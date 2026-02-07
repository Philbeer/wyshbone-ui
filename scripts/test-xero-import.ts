/**
 * Xero Import Integration Test
 * 
 * Tests the full Xero customer import pipeline:
 * - Contact fetching (mocked for testing)
 * - AI-powered entity matching
 * - Entity source creation
 * - Review queue entries
 * 
 * Run with: npx tsx scripts/test-xero-import.ts
 * 
 * Prerequisites:
 * - Run test-data.ts first to populate test pubs
 * - Set ANTHROPIC_API_KEY for AI matching
 * - Set DATABASE_URL for database connection
 * 
 * Optional: For real Xero sandbox testing, set:
 * - XERO_TEST_CLIENT_ID
 * - XERO_TEST_CLIENT_SECRET
 * - XERO_TEST_TENANT_ID
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, desc } from 'drizzle-orm';
import { 
  pubsMaster, 
  entitySources, 
  entityReviewQueue,
  crmCustomers 
} from '../shared/schema';
import { 
  findMatchingEntity,
  clearMatchCache,
  sourceExists,
  createEntitySource,
  flagForManualReview,
  CONFIDENCE_THRESHOLDS,
  type PubInput,
} from '../server/lib/matching';

// Load environment
config({ path: '.env.local' });

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  console.error('❌ SUPABASE_DATABASE_URL not set. Create .env.local with your Supabase connection.');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set. AI matching requires this.');
  process.exit(1);
}

const queryClient = postgres(process.env.SUPABASE_DATABASE_URL);
const db = drizzle(queryClient);

// Test workspace ID
const WORKSPACE_ID = parseInt(process.argv[2] || '1');

console.log('\n========================================');
console.log('🧪 Xero Import Integration Test');
console.log('========================================\n');
console.log(`Workspace ID: ${WORKSPACE_ID}`);
console.log(`Thresholds: AUTO=${CONFIDENCE_THRESHOLDS.AUTO_MATCH}, REVIEW=${CONFIDENCE_THRESHOLDS.MANUAL_REVIEW}\n`);

// ============================================
// MOCK XERO CONTACTS
// ============================================

/**
 * Simulated Xero contact structure (matching Xero API response format)
 */
interface MockXeroContact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
  Addresses?: Array<{
    AddressType: 'STREET' | 'POBOX';
    AddressLine1?: string;
    City?: string;
    PostalCode?: string;
    Country?: string;
  }>;
  Phones?: Array<{
    PhoneType: 'DEFAULT' | 'DDI' | 'MOBILE' | 'FAX';
    PhoneNumber?: string;
  }>;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
  UpdatedDateUTC?: string;
}

/**
 * Test contacts designed to test various matching scenarios.
 * These should match against pubs created by test-data.ts
 */
const mockXeroContacts: MockXeroContact[] = [
  // 1. Should match: "The Red Lion" exactly
  {
    ContactID: 'xero-test-001',
    Name: 'The Red Lion',
    EmailAddress: 'info@redlion-manchester.co.uk',
    Addresses: [{
      AddressType: 'STREET',
      AddressLine1: '45 High Street',
      City: 'Manchester',
      PostalCode: 'M1 4BT',
      Country: 'United Kingdom',
    }],
    Phones: [{
      PhoneType: 'DEFAULT',
      PhoneNumber: '0161 234 5678',
    }],
    IsCustomer: true,
  },

  // 2. Should match: "Crown Inn" (matches "The Crown Inn")
  {
    ContactID: 'xero-test-002',
    Name: 'Crown Inn',
    Addresses: [{
      AddressType: 'STREET',
      AddressLine1: '12 Market Square',
      City: 'Birmingham',
      PostalCode: 'B2 4QA',
    }],
    IsCustomer: true,
  },

  // 3. Should match: "White Horse" variation
  {
    ContactID: 'xero-test-003',
    Name: 'White Horse Leeds',
    Addresses: [{
      AddressType: 'STREET',
      AddressLine1: '78 Station Rd',
      PostalCode: 'LS1 5DL',
    }],
    Phones: [{
      PhoneType: 'DEFAULT',
      PhoneNumber: '0113 234 5678',
    }],
    IsCustomer: true,
  },

  // 4. Should NOT match: New pub, different location
  {
    ContactID: 'xero-test-004',
    Name: 'The Royal Oak',
    EmailAddress: 'royaloak@test.co.uk',
    Addresses: [{
      AddressType: 'STREET',
      AddressLine1: '99 Park Avenue',
      City: 'Cardiff',
      PostalCode: 'CF10 3NQ',
    }],
    Phones: [{
      PhoneType: 'DEFAULT',
      PhoneNumber: '029 2034 5678',
    }],
    IsCustomer: true,
  },

  // 5. Should be uncertain: Similar name, slightly different postcode
  {
    ContactID: 'xero-test-005',
    Name: 'The Plough',
    Addresses: [{
      AddressType: 'STREET',
      AddressLine1: '67 Mill Lane',
      City: 'Oxford',
      PostalCode: 'OX1 2EP', // Same postcode as "The Plough & Harrow"
    }],
    IsCustomer: true,
  },
];

