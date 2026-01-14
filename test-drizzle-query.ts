import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { crmOrders } from './shared/schema.js';
import { eq, and } from 'drizzle-orm';

const DATABASE_URL = "postgresql://postgres.zipsbmldjxytzowmmohu:Moby2014Moby2014Lister@aws-1-eu-west-2.pooler.supabase.com:6543/postgres";
const client = postgres(DATABASE_URL);
const db = drizzle(client);

async function testDrizzleQuery() {
  try {
    console.log('\n=== Testing Drizzle query on crm_orders ===\n');

    // Test 1: Simple select all
    console.log('Test 1: Select all orders');
    const allOrders = await db.select().from(crmOrders).limit(1);
    console.log(`✅ Found ${allOrders.length} orders`);
    if (allOrders.length > 0) {
      console.log('First order:', {
        id: allOrders[0].id,
        xeroInvoiceId: allOrders[0].xeroInvoiceId,
        workspaceId: allOrders[0].workspaceId
      });
    }

    // Test 2: Query with where clause on xeroInvoiceId
    console.log('\nTest 2: Query with xeroInvoiceId filter');
    const testId = 'c111b12f-82fc-4bf0-9bc5-46305e9d9a8c';
    const testWorkspace = '0a9ea70d9774a1564b410073a4a47ba6';

    const [order] = await db.select().from(crmOrders)
      .where(and(
        eq(crmOrders.xeroInvoiceId, testId),
        eq(crmOrders.workspaceId, testWorkspace)
      ));

    if (order) {
      console.log('✅ Query succeeded, found order:', order.id);
    } else {
      console.log('✅ Query succeeded, no matching order (expected if not imported yet)');
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

testDrizzleQuery();
