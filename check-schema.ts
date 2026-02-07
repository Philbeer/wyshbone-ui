import postgres from 'postgres';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);

const result = await client`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'crm_orders'
  AND column_name LIKE '%xero%'
`;

console.log('\n=== Xero-related columns in crm_orders table ===');
if (result.length === 0) {
  console.log('❌ NO XERO COLUMNS FOUND - This is the problem!');
  console.log('\nThe schema defines these columns:');
  console.log('  - xero_invoice_id');
  console.log('  - xero_invoice_number');
  console.log('  - xero_exported_at');
  console.log('  - last_xero_sync_at');
  console.log('\nBut they don\'t exist in the database!');
  console.log('\nSOLUTION: Run database migration to add these columns.');
} else {
  console.log('✅ Found', result.length, 'Xero columns:');
  for (const col of result) {
    console.log('  -', col.column_name, '(', col.data_type, ')');
  }
}

await client.end();