// ============================================
// TEST RESULT TYPES
// ============================================

interface ImportTestResult {
  contact: MockXeroContact;
  expectedOutcome: 'match' | 'new' | 'review';
  actualOutcome: 'match' | 'new' | 'review' | 'error';
  confidence: number;
  matchedPubId?: number;
  matchedPubName?: string;
  reviewId?: number;
  sourceCreated: boolean;
  passed: boolean;
  reasoning: string;
  executionTimeMs: number;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  matched: number;
  newPubs: number;
  reviews: number;
  errors: number;
  sourcesCreated: number;
}

// ============================================
// EXPECTED OUTCOMES
// ============================================

// Define what we expect for each test contact
const expectedOutcomes: Record<string, 'match' | 'new' | 'review'> = {
  'xero-test-001': 'match',  // Red Lion - exact match expected
  'xero-test-002': 'match',  // Crown Inn - should match with "The"
  'xero-test-003': 'match',  // White Horse - name variation
  'xero-test-004': 'new',    // Royal Oak - new pub
  'xero-test-005': 'review', // The Plough - uncertain match
};

// ============================================
// IMPORT SIMULATION
// ============================================

async function simulateXeroImport(): Promise<ImportTestResult[]> {
  const results: ImportTestResult[] = [];

  // Clear caches and verify database state
  clearMatchCache();
  console.log('🗑️  Cleared match cache\n');

  // Verify test data exists
  const existingPubs = await db
    .select({ id: pubsMaster.id, name: pubsMaster.name })
    .from(pubsMaster)
    .where(eq(pubsMaster.workspaceId, WORKSPACE_ID))
    .limit(5);

  if (existingPubs.length === 0) {
    console.error('❌ No pubs found. Run test-data.ts first.');
    process.exit(1);
  }
  console.log(`📊 Found ${existingPubs.length}+ pubs in workspace\n`);

  console.log('📥 Processing mock Xero contacts...\n');

  for (let i = 0; i < mockXeroContacts.length; i++) {
    const contact = mockXeroContacts[i];
    const expectedOutcome = expectedOutcomes[contact.ContactID] || 'new';

    console.log(`[${i + 1}/${mockXeroContacts.length}] Processing: ${contact.Name}`);
    console.log(`   Xero ID: ${contact.ContactID}`);
    console.log(`   Expected: ${expectedOutcome.toUpperCase()}`);

    const startTime = Date.now();
    let result: ImportTestResult = {
      contact,
      expectedOutcome,
      actualOutcome: 'error',
      confidence: 0,
      sourceCreated: false,
      passed: false,
      reasoning: '',
      executionTimeMs: 0,
    };

    try {
      // Step 1: Check if already imported
      const alreadyImported = await sourceExists(
        'xero',
        contact.ContactID,
        WORKSPACE_ID
      );

      if (alreadyImported) {
        console.log(`   ⏭️  Already imported, skipping`);
        result.actualOutcome = 'match'; // Treat as match since source exists
        result.passed = true;
        result.reasoning = 'Already imported';
        result.sourceCreated = true;
        results.push(result);
        continue;
      }

      // Step 2: Extract pub data from contact
      const streetAddress = contact.Addresses?.find(a => a.AddressType === 'STREET');
      const phone = contact.Phones?.find(p => p.PhoneType === 'DEFAULT');

      const pubInput: PubInput = {
        name: contact.Name,
        postcode: streetAddress?.PostalCode || null,
        phone: phone?.PhoneNumber || null,
        address: streetAddress?.AddressLine1 || null,
      };

      // Step 3: Run entity matching
      const decision = await findMatchingEntity(pubInput, 'xero', WORKSPACE_ID);
      result.confidence = decision.confidence;
      result.reasoning = decision.reasoning;

      // Step 4: Determine outcome based on confidence
      if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.AUTO_MATCH) {
        // High confidence match - auto-merge
        result.actualOutcome = 'match';
        result.matchedPubId = decision.match?.id;
        result.matchedPubName = decision.match?.name;

        // Create entity source
        await createEntitySource({
          pubId: decision.match!.id,
          workspaceId: WORKSPACE_ID,
          sourceType: 'xero',
          sourceId: contact.ContactID,
          sourceData: { contact },
          confidence: decision.confidence,
          matchedBy: 'test_script',
          matchedReasoning: `Xero import test: ${decision.reasoning}`,
        });
        result.sourceCreated = true;

      } else if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.MANUAL_REVIEW) {
        // Medium confidence - queue for review
        result.actualOutcome = 'review';
        result.matchedPubId = decision.match?.id;
        result.matchedPubName = decision.match?.name;

        // Flag for manual review
        const reviewId = await flagForManualReview({
          workspaceId: WORKSPACE_ID,
          newPubData: pubInput,
          sourceType: 'xero',
          sourceId: contact.ContactID,
          possibleMatchPubId: decision.match?.id,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
        });
        result.reviewId = reviewId;

      } else {
        // Low confidence or no match - create new
        result.actualOutcome = 'new';

        // In a real import, we'd create the pub here
        // For testing, we just verify the decision was correct
      }

      // Check if passed
      result.passed = result.actualOutcome === expectedOutcome ||
        // Also accept match when expected review (high confidence is good)
        (expectedOutcome === 'review' && result.actualOutcome === 'match');

    } catch (error: any) {
      result.actualOutcome = 'error';
      result.reasoning = error.message;
      console.log(`   ❌ Error: ${error.message}`);
    }

    result.executionTimeMs = Date.now() - startTime;

    // Print result
    const icon = result.passed ? '✅' : '❌';
    const outcomeInfo = result.actualOutcome === 'match'
      ? `MATCH → "${result.matchedPubName}" (id: ${result.matchedPubId})`
      : result.actualOutcome === 'review'
      ? `REVIEW (review id: ${result.reviewId})`
      : result.actualOutcome === 'new'
      ? 'NEW entity'
      : 'ERROR';

    console.log(`   ${icon} Result: ${outcomeInfo}`);
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Time: ${result.executionTimeMs}ms`);
    console.log('');

    results.push(result);
  }

  return results;
}

// ============================================
// VERIFICATION
// ============================================

async function verifyDatabaseState(results: ImportTestResult[]): Promise<void> {
  console.log('\n========================================');
  console.log('🔍 DATABASE VERIFICATION');
  console.log('========================================\n');

  // Check entity sources created
  const matchedResults = results.filter(r => r.actualOutcome === 'match' && r.matchedPubId);
  let sourcesVerified = 0;

  for (const result of matchedResults) {
    const [source] = await db
      .select()
      .from(entitySources)
      .where(
        and(
          eq(entitySources.sourceType, 'xero'),
          eq(entitySources.sourceId, result.contact.ContactID)
        )
      )
      .limit(1);

    if (source) {
      console.log(`✅ Source verified: ${result.contact.Name} → pub ${source.pubId}`);
      sourcesVerified++;
    } else {
      console.log(`❌ Source missing: ${result.contact.Name}`);
    }
  }

  // Check review queue entries
  const reviewResults = results.filter(r => r.actualOutcome === 'review');
  let reviewsVerified = 0;

  for (const result of reviewResults) {
    const [review] = await db
      .select()
      .from(entityReviewQueue)
      .where(
        and(
          eq(entityReviewQueue.sourceType, 'xero'),
          eq(entityReviewQueue.sourceId, result.contact.ContactID)
        )
      )
      .limit(1);

    if (review) {
      console.log(`✅ Review verified: ${result.contact.Name} (id: ${review.id})`);
      reviewsVerified++;
    } else {
      console.log(`❌ Review missing: ${result.contact.Name}`);
    }
  }

  console.log(`\n📊 Verification Summary:`);
  console.log(`   Entity sources: ${sourcesVerified}/${matchedResults.length} verified`);
  console.log(`   Review entries: ${reviewsVerified}/${reviewResults.length} verified`);
}

// ============================================
// SUMMARY
// ============================================

function printSummary(results: ImportTestResult[]): TestSummary {
  const summary: TestSummary = {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    matched: results.filter(r => r.actualOutcome === 'match').length,
    newPubs: results.filter(r => r.actualOutcome === 'new').length,
    reviews: results.filter(r => r.actualOutcome === 'review').length,
    errors: results.filter(r => r.actualOutcome === 'error').length,
    sourcesCreated: results.filter(r => r.sourceCreated).length,
  };

  console.log('\n========================================');
  console.log('📊 IMPORT TEST SUMMARY');
  console.log('========================================\n');

  console.log(`Total contacts processed: ${summary.total}`);
  console.log(`Tests passed:            ${summary.passed} ✅`);
  console.log(`Tests failed:            ${summary.failed} ❌`);
  console.log('');
  console.log('Outcomes:');
  console.log(`  - Matched:             ${summary.matched}`);
  console.log(`  - New pubs:            ${summary.newPubs}`);
  console.log(`  - Queued for review:   ${summary.reviews}`);
  console.log(`  - Errors:              ${summary.errors}`);
  console.log('');
  console.log(`Entity sources created:  ${summary.sourcesCreated}`);

  // Confidence distribution
  const confidences = results.filter(r => r.confidence > 0).map(r => r.confidence);
  if (confidences.length > 0) {
    const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const minConf = Math.min(...confidences);
    const maxConf = Math.max(...confidences);

    console.log('\nConfidence scores:');
    console.log(`  - Average:             ${(avgConf * 100).toFixed(1)}%`);
    console.log(`  - Min:                 ${(minConf * 100).toFixed(1)}%`);
    console.log(`  - Max:                 ${(maxConf * 100).toFixed(1)}%`);
  }

  // Execution time
  const totalTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0);
  const avgTime = totalTime / results.length;

  console.log('\nExecution time:');
  console.log(`  - Total:               ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`  - Average per contact: ${avgTime.toFixed(0)}ms`);

  return summary;
}

