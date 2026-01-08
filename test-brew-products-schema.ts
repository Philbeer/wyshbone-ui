import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { brewProducts } from './shared/schema.js';

const DATABASE_URL = "postgresql://postgres.zipsbmldjxytzowmmohu:Moby2014Moby2014Lister@aws-1-eu-west-2.pooler.supabase.com:6543/postgres";
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function testBrewProductsSchema() {
  try {
    console.log('\n=== Testing brew_products table ===\n');

    // Test: Query all products
    console.log('Test: Query all brew_products');
    const allProducts = await db.select().from(brewProducts).limit(5);
    console.log(`✅ Found ${allProducts.length} products`);

    if (allProducts.length > 0) {
      console.log('First product:', {
        id: allProducts[0].id,
        name: allProducts[0].name,
        xeroItemId: allProducts[0].xeroItemId,
        workspaceId: allProducts[0].workspaceId
      });
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
  } finally {
    await client.end();
  }
}

testBrewProductsSchema();
