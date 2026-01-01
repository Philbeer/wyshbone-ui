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
  type InsertPubsMaster,
  type SelectPubsMaster,
  type InsertXeroOrderEntity,
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

