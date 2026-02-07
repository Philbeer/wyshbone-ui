import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { xeroConnections } from './shared/schema.js';
import { eq } from 'drizzle-orm';

// Supabase is the only supported database.
if (!process.env.SUPABASE_DATABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}
const client = postgres(process.env.SUPABASE_DATABASE_URL);
const db = drizzle(client);

async function testXeroInvoice() {
  // Get the Xero connection
  const [connection] = await db.select().from(xeroConnections).limit(1);

  if (!connection) {
    console.log("No Xero connection found");
    await client.end();
    return;
  }

  console.log("Found Xero connection for tenant:", connection.tenantId);

  // Fetch a single invoice
  const invoicesUrl = `https://api.xero.com/api.xro/2.0/Invoices`;

  const response = await fetch(invoicesUrl, {
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "xero-tenant-id": connection.tenantId,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.log("Failed to fetch invoices:", response.status, response.statusText);
    await client.end();
    return;
  }

  const data = await response.json();
  const allInvoices = data.Invoices || [];
  const invoices = allInvoices.filter((inv: any) => inv.Type === "ACCREC");

  console.log(`\nTotal invoices: ${allInvoices.length}, ACCREC invoices: ${invoices.length}`);

  if (invoices.length > 0) {
    const invoice = invoices[0];
    console.log("\n=== FIRST INVOICE ===");
    console.log("InvoiceNumber:", invoice.InvoiceNumber);
    console.log("InvoiceID:", invoice.InvoiceID);
    console.log("Status:", invoice.Status);
    console.log("Type:", invoice.Type);
    console.log("Contact Name:", invoice.Contact?.Name);
    console.log("Contact ID:", invoice.Contact?.ContactID);
    console.log("\n--- DATE FIELDS ---");
    console.log("Date (raw):", invoice.Date, "type:", typeof invoice.Date);
    console.log("DueDate (raw):", invoice.DueDate, "type:", typeof invoice.DueDate);
    console.log("\n--- AMOUNT FIELDS ---");
    console.log("SubTotal:", invoice.SubTotal, "type:", typeof invoice.SubTotal);
    console.log("TotalTax:", invoice.TotalTax, "type:", typeof invoice.TotalTax);
    console.log("Total:", invoice.Total, "type:", typeof invoice.Total);
    console.log("\n--- LINE ITEMS ---");
    console.log("Number of line items:", invoice.LineItems?.length || 0);
    if (invoice.LineItems && invoice.LineItems.length > 0) {
      const line = invoice.LineItems[0];
      console.log("\nFirst line item:");
      console.log("  Description:", line.Description);
      console.log("  ItemCode:", line.ItemCode);
      console.log("  Quantity:", line.Quantity, "type:", typeof line.Quantity);
      console.log("  UnitAmount:", line.UnitAmount, "type:", typeof line.UnitAmount);
      console.log("  LineAmount:", line.LineAmount, "type:", typeof line.LineAmount);
      console.log("  TaxAmount:", line.TaxAmount, "type:", typeof line.TaxAmount);
      console.log("  LineItemID:", line.LineItemID);
    }
  }

  await client.end();
}

testXeroInvoice().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
