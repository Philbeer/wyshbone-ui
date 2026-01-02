/**
 * Xero Customer Import with AI Entity Matching
 * 
 * Imports customers from Xero and uses AI-powered entity resolution
 * to match them against existing pubs in the database, avoiding duplicates.
 */

import { XeroClient } from "xero-node";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc } from "drizzle-orm";
import {
  pubsMaster,
  entitySources,
  xeroOrdersEntity,
  aiResearchQueue,
  suppliers,
  supplierPurchases,
  supplierProducts,
  type InsertPubsMaster,
  type SelectPubsMaster,
  type InsertXeroOrderEntity,
  type InsertSupplier,
  type SelectSupplier,
  type InsertSupplierPurchase,
} from "@shared/schema";
import {
  findMatchingEntityCached,
  sourceExists,
  createEntitySource,
  flagForManualReview,
  CONFIDENCE_THRESHOLDS,
  type PubInput,
  type EntitySource,
  clearMatchCache,
} from "./matching";

// ============================================
// CONFIGURATION
// ============================================

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || "";
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || "";

// ============================================
// DATABASE CONNECTION
// ============================================

let drizzleDb: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!drizzleDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    const queryClient = postgres(process.env.DATABASE_URL, {
      connect_timeout: 5,
      idle_timeout: 10,
      max_lifetime: 60 * 30,
    });
    drizzleDb = drizzle(queryClient);
  }
  return drizzleDb;
}

// ============================================
// TYPES
// ============================================

/**
 * Import summary returned by importXeroCustomers.
 */
export interface XeroImportSummary {
  matched: number;
  newPubs: number;
  needsReview: number;
  skipped: number;
  errors: number;
  total: number;
  details: XeroImportDetail[];
}

/**
 * Detail for each imported customer.
 */
export interface XeroImportDetail {
  xeroContactId: string;
  xeroContactName: string;
  action: 'matched' | 'created' | 'review' | 'skipped' | 'error';
  pubId?: number;
  reviewId?: number;
  confidence?: number;
  message: string;
}

/**
 * Xero connection data from storage.
 */
interface XeroConnection {
  workspaceId: string;
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  isConnected: boolean;
}

/**
 * Import summary returned by importXeroSuppliers.
 */
export interface XeroSupplierImportSummary {
  matched: number;
  created: number;
  skipped: number;
  errors: number;
  total: number;
  details: XeroSupplierImportDetail[];
}

/**
 * Detail for each imported supplier.
 */
export interface XeroSupplierImportDetail {
  xeroContactId: string;
  xeroContactName: string;
  action: 'matched' | 'created' | 'skipped' | 'error';
  supplierId?: string;
  message: string;
}

/**
 * Import summary returned by importXeroPurchases.
 */
export interface XeroPurchaseImportSummary {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
}

// ============================================
// XERO CLIENT HELPER
// ============================================

/**
 * Storage interface for Xero connection (minimal interface).
 */
interface XeroStorage {
  getXeroConnection(workspaceId: string): Promise<XeroConnection | null>;
  updateXeroTokens(
    workspaceId: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date
  ): Promise<void>;
}

/**
 * Get authenticated Xero client for a workspace.
 */
