/**
 * Xero Two-Way Sync Service
 * Handles webhooks from Xero and automatic sync to Xero
 */
import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import type { IStorage } from "../storage";
import { XeroClient } from "xero-node";
import { 
  importXeroSuppliers, 
  importXeroSuppliersWithPurchases,
  importXeroPurchases,
  importXeroBills,
  fullXeroSupplierSync,
} from "../lib/xero-import";

// Webhook signing key for verifying Xero webhooks
const XERO_WEBHOOK_KEY = process.env.XERO_WEBHOOK_KEY || "";

// Xero OAuth credentials
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";

// Status mappings
const WYSHBONE_TO_XERO_STATUS: Record<string, string> = {
  'draft': 'DRAFT',
  'pending': 'SUBMITTED',
  'confirmed': 'AUTHORISED',
  'delivered': 'PAID',
  'dispatched': 'AUTHORISED',
  'cancelled': 'VOIDED',
};

const XERO_TO_WYSHBONE_STATUS: Record<string, string> = {
  'DRAFT': 'draft',
  'SUBMITTED': 'pending',
  'AUTHORISED': 'confirmed',
  'PAID': 'delivered',
  'VOIDED': 'cancelled',
};

export function createXeroSyncRouter(storage: IStorage) {
  const router = Router();

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Verify Xero webhook signature
   */
  function verifyXeroWebhookSignature(payload: string, signature: string): boolean {
    if (!XERO_WEBHOOK_KEY) {
      console.warn("⚠️ XERO_WEBHOOK_KEY not set - accepting all webhooks in dev mode");
      return process.env.NODE_ENV === 'development';
    }

    const hash = createHmac('sha256', XERO_WEBHOOK_KEY)
      .update(payload)
      .digest('base64');
    
    return hash === signature;
  }

  /**
   * Get authenticated Xero client for a workspace
   */
  async function getXeroClient(workspaceId: string): Promise<{ client: XeroClient; tenantId: string } | null> {
    const connection = await storage.getXeroConnection(workspaceId);
    if (!connection || !connection.isConnected) {
      return null;
    }

    // Check if token is expired and refresh if needed
    const now = new Date();
    if (connection.tokenExpiresAt < now) {
      try {
        const xero = new XeroClient({
          clientId: XERO_CLIENT_ID,
          clientSecret: XERO_CLIENT_SECRET,
          redirectUris: [],
          scopes: [],
        });

        const newTokens = await xero.refreshToken();
        
        await storage.updateXeroTokens(
          workspaceId,
          newTokens.access_token!,
          newTokens.refresh_token!,
          new Date(Date.now() + (newTokens.expires_in! * 1000))
        );
        
        return { client: xero, tenantId: connection.tenantId };
      } catch (error) {
        console.error(`Failed to refresh Xero token for workspace ${workspaceId}:`, error);
        return null;
      }
    }

    // Create client with valid token
    const xero = new XeroClient({
      clientId: XERO_CLIENT_ID,
      clientSecret: XERO_CLIENT_SECRET,
      redirectUris: [],
      scopes: [],
    });
    
    xero.setTokenSet({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
      expires_at: Math.floor(connection.tokenExpiresAt.getTime() / 1000),
    });

    return { client: xero, tenantId: connection.tenantId };
  }

  // ============================================
  // WEBHOOK ENDPOINT
  // ============================================

  router.post("/webhooks/xero", async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-xero-signature'] as string;
      const rawBody = JSON.stringify(req.body);

      // Verify webhook signature
      if (!verifyXeroWebhookSignature(rawBody, signature)) {
        console.error("Invalid Xero webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { events } = req.body;

      if (!events || !Array.isArray(events)) {
        return res.status(200).json({ received: true });
      }

      console.log(`📥 Received ${events.length} Xero webhook events`);

      for (const event of events) {
        try {
          // Find workspace by tenant ID
          const connection = await storage.getXeroConnectionByTenantId(event.tenantId);
          if (!connection) {
            console.warn(`No workspace found for Xero tenant ${event.tenantId}`);
            continue;
          }

          // Check if already processed (idempotency)
          const existing = await storage.getWebhookEvent(event.eventId);
          if (existing?.processed) {
            console.log(`Skipping duplicate webhook event ${event.eventId}`);
            continue;
          }

          // Store webhook event
          await storage.createWebhookEvent({
            workspaceId: connection.workspaceId,
            eventId: event.eventId,
            eventType: event.eventType,
            eventCategory: event.eventCategory,
            resourceId: event.resourceId,
            tenantId: event.tenantId,
            eventDate: new Date(event.eventDateUtc),
          });

          // Process event asynchronously
          processWebhookEvent(event, connection.workspaceId).catch(error => {
            console.error(`Webhook processing failed for ${event.eventId}:`, error);
            storage.markWebhookProcessed(event.eventId, error.message);
          });

        } catch (error: any) {
          console.error(`Error processing webhook event:`, error);
        }
      }

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ============================================
  // WEBHOOK EVENT PROCESSORS
  // ============================================

  async function processWebhookEvent(event: any, workspaceId: string) {
    console.log(`🔄 Processing ${event.eventCategory} ${event.eventType} event ${event.eventId}`);

    try {
      switch (event.eventCategory) {
        case 'INVOICE':
          await handleInvoiceWebhook(event, workspaceId);
          break;
        case 'CONTACT':
          await handleContactWebhook(event, workspaceId);
          break;
        case 'ITEM':
          await handleItemWebhook(event, workspaceId);
          break;
        default:
          console.log(`Unknown event category: ${event.eventCategory}`);
      }

      await storage.markWebhookProcessed(event.eventId);
      console.log(`✅ Processed event ${event.eventId}`);
    } catch (error: any) {
      console.error(`Failed to process event ${event.eventId}:`, error);
      await storage.markWebhookProcessed(event.eventId, error.message);
      throw error;
    }
  }

  // ============================================
  // INVOICE WEBHOOK HANDLERS
  // ============================================

  async function handleInvoiceWebhook(event: any, workspaceId: string) {
    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) {
      throw new Error("Could not get Xero client");
    }

    const { client: xero, tenantId } = xeroData;

    switch (event.eventType) {
      case 'CREATE':
        await importSingleInvoice(event.resourceId, workspaceId, xero, tenantId);
        break;
      case 'UPDATE':
        await updateInvoiceFromXero(event.resourceId, workspaceId, xero, tenantId);
        break;
      case 'DELETE':
        await voidInvoiceFromXero(event.resourceId, workspaceId);
        break;
    }
  }

  async function importSingleInvoice(
    invoiceId: string,
    workspaceId: string,
    xero: XeroClient,
    tenantId: string
  ) {
    const response = await xero.accountingApi.getInvoice(tenantId, invoiceId);
    const invoices = response.body.invoices;
    
    if (!invoices || invoices.length === 0) {
      console.warn(`Invoice ${invoiceId} not found in Xero`);
      return;
    }

    const invoice = invoices[0];

    // Check if already exists locally
    const existing = await storage.getOrderByXeroInvoiceId(invoiceId, workspaceId);
    if (existing) {
      console.log(`Invoice ${invoiceId} already exists locally, skipping import`);
      return;
    }

    // Get or create customer
    let customer = null;
    if (invoice.contact?.contactID) {
      customer = await storage.getCustomerByXeroContactId(invoice.contact.contactID, workspaceId);
      if (!customer) {
        customer = await importSingleContact(invoice.contact.contactID, workspaceId, xero, tenantId);
      }
    }

    if (!customer) {
      console.warn(`Could not find/create customer for invoice ${invoiceId}`);
      return;
    }

    // Create order
    const now = Date.now();
    const orderId = `ord_${now}_${Math.random().toString(36).slice(2, 8)}`;
    
    const newOrder = await storage.createCrmOrder({
      id: orderId,
      workspaceId,
      customerId: customer.id,
      orderNumber: invoice.invoiceNumber || `XERO-${invoiceId.slice(0, 8)}`,
      orderDate: invoice.date ? new Date(invoice.date).getTime() : now,
      status: XERO_TO_WYSHBONE_STATUS[invoice.status!] || 'pending',
      currency: invoice.currencyCode || 'GBP',
      subtotalExVat: Math.round((invoice.subTotal || 0) * 100),
      vatTotal: Math.round((invoice.totalTax || 0) * 100),
      totalIncVat: Math.round((invoice.total || 0) * 100),
      xeroInvoiceId: invoice.invoiceID,
      xeroInvoiceNumber: invoice.invoiceNumber,
      syncStatus: 'synced',
      lastXeroSyncAt: new Date(),
      createdAt: now,
      updatedAt: now,
    });

    // Create order lines
    for (const line of invoice.lineItems || []) {
      let product = null;

      if (line.itemCode) {
        product = await storage.getProductByXeroItemCode(line.itemCode, workspaceId);
      }

      const lineId = `line_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const unitPrice = Math.round((line.unitAmount || 0) * 100);
      const quantity = line.quantity || 1;
      const lineSubtotal = unitPrice * quantity;
      const vatRate = 2000; // Default 20% VAT
      const lineVat = Math.round(lineSubtotal * 0.2);
      const lineTotal = lineSubtotal + lineVat;

      await storage.createCrmOrderLine({
        id: lineId,
        orderId: newOrder.id,
        productId: product?.id,
        description: line.description || 'Unknown item',
        quantity,
        unitPriceExVat: unitPrice,
        vatRate,
        lineSubtotalExVat: lineSubtotal,
        lineVatAmount: lineVat,
        lineTotalIncVat: lineTotal,
        xeroLineItemId: line.lineItemID,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`✅ Imported invoice ${invoiceId} as order ${orderId}`);
  }

  async function updateInvoiceFromXero(
    invoiceId: string,
    workspaceId: string,
    xero: XeroClient,
    tenantId: string
  ) {
    const response = await xero.accountingApi.getInvoice(tenantId, invoiceId);
    const invoices = response.body.invoices;
    
    if (!invoices || invoices.length === 0) return;
    const invoice = invoices[0];

    const order = await storage.getOrderByXeroInvoiceId(invoiceId, workspaceId);
    if (!order) {
      // Doesn't exist locally, import it
      await importSingleInvoice(invoiceId, workspaceId, xero, tenantId);
      return;
    }

    // Update order
    await storage.updateCrmOrder(order.id, workspaceId, {
      status: XERO_TO_WYSHBONE_STATUS[invoice.status!] || order.status,
      subtotalExVat: Math.round((invoice.subTotal || 0) * 100),
      vatTotal: Math.round((invoice.totalTax || 0) * 100),
      totalIncVat: Math.round((invoice.total || 0) * 100),
      syncStatus: 'synced',
      lastXeroSyncAt: new Date(),
    });

    console.log(`✅ Updated order ${order.id} from Xero invoice ${invoiceId}`);
  }

  async function voidInvoiceFromXero(invoiceId: string, workspaceId: string) {
    const order = await storage.getOrderByXeroInvoiceId(invoiceId, workspaceId);
    if (!order) return;

    await storage.updateCrmOrder(order.id, workspaceId, {
      status: 'cancelled',
      syncStatus: 'synced',
      lastXeroSyncAt: new Date(),
    });

    console.log(`✅ Voided order ${order.id} from Xero`);
  }

  // ============================================
  // CONTACT WEBHOOK HANDLERS
  // ============================================

  async function handleContactWebhook(event: any, workspaceId: string) {
    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) return;

    const { client: xero, tenantId } = xeroData;

    // Fetch the contact to check if it's a customer or supplier
    const response = await xero.accountingApi.getContact(tenantId, event.resourceId);
    const contacts = response.body.contacts;
    
    if (!contacts || contacts.length === 0) {
      console.warn(`Contact ${event.resourceId} not found in Xero`);
      return;
    }

    const contact = contacts[0];

    // Handle based on contact type
    if (contact.isSupplier) {
      // This is a supplier - re-import suppliers to update
      console.log(`📥 Contact ${event.resourceId} is a supplier, triggering supplier sync`);
      try {
        await importXeroSuppliers(workspaceId, storage);
      } catch (error) {
        console.error(`Failed to sync supplier ${event.resourceId}:`, error);
      }
    }
    
    if (contact.isCustomer || !contact.isSupplier) {
      // This is a customer (or both) - handle as customer
      switch (event.eventType) {
        case 'CREATE':
          await importSingleContact(event.resourceId, workspaceId, xero, tenantId);
          break;
        case 'UPDATE':
          await updateContactFromXero(event.resourceId, workspaceId, xero, tenantId);
          break;
      }
    }
  }

  async function importSingleContact(
    contactId: string,
    workspaceId: string,
    xero: XeroClient,
    tenantId: string
  ) {
    const response = await xero.accountingApi.getContact(tenantId, contactId);
    const contacts = response.body.contacts;
    
    if (!contacts || contacts.length === 0) {
      console.warn(`Contact ${contactId} not found in Xero`);
      return null;
    }

    const contact = contacts[0];

    // Check if already exists
    const existing = await storage.getCustomerByXeroContactId(contactId, workspaceId);
    if (existing) {
      return existing;
    }

    // Find address
    const streetAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET');
    const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT');

    const now = Date.now();
    const customerId = `cust_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const customer = await storage.createCrmCustomer({
      id: customerId,
      workspaceId,
      name: contact.name || 'Unknown',
      email: contact.emailAddress,
      phone: phone?.phoneNumber,
      addressLine1: streetAddress?.addressLine1,
      addressLine2: streetAddress?.addressLine2,
      city: streetAddress?.city,
      postcode: streetAddress?.postalCode,
      country: streetAddress?.country || 'United Kingdom',
      xeroContactId: contact.contactID,
      xeroSyncStatus: 'synced',
      lastXeroSyncAt: new Date(),
      createdAt: now,
      updatedAt: now,
    });

    console.log(`✅ Imported contact ${contactId} as customer ${customerId}`);
    return customer;
  }

  async function updateContactFromXero(
    contactId: string,
    workspaceId: string,
    xero: XeroClient,
    tenantId: string
  ) {
    const response = await xero.accountingApi.getContact(tenantId, contactId);
    const contacts = response.body.contacts;
    
    if (!contacts || contacts.length === 0) return;
    const contact = contacts[0];

    const customer = await storage.getCustomerByXeroContactId(contactId, workspaceId);
    if (!customer) {
      await importSingleContact(contactId, workspaceId, xero, tenantId);
      return;
    }

    const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT');

    await storage.updateCrmCustomer(customer.id, workspaceId, {
      name: contact.name || customer.name,
      email: contact.emailAddress || customer.email,
      phone: phone?.phoneNumber || customer.phone,
      xeroSyncStatus: 'synced',
      lastXeroSyncAt: new Date(),
    });

    console.log(`✅ Updated customer ${customer.id} from Xero contact ${contactId}`);
  }

  // ============================================
  // ITEM WEBHOOK HANDLERS
  // ============================================

  async function handleItemWebhook(event: any, workspaceId: string) {
    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) return;

    const { client: xero, tenantId } = xeroData;

    switch (event.eventType) {
      case 'CREATE':
      case 'UPDATE':
        await importSingleItem(event.resourceId, workspaceId, xero, tenantId);
        break;
    }
  }

  async function importSingleItem(
    itemId: string,
    workspaceId: string,
    xero: XeroClient,
    tenantId: string
  ) {
    const response = await xero.accountingApi.getItem(tenantId, itemId);
    const items = response.body.items;
    
    if (!items || items.length === 0) return;
    const item = items[0];

    const existing = await storage.getProductByXeroItemId(itemId, workspaceId);

    if (existing) {
      await storage.updateBrewProduct(existing.id, workspaceId, {
        name: item.name || existing.name,
        sku: item.code || existing.sku,
        description: item.description || existing.description,
        defaultUnitPriceExVat: Math.round((item.salesDetails?.unitPrice || 0) * 100),
        syncStatus: 'synced',
        lastXeroSyncAt: new Date(),
      });
      console.log(`✅ Updated product ${existing.id} from Xero item ${itemId}`);
    } else {
      const now = Date.now();
      const productId = `prod_${now}_${Math.random().toString(36).slice(2, 8)}`;

      await storage.createBrewProduct({
        id: productId,
        workspaceId,
        name: item.name || 'Unknown Product',
        sku: item.code || `XERO-${itemId.slice(0, 8)}`,
        description: item.description,
        defaultUnitPriceExVat: Math.round((item.salesDetails?.unitPrice || 0) * 100),
        xeroItemId: item.itemID,
        xeroItemCode: item.code,
        isActive: !(item as any).isDeleted,
        syncStatus: 'synced',
        lastXeroSyncAt: new Date(),
        createdAt: now,
        updatedAt: now,
        // Required brewery fields with defaults
        abv: 0,
        defaultPackageType: 'keg',
        defaultPackageSizeLitres: 50000,
        dutyBand: 'beer_standard',
      });
      console.log(`✅ Created product ${productId} from Xero item ${itemId}`);
    }
  }

  // ============================================
  // WYSHBONE → XERO SYNC FUNCTIONS
  // ============================================

  /**
   * Sync an order from Wyshbone to Xero
   */
  async function syncOrderToXero(orderId: string, workspaceId: string): Promise<void> {
    console.log(`📤 Syncing order ${orderId} to Xero...`);

    const order = await storage.getCrmOrder(orderId, workspaceId);
    if (!order) throw new Error('Order not found');

    // Skip if already synced to Xero
    if (order.xeroInvoiceId) {
      console.log(`Order ${orderId} already has Xero invoice ${order.xeroInvoiceId}`);
      return;
    }

    await storage.updateOrderSyncStatus(orderId, workspaceId, 'pending');

    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) {
      throw new Error('Xero not connected');
    }

    const { client: xero, tenantId } = xeroData;

    // Get customer
    const customer = await storage.getCrmCustomer(order.customerId, workspaceId);
    if (!customer) throw new Error('Customer not found');

    // Ensure customer synced to Xero first
    if (!customer.xeroContactId) {
      await syncCustomerToXero(customer.id, workspaceId);
      // Re-fetch customer to get xeroContactId
      const updatedCustomer = await storage.getCrmCustomer(customer.id, workspaceId);
      if (!updatedCustomer?.xeroContactId) {
        throw new Error('Failed to sync customer to Xero');
      }
      customer.xeroContactId = updatedCustomer.xeroContactId;
    }

    // Get order lines
    const orderLines = await storage.getOrderLinesForOrder(orderId, workspaceId);

    // Map to Xero format
    const xeroInvoice = {
      type: 'ACCREC' as any,
      contact: { contactID: customer.xeroContactId },
      date: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : undefined,
      dueDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : undefined,
      status: (WYSHBONE_TO_XERO_STATUS[order.status] || 'DRAFT') as any,
      lineItems: orderLines.map(line => ({
        description: line.description || 'Unknown item',
        quantity: line.quantity,
        unitAmount: (line.unitPriceExVat || 0) / 100, // Convert from pence to pounds
      })),
    };

    // Create invoice in Xero
    const response = await xero.accountingApi.createInvoices(tenantId, { invoices: [xeroInvoice] });
    
    const createdInvoice = response.body.invoices?.[0];
    if (!createdInvoice) {
      throw new Error('Failed to create invoice in Xero');
    }

    // Update local order with Xero details
    await storage.updateCrmOrder(orderId, workspaceId, {
      xeroInvoiceId: createdInvoice.invoiceID,
      xeroInvoiceNumber: createdInvoice.invoiceNumber,
      syncStatus: 'synced',
      lastXeroSyncAt: new Date(),
    });

    console.log(`✅ Synced order ${orderId} to Xero as invoice ${createdInvoice.invoiceNumber}`);
  }

  /**
   * Update an order in Xero
   */
  async function updateOrderInXero(orderId: string, workspaceId: string): Promise<void> {
    const order = await storage.getCrmOrder(orderId, workspaceId);
    if (!order || !order.xeroInvoiceId) {
      return await syncOrderToXero(orderId, workspaceId);
    }

    await storage.updateOrderSyncStatus(orderId, workspaceId, 'pending');

    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) {
      throw new Error('Xero not connected');
    }

    const { client: xero, tenantId } = xeroData;

    const orderLines = await storage.getOrderLinesForOrder(orderId, workspaceId);

    const xeroInvoice = {
      invoiceID: order.xeroInvoiceId,
      status: (WYSHBONE_TO_XERO_STATUS[order.status] || 'DRAFT') as any,
      dueDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : undefined,
      lineItems: orderLines.map(line => ({
        description: line.description || 'Unknown item',
        quantity: line.quantity,
        unitAmount: (line.unitPriceExVat || 0) / 100,
      })),
    };

    await xero.accountingApi.updateInvoice(tenantId, order.xeroInvoiceId, { invoices: [xeroInvoice] });
    await storage.updateOrderSyncStatus(orderId, workspaceId, 'synced');

    console.log(`✅ Updated order ${orderId} in Xero`);
  }

  /**
   * Void an order in Xero
   */
  async function voidOrderInXero(orderId: string, workspaceId: string): Promise<void> {
    const order = await storage.getCrmOrder(orderId, workspaceId);
    if (!order || !order.xeroInvoiceId) {
      return; // Nothing to void in Xero
    }

    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) return;

    const { client: xero, tenantId } = xeroData;

    try {
      await xero.accountingApi.updateInvoice(tenantId, order.xeroInvoiceId, {
        invoices: [{ invoiceID: order.xeroInvoiceId, status: 'VOIDED' as any }]
      });

      await storage.updateCrmOrder(orderId, workspaceId, {
        status: 'cancelled',
        syncStatus: 'synced',
        lastXeroSyncAt: new Date(),
      });

      console.log(`✅ Voided order ${orderId} in Xero`);
    } catch (error) {
      console.error(`Failed to void order ${orderId} in Xero:`, error);
      await storage.addToSyncQueue({
        workspaceId,
        entityType: 'order',
        entityId: orderId,
        action: 'void',
      });
    }
  }

  /**
   * Sync a customer from Wyshbone to Xero
   */
  async function syncCustomerToXero(customerId: string, workspaceId: string): Promise<void> {
    console.log(`📤 Syncing customer ${customerId} to Xero...`);

    const customer = await storage.getCrmCustomer(customerId, workspaceId);
    if (!customer) throw new Error('Customer not found');

    if (customer.xeroContactId) {
      console.log(`Customer ${customerId} already synced to Xero`);
      return;
    }

    await storage.updateCustomerSyncStatus(customerId, workspaceId, 'pending');

    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) {
      throw new Error('Xero not connected');
    }

    const { client: xero, tenantId } = xeroData;

    const xeroContact = {
      name: customer.name,
      emailAddress: customer.email,
      phones: customer.phone ? [{
        phoneType: 'DEFAULT' as any,
        phoneNumber: customer.phone,
      }] : [],
      addresses: customer.addressLine1 ? [{
        addressType: 'STREET' as any,
        addressLine1: customer.addressLine1,
        addressLine2: customer.addressLine2,
        city: customer.city,
        postalCode: customer.postcode,
        country: customer.country,
      }] : [],
    };

    const response = await xero.accountingApi.createContacts(tenantId, { contacts: [xeroContact] });
    
    const createdContact = response.body.contacts?.[0];
    if (!createdContact) {
      throw new Error('Failed to create contact in Xero');
    }

    await storage.updateCrmCustomer(customerId, workspaceId, {
      xeroContactId: createdContact.contactID,
      xeroSyncStatus: 'synced',
      lastXeroSyncAt: new Date(),
    });

    console.log(`✅ Synced customer ${customerId} to Xero as contact ${createdContact.contactID}`);
  }

  /**
   * Update a customer in Xero
   */
  async function updateCustomerInXero(customerId: string, workspaceId: string): Promise<void> {
    const customer = await storage.getCrmCustomer(customerId, workspaceId);
    if (!customer || !customer.xeroContactId) {
      return await syncCustomerToXero(customerId, workspaceId);
    }

    await storage.updateCustomerSyncStatus(customerId, workspaceId, 'pending');

    const xeroData = await getXeroClient(workspaceId);
    if (!xeroData) {
      throw new Error('Xero not connected');
    }

    const { client: xero, tenantId } = xeroData;

    const xeroContact = {
      contactID: customer.xeroContactId,
      name: customer.name,
      emailAddress: customer.email,
      phones: customer.phone ? [{
        phoneType: 'DEFAULT' as any,
        phoneNumber: customer.phone,
      }] : [],
    };

    await xero.accountingApi.updateContact(tenantId, customer.xeroContactId, { contacts: [xeroContact] });
    await storage.updateCustomerSyncStatus(customerId, workspaceId, 'synced');

    console.log(`✅ Updated customer ${customerId} in Xero`);
  }

  // ============================================
  // SYNC QUEUE PROCESSOR
  // ============================================

  async function processSyncQueue(): Promise<void> {
    console.log("🔄 Processing sync queue...");
    
    const items = await storage.getPendingSyncItems();
    console.log(`Found ${items.length} pending sync items`);

    for (const item of items) {
      try {
        switch (item.entityType) {
          case 'order':
            if (item.action === 'create') {
              await syncOrderToXero(item.entityId, item.workspaceId);
            } else if (item.action === 'update') {
              await updateOrderInXero(item.entityId, item.workspaceId);
            } else if (item.action === 'void') {
              await voidOrderInXero(item.entityId, item.workspaceId);
            }
            break;

          case 'customer':
            if (item.action === 'create') {
              await syncCustomerToXero(item.entityId, item.workspaceId);
            } else if (item.action === 'update') {
              await updateCustomerInXero(item.entityId, item.workspaceId);
            }
            break;
        }

        await storage.markSyncItemProcessed(item.id);
        console.log(`✅ Processed sync item ${item.id}`);
      } catch (error: any) {
        console.error(`Failed to process sync item ${item.id}:`, error.message);
        await storage.incrementSyncRetry(item.id, error.message);
      }
    }
  }

  // ============================================
  // BACKUP POLLING (CATCH MISSED WEBHOOKS)
  // ============================================

  async function backupPollXero(): Promise<void> {
    console.log("🔄 Running backup Xero poll...");
    
    const connections = await storage.getAllActiveXeroConnections();
    console.log(`Polling ${connections.length} active Xero connections`);

    // For now, just log - full implementation would re-import recent invoices/contacts
    // This is a safety net in case webhooks are missed
  }

  // ============================================
  // API ROUTES
  // ============================================

  // Get sync queue for a workspace
  router.get("/sync/queue", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const queue = await storage.getSyncQueue(workspaceId);
      res.json(queue);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Force sync now
  router.post("/sync/force", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.body.workspaceId as string;
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      // Process queue
      await processSyncQueue();

      res.json({ message: "Sync triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Manual trigger to sync an order to Xero
  router.post("/sync/order/:orderId", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      await syncOrderToXero(orderId, workspaceId);
      res.json({ message: "Order synced to Xero" });
    } catch (error: any) {
      console.error("Failed to sync order:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manual trigger to sync a customer to Xero
  router.post("/sync/customer/:customerId", async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      await syncCustomerToXero(customerId, workspaceId);
      res.json({ message: "Customer synced to Xero" });
    } catch (error: any) {
      console.error("Failed to sync customer:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // SUPPLIER SYNC ROUTES
  // ============================================

  /**
   * Import suppliers from Xero (contacts where IsSupplier==true)
   */
  router.post("/sync/suppliers", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const connection = await storage.getXeroConnection(workspaceId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ error: "Xero not connected" });
      }

      console.log(`📥 Starting supplier sync for workspace ${workspaceId}`);
      
      const result = await importXeroSuppliers(workspaceId, storage);

      res.json({
        success: true,
        message: `Synced ${result.total} suppliers (${result.created} new, ${result.matched} updated)`,
        result,
      });
    } catch (error: any) {
      console.error("Failed to sync suppliers:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Import suppliers AND their purchase history from Xero
   */
  router.post("/sync/suppliers-with-purchases", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const connection = await storage.getXeroConnection(workspaceId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ error: "Xero not connected" });
      }

      console.log(`📥 Starting supplier + purchases sync for workspace ${workspaceId}`);
      
      const result = await importXeroSuppliersWithPurchases(workspaceId, storage);

      res.json({
        success: true,
        message: `Synced ${result.suppliers.total} suppliers and ${result.purchases.total} purchases`,
        result,
      });
    } catch (error: any) {
      console.error("Failed to sync suppliers with purchases:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Import purchases for a specific supplier
   */
  router.post("/sync/supplier/:supplierId/purchases", async (req: Request, res: Response) => {
    try {
      const { supplierId } = req.params;
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const connection = await storage.getXeroConnection(workspaceId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ error: "Xero not connected" });
      }

      // Get supplier to find xero_contact_id
      const supplier = await storage.getSupplierById(supplierId, workspaceId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      if (!supplier.xeroContactId) {
        return res.status(400).json({ error: "Supplier not linked to Xero" });
      }

      const xeroData = await getXeroClient(workspaceId);
      if (!xeroData) {
        return res.status(400).json({ error: "Could not get Xero client" });
      }

      console.log(`📥 Importing purchases for supplier ${supplierId}`);
      
      const result = await importXeroPurchases(
        supplier.xeroContactId,
        supplierId,
        workspaceId,
        xeroData.client,
        xeroData.tenantId
      );

      res.json({
        success: true,
        message: `Imported ${result.imported} purchases`,
        result,
      });
    } catch (error: any) {
      console.error("Failed to sync supplier purchases:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Import all bills (purchase invoices) from Xero
   * Matches to existing suppliers and tracks product pricing
   */
  router.post("/sync/bills", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.body.workspaceId as string;
      const since = req.body.since ? new Date(req.body.since) : undefined;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const connection = await storage.getXeroConnection(workspaceId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ error: "Xero not connected" });
      }

      console.log(`📥 Starting bills sync for workspace ${workspaceId}`);
      if (since) {
        console.log(`📥 Fetching bills since ${since.toISOString()}`);
      }

      // First ensure suppliers are synced
      console.log(`📥 Step 1: Syncing suppliers first...`);
      const supplierResult = await importXeroSuppliers(workspaceId, storage);
      
      // Then sync bills
      console.log(`📥 Step 2: Syncing bills...`);
      const billsResult = await importXeroBills(workspaceId, storage, since);

      res.json({
        success: true,
        message: `Synced ${billsResult.imported} new bills, ${billsResult.updated} updated`,
        result: {
          suppliers: {
            created: supplierResult.created,
            updated: supplierResult.matched,
          },
          bills: billsResult,
        },
      });
    } catch (error: any) {
      console.error("Failed to sync bills:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Full supplier sync: suppliers + all bills + product pricing
   * This is the recommended endpoint for a complete supplier sync
   */
  router.post("/sync/suppliers-full", async (req: Request, res: Response) => {
    try {
      const workspaceId = req.body.workspaceId as string;
      const since = req.body.since ? new Date(req.body.since) : undefined;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      const connection = await storage.getXeroConnection(workspaceId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ error: "Xero not connected" });
      }

      console.log(`📥 Starting full supplier sync for workspace ${workspaceId}`);
      
      const result = await fullXeroSupplierSync(workspaceId, storage, since);

      res.json({
        success: true,
        message: `Full sync complete: ${result.suppliers.created} new suppliers, ${result.bills.imported} new bills, ${result.bills.productsTracked} products tracked`,
        result,
      });
    } catch (error: any) {
      console.error("Failed full supplier sync:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // EXPORT SYNC FUNCTIONS FOR CRUD HOOKS
  // ============================================

  // Store these functions on the router for use by other routes
  (router as any).syncOrderToXero = syncOrderToXero;
  (router as any).updateOrderInXero = updateOrderInXero;
  (router as any).voidOrderInXero = voidOrderInXero;
  (router as any).syncCustomerToXero = syncCustomerToXero;
  (router as any).updateCustomerInXero = updateCustomerInXero;
  (router as any).processSyncQueue = processSyncQueue;
  (router as any).backupPollXero = backupPollXero;

  // Store reference for cron job access
  xeroSyncFunctions = {
    processSyncQueue,
    backupPollXero,
  };

  return router;
}

// Store sync functions for cron job access
let xeroSyncFunctions: {
  processSyncQueue: () => Promise<void>;
  backupPollXero: () => Promise<void>;
} | null = null;

/**
 * Get the sync functions for use by cron jobs
 * Must be called after createXeroSyncRouter
 */
export function getXeroSyncFunctions() {
  return xeroSyncFunctions;
}

