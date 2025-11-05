/**
 * Script to create and immediately trigger a test monitor
 * to demonstrate agentic AI capabilities
 */

const baseUrl = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

// Test user credentials for development
const testUserId = 'demo-user';
const testUserEmail = 'demo@test.com';

async function createTestMonitor() {
  console.log('🤖 Creating agentic test monitor...\n');
  
  const monitorData = {
    label: 'Agentic AI Demo - UK Coffee Shops',
    description: 'Research the top 10 most innovative independent coffee shops in London that have opened in the last 2 years',
    schedule: 'daily',
    scheduleTime: '09:00',
    monitorType: 'deep_research',
    emailNotifications: 1,
    config: {}
  };
  
  // Add dev auth params
  const url = `${baseUrl}/api/scheduled-monitors?user_id=${testUserId}&user_email=${testUserEmail}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(monitorData)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create monitor: ${error}`);
    }
    
    const monitor = await response.json();
    console.log('✅ Monitor created successfully!');
    console.log(`   ID: ${monitor.id}`);
    console.log(`   Label: ${monitor.label}\n`);
    
    return monitor;
  } catch (error) {
    console.error('❌ Error creating monitor:', error.message);
    throw error;
  }
}

async function triggerMonitor(monitorId) {
  console.log('⚡ Manually triggering monitor execution...\n');
  
  // Import the monitor executor
  const { executeMonitorAndNotify } = await import('./server/monitor-executor.ts');
  const { storage } = await import('./server/storage.ts');
  
  try {
    // Get the monitor
    const monitor = await storage.getScheduledMonitor(monitorId);
    if (!monitor) {
      throw new Error('Monitor not found');
    }
    
    console.log('🔍 Starting agentic monitor run...');
    console.log('   This will:');
    console.log('   1. Execute the deep research');
    console.log('   2. AI analyzes the results');
    console.log('   3. AI decides on follow-up actions');
    console.log('   4. Possibly triggers autonomous deep dive');
    console.log('   5. Stores all findings in conversation\n');
    
    // Execute the monitor
    await executeMonitorAndNotify(monitor, testUserEmail);
    
    console.log('\n✅ Monitor execution complete!');
    console.log('\n📊 Check the results:');
    console.log('   1. Open your Wyshbone app');
    console.log('   2. Look in the sidebar under "Scheduled Monitors"');
    console.log('   3. Click on "Agentic AI Demo - UK Coffee Shops"');
    console.log('   4. See the AI\'s agentic analysis and decisions!');
    console.log('\n💡 Look for:');
    console.log('   - 🤖 Agentic Analysis message');
    console.log('   - Significance rating (HIGH/MEDIUM/LOW)');
    console.log('   - Key findings extracted by AI');
    console.log('   - Possibly an autonomous deep dive follow-up\n');
    
  } catch (error) {
    console.error('❌ Error executing monitor:', error.message);
    throw error;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🤖 AGENTIC AI MONITOR DEMO');
  console.log('═══════════════════════════════════════════════════════\n');
  
  try {
    // Create the monitor
    const monitor = await createTestMonitor();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Trigger it immediately
    await triggerMonitor(monitor.id);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ DEMO COMPLETE!');
    console.log('═══════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

main();