async function getXeroClient(
  workspaceId: string,
  storage: XeroStorage
): Promise<{ client: XeroClient; tenantId: string } | null> {
  const connection = await storage.getXeroConnection(workspaceId);
  if (!connection || !connection.isConnected) {
    console.log(`[xero-import] No Xero connection for workspace ${workspaceId}`);
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
      console.error(`[xero-import] Failed to refresh Xero token:`, error);
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
// MAIN IMPORT FUNCTION
// ============================================

/**
 * Import all customers from Xero with AI-powered entity matching.
 * 
 * For each Xero customer:
 * 1. Check if already imported (via entity_sources)
 * 2. Try to match to existing pub using AI
 * 3. Based on confidence:
 *    - >= 0.9: Auto-match to existing pub
 *    - >= 0.7: Queue for manual review
 *    - < 0.7: Create as new pub
 * 
 * @param workspaceId - Tenant workspace ID
 * @param storage - Storage interface for Xero connection
 * @returns Import summary with counts and details
 */
export async function importXeroCustomers(
  workspaceId: string,
  storage: XeroStorage
): Promise<XeroImportSummary> {
  const logPrefix = `[xero-import]`;
  const workspaceIdNum = parseInt(workspaceId, 10);
  
  console.log(`${logPrefix} Starting Xero customer import for workspace ${workspaceId}`);

  // Initialize summary
  const summary: XeroImportSummary = {
    matched: 0,
    newPubs: 0,
    needsReview: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    details: [],
  };

  // Get Xero client
  const xeroData = await getXeroClient(workspaceId, storage);
  if (!xeroData) {
    throw new Error("Xero not connected or token expired");
  }

  const { client: xero, tenantId } = xeroData;

  // Clear match cache for fresh lookups
  clearMatchCache();

  try {
    // Fetch all contacts from Xero
    console.log(`${logPrefix} Fetching contacts from Xero...`);
    const response = await xero.accountingApi.getContacts(tenantId);
    const contacts = response.body.contacts || [];
    
    summary.total = contacts.length;
    console.log(`${logPrefix} Found ${contacts.length} contacts in Xero`);

    // Process each contact
    for (const contact of contacts) {
      const contactId = contact.contactID;
      const contactName = contact.name || 'Unknown';

      try {
        // Step 1: Check if already imported
        const alreadyImported = await sourceExists('xero', contactId!, workspaceIdNum);
        
        if (alreadyImported) {
          summary.skipped++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'skipped',
            message: 'Already imported',
          });
          continue;
        }

        // Step 2: Extract pub data from Xero contact
        const streetAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET');
        const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT');

        const newPub: PubInput = {
          name: contactName,
          postcode: streetAddress?.postalCode || null,
          phone: phone?.phoneNumber || null,
          address: streetAddress?.addressLine1 || null,
        };

        // Step 3: Try to match to existing pub using AI
        const decision = await findMatchingEntityCached(
          newPub,
          'xero',
          workspaceIdNum
        );

        // Step 4: Handle based on confidence
        if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.AUTO_MATCH && decision.match) {
          // High confidence match - auto-merge
          const existingPubId = decision.match.id;
          
          // Update existing pub: mark as customer
          await updatePubAsCustomer(existingPubId);

          // Import Xero orders
          const orderCount = await importXeroOrders(
            contactId!,
            existingPubId,
            workspaceIdNum,
            xero,
            tenantId
          );

          // Create entity source link
          await createEntitySource({
            pubId: existingPubId,
            workspaceId: workspaceIdNum,
            sourceType: 'xero',
            sourceId: contactId!,
            sourceData: contact,
            confidence: decision.confidence,
            matchedBy: 'ai',
            matchedReasoning: decision.reasoning,
          });

          summary.matched++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'matched',
            pubId: existingPubId,
            confidence: decision.confidence,
            message: `Matched to "${decision.match.name}" (${orderCount} orders imported)`,
          });

        } else if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.MANUAL_REVIEW && decision.match) {
          // Medium confidence - queue for review
          const reviewId = await flagForManualReview({
            workspaceId: workspaceIdNum,
            newPubData: newPub,
            sourceType: 'xero',
            sourceId: contactId,
            possibleMatchPubId: decision.match.id,
            confidence: decision.confidence,
            reasoning: decision.reasoning,
          });

          summary.needsReview++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'review',
            reviewId,
            confidence: decision.confidence,
            message: `Queued for review - possible match to "${decision.match.name}"`,
          });

        } else {
          // Low confidence or new - create new pub
          const newPubRecord = await createNewPubFromXero(
            contact,
            streetAddress,
            phone,
            workspaceIdNum
          );

          // Import Xero orders
          const orderCount = await importXeroOrders(
            contactId!,
            newPubRecord.id,
            workspaceIdNum,
            xero,
            tenantId
          );

          // Create entity source link
          await createEntitySource({
            pubId: newPubRecord.id,
            workspaceId: workspaceIdNum,
            sourceType: 'xero',
            sourceId: contactId!,
            sourceData: contact,
            confidence: 1.0,
            matchedBy: 'new_entity',
            matchedReasoning: decision.reasoning || 'Created as new entity from Xero',
          });

          // Queue for freehouse research
          await queueFreehouseResearch(newPubRecord.id, workspaceIdNum);

          summary.newPubs++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'created',
            pubId: newPubRecord.id,
            confidence: decision.confidence,
            message: `Created new pub (${orderCount} orders imported)`,
          });
        }

      } catch (error) {
        console.error(`${logPrefix} Error processing contact ${contactId}:`, error);
        summary.errors++;
        summary.details.push({
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`${logPrefix} Import complete:`, {
      matched: summary.matched,
      newPubs: summary.newPubs,
      needsReview: summary.needsReview,
      skipped: summary.skipped,
      errors: summary.errors,
      total: summary.total,
    });

    return summary;

  } catch (error) {
    console.error(`${logPrefix} Fatal error during import:`, error);
    throw error;
  }
}

// ============================================
// XERO ORDERS IMPORT
// ============================================

/**
 * Import orders (invoices) from Xero for a specific customer.
 * 
 * @param xeroContactId - Xero contact ID
 * @param pubId - Pub ID to link orders to
 * @param workspaceId - Tenant workspace ID
 * @param xero - Xero client
 * @param tenantId - Xero tenant ID
 * @returns Number of orders imported
 */
