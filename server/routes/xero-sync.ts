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
    // First check dedicated xero_connections table
    const connection = await storage.getXeroConnection(workspaceId);
    if (connection && connection.isConnected) {
      // Use connection from xero_connections table
      return getXeroClientFromConnection(connection, workspaceId);
    }

    // Fallback to integrations table (legacy)
    console.log(`   🔍 No xero_connections found, checking integrations table for workspace ${workspaceId}...`);
    const integrations = await storage.listIntegrations(workspaceId);
    const xeroIntegration = integrations.find((i) => i.provider === "xero");
    
    if (!xeroIntegration) {
      console.log(`   ❌ No Xero integration found in either table for workspace ${workspaceId}`);
      return null;
    }

    console.log(`   ✅ Found legacy Xero integration in integrations table`);
    
    // Build XeroClient from legacy integration
    const metadata = xeroIntegration.metadata as any;
    const tenantId = metadata?.tenantId;
    
    if (!tenantId) {
      console.error(`   ❌ Legacy integration missing tenantId`);
      return null;
    }

    const xero = new XeroClient({
      clientId: XERO_CLIENT_ID,
      clientSecret: XERO_CLIENT_SECRET,
      redirectUris: [],
      scopes: [],
    });

    // Set the token set directly
    xero.setTokenSet({
      access_token: xeroIntegration.accessToken,
      refresh_token: xeroIntegration.refreshToken || undefined,
      expires_at: xeroIntegration.expiresAt ? xeroIntegration.expiresAt / 1000 : undefined,
      token_type: 'Bearer',
    });

    return { client: xero, tenantId };
  }

  /**
   * Helper to create XeroClient from xero_connections record
   */
  async function getXeroClientFromConnection(connection: any, workspaceId: string): Promise<{ client: XeroClient; tenantId: string } | null> {
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
    
    const xeroStatus = invoice.status || 'DRAFT';
    const nowDate = new Date();
    
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
      xeroStatus: xeroStatus,
      xeroUpdatedAt: nowDate,
      xeroStatusSource: 'import',
      syncStatus: 'synced',
      lastXeroSyncAt: nowDate,
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

    const now = new Date();
    const xeroStatus = invoice.status || 'DRAFT';
    const previousStatus = order.xeroStatus;

    // V1 CONTRACT: Update order with Xero status fields
    await storage.updateCrmOrder(order.id, workspaceId, {
      status: XERO_TO_WYSHBONE_STATUS[invoice.status!] || order.status,
      subtotalExVat: Math.round((invoice.subTotal || 0) * 100),
      vatTotal: Math.round((invoice.totalTax || 0) * 100),
      totalIncVat: Math.round((invoice.total || 0) * 100),
      xeroStatus: xeroStatus,
      xeroUpdatedAt: now,
      xeroStatusSource: 'webhook',
      syncStatus: 'synced',
      lastXeroSyncAt: now,
    });

    // Log activity for status changes
    if (previousStatus !== xeroStatus) {
      await logXeroActivity(
        workspaceId,
        'system',
        'Xero Webhook',
        'xero_status_changed',
        'order',
        order.id,
        {
          previousStatus,
          newStatus: xeroStatus,
          source: 'webhook',
          invoiceId,
        }
      );
    }

    console.log(`✅ Updated order ${order.id} from Xero invoice ${invoiceId} (status: ${xeroStatus})`);
  }

  async function voidInvoiceFromXero(invoiceId: string, workspaceId: string) {
    const order = await storage.getOrderByXeroInvoiceId(invoiceId, workspaceId);
    if (!order) return;

    const now = new Date();
    const previousStatus = order.xeroStatus;
    
    await storage.updateCrmOrder(order.id, workspaceId, {
      status: 'cancelled',
      xeroStatus: 'VOIDED',
      xeroUpdatedAt: now,
      xeroStatusSource: 'webhook',
      syncStatus: 'synced',
      lastXeroSyncAt: now,
    });

    // Log activity
    if (previousStatus !== 'VOIDED') {
      await logXeroActivity(
        workspaceId,
        'system',
        'Xero Webhook',
        'xero_status_changed',
        'order',
        order.id,
        {
          previousStatus,
          newStatus: 'VOIDED',
          source: 'webhook',
          invoiceId,
        }
      );
    }

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
      await storage.updateCrmProduct(existing.id, workspaceId, {
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

      await storage.createCrmProduct({
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
   * 
   * V1 CONTRACT: Always creates/updates as DRAFT in Xero.
   * Approval and payment happen ONLY in Xero.
   * Wyshbone reflects Xero status via webhook/poller.
   */
  async function syncOrderToXero(orderId: string, workspaceId: string, actorUserId?: string, actorName?: string): Promise<{ invoiceId: string; invoiceNumber: string }> {
    console.log(`📤 Syncing order ${orderId} to Xero (workspaceId: ${workspaceId})...`);

    // Debug: Check Xero connection for this workspace
    const debugConnection = await storage.getXeroConnection(workspaceId);
    console.log(`   🔍 Xero connection lookup for '${workspaceId}':`, debugConnection ? `Found (connected: ${debugConnection.isConnected})` : 'NOT FOUND');

    const order = await storage.getCrmOrder(orderId, workspaceId);
    if (!order) throw new Error('Order not found');

    // Set status to pending before attempting sync
    await storage.updateOrderSyncStatus(orderId, workspaceId, 'pending');

    try {
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
      const orderLines = await storage.listCrmOrderLinesByOrder(orderId);

      // Build attribution reference for Xero
      const exportTimestamp = new Date().toISOString();
      const exporterName = actorName || 'Wyshbone User';
      const attribution = `Created in Wyshbone by ${exporterName} at ${exportTimestamp}. Wyshbone Order ID: ${orderId}`;

      // V1 CONTRACT: ALWAYS create as DRAFT - regardless of Wyshbone order.status
      const xeroInvoice = {
        type: 'ACCREC' as any,
        contact: { contactID: customer.xeroContactId },
        date: order.orderDate ? new Date(order.orderDate).toISOString().split('T')[0] : undefined,
        dueDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : undefined,
        status: 'DRAFT' as any, // V1 CONTRACT: Always DRAFT
        reference: `WB-${order.orderNumber}`, // Wyshbone reference
        lineItems: orderLines.map(line => ({
          description: line.description || 'Unknown item',
          quantity: line.quantity,
          unitAmount: (line.unitPriceExVat || 0) / 100, // Convert from pence to pounds
        })),
      };

      let createdInvoice: any;

      // Check if already synced - update existing invoice instead of creating new one
      if (order.xeroInvoiceId) {
        console.log(`   📝 Order already has Xero invoice ${order.xeroInvoiceId}, updating...`);
        
        // Fetch current invoice to check status
        const existingInvoiceResponse = await xero.accountingApi.getInvoice(tenantId, order.xeroInvoiceId);
        const existingInvoice = existingInvoiceResponse.body.invoices?.[0];
        
        if (existingInvoice && existingInvoice.status !== 'DRAFT') {
          throw new Error(`Cannot update invoice - Xero status is ${existingInvoice.status} (not DRAFT). Approval/payment must be done in Xero.`);
        }

        // Update existing invoice
        const updateResponse = await xero.accountingApi.updateInvoice(tenantId, order.xeroInvoiceId, {
          invoices: [{
            ...xeroInvoice,
            invoiceID: order.xeroInvoiceId,
          }]
        });
        createdInvoice = updateResponse.body.invoices?.[0];
      } else {
        // Create new invoice in Xero
        const response = await xero.accountingApi.createInvoices(tenantId, { invoices: [xeroInvoice] });
        createdInvoice = response.body.invoices?.[0];
      }
      
      if (!createdInvoice) {
        throw new Error('Failed to create/update invoice in Xero');
      }

      const now = new Date();

      // Update local order with Xero details
      await storage.updateCrmOrder(orderId, workspaceId, {
        xeroInvoiceId: createdInvoice.invoiceID,
        xeroInvoiceNumber: createdInvoice.invoiceNumber,
        xeroStatus: createdInvoice.status || 'DRAFT',
        xeroUpdatedAt: now,
        xeroStatusSource: 'export',
        xeroExportedAt: now.getTime(),
        syncStatus: 'synced',
        lastXeroSyncAt: now,
      });

      // Log activity
      await logXeroActivity(workspaceId, actorUserId || 'system', actorName || 'Wyshbone', 'pushed_to_xero', 'order', orderId, {
        invoiceId: createdInvoice.invoiceID,
        invoiceNumber: createdInvoice.invoiceNumber,
        status: 'DRAFT',
        isUpdate: !!order.xeroInvoiceId,
      });

      console.log(`✅ Synced order ${orderId} to Xero as invoice ${createdInvoice.invoiceNumber} (DRAFT)`);
      
      return {
        invoiceId: createdInvoice.invoiceID,
        invoiceNumber: createdInvoice.invoiceNumber,
      };
    } catch (error: any) {
      // On any error, set status to failed so it doesn't stay stuck in "Syncing..."
      console.error(`❌ Failed to sync order ${orderId} to Xero:`, error.message);
      await storage.updateOrderSyncStatus(orderId, workspaceId, 'failed', error.message);
      throw error; // Re-throw so caller knows it failed
    }
  }

  /**
   * Log Xero-related activity for audit trail
   */
  async function logXeroActivity(
    workspaceId: string,
    actorUserId: string,
    actorName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      // Use activity log if available
      if (typeof storage.createCrmActivity === 'function') {
        await storage.createCrmActivity({
          id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          workspaceId,
          customerId: entityType === 'customer' ? entityId : undefined,
          orderId: entityType === 'order' ? entityId : undefined,
          type: 'xero_sync',
          summary: `${action}: ${JSON.stringify(details)}`,
          details: JSON.stringify({ action, entityType, entityId, ...details }),
          performedBy: actorUserId,
          performedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
      console.log(`📋 [XERO_AUDIT] ${action} | ${entityType}:${entityId} | by ${actorName} | ${JSON.stringify(details)}`);
    } catch (err) {
      // Don't fail the main operation if logging fails
      console.warn('Failed to log Xero activity:', err);
    }
  }

  /**
   * Update an order in Xero
   * 
   * V1 CONTRACT: Can only update DRAFT invoices. Once approved in Xero, order is locked.
   */
  async function updateOrderInXero(orderId: string, workspaceId: string, actorUserId?: string, actorName?: string): Promise<void> {
    const order = await storage.getCrmOrder(orderId, workspaceId);
    if (!order || !order.xeroInvoiceId) {
      await syncOrderToXero(orderId, workspaceId, actorUserId, actorName);
      return;
    }

    // V1 CONTRACT: Check if order is locked (approved/paid in Xero)
    if (order.xeroStatus && order.xeroStatus !== 'DRAFT') {
      throw new Error(`Cannot update order - locked in Xero with status: ${order.xeroStatus}. Changes must be made in Xero.`);
    }

    await storage.updateOrderSyncStatus(orderId, workspaceId, 'pending');

    try {
      const xeroData = await getXeroClient(workspaceId);
      if (!xeroData) {
        throw new Error('Xero not connected');
      }

      const { client: xero, tenantId } = xeroData;

      // Verify Xero invoice is still DRAFT before updating
      const existingInvoiceResponse = await xero.accountingApi.getInvoice(tenantId, order.xeroInvoiceId);
      const existingInvoice = existingInvoiceResponse.body.invoices?.[0];
      
      if (existingInvoice && existingInvoice.status !== 'DRAFT') {
        // Update local status to match Xero
        await storage.updateCrmOrder(orderId, workspaceId, {
          xeroStatus: existingInvoice.status,
          xeroUpdatedAt: new Date(),
          xeroStatusSource: 'poll',
          syncStatus: 'synced',
        });
        throw new Error(`Cannot update - invoice was approved in Xero (status: ${existingInvoice.status})`);
      }

      const orderLines = await storage.listCrmOrderLinesByOrder(orderId);

      // V1 CONTRACT: Always keep as DRAFT when updating from Wyshbone
      const xeroInvoice = {
        invoiceID: order.xeroInvoiceId,
        status: 'DRAFT' as any, // V1 CONTRACT: Always DRAFT
        dueDate: order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : undefined,
        reference: `WB-${order.orderNumber}`,
        lineItems: orderLines.map(line => ({
          description: line.description || 'Unknown item',
          quantity: line.quantity,
          unitAmount: (line.unitPriceExVat || 0) / 100,
        })),
      };

      await xero.accountingApi.updateInvoice(tenantId, order.xeroInvoiceId, { invoices: [xeroInvoice] });
      
      await storage.updateCrmOrder(orderId, workspaceId, {
        xeroStatus: 'DRAFT',
        xeroUpdatedAt: new Date(),
        xeroStatusSource: 'export',
        syncStatus: 'synced',
        lastXeroSyncAt: new Date(),
      });

      // Log activity
      await logXeroActivity(workspaceId, actorUserId || 'system', actorName || 'Wyshbone', 'updated_in_xero', 'order', orderId, {
        invoiceId: order.xeroInvoiceId,
        status: 'DRAFT',
      });

      console.log(`✅ Updated order ${orderId} in Xero (DRAFT)`);
    } catch (error: any) {
      console.error(`❌ Failed to update order ${orderId} in Xero:`, error.message);
      await storage.updateOrderSyncStatus(orderId, workspaceId, 'failed', error.message);
      throw error;
    }
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

  /**
   * Backup poller - fetches invoice status changes from Xero
   * Runs every 15 minutes to catch any missed webhooks
   * 
   * V1 CONTRACT: Only updates status fields, doesn't modify order data
   */
  async function backupPollXero(): Promise<void> {
    console.log("🔄 Running backup Xero poll...");
    
    const connections = await storage.getAllActiveXeroConnections();
    console.log(`Polling ${connections.length} active Xero connections`);

    for (const connection of connections) {
      if (!connection.isConnected) continue;
      
      try {
        const xeroData = await getXeroClient(connection.workspaceId);
        if (!xeroData) {
          console.log(`   ⚠️ No Xero client for workspace ${connection.workspaceId}`);
          continue;
        }

        const { client: xero, tenantId } = xeroData;

        // Get orders that have been exported to Xero
        const ordersWithXero = await storage.getOrdersWithXeroInvoiceId(connection.workspaceId);
        console.log(`   📋 Found ${ordersWithXero.length} orders with Xero invoices in workspace ${connection.workspaceId}`);

        // Get all invoice IDs that need status checks
        const invoiceIds = ordersWithXero
          .filter(o => o.xeroInvoiceId)
          .map(o => o.xeroInvoiceId as string);

        if (invoiceIds.length === 0) continue;

        // Chunk invoice IDs (Xero API limit is 100 per request)
        const CHUNK_SIZE = 100;
        const chunks: string[][] = [];
        for (let i = 0; i < invoiceIds.length; i += CHUNK_SIZE) {
          chunks.push(invoiceIds.slice(i, i + CHUNK_SIZE));
        }
        console.log(`   📦 Fetching ${invoiceIds.length} invoices in ${chunks.length} batches`);

        // Fetch all invoices in chunks
        const xeroInvoices: any[] = [];
        for (const chunk of chunks) {
          try {
            const invoicesResponse = await xero.accountingApi.getInvoices(
              tenantId,
              undefined, // ifModifiedSince
              undefined, // where
              undefined, // order
              chunk, // IDs filter (max 100)
              undefined, // invoiceNumbers
              undefined, // contactIDs
              undefined, // statuses
              undefined, // page
              false // includeArchived
            );
            xeroInvoices.push(...(invoicesResponse.body.invoices || []));
          } catch (chunkError: any) {
            console.error(`   ⚠️ Failed to fetch chunk of ${chunk.length} invoices:`, chunkError.message);
          }
        }
        console.log(`   📦 Fetched ${xeroInvoices.length} invoices from Xero`);

        // Update local orders with Xero statuses
        let updatedCount = 0;
        for (const xeroInvoice of xeroInvoices) {
          const localOrder = ordersWithXero.find(o => o.xeroInvoiceId === xeroInvoice.invoiceID);
          if (!localOrder) continue;

          const xeroStatus = xeroInvoice.status || 'DRAFT';
          
          // Only update if status changed
          if (localOrder.xeroStatus !== xeroStatus) {
            const now = new Date();
            await storage.updateCrmOrder(localOrder.id, connection.workspaceId, {
              xeroStatus: xeroStatus,
              xeroUpdatedAt: now,
              xeroStatusSource: 'poll',
            });

            // Log activity
            await logXeroActivity(
              connection.workspaceId,
              'system',
              'Xero Poller',
              'xero_status_changed',
              'order',
              localOrder.id,
              {
                previousStatus: localOrder.xeroStatus,
                newStatus: xeroStatus,
                source: 'poll',
                invoiceId: xeroInvoice.invoiceID,
              }
            );

            console.log(`   ✅ Updated order ${localOrder.id}: ${localOrder.xeroStatus || 'null'} → ${xeroStatus}`);
            updatedCount++;
          }
        }

        console.log(`   📊 Updated ${updatedCount} orders in workspace ${connection.workspaceId}`);
      } catch (error: any) {
        console.error(`   ❌ Failed to poll workspace ${connection.workspaceId}:`, error.message);
      }
    }
    
    console.log("✅ Backup Xero poll complete");
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

  // Reset a stuck sync status (recover from "Syncing..." state)
  router.post("/sync/order/:orderId/reset", async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const workspaceId = req.body.workspaceId as string;
      
      if (!workspaceId) {
        return res.status(400).json({ error: "workspaceId required" });
      }

      // Reset to null/empty status so user can retry
      await storage.updateOrderSyncStatus(orderId, workspaceId, 'failed', 'Manually reset');
      res.json({ message: "Order sync status reset" });
    } catch (error: any) {
      console.error("Failed to reset order sync status:", error);
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

