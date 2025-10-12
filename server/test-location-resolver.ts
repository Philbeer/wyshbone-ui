// Test script for location resolver
// Run with: npx tsx server/test-location-resolver.ts

import { resolveLocation } from './location-resolver';

const testCases = [
  "pubs in Melbourne",
  "bars in Texas",
  "breweries in London",
  "dentists in Victoria Australia",
  "cafés in Dublin",
  "coffee shops in Auckland NZ",
  "restaurants in Kyoto",
  "hotels in Bavaria"
];

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 LOCATION RESOLVER TEST RESULTS');
  console.log('========================================\n');
  
  for (const testCase of testCases) {
    const result = await resolveLocation(testCase);
    
    console.log(`📍 Input: "${testCase}"`);
    console.log(`   ✅ Country: ${result.country} (${result.country_code})`);
    console.log(`   ✅ Granularity: ${result.granularity}`);
    if (result.region_filter) {
      console.log(`   ✅ Region Filter: ${result.region_filter}`);
    }
    console.log(`   ✅ Confidence: ${result.confidence}`);
    if (result.note) {
      console.log(`   📝 Note: ${result.note}`);
    }
    if (result.source) {
      console.log(`   🔍 Source: ${result.source}`);
    }
    console.log('');
  }
  
  console.log('========================================\n');
}

runTests().catch(console.error);
