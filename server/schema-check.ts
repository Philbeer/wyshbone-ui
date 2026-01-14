/**
 * Schema Health Check
 * 
 * Non-fatal startup check that verifies critical CRM tables exist in the database.
 * Logs warnings with instructions if tables are missing.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

interface TableCheckResult {
  table: string;
  exists: boolean;
  columnsMissing?: string[];
}

interface SchemaCheckResult {
  healthy: boolean;
  checks: TableCheckResult[];
  missingTables: string[];
  warnings: string[];
}

// Tables that must exist for CRM to work
const REQUIRED_CRM_TABLES = [
  'crm_products',
  'crm_stock',
  'crm_orders',
  'crm_order_lines',
  'crm_customers',
  'crm_settings',
  'crm_delivery_runs',
];

const REQUIRED_BREWERY_TABLES = [
  // Note: brew_products was renamed to crm_products (universal products table)
  'brew_batches',
  'brew_inventory_items',
  'brew_containers',
  'brew_duty_reports',
  'brew_settings',
  'brew_duty_lookup_bands',
];

// Critical columns that must exist on certain tables
const REQUIRED_COLUMNS: Record<string, string[]> = {
  'crm_orders': [
    'subtotal_ex_vat',
    'vat_total',
    'total_inc_vat',
    'discount_type',
    'discount_value',
  ],
  'crm_order_lines': [
    'product_id',
    'unit_price_ex_vat',
    'vat_rate',
    'line_subtotal_ex_vat',
    'line_vat_amount',
    'line_total_inc_vat',
  ],
  // Note: brew_products renamed to crm_products (universal products table for all verticals)
  'crm_products': [
    'default_unit_price_ex_vat',
    'default_vat_rate',
    'track_stock',
    'description',
    'category',
    'unit_type',
    // Brewery-specific fields (nullable)
    'abv',
    'duty_band',
    'style',
  ],
};

/**
 * Check if a table exists in the database
 */
async function tableExists(db: ReturnType<typeof drizzle>, tableName: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      ) as exists
    `);
    return (result as any)[0]?.exists === true;
  } catch (error) {
    console.error(`Error checking table ${tableName}:`, error);
    return false;
  }
}

/**
 * Check if specific columns exist on a table
 */
async function getMissingColumns(
  db: ReturnType<typeof drizzle>, 
  tableName: string, 
  requiredColumns: string[]
): Promise<string[]> {
  try {
    const result = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    `);
    
    const existingColumns = new Set((result as any[]).map((r: any) => r.column_name));
    return requiredColumns.filter(col => !existingColumns.has(col));
  } catch (error) {
    console.error(`Error checking columns for ${tableName}:`, error);
    return requiredColumns; // Assume all missing on error
  }
}

/**
 * Run schema health check on startup
 * Returns result object, logs warnings but does not throw
 */
export async function runSchemaHealthCheck(): Promise<SchemaCheckResult> {
  const result: SchemaCheckResult = {
    healthy: true,
    checks: [],
    missingTables: [],
    warnings: [],
  };

  // Skip check if database URL not configured
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn('⚠️ [Schema Check] Database URL not set, skipping schema check');
    return result;
  }

  let queryClient: ReturnType<typeof postgres> | null = null;
  
  try {
    // Create a dedicated connection for schema check with short timeout
    queryClient = postgres(dbUrl, {
      connect_timeout: 5,
      idle_timeout: 5,
      max: 1,
    });
    const db = drizzle(queryClient);

    console.log('\n🔍 [Schema Check] Verifying CRM database schema...\n');

    // Check all required CRM tables
    const allTables = [...REQUIRED_CRM_TABLES, ...REQUIRED_BREWERY_TABLES];
    
    for (const tableName of allTables) {
      const exists = await tableExists(db, tableName);
      const check: TableCheckResult = { table: tableName, exists };
      
      if (!exists) {
        result.missingTables.push(tableName);
        result.healthy = false;
      } else {
        // Check for missing columns on critical tables
        const requiredCols = REQUIRED_COLUMNS[tableName];
        if (requiredCols) {
          const missingCols = await getMissingColumns(db, tableName, requiredCols);
          if (missingCols.length > 0) {
            check.columnsMissing = missingCols;
            result.healthy = false;
            result.warnings.push(
              `Table "${tableName}" is missing columns: ${missingCols.join(', ')}`
            );
          }
        }
      }
      
      result.checks.push(check);
    }

    // Log results
    if (result.healthy) {
      console.log('✅ [Schema Check] All CRM tables and columns verified!\n');
    } else {
      console.log('\n' + '='.repeat(70));
      console.log('⚠️  DATABASE SCHEMA ISSUES DETECTED');
      console.log('='.repeat(70));
      
      if (result.missingTables.length > 0) {
        console.log('\n❌ MISSING TABLES:');
        result.missingTables.forEach(t => console.log(`   - ${t}`));
      }
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  MISSING COLUMNS:');
        result.warnings.forEach(w => console.log(`   - ${w}`));
      }
      
      console.log('\n📋 TO FIX: Run these migration scripts in Supabase SQL Editor:');
      console.log('   1. drizzle/migrations/2025_12_29_crm_schema_fix.sql');
      console.log('   2. drizzle/migrations/2025_12_29_brewcrm_schema_fix.sql');
      console.log('\n   Or for duty lookup bands specifically:');
      console.log('   drizzle/brew_duty_lookup_bands.sql');
      console.log('\n' + '='.repeat(70) + '\n');
    }

  } catch (error: any) {
    // Non-fatal - just log the error
    if (error.message?.includes('ENOTFOUND') || error.cause?.code === 'ENOTFOUND') {
      console.warn('⚠️ [Schema Check] Could not connect to database (DNS resolution failed)');
      console.warn('   This is normal in demo mode without database access.\n');
    } else {
      console.warn('⚠️ [Schema Check] Could not verify schema:', error.message);
    }
    result.warnings.push(`Schema check failed: ${error.message}`);
  } finally {
    // Clean up connection
    if (queryClient) {
      try {
        await queryClient.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return result;
}

/**
 * Quick check for a specific table (for use in route handlers)
 */
export async function quickTableCheck(tableName: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  
  try {
    const queryClient = postgres(process.env.DATABASE_URL, {
      connect_timeout: 3,
      idle_timeout: 3,
      max: 1,
    });
    const db = drizzle(queryClient);
    const exists = await tableExists(db, tableName);
    await queryClient.end();
    return exists;
  } catch {
    return false;
  }
}

