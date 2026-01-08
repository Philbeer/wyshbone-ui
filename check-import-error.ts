import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres.zipsbmldjxytzowmmohu:Moby2014Moby2014Lister@aws-1-eu-west-2.pooler.supabase.com:6543/postgres";
const client = postgres(DATABASE_URL);

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
