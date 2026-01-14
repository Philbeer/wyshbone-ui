/**
 * Entity Matching Test Suite
 * 
 * Verifies AI-powered entity matching works correctly by testing:
 * - True positives (should match, did match)
 * - True negatives (shouldn't match, didn't match)
 * - False positives (matched incorrectly)
 * - False negatives (should match, didn't)
 * 
 * Run with: npx tsx scripts/test-matching.ts
 * 
 * Prerequisites:
 * - Run test-data.ts first to populate the database
 * - Set ANTHROPIC_API_KEY for AI matching
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import { pubsMaster } from '../shared/schema';
import { 
  findMatchingEntity, 
  clearMatchCache,
  type PubInput, 
  type MatchDecision,
  type EntitySource,
  CONFIDENCE_THRESHOLDS 
} from '../server/lib/matching';

// Load environment
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Create .env.local with your database connection.');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set. AI matching requires this.');
  process.exit(1);
}

const queryClient = postgres(process.env.DATABASE_URL);
const db = drizzle(queryClient);

// Test workspace ID
const WORKSPACE_ID = parseInt(process.argv[2] || '1');

console.log('\n========================================');
console.log('🧪 Entity Matching Test Suite');
console.log('========================================\n');
console.log(`Workspace ID: ${WORKSPACE_ID}`);
console.log(`AI Model: Claude (via Anthropic API)`);
console.log(`Thresholds: AUTO_MATCH=${CONFIDENCE_THRESHOLDS.AUTO_MATCH}, MANUAL_REVIEW=${CONFIDENCE_THRESHOLDS.MANUAL_REVIEW}\n`);

// ============================================
// TEST CASE DEFINITIONS
// ============================================

interface TestCase {
  name: string;
  description: string;
  input: PubInput;
  expectedMatchName: string | null; // null = should be NEW
  category: 'exact_match' | 'name_variation' | 'spelling' | 'no_match' | 'different_location';
}

// These test cases are designed to work with the data from test-data.ts
const testCases: TestCase[] = [
  // === SHOULD MATCH ===
  {
    name: 'Exact duplicate',
    description: 'Identical name and postcode should match',
    input: {
      name: 'The Red Lion',
      postcode: 'M1 4BT',
      phone: '0161 234 5678',
    },
    expectedMatchName: 'The Red Lion',
    category: 'exact_match',
  },
  {
    name: 'Missing "The" prefix',
    description: 'Name without "The" should match',
    input: {
      name: 'Red Lion',
      postcode: 'M1 4BT',
    },
    expectedMatchName: 'The Red Lion',
    category: 'name_variation',
  },
  {
    name: 'Extra "The" prefix',
    description: 'Adding "The" should still match',
    input: {
      name: 'Crown Inn',
      postcode: 'B2 4QA',
      address: '12 Market Square',
    },
    expectedMatchName: 'The Crown Inn',
    category: 'name_variation',
  },
  {
    name: 'Ampersand vs "and"',
    description: '& vs "and" should match',
    input: {
      name: 'The Plough and Harrow',
      postcode: 'OX1 2EP',
    },
    expectedMatchName: 'The Plough & Harrow',
    category: 'spelling',
  },
  {
    name: 'Abbreviated address',
    description: 'Same pub with abbreviated address',
    input: {
      name: 'The White Horse',
      postcode: 'LS1 5DL',
      address: '78 Station Rd',
    },
    expectedMatchName: 'The White Horse',
    category: 'exact_match',
  },
  {
    name: 'Lowercase input',
    description: 'All lowercase should still match',
    input: {
      name: 'the dog & duck',
      postcode: 'CB2 1LA',
    },
    expectedMatchName: 'The Dog & Duck',
    category: 'name_variation',
  },
  {
    name: 'Extra spaces',
    description: 'Name with extra whitespace should match',
    input: {
      name: '  The  Three  Tuns  ',
      postcode: 'NG1 2GN',
    },
    expectedMatchName: 'The Three Tuns',
    category: 'name_variation',
  },

  // === SHOULD NOT MATCH (different pubs) ===
  {
    name: 'Same name, different city',
    description: 'Black Bull in different city should be different',
    input: {
      name: 'The Black Bull',
      postcode: 'LS1 1AA', // Leeds, not York or Sheffield
      address: '99 New Street',
    },
    expectedMatchName: null, // Should be NEW
    category: 'different_location',
  },
  {
    name: 'Similar name, different postcode',
    description: 'Similar but different location = different pub',
    input: {
      name: 'The Ship',
      postcode: 'M1 1ZZ', // Manchester, not Bristol
    },
    expectedMatchName: null,
    category: 'different_location',
  },
  {
    name: 'Completely new pub',
    description: 'Pub that does not exist in database',
    input: {
      name: 'The Unicorn & Rainbow',
      postcode: 'SW1A 1AA',
      phone: '020 7123 4567',
    },
    expectedMatchName: null,
    category: 'no_match',
  },
  {
    name: 'New pub with common name',
    description: 'New location of common pub name',
    input: {
      name: 'The Kings Arms',
      postcode: 'EH1 1AA', // Edinburgh, not Chester
      address: '1 Royal Mile',
    },
    expectedMatchName: null, // Different from Chester one
    category: 'different_location',
  },
  {
    name: 'Neighbouring pub test',
    description: 'The Anchor should not match The Ship (same postcode)',
    input: {
      name: 'The Ship Inn',
      postcode: 'BS1 4RW',
      address: '100 Harbour Road',
    },
    expectedMatchName: 'The Ship Inn', // Should match the Ship, not the Anchor
    category: 'exact_match',
  },
];

// ============================================
// TEST RESULT TYPES
// ============================================

interface TestResult {
  testCase: TestCase;
  decision: MatchDecision;
  passed: boolean;
  resultType: 'TP' | 'TN' | 'FP' | 'FN';
  executionTimeMs: number;
}

// ============================================
// TEST EXECUTION
// ============================================

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Clear cache before testing
  clearMatchCache();
  console.log('🗑️  Cleared match cache\n');

  // First, verify we have test data
  const pubCount = await db
    .select({ count: pubsMaster.id })
    .from(pubsMaster)
    .where(eq(pubsMaster.workspaceId, WORKSPACE_ID));

  if (!pubCount.length) {
    console.error('❌ No pubs found in database. Run test-data.ts first.');
    process.exit(1);
  }
  console.log(`📊 Found pubs in workspace: proceeding with tests\n`);

  // Run each test case
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] Testing: ${testCase.name}`);
    console.log(`   Input: "${testCase.input.name}" (${testCase.input.postcode || 'no postcode'})`);
    console.log(`   Expected: ${testCase.expectedMatchName ? `MATCH "${testCase.expectedMatchName}"` : 'NEW entity'}`);

    const startTime = Date.now();
    let decision: MatchDecision;

    try {
      decision = await findMatchingEntity(
        testCase.input,
        'manual' as EntitySource,
        WORKSPACE_ID
      );
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      results.push({
        testCase,
        decision: {
          isNew: true,
          confidence: 0,
          reasoning: `Error: ${error.message}`,
        },
        passed: false,
        resultType: 'FN', // Treat errors as false negatives
        executionTimeMs: Date.now() - startTime,
      });
      continue;
    }

    const executionTimeMs = Date.now() - startTime;

    // Determine if test passed
    const expectedNew = testCase.expectedMatchName === null;
    const actualNew = decision.isNew;
    const matchedCorrectPub = !expectedNew && !actualNew && 
      decision.match?.name.toLowerCase().includes(testCase.expectedMatchName!.toLowerCase().replace('the ', ''));

    let passed: boolean;
    let resultType: 'TP' | 'TN' | 'FP' | 'FN';

    if (expectedNew && actualNew) {
      // Correctly identified as new
      passed = true;
      resultType = 'TN';
    } else if (!expectedNew && !actualNew && matchedCorrectPub) {
      // Correctly matched to expected pub
      passed = true;
      resultType = 'TP';
    } else if (!expectedNew && actualNew) {
      // Should have matched but didn't
      passed = false;
      resultType = 'FN';
    } else if (expectedNew && !actualNew) {
      // Matched when it shouldn't have
      passed = false;
      resultType = 'FP';
    } else {
      // Matched to wrong pub
      passed = false;
      resultType = 'FP';
    }

    results.push({
      testCase,
      decision,
      passed,
      resultType,
      executionTimeMs,
    });

    // Print result
    const icon = passed ? '✅' : '❌';
    const matchInfo = decision.isNew 
      ? 'NEW entity' 
      : `MATCH "${decision.match?.name}" (id: ${decision.match?.id})`;
    
    console.log(`   ${icon} Result: ${matchInfo}`);
    console.log(`   Confidence: ${(decision.confidence * 100).toFixed(1)}%`);
    console.log(`   Time: ${executionTimeMs}ms`);
    console.log(`   Reasoning: ${decision.reasoning.substring(0, 100)}...`);
    console.log('');
  }

  return results;
}

// ============================================
// METRICS CALCULATION
// ============================================

interface Metrics {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  avgConfidence: number;
  avgExecutionTime: number;
}

function calculateMetrics(results: TestResult[]): Metrics {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  const tp = results.filter(r => r.resultType === 'TP').length;
  const tn = results.filter(r => r.resultType === 'TN').length;
  const fp = results.filter(r => r.resultType === 'FP').length;
  const fn = results.filter(r => r.resultType === 'FN').length;

  // Precision = TP / (TP + FP)
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  
  // Recall = TP / (TP + FN)
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  
  // F1 Score = 2 * (precision * recall) / (precision + recall)
  const f1Score = precision + recall > 0 
    ? 2 * (precision * recall) / (precision + recall) 
    : 0;

  // Average confidence
  const avgConfidence = results.reduce((sum, r) => sum + r.decision.confidence, 0) / total;

  // Average execution time
  const avgExecutionTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0) / total;

  return {
    total,
    passed,
    failed,
    accuracy: passed / total,
    truePositives: tp,
    trueNegatives: tn,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1Score,
    avgConfidence,
    avgExecutionTime,
  };
}

// ============================================
// ASSERTIONS
// ============================================

function runAssertions(metrics: Metrics): boolean {
  const assertions: { name: string; condition: boolean; message: string }[] = [
    {
      name: 'Minimum accuracy',
      condition: metrics.accuracy >= 0.7,
      message: `Accuracy ${(metrics.accuracy * 100).toFixed(1)}% is below minimum 70%`,
    },
    {
      name: 'Precision threshold',
      condition: metrics.precision >= 0.6,
      message: `Precision ${(metrics.precision * 100).toFixed(1)}% is below minimum 60%`,
    },
    {
      name: 'Recall threshold',
      condition: metrics.recall >= 0.6,
      message: `Recall ${(metrics.recall * 100).toFixed(1)}% is below minimum 60%`,
    },
    {
      name: 'False positive limit',
      condition: metrics.falsePositives <= 3,
      message: `Too many false positives: ${metrics.falsePositives} (max: 3)`,
    },
    {
      name: 'Execution time',
      condition: metrics.avgExecutionTime < 10000,
      message: `Average execution time ${metrics.avgExecutionTime.toFixed(0)}ms exceeds 10s limit`,
    },
  ];

  console.log('\n========================================');
  console.log('🔍 ASSERTIONS');
  console.log('========================================\n');

  let allPassed = true;
  for (const assertion of assertions) {
    const icon = assertion.condition ? '✅' : '❌';
    console.log(`${icon} ${assertion.name}: ${assertion.condition ? 'PASSED' : 'FAILED'}`);
    if (!assertion.condition) {
      console.log(`   ${assertion.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  try {
    console.log('🚀 Starting test suite...\n');

    const results = await runTests();
    const metrics = calculateMetrics(results);

    // Print confusion matrix
    console.log('\n========================================');
    console.log('📊 CONFUSION MATRIX');
    console.log('========================================\n');
    console.log('                  Predicted');
    console.log('              MATCH     NEW');
    console.log('           ┌─────────┬─────────┐');
    console.log(`  Actual   │  TP: ${metrics.truePositives.toString().padStart(2)}  │  FN: ${metrics.falseNegatives.toString().padStart(2)}  │  MATCH`);
    console.log('           ├─────────┼─────────┤');
    console.log(`           │  FP: ${metrics.falsePositives.toString().padStart(2)}  │  TN: ${metrics.trueNegatives.toString().padStart(2)}  │  NEW`);
    console.log('           └─────────┴─────────┘');

    // Print metrics
    console.log('\n========================================');
    console.log('📈 ACCURACY METRICS');
    console.log('========================================\n');
    console.log(`Total tests:        ${metrics.total}`);
    console.log(`Passed:             ${metrics.passed} ✅`);
    console.log(`Failed:             ${metrics.failed} ❌`);
    console.log('');
    console.log(`Accuracy:           ${(metrics.accuracy * 100).toFixed(1)}%`);
    console.log(`Precision:          ${(metrics.precision * 100).toFixed(1)}%`);
    console.log(`Recall:             ${(metrics.recall * 100).toFixed(1)}%`);
    console.log(`F1 Score:           ${(metrics.f1Score * 100).toFixed(1)}%`);
    console.log('');
    console.log(`Avg Confidence:     ${(metrics.avgConfidence * 100).toFixed(1)}%`);
    console.log(`Avg Execution Time: ${metrics.avgExecutionTime.toFixed(0)}ms`);

    // Print confidence scores by category
    console.log('\n========================================');
    console.log('📊 CONFIDENCE SCORES BY CATEGORY');
    console.log('========================================\n');

    const categories = [...new Set(testCases.map(t => t.category))];
    for (const category of categories) {
      const categoryResults = results.filter(r => r.testCase.category === category);
      const avgConf = categoryResults.reduce((sum, r) => sum + r.decision.confidence, 0) / categoryResults.length;
      const passRate = categoryResults.filter(r => r.passed).length / categoryResults.length;
      
      console.log(`${category}:`);
      console.log(`  Pass rate:   ${(passRate * 100).toFixed(0)}% (${categoryResults.filter(r => r.passed).length}/${categoryResults.length})`);
      console.log(`  Avg conf:    ${(avgConf * 100).toFixed(1)}%`);
    }

    // Print failed tests
    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('\n========================================');
      console.log('❌ FAILED TESTS');
      console.log('========================================\n');
      
      for (const result of failedTests) {
        console.log(`Test: ${result.testCase.name}`);
        console.log(`  Input: "${result.testCase.input.name}"`);
        console.log(`  Expected: ${result.testCase.expectedMatchName || 'NEW'}`);
        console.log(`  Got: ${result.decision.isNew ? 'NEW' : result.decision.match?.name}`);
        console.log(`  Type: ${result.resultType}`);
        console.log(`  Reasoning: ${result.decision.reasoning}`);
        console.log('');
      }
    }

    // Run assertions
    const assertionsPassed = runAssertions(metrics);

    // Final summary
    console.log('\n========================================');
    console.log(assertionsPassed ? '✅ ALL ASSERTIONS PASSED' : '❌ SOME ASSERTIONS FAILED');
    console.log('========================================\n');

    // Exit with appropriate code
    process.exit(assertionsPassed && metrics.failed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run
main();

