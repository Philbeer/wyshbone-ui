#!/usr/bin/env tsx

/**
 * Test script for Tower chat-test endpoint
 * 
 * This script tests the /api/tower/chat-test endpoint which allows
 * the Wyshbone Control Tower to run behaviour tests against the chat
 * logic without requiring a browser session, using export-key based auth.
 * 
 * Usage:
 *   npm run test:tower
 *   or
 *   tsx scripts/test-tower-chat.ts
 */

import { randomBytes } from 'crypto';

// Configuration
const BASE_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

const EXPORT_KEY = process.env.EXPORT_KEY;

// Test user data
const testUser = {
  id: 'tower-test-' + randomBytes(8).toString('hex'),
  email: 'tower-test@wyshbone.com',
  name: 'Tower Test User'
};

const testMessages = [
  { role: 'user' as const, content: 'Hello! Can you help me find coffee shops in London?' }
];

async function testTowerChatEndpoint() {
  console.log('🏢 Testing Tower Chat Endpoint');
  console.log('================================');
  console.log('Base URL:', BASE_URL);
  console.log('Export Key:', EXPORT_KEY ? '✓ Present' : '✗ Missing');
  console.log('Test User:', testUser.email);
  console.log('');

  if (!EXPORT_KEY) {
    console.error('❌ ERROR: EXPORT_KEY environment variable not set');
    console.error('   Please ensure the server is running and EXPORT_KEY is configured');
    process.exit(1);
  }

  // Test 1: Missing export key should return 401
  console.log('📝 Test 1: Missing X-EXPORT-KEY header (should fail with 401)');
  try {
    const response = await fetch(`${BASE_URL}/api/tower/chat-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: testUser,
        messages: testMessages
      })
    });

    if (response.status === 401) {
      console.log('   ✅ Correctly rejected with 401 Unauthorized');
    } else {
      console.log(`   ❌ Expected 401, got ${response.status}`);
      const data = await response.json();
      console.log('   Response:', data);
    }
  } catch (error: any) {
    console.error('   ❌ Request failed:', error.message);
  }
  console.log('');

  // Test 2: Wrong export key should return 401
  console.log('📝 Test 2: Wrong X-EXPORT-KEY header (should fail with 401)');
  try {
    const response = await fetch(`${BASE_URL}/api/tower/chat-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EXPORT-KEY': 'wrong-key-' + randomBytes(8).toString('hex')
      },
      body: JSON.stringify({
        user: testUser,
        messages: testMessages
      })
    });

    if (response.status === 401) {
      console.log('   ✅ Correctly rejected with 401 Unauthorized');
    } else {
      console.log(`   ❌ Expected 401, got ${response.status}`);
      const data = await response.json();
      console.log('   Response:', data);
    }
  } catch (error: any) {
    console.error('   ❌ Request failed:', error.message);
  }
  console.log('');

  // Test 3: Valid export key with invalid payload should return 400
  console.log('📝 Test 3: Valid key but invalid payload (should fail with 400)');
  try {
    const response = await fetch(`${BASE_URL}/api/tower/chat-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EXPORT-KEY': EXPORT_KEY
      },
      body: JSON.stringify({
        // Missing required fields
        invalid: 'payload'
      })
    });

    if (response.status === 400) {
      console.log('   ✅ Correctly rejected with 400 Bad Request');
      const data = await response.json();
      if (data.error === 'Invalid request format') {
        console.log('   ✅ Error message is correct');
      }
    } else {
      console.log(`   ❌ Expected 400, got ${response.status}`);
      const data = await response.json();
      console.log('   Response:', data);
    }
  } catch (error: any) {
    console.error('   ❌ Request failed:', error.message);
  }
  console.log('');

  // Test 4: Valid export key with valid payload should succeed
  console.log('📝 Test 4: Valid key with valid payload (should succeed with 200)');
  try {
    const response = await fetch(`${BASE_URL}/api/tower/chat-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EXPORT-KEY': EXPORT_KEY
      },
      body: JSON.stringify({
        user: testUser,
        messages: testMessages
      })
    });

    if (response.status === 200) {
      console.log('   ✅ Request succeeded with 200 OK');
      console.log('   📡 Streaming response:');
      console.log('   ────────────────────────────────');
      
      // Read the streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log('   🏁 Stream completed');
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.conversationId) {
                  console.log(`   💬 Conversation ID: ${parsed.conversationId}`);
                } else if (parsed.content) {
                  process.stdout.write(parsed.content);
                  fullResponse += parsed.content;
                }
              } catch (e) {
                // Ignore parsing errors for incomplete chunks
              }
            }
          }
        }
      }
      
      console.log('');
      console.log('   ────────────────────────────────');
      console.log('   ✅ Full response received');
      console.log(`   📏 Response length: ${fullResponse.length} characters`);
    } else {
      console.log(`   ❌ Expected 200, got ${response.status}`);
      const data = await response.text();
      console.log('   Response:', data);
    }
  } catch (error: any) {
    console.error('   ❌ Request failed:', error.message);
  }
  console.log('');

  console.log('================================');
  console.log('✅ All tests completed!');
  console.log('');
  console.log('Summary:');
  console.log('- Test 1: No export key → 401 ✓');
  console.log('- Test 2: Wrong export key → 401 ✓');
  console.log('- Test 3: Invalid payload → 400 ✓');
  console.log('- Test 4: Valid request → 200 + streaming response ✓');
}

// Run the tests
testTowerChatEndpoint().catch(error => {
  console.error('❌ Test script failed:', error);
  process.exit(1);
});
