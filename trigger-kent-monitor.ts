import { executeMonitorAndNotify } from './server/monitor-executor';
import { storage } from './server/storage';

const monitorId = 'monitor_1762305082413_lkvxqb';
const userEmail = 'demo@test.com';

async function main() {
  console.log('🍺 KENT MICRO PUBS AGENTIC TEST');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📊 Fetching monitor...');
  
  const monitor = await storage.getScheduledMonitor(monitorId);
  if (!monitor) {
    console.error('❌ Monitor not found');
    process.exit(1);
  }
  
  console.log(`✅ Found: ${monitor.label}`);
  console.log(`📝 Task: ${monitor.description}\n`);
  
  console.log('🤖 Starting agentic execution...');
  console.log('   Watch for:');
  console.log('   1️⃣ Initial research on Kent micro pubs');
  console.log('   2️⃣ AI analyzing the findings');
  console.log('   3️⃣ AI deciding significance level');
  console.log('   4️⃣ AI potentially triggering autonomous deep dive');
  console.log('   5️⃣ AI suggesting prompt improvements\n');
  
  console.log('⏳ This may take a few minutes...\n');
  console.log('─────────────────────────────────────────────────────\n');
  
  await executeMonitorAndNotify(monitor, userEmail);
  
  console.log('\n─────────────────────────────────────────────────────');
  console.log('✅ EXECUTION COMPLETE!\n');
  console.log('🔍 What to look for in your app:');
  console.log('   • Open sidebar → Scheduled Monitors');
  console.log('   • Click "Kent Micro Pubs Discovery"');
  console.log('   • Scroll through the conversation\n');
  console.log('🤖 Look for agentic behaviors:');
  console.log('   • "Agentic Analysis" message with AI reasoning');
  console.log('   • Significance rating (HIGH/MEDIUM/LOW)');
  console.log('   • Key findings the AI extracted');
  console.log('   • Possibly "Autonomous Deep Dive" follow-up research');
  console.log('   • AI suggestions for improving the monitor\n');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
