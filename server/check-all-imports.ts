import postgres from 'postgres';

const sql = postgres(process.env.SUPABASE_DATABASE_URL!);

async function checkAllImports() {
  console.log('🔍 Checking ALL import jobs across all workspaces...\n');

  const jobs = await sql`
    SELECT
      id,
      workspace_id,
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
    ORDER BY created_at DESC
    LIMIT 20
  `;

  console.log(`Found ${jobs.length} import jobs:\n`);

  jobs.forEach((job: any) => {
    console.log(`📦 Job #${job.id} [Workspace: ${job.workspace_id}] - ${job.job_type?.toUpperCase() || 'unknown'}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Records: ${job.total_records || 0} total, ${job.processed_records || 0} processed, ${job.failed_records || 0} failed`);
    console.log(`   Created: ${new Date(job.created_at).toLocaleString()}`);
    if (job.started_at) console.log(`   Started: ${new Date(job.started_at).toLocaleString()}`);
    if (job.completed_at) console.log(`   Completed: ${new Date(job.completed_at).toLocaleString()}`);
    if (job.error_message) console.log(`   ❌ Error: ${job.error_message}`);
    console.log('');
  });

  // Also check customers and orders
  console.log('\n📊 Current data counts:');
  const customerCount = await sql`SELECT COUNT(*) as count FROM crm_customers`;
  const orderCount = await sql`SELECT COUNT(*) as count FROM crm_orders`;
  const productCount = await sql`SELECT COUNT(*) as count FROM brew_products`;

  console.log(`   Customers: ${customerCount[0].count}`);
  console.log(`   Orders: ${orderCount[0].count}`);
  console.log(`   Products: ${productCount[0].count}`);

  await sql.end();
}

checkAllImports().catch(console.error);