export async function importXeroOrders(
  xeroContactId: string,
  pubId: number,
  workspaceId: number,
  xero: XeroClient,
  tenantId: string
): Promise<number> {
  const db = getDb();
  const logPrefix = `[xero-import:orders]`;

  try {
    // Fetch invoices for this contact
    const response = await xero.accountingApi.getInvoices(
      tenantId,
      undefined, // ifModifiedSince
      undefined, // where
      undefined, // order
      undefined, // iDs
      undefined, // invoiceNumbers
      [xeroContactId], // contactIDs
      undefined, // statuses
      undefined, // page
      false,     // includeArchived
      false,     // createdByMyApp
      undefined  // unitdp
    );

    const invoices = response.body.invoices || [];
    console.log(`${logPrefix} Found ${invoices.length} invoices for contact ${xeroContactId}`);

    if (invoices.length === 0) {
      return 0;
    }

    let importedCount = 0;
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    for (const invoice of invoices) {
      try {
        // Check if already imported
        const existing = await db
          .select({ id: xeroOrdersEntity.id })
          .from(xeroOrdersEntity)
          .where(eq(xeroOrdersEntity.xeroInvoiceId, invoice.invoiceID!))
          .limit(1);

        if (existing.length > 0) {
          continue; // Already imported
        }

        // Parse dates - use string format for date columns
        const orderDateStr = invoice.date 
          ? new Date(invoice.date).toISOString().split('T')[0] 
          : new Date().toISOString().split('T')[0];
        const dueDateStr = invoice.dueDate 
          ? new Date(invoice.dueDate).toISOString().split('T')[0] 
          : null;

        // Insert order
        const orderData: InsertXeroOrderEntity = {
          pubId,
          xeroInvoiceId: invoice.invoiceID!,
          xeroInvoiceNumber: invoice.invoiceNumber || null,
          orderDate: orderDateStr,
          dueDate: dueDateStr,
          totalAmount: invoice.total?.toString() || null,
          paidAmount: invoice.amountPaid?.toString() || null,
          status: invoice.status?.toString() || null,
        };
        
        await db.insert(xeroOrdersEntity).values(orderData);

        importedCount++;

        // Track dates for pub update
        const invoiceDate = new Date(orderDateStr);
        if (!earliestDate || invoiceDate < earliestDate) {
          earliestDate = invoiceDate;
        }
        if (!latestDate || invoiceDate > latestDate) {
          latestDate = invoiceDate;
        }

      } catch (error) {
        console.error(`${logPrefix} Error importing invoice ${invoice.invoiceID}:`, error);
      }
    }

    // Update pub with order stats
    if (importedCount > 0) {
      await db.update(pubsMaster)
        .set({
          isCustomer: true,
          totalOrders: invoices.length,
          lastOrderAt: latestDate,
          customerSince: earliestDate?.toISOString().split('T')[0] || null,
          updatedAt: new Date(),
        })
        .where(eq(pubsMaster.id, pubId));
    }

    console.log(`${logPrefix} Imported ${importedCount} orders for pub ${pubId}`);
    return importedCount;

  } catch (error) {
    console.error(`${logPrefix} Error fetching invoices:`, error);
    return 0;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a new pub from Xero contact data.
 */
async function createNewPubFromXero(
  contact: any,
  streetAddress: any,
  phone: any,
  workspaceId: number
): Promise<SelectPubsMaster> {
  const db = getDb();

  const insertData: InsertPubsMaster = {
    workspaceId,
    name: contact.name || 'Unknown',
    addressLine1: streetAddress?.addressLine1 || null,
    addressLine2: streetAddress?.addressLine2 || null,
    city: streetAddress?.city || null,
    postcode: streetAddress?.postalCode || null,
    phone: phone?.phoneNumber || null,
    email: contact.emailAddress || null,
    country: streetAddress?.country || 'GB',
    isCustomer: true,
    discoveredBy: 'xero',
    discoveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const [newPub] = await db.insert(pubsMaster).values(insertData).returning();
  
  console.log(`[xero-import] Created new pub: "${contact.name}" (id: ${newPub.id})`);
  return newPub;
}

/**
 * Update an existing pub to mark as customer.
 */
async function updatePubAsCustomer(pubId: number): Promise<void> {
  const db = getDb();

  await db.update(pubsMaster)
    .set({
      isCustomer: true,
      updatedAt: new Date(),
    })
    .where(eq(pubsMaster.id, pubId));
}

/**
 * Queue a new pub for freehouse research.
 */
async function queueFreehouseResearch(pubId: number, workspaceId: number): Promise<void> {
  const db = getDb();

  try {
    await db.insert(aiResearchQueue).values({
      pubId,
      workspaceId,
      researchType: 'freehouse_check',
      priority: 3, // Medium priority
      status: 'pending',
      createdAt: new Date(),
    });
  } catch (error) {
    // Non-critical - log but don't fail
    console.warn(`[xero-import] Failed to queue freehouse research for pub ${pubId}:`, error);
  }
}

// ============================================
// BATCH IMPORT WITH PROGRESS
// ============================================

/**
 * Progress callback for batch import.
 */
export type ImportProgressCallback = (current: number, total: number, detail: XeroImportDetail) => void;

/**
 * Import Xero customers with progress callback.
 * Useful for long-running imports with UI progress.
 * 
 * @param workspaceId - Tenant workspace ID
 * @param storage - Storage interface
 * @param onProgress - Progress callback
 * @returns Import summary
 */
export async function importXeroCustomersWithProgress(
  workspaceId: string,
  storage: XeroStorage,
  onProgress?: ImportProgressCallback
): Promise<XeroImportSummary> {
  const logPrefix = `[xero-import]`;
  const workspaceIdNum = parseInt(workspaceId, 10);
  
  // Get Xero client
  const xeroData = await getXeroClient(workspaceId, storage);
  if (!xeroData) {
    throw new Error("Xero not connected or token expired");
  }

  const { client: xero, tenantId } = xeroData;

  // Clear match cache
  clearMatchCache();

  // Fetch contacts
  const response = await xero.accountingApi.getContacts(tenantId);
  const contacts = response.body.contacts || [];

  const summary: XeroImportSummary = {
    matched: 0,
    newPubs: 0,
    needsReview: 0,
    skipped: 0,
    errors: 0,
    total: contacts.length,
    details: [],
  };

  let current = 0;

  for (const contact of contacts) {
    current++;
    const contactId = contact.contactID;
    const contactName = contact.name || 'Unknown';

    try {
      // Check if already imported
      const alreadyImported = await sourceExists('xero', contactId!, workspaceIdNum);
      
      if (alreadyImported) {
        const detail: XeroImportDetail = {
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'skipped',
          message: 'Already imported',
        };
        summary.skipped++;
        summary.details.push(detail);
        onProgress?.(current, summary.total, detail);
        continue;
      }

      // Extract pub data
      const streetAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET');
      const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT');

      const newPub: PubInput = {
        name: contactName,
        postcode: streetAddress?.postalCode || null,
        phone: phone?.phoneNumber || null,
        address: streetAddress?.addressLine1 || null,
      };

      // Match using AI
      const decision = await findMatchingEntityCached(newPub, 'xero', workspaceIdNum);

      let detail: XeroImportDetail;

      if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.AUTO_MATCH && decision.match) {
        // Auto-match
        await updatePubAsCustomer(decision.match.id);
        const orderCount = await importXeroOrders(contactId!, decision.match.id, workspaceIdNum, xero, tenantId);
        await createEntitySource({
          pubId: decision.match.id,
          workspaceId: workspaceIdNum,
          sourceType: 'xero',
          sourceId: contactId!,
          sourceData: contact,
          confidence: decision.confidence,
          matchedBy: 'ai',
          matchedReasoning: decision.reasoning,
        });

        summary.matched++;
        detail = {
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'matched',
          pubId: decision.match.id,
          confidence: decision.confidence,
          message: `Matched to "${decision.match.name}" (${orderCount} orders)`,
        };

      } else if (!decision.isNew && decision.confidence >= CONFIDENCE_THRESHOLDS.MANUAL_REVIEW && decision.match) {
        // Queue for review
        const reviewId = await flagForManualReview({
          workspaceId: workspaceIdNum,
          newPubData: newPub,
          sourceType: 'xero',
          sourceId: contactId,
          possibleMatchPubId: decision.match.id,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
        });

        summary.needsReview++;
        detail = {
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'review',
          reviewId,
          confidence: decision.confidence,
          message: `Queued for review`,
        };

      } else {
        // Create new
        const newPubRecord = await createNewPubFromXero(contact, streetAddress, phone, workspaceIdNum);
        const orderCount = await importXeroOrders(contactId!, newPubRecord.id, workspaceIdNum, xero, tenantId);
        await createEntitySource({
          pubId: newPubRecord.id,
          workspaceId: workspaceIdNum,
          sourceType: 'xero',
          sourceId: contactId!,
          sourceData: contact,
          confidence: 1.0,
          matchedBy: 'new_entity',
          matchedReasoning: decision.reasoning || 'Created from Xero',
        });
        await queueFreehouseResearch(newPubRecord.id, workspaceIdNum);

        summary.newPubs++;
        detail = {
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'created',
          pubId: newPubRecord.id,
          confidence: decision.confidence,
          message: `Created new pub (${orderCount} orders)`,
        };
      }

      summary.details.push(detail);
      onProgress?.(current, summary.total, detail);

    } catch (error) {
      const detail: XeroImportDetail = {
        xeroContactId: contactId!,
        xeroContactName: contactName,
        action: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      summary.errors++;
      summary.details.push(detail);
      onProgress?.(current, summary.total, detail);
    }
  }

  return summary;
}

// ============================================
// SUPPLIER IMPORT FUNCTIONS
// ============================================

/**
 * Generate a unique supplier ID.
 */
function generateSupplierId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `supp_${timestamp}_${random}`;
}

/**
 * Import all suppliers from Xero.
 * 
 * Suppliers in Xero are contacts where IsSupplier == true.
 * 
 * @param workspaceId - Tenant workspace ID
 * @param storage - Storage interface for Xero connection
 * @returns Import summary with counts and details
 */
export async function importXeroSuppliers(
  workspaceId: string,
  storage: XeroStorage
): Promise<XeroSupplierImportSummary> {
  const logPrefix = `[xero-import:suppliers]`;
  const db = getDb();
  
  console.log(`${logPrefix} Starting Xero supplier import for workspace ${workspaceId}`);

  // Initialize summary
  const summary: XeroSupplierImportSummary = {
    matched: 0,
    created: 0,
    skipped: 0,
    errors: 0,
    total: 0,
    details: [],
  };

  // Get Xero client
  const xeroData = await getXeroClient(workspaceId, storage);
  if (!xeroData) {
    throw new Error("Xero not connected or token expired");
  }

  const { client: xero, tenantId } = xeroData;

  try {
    // Fetch suppliers from Xero (contacts where IsSupplier == true)
    console.log(`${logPrefix} Fetching suppliers from Xero...`);
    const response = await xero.accountingApi.getContacts(
      tenantId,
      undefined, // ifModifiedSince
      'ContactStatus=="ACTIVE" AND IsSupplier==true' // where
    );
    
    const contacts = response.body.contacts || [];
    summary.total = contacts.length;
    console.log(`${logPrefix} Found ${contacts.length} suppliers in Xero`);

    // Process each supplier contact
    for (const contact of contacts) {
      const contactId = contact.contactID;
      const contactName = contact.name || 'Unknown';

      try {
        // Check if already imported (by xero_contact_id)
        const existing = await db
          .select()
          .from(suppliers)
          .where(eq(suppliers.xeroContactId, contactId!))
          .limit(1);

        if (existing.length > 0) {
          // Update existing supplier
          const streetAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET') ||
                               contact.addresses?.find((a: any) => a.addressType === 'POBOX') ||
                               contact.addresses?.[0];
          const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT') ||
                       contact.phones?.[0];

          await db.update(suppliers).set({
            name: contactName,
            email: contact.emailAddress || null,
            phone: phone?.phoneNumber || null,
            website: contact.website || null,
            addressLine1: streetAddress?.addressLine1 || null,
            addressLine2: streetAddress?.addressLine2 || null,
            city: streetAddress?.city || null,
            postcode: streetAddress?.postalCode || null,
            country: streetAddress?.country || 'UK',
            vatNumber: contact.taxNumber || null,
            isOurSupplier: 1,
            lastXeroSyncAt: Date.now(),
            updatedAt: Date.now(),
          }).where(eq(suppliers.id, existing[0].id));

          summary.matched++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'matched',
            supplierId: existing[0].id,
            message: `Updated existing supplier`,
          });
          
          console.log(`${logPrefix} Updated supplier: ${contactName}`);

        } else {
          // Create new supplier
          const streetAddress = contact.addresses?.find((a: any) => a.addressType === 'STREET') ||
                               contact.addresses?.find((a: any) => a.addressType === 'POBOX') ||
                               contact.addresses?.[0];
          const phone = contact.phones?.find((p: any) => p.phoneType === 'DEFAULT') ||
                       contact.phones?.[0];

          const supplierId = generateSupplierId();
          const now = Date.now();

          const supplierData: InsertSupplier = {
            id: supplierId,
            workspaceId,
            name: contactName,
            email: contact.emailAddress || null,
            phone: phone?.phoneNumber || null,
            website: contact.website || null,
            addressLine1: streetAddress?.addressLine1 || null,
            addressLine2: streetAddress?.addressLine2 || null,
            city: streetAddress?.city || null,
            postcode: streetAddress?.postalCode || null,
            country: streetAddress?.country || 'UK',
            vatNumber: contact.taxNumber || null,
            xeroContactId: contactId,
            isOurSupplier: 1,
            discoveredBy: 'xero',
            discoveredAt: now,
            lastXeroSyncAt: now,
            createdAt: now,
            updatedAt: now,
          };

          await db.insert(suppliers).values(supplierData);

          summary.created++;
          summary.details.push({
            xeroContactId: contactId!,
            xeroContactName: contactName,
            action: 'created',
            supplierId,
            message: `Created new supplier`,
          });

          console.log(`${logPrefix} Created supplier: ${contactName} (${supplierId})`);
        }

      } catch (error) {
        console.error(`${logPrefix} Error processing supplier ${contactId}:`, error);
        summary.errors++;
        summary.details.push({
          xeroContactId: contactId!,
          xeroContactName: contactName,
          action: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`${logPrefix} Import complete:`, {
      matched: summary.matched,
      created: summary.created,
      skipped: summary.skipped,
      errors: summary.errors,
      total: summary.total,
    });

    return summary;

  } catch (error) {
    console.error(`${logPrefix} Fatal error during import:`, error);
    throw error;
  }
}

/**
 * Import purchases (bills) from Xero for a specific supplier.
 * 
 * @param xeroContactId - Xero contact ID of the supplier
 * @param supplierId - Local supplier ID
 * @param workspaceId - Tenant workspace ID
 * @param xero - Xero client
 * @param tenantId - Xero tenant ID
 * @returns Number of purchases imported
 */
export async function importXeroPurchases(
  xeroContactId: string,
  supplierId: string,
  workspaceId: string,
  xero: XeroClient,
  tenantId: string
): Promise<XeroPurchaseImportSummary> {
  const db = getDb();
  const logPrefix = `[xero-import:purchases]`;

  const summary: XeroPurchaseImportSummary = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
  };

  try {
    // Fetch bills (invoices of type ACCPAY) for this supplier
    // Note: Xero API uses invoices endpoint for both sales and purchase invoices
    const response = await xero.accountingApi.getInvoices(
      tenantId,
      undefined, // ifModifiedSince
      `Type=="ACCPAY"`, // where - purchase invoices only
      undefined, // order
      undefined, // iDs
      undefined, // invoiceNumbers
      [xeroContactId], // contactIDs
      undefined, // statuses
      undefined, // page
      false,     // includeArchived
      false,     // createdByMyApp
      undefined  // unitdp
    );

    const bills = response.body.invoices || [];
    summary.total = bills.length;
    console.log(`${logPrefix} Found ${bills.length} bills for supplier ${xeroContactId}`);

    if (bills.length === 0) {
      return summary;
    }

    let earliestDate: number | null = null;
    let latestDate: number | null = null;
    let totalAmount = 0;

    for (const bill of bills) {
      try {
        // Check if already imported
        const existing = await db
          .select({ id: supplierPurchases.id })
          .from(supplierPurchases)
          .where(eq(supplierPurchases.xeroBillId, bill.invoiceID!))
          .limit(1);

        if (existing.length > 0) {
          summary.skipped++;
          continue; // Already imported
        }

        // Parse dates
        const purchaseDate = bill.date ? new Date(bill.date).getTime() : Date.now();
        const dueDate = bill.dueDate ? new Date(bill.dueDate).getTime() : null;

        // Generate purchase ID
        const purchaseId = `purch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();

        // Map line items
        const lineItems = (bill.lineItems || []).map((line: any) => ({
          description: line.description || 'Unknown item',
          quantity: line.quantity || 1,
          unitPrice: line.unitAmount || 0,
          amount: line.lineAmount || 0,
          accountCode: line.accountCode || null,
        }));

        const purchaseData: InsertSupplierPurchase = {
          id: purchaseId,
          workspaceId,
          supplierId,
          xeroBillId: bill.invoiceID,
          xeroBillNumber: bill.invoiceNumber || null,
          purchaseDate,
          dueDate,
          totalAmount: bill.total || 0,
          currency: bill.currencyCode || 'GBP',
          status: mapXeroStatusToLocal(bill.status?.toString()),
          lineItems,
          reference: bill.reference || null,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
        };

        await db.insert(supplierPurchases).values(purchaseData);
        summary.imported++;

        // Track dates and total for supplier stats
        if (!earliestDate || purchaseDate < earliestDate) {
          earliestDate = purchaseDate;
        }
        if (!latestDate || purchaseDate > latestDate) {
          latestDate = purchaseDate;
        }
        totalAmount += bill.total || 0;

      } catch (error) {
        console.error(`${logPrefix} Error importing bill ${bill.invoiceID}:`, error);
        summary.errors++;
      }
    }

    // Update supplier with purchase stats
    if (summary.imported > 0) {
      await db.update(suppliers)
        .set({
          firstPurchaseDate: earliestDate,
          lastPurchaseDate: latestDate,
          totalPurchasesAmount: totalAmount,
          purchaseCount: summary.imported,
          updatedAt: Date.now(),
        })
        .where(eq(suppliers.id, supplierId));
    }

    console.log(`${logPrefix} Imported ${summary.imported} purchases for supplier ${supplierId}`);
    return summary;

  } catch (error) {
    console.error(`${logPrefix} Error fetching bills:`, error);
    throw error;
  }
}

/**
 * Import suppliers AND their purchases from Xero.
 * 
 * This is a convenience function that:
 * 1. Imports all suppliers
 * 2. For each supplier, imports their purchase history
 * 
 * @param workspaceId - Tenant workspace ID
 * @param storage - Storage interface for Xero connection
 * @returns Combined import summary
 */
export async function importXeroSuppliersWithPurchases(
  workspaceId: string,
  storage: XeroStorage
): Promise<{
  suppliers: XeroSupplierImportSummary;
  purchases: XeroPurchaseImportSummary;
}> {
  const logPrefix = `[xero-import:suppliers+purchases]`;
  const db = getDb();

  // First, import all suppliers
  const supplierSummary = await importXeroSuppliers(workspaceId, storage);

  // Initialize purchases summary
  const purchasesSummary: XeroPurchaseImportSummary = {
    imported: 0,
    skipped: 0,
    errors: 0,
    total: 0,
  };

  // Get Xero client
  const xeroData = await getXeroClient(workspaceId, storage);
  if (!xeroData) {
    return { suppliers: supplierSummary, purchases: purchasesSummary };
  }

  const { client: xero, tenantId } = xeroData;

  // Get all suppliers with xero_contact_id for this workspace
  const localSuppliers = await db
    .select()
    .from(suppliers)
    .where(and(
      eq(suppliers.workspaceId, workspaceId),
      eq(suppliers.isOurSupplier, 1)
    ));

  console.log(`${logPrefix} Importing purchases for ${localSuppliers.length} suppliers...`);

  // Import purchases for each supplier
  for (const supplier of localSuppliers) {
    if (!supplier.xeroContactId) continue;

    try {
      const result = await importXeroPurchases(
        supplier.xeroContactId,
        supplier.id,
        workspaceId,
        xero,
        tenantId
      );

      purchasesSummary.imported += result.imported;
      purchasesSummary.skipped += result.skipped;
      purchasesSummary.errors += result.errors;
      purchasesSummary.total += result.total;

    } catch (error) {
      console.error(`${logPrefix} Error importing purchases for supplier ${supplier.id}:`, error);
      purchasesSummary.errors++;
    }
  }

  console.log(`${logPrefix} Purchase import complete:`, purchasesSummary);

  return {
    suppliers: supplierSummary,
    purchases: purchasesSummary,
  };
}

/**
 * Map Xero invoice status to local status.
 */
function mapXeroStatusToLocal(status?: string): string {
  const statusMap: Record<string, string> = {
    'DRAFT': 'draft',
    'SUBMITTED': 'submitted',
    'AUTHORISED': 'authorised',
    'PAID': 'paid',
    'VOIDED': 'voided',
    'DELETED': 'voided',
  };
  return statusMap[status || ''] || 'draft';
}

// ============================================
// BILLS IMPORT (ALL SUPPLIERS)
// ============================================

/**
 * Import summary for bills import.
 */
export interface XeroBillsImportSummary {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  productsTracked: number;
  errorDetails: Array<{ bill: string; error: string }>;
}

/**
 * Import all bills (ACCPAY invoices) from Xero.
 * 
 * This function:
 * 1. Fetches all purchase invoices (bills) from Xero
 * 2. Matches them to existing suppliers
 * 3. Updates supplier statistics
 * 4. Tracks product pricing from line items
 * 
 * @param workspaceId - Tenant workspace ID
 * @param storage - Storage interface for Xero connection
 * @param since - Optional date to only fetch bills since
 * @returns Import summary
 */
export async function importXeroBills(
  workspaceId: string,
  storage: XeroStorage,
  since?: Date
): Promise<XeroBillsImportSummary> {
  const logPrefix = `[xero-import:bills]`;
  const db = getDb();
  
  console.log(`${logPrefix} Starting Xero bills import for workspace ${workspaceId}`);
  if (since) {
    console.log(`${logPrefix} Fetching bills since ${since.toISOString()}`);
  }

  // Initialize summary
  const summary: XeroBillsImportSummary = {
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    productsTracked: 0,
    errorDetails: [],
  };

  // Get Xero client
  const xeroData = await getXeroClient(workspaceId, storage);
  if (!xeroData) {
    throw new Error("Xero not connected or token expired");
  }

  const { client: xero, tenantId } = xeroData;

  try {
    // Build where clause for ACCPAY (purchase invoices/bills)
    let whereClause = 'Type=="ACCPAY"';
    if (since) {
      const year = since.getFullYear();
      const month = since.getMonth() + 1;
      const day = since.getDate();
      whereClause = `Type=="ACCPAY" AND Date >= DateTime(${year},${month},${day})`;
    }

    // Fetch bills from Xero
    console.log(`${logPrefix} Fetching bills from Xero with filter: ${whereClause}`);
    const response = await xero.accountingApi.getInvoices(
      tenantId,
      undefined,     // ifModifiedSince
      whereClause,   // where
      'Date DESC',   // order
      undefined,     // iDs
      undefined,     // invoiceNumbers
      undefined,     // contactIDs
      undefined,     // statuses
      undefined,     // page
      false,         // includeArchived
      false,         // createdByMyApp
      undefined      // unitdp
    );

    const bills = response.body.invoices || [];
    summary.total = bills.length;
    console.log(`${logPrefix} Found ${bills.length} bills in Xero`);

    if (bills.length === 0) {
      return summary;
    }

    // Track which suppliers need stats updates
    const suppliersToUpdate = new Set<string>();

    // Process each bill
    for (const bill of bills) {
      const billNumber = bill.invoiceNumber || bill.invoiceID || 'Unknown';

      try {
        // Find matching supplier by Xero contact ID
        if (!bill.contact?.contactID) {
          summary.skipped++;
          continue;
        }

        const [supplier] = await db
          .select()
          .from(suppliers)
          .where(and(
            eq(suppliers.xeroContactId, bill.contact.contactID),
            eq(suppliers.workspaceId, workspaceId)
          ))
          .limit(1);

        if (!supplier) {
          // Supplier not yet imported - skip
          console.log(`${logPrefix} Skipping bill ${billNumber} - supplier ${bill.contact.name} not found`);
          summary.skipped++;
          continue;
        }

        // Check if bill already exists
        const [existingBill] = await db
          .select({ id: supplierPurchases.id })
          .from(supplierPurchases)
          .where(eq(supplierPurchases.xeroBillId, bill.invoiceID!))
          .limit(1);

        // Parse dates
        const purchaseDate = bill.date ? new Date(bill.date).getTime() : Date.now();
        const dueDate = bill.dueDate ? new Date(bill.dueDate).getTime() : null;

        // Map line items
        const lineItems = (bill.lineItems || []).map((item: any) => ({
          description: item.description || 'Unknown item',
          quantity: item.quantity || 1,
          unitPrice: item.unitAmount || 0,
          lineAmount: item.lineAmount || 0,
          accountCode: item.accountCode || null,
          itemCode: item.itemCode || null,
        }));

        if (existingBill) {
          // Update existing bill
          await db.update(supplierPurchases).set({
            totalAmount: bill.total || 0,
            status: mapXeroStatusToLocal(bill.status?.toString()),
            lineItems,
            syncedAt: Date.now(),
            updatedAt: Date.now(),
          }).where(eq(supplierPurchases.id, existingBill.id));

          summary.updated++;
        } else {
          // Create new bill
          const purchaseId = `purch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const now = Date.now();

          await db.insert(supplierPurchases).values({
            id: purchaseId,
            workspaceId,
            supplierId: supplier.id,
            xeroBillId: bill.invoiceID,
            xeroBillNumber: bill.invoiceNumber || null,
            purchaseDate,
            dueDate,
            totalAmount: bill.total || 0,
            currency: bill.currencyCode || 'GBP',
            status: mapXeroStatusToLocal(bill.status?.toString()),
            lineItems,
            reference: bill.reference || null,
            createdAt: now,
            updatedAt: now,
            syncedAt: now,
          });

          summary.imported++;
        }

        // Mark supplier for stats update
        suppliersToUpdate.add(supplier.id);

        // Extract and track product pricing from line items
        if (bill.lineItems && bill.lineItems.length > 0) {
          for (const item of bill.lineItems) {
            if (item.description && item.quantity && item.lineAmount) {
              const unitPrice = item.lineAmount / item.quantity;
              const billDate = bill.date ? new Date(bill.date) : new Date();
              
              await updateSupplierProduct(
                workspaceId,
                supplier.id,
                item.description,
                unitPrice,
                billDate,
                item.itemCode || undefined
              );
              
              summary.productsTracked++;
            }
          }
        }

      } catch (error) {
        console.error(`${logPrefix} Error processing bill ${billNumber}:`, error);
        summary.errors++;
        summary.errorDetails.push({
          bill: billNumber,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Update stats for all affected suppliers
    console.log(`${logPrefix} Updating stats for ${suppliersToUpdate.size} suppliers...`);
    for (const supplierId of suppliersToUpdate) {
      try {
        await updateSupplierStats(supplierId);
      } catch (error) {
        console.error(`${logPrefix} Error updating stats for supplier ${supplierId}:`, error);
      }
    }

    console.log(`${logPrefix} Bills import complete:`, {
      total: summary.total,
      imported: summary.imported,
      updated: summary.updated,
      skipped: summary.skipped,
      errors: summary.errors,
      productsTracked: summary.productsTracked,
    });

    return summary;

  } catch (error) {
    console.error(`${logPrefix} Fatal error during bills import:`, error);
    throw error;
  }
}

/**
 * Update supplier statistics from their purchases.
 * 
 * Calculates:
 * - Total spend (totalPurchasesAmount)
 * - Purchase count
 * - First and last purchase dates
 * 
 * @param supplierId - Supplier ID to update
 */
async function updateSupplierStats(supplierId: string): Promise<void> {
  const db = getDb();
  const logPrefix = `[xero-import:stats]`;

  try {
    // Calculate aggregate stats from purchases
    const [stats] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${supplierPurchases.totalAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
        lastDate: sql<number>`MAX(${supplierPurchases.purchaseDate})`,
        firstDate: sql<number>`MIN(${supplierPurchases.purchaseDate})`,
      })
      .from(supplierPurchases)
      .where(eq(supplierPurchases.supplierId, supplierId));

    // Update supplier record
    await db.update(suppliers).set({
      totalPurchasesAmount: stats?.total || 0,
      purchaseCount: stats?.count || 0,
      lastPurchaseDate: stats?.lastDate || null,
      firstPurchaseDate: stats?.firstDate || null,
      updatedAt: Date.now(),
    }).where(eq(suppliers.id, supplierId));

    console.log(`${logPrefix} Updated stats for supplier ${supplierId}: £${stats?.total?.toFixed(2) || 0} total, ${stats?.count || 0} purchases`);

  } catch (error) {
    console.error(`${logPrefix} Error updating supplier stats:`, error);
    throw error;
  }
}

/**
 * Update or create a supplier product record with pricing history.
 * 
 * Tracks the price paid for each product from a supplier over time,
 * enabling price trend analysis and cost monitoring.
 * 
 * @param workspaceId - Workspace ID
 * @param supplierId - Supplier ID
 * @param productName - Product description/name
 * @param price - Unit price paid
 * @param date - Date of purchase
 * @param productCode - Optional product code/SKU
 */
async function updateSupplierProduct(
  workspaceId: string,
  supplierId: string,
  productName: string,
  price: number,
  date: Date,
  productCode?: string
): Promise<void> {
  const db = getDb();
  const logPrefix = `[xero-import:products]`;

  try {
    // Normalize product name for matching
    const normalizedName = productName.trim().toLowerCase();

    // Find existing product record
    const [existing] = await db
      .select()
      .from(supplierProducts)
      .where(and(
        eq(supplierProducts.supplierId, supplierId),
        sql`LOWER(${supplierProducts.productName}) = ${normalizedName}`
      ))
      .limit(1);

    const dateTimestamp = date.getTime();
    const now = Date.now();

    if (existing) {
      // Update existing product with new price point
      const history: Array<{ date: string; price: number }> = 
        (existing.priceHistory as Array<{ date: string; price: number }>) || [];
      
      // Check if we already have this price point (avoid duplicates)
      const dateStr = date.toISOString().split('T')[0];
      const existingEntry = history.find(h => h.date.startsWith(dateStr));
      
      if (!existingEntry) {
        history.push({ date: date.toISOString(), price });
        
        // Sort by date and keep last 50 entries
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const trimmedHistory = history.slice(0, 50);

        await db.update(supplierProducts).set({
          lastPrice: price,
          lastPurchaseDate: dateTimestamp,
          priceHistory: trimmedHistory,
          productCode: productCode || existing.productCode,
          updatedAt: now,
        }).where(eq(supplierProducts.id, existing.id));
      }

    } else {
      // Create new product record
      await db.insert(supplierProducts).values({
        workspaceId,
        supplierId,
        productName: productName.trim(),
        productCode: productCode || null,
        lastPrice: price,
        lastPurchaseDate: dateTimestamp,
        priceHistory: [{ date: date.toISOString(), price }],
        createdAt: now,
        updatedAt: now,
      });

      console.log(`${logPrefix} Created product: "${productName}" from supplier ${supplierId}`);
    }

  } catch (error) {
    // Non-critical - log but don't fail the main import
    console.warn(`${logPrefix} Failed to update product "${productName}":`, error);
  }
}

/**
 * Full supplier sync: imports suppliers, their bills, and updates all stats.
 * 
 * This is the recommended function for a complete Xero supplier sync.
 * 
 * @param workspaceId - Workspace ID
 * @param storage - Storage interface
 * @param since - Optional: only import bills since this date
 */
export async function fullXeroSupplierSync(
  workspaceId: string,
  storage: XeroStorage,
  since?: Date
): Promise<{
  suppliers: XeroSupplierImportSummary;
  bills: XeroBillsImportSummary;
}> {
  const logPrefix = `[xero-import:full-sync]`;
  
  console.log(`${logPrefix} Starting full supplier sync for workspace ${workspaceId}`);

  // Step 1: Import/update suppliers
  console.log(`${logPrefix} Step 1: Importing suppliers...`);
  const supplierResult = await importXeroSuppliers(workspaceId, storage);

  // Step 2: Import bills
  console.log(`${logPrefix} Step 2: Importing bills...`);
  const billsResult = await importXeroBills(workspaceId, storage, since);

  console.log(`${logPrefix} Full sync complete:`, {
    suppliersCreated: supplierResult.created,
    suppliersUpdated: supplierResult.matched,
    billsImported: billsResult.imported,
    billsUpdated: billsResult.updated,
    productsTracked: billsResult.productsTracked,
  });

  return {
    suppliers: supplierResult,
    bills: billsResult,
  };
}

