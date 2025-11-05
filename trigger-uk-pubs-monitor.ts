import { executeMonitorAndNotify } from './server/monitor-executor';
import { storage } from './server/storage';

const monitorId = 'monitor_1762305409859_t8efuk';
const userEmail = 'demo@test.com';

async function main() {
  console.log('🍺 UK-WIDE MICRO PUBS AGENTIC TEST');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('📊 Fetching monitor...');
  
  const monitor = await storage.getScheduledMonitor(monitorId);
  if (!monitor) {
    console.error('❌ Monitor not found');
    process.exit(1);
  }
  
  console.log(`✅ Found: ${monitor.label}`);
  console.log(`📝 Task: ${monitor.description}\n`);
  
  console.log('🎯 EXPECTED AGENTIC BEHAVIOR:');
  console.log('   With UK-wide search (vs. just Kent), we expect:');
  console.log('   • More venues found (10-20+ instead of 3)');
  console.log('   • AI to rate this as HIGH significance');
  console.log('   • AI to trigger AUTONOMOUS DEEP DIVE');
  console.log('   • Follow-up research on specific aspect\n');
  
  console.log('🤖 Starting agentic execution...\n');
  console.log('⏳ This will take several minutes (initial + deep dive)...\n');
  console.log('─────────────────────────────────────────────────────\n');
  
  await executeMonitorAndNotify(monitor, userEmail);
  
  console.log('\n─────────────────────────────────────────────────────');
  console.log('✅ EXECUTION COMPLETE!\n');
  console.log('🔍 Check your app NOW:');
  console.log('   1. Sidebar → Scheduled Monitors');
  console.log('   2. Click "UK-Wide Micro Pubs Discovery"');
  console.log('   3. Scroll through to see:\n');
  console.log('📊 Initial Results:');
  console.log('   • List of UK micro pubs found\n');
  console.log('🤖 Agentic Analysis:');
  console.log('   • Significance: (should be HIGH this time!)');
  console.log('   • AI\'s reasoning for the rating');
  console.log('   • Key findings extracted\n');
  console.log('⚡ Autonomous Deep Dive:');
  console.log('   • "Autonomous Deep Dive (triggered by Run #1)"');
  console.log('   • Focus: [what AI decided to investigate]');
  console.log('   • Additional research results\n');
  console.log('📊 Budget Tracking:');
  console.log('   • Deep dive counter: 2/3 used today\n');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
