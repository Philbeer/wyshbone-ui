import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function checkImports() {
  console.log('🔍 Checking recent import jobs...\n');

  const jobs = await sql`
    SELECT
      id,
      job_type,
      status,
      total_records,
      processed_records,
      failed_records,
      error_message,
      created_at,
      started_at,
      completed_at
    FROM xero_import_jobs
    WHERE workspace_id = '1'
    ORDER BY created_at DESC
    LIMIT 10
  `;

  console.log(`Found ${jobs.length} recent import jobs:\n`);

  jobs.forEach((job: any) => {
    console.log(`📦 Job #${job.id} - ${job.job_type.toUpperCase()}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Records: ${job.total_records || 0} total, ${job.processed_records || 0} processed, ${job.failed_records || 0} failed`);
    console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
    if (job.started_at) console.log(`   Started: ${new Date(job.started_at).toLocaleString()}`);
    if (job.completed_at) console.log(`   Completed: ${new Date(job.completed_at).toLocaleString()}`);
    if (job.error_message) console.log(`   ❌ Error: ${job.error_message}`);
    console.log('');
  });

  await sql.end();
}

checkImports().catch(console.error);
