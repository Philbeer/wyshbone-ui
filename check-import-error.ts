import postgres from 'postgres';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);

const result = await client`
  SELECT id, status, error_message, processed_records, failed_records, total_records, created_at
  FROM xero_import_jobs
  WHERE job_type = 'orders'
  ORDER BY id DESC
  LIMIT 1
`;

if (result.length > 0) {
  const job = result[0];
  console.log('\n=== MOST RECENT ORDER IMPORT JOB ===');
  console.log('Job ID:', job.id);
  console.log('Status:', job.status);
  console.log('Created:', job.created_at);
  console.log('Total records:', job.total_records);
  console.log('Processed:', job.processed_records);
  console.log('Failed:', job.failed_records);
  console.log('\nError message:');
  console.log(job.error_message || '(no error message)');
} else {
  console.log('No order import jobs found');
}

await client.end();
