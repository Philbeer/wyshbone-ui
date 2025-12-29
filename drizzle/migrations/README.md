# CRM Schema Migrations

This folder contains SQL migration scripts to fix schema mismatches between the database and `shared/schema.ts`.

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Open your Supabase Dashboard
2. Go to **SQL Editor** (left sidebar)
3. Click **+ New query**
4. Copy and paste the contents of each migration file
5. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)
6. Verify there are no errors in the output

### Option 2: Supabase CLI

```bash
# If you have Supabase CLI configured:
supabase db execute --file drizzle/migrations/2025_12_29_crm_schema_fix.sql
supabase db execute --file drizzle/migrations/2025_12_29_brewcrm_schema_fix.sql
```

## Migration Files

### `2025_12_29_crm_schema_fix.sql`

Fixes the core CRM schema:

- **Creates `crm_products`** - Generic product catalog (was missing entirely)
- **Creates `crm_stock`** - Inventory tracking (was missing entirely)
- **Updates `crm_orders`** - Adds VAT, discount, shipping, and Xero columns
- **Updates `crm_order_lines`** - Adds new VAT calculation columns (keeps legacy columns)
- **Ensures all base CRM tables exist** with correct indexes

### `2025_12_29_brewcrm_schema_fix.sql`

Fixes the brewery-specific schema:

- **Updates `brew_products`** - Adds `default_unit_price_ex_vat` and `default_vat_rate`
- **Ensures all brewery tables exist** - batches, inventory, containers, duty reports, settings
- **Creates `brew_duty_lookup_bands`** - UK duty calculation bands

## Order of Execution

Run migrations in this order:

1. `2025_12_29_crm_schema_fix.sql` (core CRM tables first)
2. `2025_12_29_brewcrm_schema_fix.sql` (brewery-specific tables)

## Safety Guarantees

All migrations are designed to be **safe and non-destructive**:

- ✅ `CREATE TABLE IF NOT EXISTS` - Won't fail if table already exists
- ✅ `ADD COLUMN IF NOT EXISTS` - Won't fail if column already exists
- ✅ No `DROP TABLE` or `DROP COLUMN` statements
- ✅ No data deletion
- ✅ Legacy columns preserved for backwards compatibility

## Verification

After running migrations, verify success by running these queries:

```sql
-- Check crm_products exists with correct columns:
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'crm_products' 
ORDER BY ordinal_position;

-- Check crm_stock exists:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'crm_stock' 
ORDER BY ordinal_position;

-- Check crm_orders has VAT columns:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'crm_orders' 
AND column_name IN ('subtotal_ex_vat', 'vat_total', 'discount_type', 'xero_invoice_id');

-- Check crm_order_lines has new VAT columns:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'crm_order_lines' 
AND column_name IN ('product_id', 'unit_price_ex_vat', 'vat_rate', 'line_vat_amount');

-- Check brew_products has pricing columns:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'brew_products' 
AND column_name IN ('default_unit_price_ex_vat', 'default_vat_rate');
```

## Backend Startup Check

After applying migrations, restart your backend server. It will automatically run a schema health check on startup:

- ✅ **All tables verified** → Green message, no action needed
- ⚠️ **Missing tables/columns** → Yellow warning with instructions

The check is **non-fatal** - the server will still start, but CRM operations may fail until migrations are applied.

## Troubleshooting

### "relation does not exist" errors

Run the migration scripts in Supabase SQL Editor.

### "column does not exist" errors

The migration may have partially applied. Re-run the full migration - `IF NOT EXISTS` clauses will skip already-applied changes.

### Permission errors

Ensure you're using the Supabase service role key (not anon key) in your `DATABASE_URL`.

