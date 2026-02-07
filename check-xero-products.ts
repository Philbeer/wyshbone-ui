import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { brewProducts } from './shared/schema.js';
import { isNotNull } from 'drizzle-orm';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);
const db = drizzle(client);

async function checkXeroProducts() {
  try {
    console.log('\n=== Checking Xero-imported products ===\n');

    // Query products with xeroItemId
    const xeroProducts = await db.select().from(brewProducts)
      .where(isNotNull(brewProducts.xeroItemId));

    console.log(`✅ Found ${xeroProducts.length} Xero-imported products`);

    for (const product of xeroProducts) {
      console.log(`\nProduct: ${product.name}`);
      console.log(`  ID: ${product.id}`);
      console.log(`  SKU: ${product.sku}`);
      console.log(`  Xero Item ID: ${product.xeroItemId}`);
      console.log(`  Workspace ID: ${product.workspaceId}`);
      console.log(`  Active: ${product.isActive}`);
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
    }
  } finally {
    await client.end();
  }
}

checkXeroProducts();