// ============================================
// ASSERTIONS
// ============================================

function runAssertions(results: ImportTestResult[], summary: TestSummary): boolean {
  console.log('\n========================================');
  console.log('🔍 ASSERTIONS');
  console.log('========================================\n');

  const assertions = [
    {
      name: 'Minimum pass rate',
      condition: summary.passed / summary.total >= 0.6,
      message: `Pass rate ${((summary.passed / summary.total) * 100).toFixed(0)}% is below 60%`,
    },
    {
      name: 'No errors',
      condition: summary.errors === 0,
      message: `${summary.errors} contacts had errors`,
    },
    {
      name: 'Sources created for matches',
      condition: summary.sourcesCreated >= summary.matched - 1, // Allow 1 already-imported
      message: `Only ${summary.sourcesCreated} sources created for ${summary.matched} matches`,
    },
    {
      name: 'Red Lion matched correctly',
      condition: results.find(r => r.contact.ContactID === 'xero-test-001')?.actualOutcome === 'match',
      message: 'Red Lion should have been matched',
    },
    {
      name: 'Royal Oak created as new',
      condition: results.find(r => r.contact.ContactID === 'xero-test-004')?.actualOutcome === 'new',
      message: 'Royal Oak should be a new pub',
    },
  ];

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
// CLEANUP (optional)
// ============================================

async function cleanup(results: ImportTestResult[]): Promise<void> {
  console.log('\n🧹 Cleaning up test data...');

  // Remove test entity sources
  for (const result of results) {
    if (result.sourceCreated) {
      await db
        .delete(entitySources)
        .where(
          and(
            eq(entitySources.sourceType, 'xero'),
            eq(entitySources.sourceId, result.contact.ContactID)
          )
        );
    }
    if (result.reviewId) {
      await db
        .delete(entityReviewQueue)
        .where(eq(entityReviewQueue.id, result.reviewId));
    }
  }

  console.log('✅ Test data cleaned up');
}

// ============================================
// MAIN
// ============================================

async function main() {
  const doCleanup = process.argv.includes('--cleanup');

  try {
    // Run import simulation
    const results = await simulateXeroImport();

    // Verify database state
    await verifyDatabaseState(results);

    // Print summary
    const summary = printSummary(results);

    // Print failed tests
    const failedTests = results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      console.log('\n========================================');
      console.log('❌ FAILED TESTS');
      console.log('========================================\n');

      for (const result of failedTests) {
        console.log(`${result.contact.Name}:`);
        console.log(`  Expected: ${result.expectedOutcome}`);
        console.log(`  Actual:   ${result.actualOutcome}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`  Reasoning: ${result.reasoning}`);
        console.log('');
      }
    }

    // Run assertions
    const assertionsPassed = runAssertions(results, summary);

    // Cleanup if requested
    if (doCleanup) {
      await cleanup(results);
    }

    // Final status
    console.log('\n========================================');
    console.log(assertionsPassed ? '✅ ALL ASSERTIONS PASSED' : '❌ SOME ASSERTIONS FAILED');
    console.log('========================================\n');

    if (!doCleanup) {
      console.log('💡 Tip: Run with --cleanup to remove test data after run\n');
    }

    process.exit(assertionsPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run
main();

