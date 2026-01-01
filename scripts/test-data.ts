/**
 * Test Data Generator for Entity Resolution Testing
 * 
 * Creates sample pub data with intentional variations to test:
 * - Duplicate detection
 * - Name matching (with/without "The")
 * - Multi-source entities
 * - Similar names/postcodes
 * 
 * Run with: npx tsx scripts/test-data.ts
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pubsMaster, entitySources, entityReviewQueue } from '../shared/schema';

// Load environment
config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Create .env.local with your database connection.');
  process.exit(1);
}

const queryClient = postgres(process.env.DATABASE_URL);
const db = drizzle(queryClient);

// Test workspace ID (use 1 for testing, or pass via args)
const WORKSPACE_ID = parseInt(process.argv[2] || '1');

console.log('\n========================================');
console.log('🧪 Test Data Generator');
console.log('========================================\n');
console.log(`Workspace ID: ${WORKSPACE_ID}\n`);

// ============================================
// SAMPLE PUB DATA
// ============================================

interface TestPub {
  name: string;
  addressLine1?: string;
  city?: string;
  postcode?: string;
  phone?: string;
  isFreehouse?: boolean;
  isCustomer?: boolean;
  category?: string;
  notes?: string;
}

const testPubs: TestPub[] = [
  // === EXACT DUPLICATES ===
  // These should be detected as the same pub
  {
    name: 'The Red Lion',
    addressLine1: '45 High Street',
    city: 'Manchester',
    postcode: 'M1 4BT',
    phone: '0161 234 5678',
    isFreehouse: true,
    category: 'exact_dup',
    notes: 'Original - exact duplicate pair',
  },
  {
    name: 'The Red Lion',
    addressLine1: '45 High Street',
    city: 'Manchester',
    postcode: 'M1 4BT',
    phone: '0161 234 5678',
    isFreehouse: true,
    category: 'exact_dup',
    notes: 'Duplicate - should match exactly',
  },

  // === NAME VARIATIONS (with/without "The") ===
  {
    name: 'The Crown Inn',
    addressLine1: '12 Market Square',
    city: 'Birmingham',
    postcode: 'B2 4QA',
    phone: '0121 456 7890',
    isFreehouse: false,
    category: 'name_variation',
    notes: 'Original - with "The"',
  },
  {
    name: 'Crown Inn',
    addressLine1: '12 Market Square',
    city: 'Birmingham',
    postcode: 'B2 4QA',
    phone: '0121 456 7890',
    isFreehouse: false,
    category: 'name_variation',
    notes: 'Variation - without "The"',
  },

  // === SAME PUB, DIFFERENT SOURCES ===
  // Will create entity_sources to link these
  {
    name: 'The White Horse',
    addressLine1: '78 Station Road',
    city: 'Leeds',
    postcode: 'LS1 5DL',
    phone: '0113 234 5678',
    isFreehouse: true,
    isCustomer: true,
    category: 'multi_source',
    notes: 'Multi-source pub - spreadsheet origin',
  },

  // === SIMILAR NAMES, DIFFERENT POSTCODES ===
  // These are DIFFERENT pubs
  {
    name: 'The Black Bull',
    addressLine1: '23 Northgate',
    city: 'York',
    postcode: 'YO1 7NJ',
    phone: '01904 123456',
    isFreehouse: true,
    category: 'diff_location',
    notes: 'Black Bull York - different from Sheffield',
  },
  {
    name: 'The Black Bull',
    addressLine1: '156 West Street',
    city: 'Sheffield',
    postcode: 'S1 4ES',
    phone: '0114 276 5432',
    isFreehouse: true,
    category: 'diff_location',
    notes: 'Black Bull Sheffield - different from York',
  },

  // === SIMILAR POSTCODES, DIFFERENT NAMES ===
  // These are neighbours, not duplicates
  {
    name: 'The Ship Inn',
    addressLine1: '100 Harbour Road',
    city: 'Bristol',
    postcode: 'BS1 4RW',
    phone: '0117 929 0001',
    isFreehouse: false,
    category: 'neighbours',
    notes: 'Ship Inn - near Anchor but different',
  },
  {
    name: 'The Anchor',
    addressLine1: '102 Harbour Road',
    city: 'Bristol',
    postcode: 'BS1 4RW',
    phone: '0117 929 0002',
    isFreehouse: true,
    category: 'neighbours',
    notes: 'Anchor - near Ship but different',
  },

  // === SPELLING VARIATIONS ===
  {
    name: 'The Plough & Harrow',
    addressLine1: '67 Mill Lane',
    city: 'Oxford',
    postcode: 'OX1 2EP',
    phone: '01865 123456',
    isFreehouse: true,
    category: 'spelling',
    notes: 'Original - ampersand',
  },
  {
    name: 'The Plough and Harrow',
    addressLine1: '67 Mill Lane',
    city: 'Oxford',
    postcode: 'OX1 2EP',
    phone: '01865 123456',
    isFreehouse: true,
    category: 'spelling',
    notes: 'Variation - "and" spelled out',
  },

  // === ADDITIONAL UNIQUE PUBS ===
  {
    name: 'The Dog & Duck',
    addressLine1: '34 Church Lane',
    city: 'Cambridge',
    postcode: 'CB2 1LA',
    phone: '01223 567890',
    isFreehouse: true,
    category: 'unique',
    notes: 'Unique pub - no duplicates',
  },
  {
    name: 'The Three Tuns',
    addressLine1: '8 Market Place',
    city: 'Nottingham',
    postcode: 'NG1 2GN',
    phone: '0115 941 7890',
    isFreehouse: false,
    category: 'unique',
    notes: 'Unique pub - no duplicates',
  },
  {
    name: 'The Kings Arms',
    addressLine1: '22 Bridge Street',
    city: 'Chester',
    postcode: 'CH1 1NQ',
    phone: '01244 345678',
    isFreehouse: true,
    isCustomer: true,
    category: 'unique',
    notes: 'Unique pub - existing customer',
  },
  {
    name: 'The Rose & Crown',
    addressLine1: '56 London Road',
    city: 'Newcastle',
    postcode: 'NE1 4AG',
    phone: '0191 232 4567',
    isFreehouse: false,
    category: 'unique',
    notes: 'Unique pub - no duplicates',
  },
  {
    name: 'The Old Bell',
    addressLine1: '1 Abbey Gate',
    city: 'Bath',
    postcode: 'BA1 1LT',
    phone: '01225 987654',
    isFreehouse: true,
    category: 'unique',
    notes: 'Unique pub - freehouse',
  },
  {
    name: 'The Wheatsheaf',
    addressLine1: '89 Green Lane',
    city: 'Liverpool',
    postcode: 'L1 0AB',
    phone: '0151 709 1234',
    isFreehouse: true,
    category: 'unique',
    notes: 'Unique pub - no duplicates',
  },
  {
    name: 'The Fox & Hounds',
    addressLine1: '45 Park Road',
    city: 'Edinburgh',
    postcode: 'EH4 1QE',
    phone: '0131 225 6789',
    isFreehouse: false,
    category: 'unique',
    notes: 'Unique pub - Scotland',
  },
  {
    name: 'The Golden Fleece',
    addressLine1: '16 Pavement',
    city: 'York',
    postcode: 'YO1 9UP',
    phone: '01904 654321',
    isFreehouse: true,
    category: 'unique',
    notes: 'Unique pub - historic',
  },
  {
    name: 'The Lamb & Flag',
    addressLine1: '33 Rose Street',
    city: 'London',
    postcode: 'WC2E 9EB',
    phone: '020 7497 9504',
    isFreehouse: false,
    category: 'unique',
    notes: 'Unique pub - London',
  },
];

// ============================================
// REVIEW QUEUE ITEMS
// ============================================

interface TestReviewItem {
  newPubData: {
    name: string;
    address?: string;
    postcode?: string;
    phone?: string;
  };
  sourceType: string;
  sourceId?: string;
  confidence: number;
  reasoning: string;
  matchIndex?: number; // Index of pub to match against
}

const testReviewItems: TestReviewItem[] = [
  {
    newPubData: {
      name: 'Red Lion',
      address: '45 High St',
      postcode: 'M1 4BT',
      phone: '0161 234 5678',
    },
    sourceType: 'xero',
    sourceId: 'xero-contact-001',
    confidence: 0.92,
    reasoning: 'High confidence match: Name is similar (missing "The"), address and postcode match exactly.',
    matchIndex: 0,
  },
  {
    newPubData: {
      name: 'Crown Pub',
      address: '12 Market Sq',
      postcode: 'B2 4QA',
    },
    sourceType: 'google',
    sourceId: 'place-id-abc123',
    confidence: 0.75,
    reasoning: 'Medium confidence: Postcode matches, name similar but uses "Pub" instead of "Inn".',
    matchIndex: 2,
  },
  {
    newPubData: {
      name: 'The Plough',
      address: '67 Mill Lane',
      postcode: 'OX1 2EP',
    },
    sourceType: 'web_scrape',
    sourceId: 'scrape-456',
    confidence: 0.68,
    reasoning: 'Possible match: Same address, but name is truncated (missing "& Harrow").',
    matchIndex: 8,
  },
  {
    newPubData: {
      name: 'The Eagle',
      address: '99 New Street',
      postcode: 'M1 1AA',
    },
    sourceType: 'manual',
    confidence: 0.15,
    reasoning: 'Low confidence: No matching pub found in database. May be a new venue.',
  },
  {
    newPubData: {
      name: 'White Horse Inn',
      address: '78 Station Rd',
      postcode: 'LS1 5DL',
    },
    sourceType: 'xero',
    sourceId: 'xero-contact-002',
    confidence: 0.88,
    reasoning: 'High confidence: Name and postcode match, address abbreviation different.',
    matchIndex: 4,
  },
];

// ============================================
// MAIN EXECUTION
// ============================================

async function generateTestData() {
  console.log('📊 Generating test data...\n');
  
  const insertedPubs: { id: number; name: string; category: string }[] = [];
  
  // Insert pubs
  console.log('📍 Inserting pubs...');
  for (const pub of testPubs) {
    try {
      const [inserted] = await db
        .insert(pubsMaster)
        .values({
          workspaceId: WORKSPACE_ID,
          name: pub.name,
          addressLine1: pub.addressLine1 || null,
          city: pub.city || null,
          postcode: pub.postcode || null,
          phone: pub.phone || null,
          isFreehouse: pub.isFreehouse || false,
          isCustomer: pub.isCustomer || false,
          discoveredBy: 'test_script',
          discoveredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: pubsMaster.id });

      insertedPubs.push({
        id: inserted.id,
        name: pub.name,
        category: pub.category || 'unknown',
      });

      console.log(`   ✅ ${pub.name} (${pub.postcode}) - ID: ${inserted.id}`);
    } catch (error: any) {
      console.log(`   ❌ ${pub.name}: ${error.message}`);
    }
  }

  // Add entity sources for multi-source pub
  const whiteHorsePub = insertedPubs.find(p => p.name === 'The White Horse');
  if (whiteHorsePub) {
    console.log('\n🔗 Adding entity sources for multi-source pub...');
    
    const sources = [
      { sourceType: 'spreadsheet', sourceId: 'row-42', confidence: 0.95 },
      { sourceType: 'xero', sourceId: 'xero-c-12345', confidence: 0.88 },
      { sourceType: 'google', sourceId: 'ChIJxyz123', confidence: 0.92 },
    ];

    for (const source of sources) {
      try {
        await db.insert(entitySources).values({
          pubId: whiteHorsePub.id,
          workspaceId: WORKSPACE_ID,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          confidence: source.confidence,
          matchedAt: new Date(),
          matchedBy: 'test_script',
          matchedReasoning: `Test source link: ${source.sourceType}`,
          createdAt: new Date(),
        });
        console.log(`   ✅ Linked ${source.sourceType} source to The White Horse`);
      } catch (error: any) {
        console.log(`   ❌ ${source.sourceType}: ${error.message}`);
      }
    }
  }

  // Add review queue items
  console.log('\n📋 Adding review queue items...');
  for (const item of testReviewItems) {
    try {
      const matchPubId = item.matchIndex !== undefined 
        ? insertedPubs[item.matchIndex]?.id 
        : null;

      await db.insert(entityReviewQueue).values({
        workspaceId: WORKSPACE_ID,
        newPubData: item.newPubData,
        sourceType: item.sourceType,
        sourceId: item.sourceId || null,
        possibleMatchPubId: matchPubId,
        confidence: item.confidence,
        reasoning: item.reasoning,
        status: 'pending',
        createdAt: new Date(),
      });
      
      console.log(`   ✅ Review item: "${item.newPubData.name}" (${(item.confidence * 100).toFixed(0)}% confidence)`);
    } catch (error: any) {
      console.log(`   ❌ ${item.newPubData.name}: ${error.message}`);
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('📊 SUMMARY');
  console.log('========================================\n');

  const categories = insertedPubs.reduce((acc, pub) => {
    acc[pub.category] = (acc[pub.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`Total pubs inserted: ${insertedPubs.length}`);
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(categories)) {
    const label = {
      exact_dup: 'Exact duplicates',
      name_variation: 'Name variations',
      multi_source: 'Multi-source',
      diff_location: 'Different locations',
      neighbours: 'Neighbouring pubs',
      spelling: 'Spelling variations',
      unique: 'Unique pubs',
    }[cat] || cat;
    console.log(`  - ${label}: ${count}`);
  }

  console.log(`\nReview queue items: ${testReviewItems.length}`);
  console.log('  - High confidence (>80%): ' + testReviewItems.filter(i => i.confidence > 0.8).length);
  console.log('  - Medium confidence (50-80%): ' + testReviewItems.filter(i => i.confidence >= 0.5 && i.confidence <= 0.8).length);
  console.log('  - Low confidence (<50%): ' + testReviewItems.filter(i => i.confidence < 0.5).length);

  console.log('\n✅ Test data generation complete!');
  console.log('   Visit /entity-review to test the review queue.');
  console.log('========================================\n');
}

// Run
generateTestData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

