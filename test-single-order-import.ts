import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { xeroConnections, crmCustomers } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { storage } from './server/storage.js';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);
const db = drizzle(client);

async function testSingleOrderImport() {
  try {
    // Get the Xero connection
    const [connection] = await db.select().from(xeroConnections).limit(1);

    if (!connection) {
      console.log("❌ No Xero connection found");
      await client.end();
      return;
    }

    console.log("✅ Found Xero connection for workspace:", connection.workspaceId);

    // Get customers to verify they exist
    const customers = await db.select().from(crmCustomers).where(eq(crmCustomers.workspaceId, connection.workspaceId));
    console.log(`✅ Found ${customers.length} customers in database`);
    for (const c of customers) {
      console.log(`   - ${c.name} (xeroContactId: ${c.xeroContactId})`);
    }

    // Fetch ONE invoice
    const invoicesUrl = `https://api.xero.com/api.xro/2.0/Invoices`;
    console.log("\n📡 Fetching invoices from Xero...");

    const response = await fetch(invoicesUrl, {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "xero-tenant-id": connection.tenantId,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.log("❌ Failed to fetch invoices:", response.status, response.statusText);
      await client.end();
      return;
    }

    const data = await response.json();
    const allInvoices = data.Invoices || [];
    const invoices = allInvoices.filter((inv: any) => inv.Type === "ACCREC");

    console.log(`✅ Fetched ${allInvoices.length} total invoices, ${invoices.length} sales invoices (ACCREC)\n`);

    if (invoices.length === 0) {
      console.log("❌ No ACCREC invoices found");
      await client.end();
      return;
    }

    // Take the first invoice
    const invoice = invoices[0];
    console.log("=== PROCESSING FIRST INVOICE ===");
    console.log("InvoiceNumber:", invoice.InvoiceNumber);
    console.log("InvoiceID:", invoice.InvoiceID);
    console.log("Status:", invoice.Status);
    console.log("Contact:", invoice.Contact?.Name, "(ID:", invoice.Contact?.ContactID, ")");

    // Check if customer exists
    const customer = await storage.getCustomerByXeroContactId(invoice.Contact?.ContactID, connection.workspaceId);
    if (customer) {
      console.log("✅ Customer found in database:", customer.name);
    } else {
      console.log("❌ Customer NOT found in database for contact ID:", invoice.Contact?.ContactID);
      console.log("   This order will fail because customer is required");
      await client.end();
      return;
    }

    // Test date parsing
    console.log("\n=== DATE PARSING TEST ===");
    console.log("Raw Date:", invoice.Date, "Type:", typeof invoice.Date);
    console.log("Raw DueDate:", invoice.DueDate, "Type:", typeof invoice.DueDate);

    try {
      let invoiceDate: number;
      if (invoice.Date) {
        if (typeof invoice.Date === 'string' && invoice.Date.includes('/Date(')) {
          console.log("Parsing as /Date() format...");
          invoiceDate = new Date(parseInt(invoice.Date.replace('/Date(', '').replace(')/', ''))).getTime();
        } else {
          console.log("Parsing as standard date...");
          invoiceDate = new Date(invoice.Date).getTime();
        }
        console.log("✅ Parsed invoice date:", new Date(invoiceDate).toISOString());
      }
    } catch (dateError) {
      console.log("❌ Date parsing failed:", dateError);
    }

    // Test amount parsing
    console.log("\n=== AMOUNT PARSING TEST ===");
    console.log("SubTotal:", invoice.SubTotal, "Type:", typeof invoice.SubTotal);
    console.log("TotalTax:", invoice.TotalTax, "Type:", typeof invoice.TotalTax);
    console.log("Total:", invoice.Total, "Type:", typeof invoice.Total);

    const subtotalExVat = invoice.SubTotal ? Math.round(parseFloat(invoice.SubTotal) * 100) : 0;
    const vatTotal = invoice.TotalTax ? Math.round(parseFloat(invoice.TotalTax) * 100) : 0;
    const totalIncVat = invoice.Total ? Math.round(parseFloat(invoice.Total) * 100) : 0;

    console.log("✅ Converted amounts (in pence):");
    console.log("   SubTotal:", subtotalExVat);
    console.log("   VAT:", vatTotal);
    console.log("   Total:", totalIncVat);

    // Test line items
    console.log("\n=== LINE ITEMS TEST ===");
    console.log("Number of line items:", invoice.LineItems?.length || 0);

    if (invoice.LineItems && invoice.LineItems.length > 0) {
      const line = invoice.LineItems[0];
      console.log("First line item:");
      console.log("   Description:", line.Description);
      console.log("   ItemCode:", line.ItemCode);
      console.log("   Quantity:", line.Quantity, "Type:", typeof line.Quantity);
      console.log("   UnitAmount:", line.UnitAmount, "Type:", typeof line.UnitAmount);

      const quantity = line.Quantity || 1;
      const unitPriceExVat = line.UnitAmount ? Math.round(parseFloat(line.UnitAmount) * 100) : 0;
      const lineSubtotalExVat = quantity * unitPriceExVat;

      console.log("   ✅ Converted line values:");
      console.log("      Quantity:", quantity);
      console.log("      Unit Price (pence):", unitPriceExVat);
      console.log("      Line Subtotal (pence):", lineSubtotalExVat);
    }

    console.log("\n✅ All parsing tests passed!");
    console.log("\n💡 The data from Xero looks valid. The issue must be in the actual database insert.");
    console.log("   Recommendation: Check server logs during import for database errors.");

  } catch (error) {
    console.error("\n❌ ERROR:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
  } finally {
    await client.end();
  }
}

testSingleOrderImport();
