/**
 * Nightly Database Maintenance Cron Jobs
 * 
 * Runs scheduled tasks to keep the pub database fresh:
 * - Verify existing pubs (check if still open, update details)
 * - Discover new pubs in delivery areas
 * - Find new events
 * - Research freehouse status for queued pubs
 * - Log all activity for analytics
 */

import * as cron from "node-cron";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, sql, asc, desc, isNull, or, lte } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import {
  pubsMaster,
  aiResearchQueue,
  searchLog,
  type InsertSearchLog,
  type SelectPubsMaster,
  type SelectAiResearchQueue,
} from "@shared/schema";
import {
  processSleepAgentProspect,
  processEvent,
  searchGooglePlaces,
  searchGoogleForEvents,
  extractPostcode,
  type GooglePlaceResult,
} from "../lib/sleeper-agent";
import { verifyVenue, searchPlaces } from "../googlePlaces";

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // How many pubs to verify per night (spread the load)
  PUBS_TO_VERIFY_PER_NIGHT: 1000,
  
  // How many research queue items to process per night
  RESEARCH_QUEUE_LIMIT: 100,
  
  // Event discovery queries
  EVENT_QUERIES: [
    "beer festival UK",
    "craft beer festival UK",
    "beer tasting event UK",
    "brewery open day UK",
    "meet the brewer event UK",
    "CAMRA beer festival",
  ],
  
  // Pub discovery queries for delivery areas
  PUB_SEARCH_QUERIES: [
    "pubs",
    "micropubs",
    "freehouse",
    "independent pub",
    "craft beer pub",
  ],
  
  // Claude model for freehouse research
  CLAUDE_MODEL: "claude-sonnet-4-20250514",
  
  // Delay between API calls to avoid rate limits (ms)
  API_DELAY: 500,
};

// ============================================
// DATABASE CONNECTION
// ============================================

let drizzleDb: ReturnType<typeof drizzle> | null = null;

function getDrizzleDb() {
  if (!drizzleDb) {
    // CRITICAL: Always prefer SUPABASE_DATABASE_URL over DATABASE_URL
    const connectionUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionUrl) {
      throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL environment variable is not set");
    }
    const queryClient = postgres(connectionUrl, {
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

interface NightlyUpdateSummary {
  workspaceId: number;
  startedAt: Date;
  completedAt: Date;
  
  // Pub verification
  pubsVerified: number;
  pubsUpdated: number;
  pubsMarkedClosed: number;
  
  // New pub discovery
  areasSearched: number;
  newPubsDiscovered: number;
  existingPubsFound: number;
  
  // Event discovery
  eventQueriesRun: number;
  newEventsDiscovered: number;
  existingEventsUpdated: number;
  
  // Freehouse research
  researchItemsProcessed: number;
  freehousesIdentified: number;
  pubCompaniesIdentified: number;
  
  // Errors
  errors: string[];
}

interface DeliveryArea {
  name: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  radius?: number; // meters
}

// ============================================
// MAIN NIGHTLY UPDATE FUNCTION
// ============================================

/**
 * Run the nightly database update for a workspace.
 * 
 * This is the main orchestrator that runs all maintenance tasks:
 * 1. Verify existing pubs (check if still open, update phone/details)
 * 2. Find new pubs in delivery areas
 * 3. Find new events
 * 4. Research freehouse status
 * 5. Log all activity
 * 
 * @param workspaceId - The workspace to update
 * @returns NightlyUpdateSummary with results
 */
export async function nightlyDatabaseUpdate(workspaceId: number): Promise<NightlyUpdateSummary> {
  const logPrefix = `[nightly:${workspaceId}]`;
  const startedAt = new Date();
  
  console.log(`${logPrefix} =============================================`);
  console.log(`${logPrefix} Starting nightly database update`);
  console.log(`${logPrefix} =============================================`);
  
  const summary: NightlyUpdateSummary = {
    workspaceId,
    startedAt,
    completedAt: new Date(), // Will be updated
    pubsVerified: 0,
    pubsUpdated: 0,
    pubsMarkedClosed: 0,
    areasSearched: 0,
    newPubsDiscovered: 0,
    existingPubsFound: 0,
    eventQueriesRun: 0,
    newEventsDiscovered: 0,
    existingEventsUpdated: 0,
    researchItemsProcessed: 0,
    freehousesIdentified: 0,
    pubCompaniesIdentified: 0,
    errors: [],
  };
  
  try {
    // Step 1: Verify existing pubs
    console.log(`${logPrefix} Step 1: Verifying existing pubs...`);
    const verifyResult = await verifyExistingPubs(workspaceId, CONFIG.PUBS_TO_VERIFY_PER_NIGHT);
    summary.pubsVerified = verifyResult.verified;
    summary.pubsUpdated = verifyResult.updated;
    summary.pubsMarkedClosed = verifyResult.markedClosed;
    summary.errors.push(...verifyResult.errors);
    
    // Small delay between major tasks
    await delay(2000);
    
    // Step 2: Find new pubs in delivery areas
    console.log(`${logPrefix} Step 2: Finding new pubs in delivery areas...`);
    const deliveryAreas = await getDeliveryAreas(workspaceId);
    for (const area of deliveryAreas) {
      try {
        const areaResult = await discoverPubsInArea(area, workspaceId);
        summary.areasSearched++;
        summary.newPubsDiscovered += areaResult.newPubs;
        summary.existingPubsFound += areaResult.existingPubs;
        
        // Log the search
        await logSearch(workspaceId, "pub_discovery", area.name, {
          resultsReturned: areaResult.resultsReturned,
          newPubsAdded: areaResult.newPubs,
          existingPubsFound: areaResult.existingPubs,
          duplicatesSkipped: 0,
        });
        
        await delay(CONFIG.API_DELAY);
      } catch (error: any) {
        summary.errors.push(`Area ${area.name}: ${error.message}`);
      }
    }
    
    // Small delay
    await delay(2000);
    
    // Step 3: Find new events
    console.log(`${logPrefix} Step 3: Finding new events...`);
    for (const query of CONFIG.EVENT_QUERIES) {
      try {
        const eventResult = await discoverEvents(query, "UK", workspaceId);
        summary.eventQueriesRun++;
        summary.newEventsDiscovered += eventResult.newEvents;
        summary.existingEventsUpdated += eventResult.updatedEvents;
        
        // Log the search
        await logSearch(workspaceId, "event_discovery", query, {
          resultsReturned: eventResult.eventsFound,
          newPubsAdded: eventResult.newEvents,
          existingPubsFound: eventResult.updatedEvents,
          duplicatesSkipped: 0,
        });
        
        await delay(CONFIG.API_DELAY);
      } catch (error: any) {
        summary.errors.push(`Event query "${query}": ${error.message}`);
      }
    }
    
    // Small delay
    await delay(2000);
    
    // Step 4: Research freehouse status
    console.log(`${logPrefix} Step 4: Researching freehouse status...`);
    const researchResult = await processFreehouseResearchQueue(workspaceId, CONFIG.RESEARCH_QUEUE_LIMIT);
    summary.researchItemsProcessed = researchResult.processed;
    summary.freehousesIdentified = researchResult.freehouses;
    summary.pubCompaniesIdentified = researchResult.pubCompanies;
    summary.errors.push(...researchResult.errors);
    
  } catch (error: any) {
    console.error(`${logPrefix} Fatal error:`, error);
    summary.errors.push(`Fatal error: ${error.message}`);
  }
  
  summary.completedAt = new Date();
  const duration = (summary.completedAt.getTime() - startedAt.getTime()) / 1000 / 60;
  
  console.log(`${logPrefix} =============================================`);
  console.log(`${logPrefix} Nightly update completed in ${duration.toFixed(1)} minutes`);
  console.log(`${logPrefix} Pubs verified: ${summary.pubsVerified} (${summary.pubsUpdated} updated, ${summary.pubsMarkedClosed} closed)`);
  console.log(`${logPrefix} New pubs discovered: ${summary.newPubsDiscovered}`);
  console.log(`${logPrefix} New events discovered: ${summary.newEventsDiscovered}`);
  console.log(`${logPrefix} Research items processed: ${summary.researchItemsProcessed}`);
  console.log(`${logPrefix} Errors: ${summary.errors.length}`);
  console.log(`${logPrefix} =============================================`);
  
  return summary;
}

// ============================================
// STEP 1: VERIFY EXISTING PUBS
// ============================================

interface VerifyResult {
  verified: number;
  updated: number;
  markedClosed: number;
  errors: string[];
}

/**
 * Verify existing pubs by checking Google Places for current info.
 * Prioritizes pubs that haven't been verified recently.
 */
async function verifyExistingPubs(workspaceId: number, limit: number): Promise<VerifyResult> {
  const db = getDrizzleDb();
  const logPrefix = "[nightly:verify]";
  
  const result: VerifyResult = {
    verified: 0,
    updated: 0,
    markedClosed: 0,
    errors: [],
  };
  
  try {
    // Get pubs that need verification (oldest first, null dates first)
    const pubsToVerify = await db
      .select()
      .from(pubsMaster)
      .where(
        and(
          eq(pubsMaster.workspaceId, workspaceId),
          eq(pubsMaster.isClosed, false),
        )
      )
      .orderBy(asc(sql`COALESCE(${pubsMaster.lastVerifiedAt}, '1970-01-01'::timestamp)`))
      .limit(limit);
    
    console.log(`${logPrefix} Found ${pubsToVerify.length} pubs to verify`);
    
    for (const pub of pubsToVerify) {
      try {
        // Build search query
        const address = [pub.addressLine1, pub.city, pub.postcode].filter(Boolean).join(", ");
        
        // Search Google Places for this pub
        const verifyResult = await verifyVenue({
          name: pub.name,
          address: address || undefined,
        });
        
        result.verified++;
        
        if (verifyResult.found && verifyResult.best) {
          const best = verifyResult.best;
          
          // Check if closed
          if (best.businessStatus === "CLOSED_PERMANENTLY") {
            await db
              .update(pubsMaster)
              .set({
                isClosed: true,
                lastVerifiedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(pubsMaster.id, pub.id));
            
            result.markedClosed++;
            console.log(`${logPrefix} Marked as closed: "${pub.name}"`);
          } else {
            // Update with fresh data
            const updates: Partial<SelectPubsMaster> = {
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            };
            
            // Update phone if we got a better one
            if (best.phone && !pub.phone) {
              updates.phone = best.phone;
              result.updated++;
            }
            
            await db
              .update(pubsMaster)
              .set(updates)
              .where(eq(pubsMaster.id, pub.id));
          }
        } else {
          // Just update last_verified_at even if not found
          await db
            .update(pubsMaster)
            .set({
              lastVerifiedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(pubsMaster.id, pub.id));
        }
        
        // Rate limit
        await delay(CONFIG.API_DELAY);
        
      } catch (error: any) {
        result.errors.push(`Pub ${pub.id} (${pub.name}): ${error.message}`);
      }
    }
    
  } catch (error: any) {
    result.errors.push(`Verify query error: ${error.message}`);
  }
  
  return result;
}

// ============================================
// STEP 2: DISCOVER NEW PUBS IN DELIVERY AREAS
// ============================================

interface AreaDiscoveryResult {
  newPubs: number;
  existingPubs: number;
  resultsReturned: number;
}

/**
 * Get delivery areas for a workspace.
 * In production, this would come from user settings.
 */
async function getDeliveryAreas(workspaceId: number): Promise<DeliveryArea[]> {
  // TODO: Load from user settings or workspace config
  // For now, return some default UK areas
  
  // These would typically come from a settings table or user profile
  const defaultAreas: DeliveryArea[] = [
    { name: "Brighton", postcode: "BN1", radius: 15000 },
    { name: "Hove", postcode: "BN3", radius: 10000 },
    { name: "Worthing", postcode: "BN11", radius: 10000 },
    { name: "Eastbourne", postcode: "BN21", radius: 10000 },
  ];
  
  // In production, query workspace settings here
  // const settings = await db.query...
  
  return defaultAreas;
}

/**
 * Discover pubs in a delivery area.
 */
async function discoverPubsInArea(area: DeliveryArea, workspaceId: number): Promise<AreaDiscoveryResult> {
  const logPrefix = "[nightly:discover]";
  
  let newPubs = 0;
  let existingPubs = 0;
  let resultsReturned = 0;
  
  // Run multiple search queries for the area
  for (const query of CONFIG.PUB_SEARCH_QUERIES.slice(0, 2)) { // Limit queries per area
    try {
      const location = area.postcode 
        ? `${area.postcode}, UK`
        : area.name + ", UK";
      
      const places = await searchGooglePlaces(
        query,
        { locationText: location },
        area.radius || 10000
      );
      
      resultsReturned += places.length;
      
      // Process each place
      for (const place of places) {
        const result = await processSleepAgentProspect(place, workspaceId);
        
        if (result.action === "new") {
          newPubs++;
        } else if (result.action === "existing_customer" || result.action === "existing_prospect") {
          existingPubs++;
        }
        
        await delay(100); // Small delay between processing
      }
      
      await delay(CONFIG.API_DELAY);
      
    } catch (error: any) {
      console.warn(`${logPrefix} Error searching for "${query}" in ${area.name}: ${error.message}`);
    }
  }
  
  console.log(`${logPrefix} Area "${area.name}": ${resultsReturned} results, ${newPubs} new, ${existingPubs} existing`);
  
  return { newPubs, existingPubs, resultsReturned };
}

// ============================================
// STEP 3: DISCOVER EVENTS
// ============================================

interface EventDiscoveryResult {
  eventsFound: number;
  newEvents: number;
  updatedEvents: number;
}

/**
 * Discover events using Google Custom Search.
 */
async function discoverEvents(query: string, location: string, workspaceId: number): Promise<EventDiscoveryResult> {
  const logPrefix = "[nightly:events]";
  
  try {
    // Search for events
    const events = await searchGoogleForEvents(query, location);
    
    let newEvents = 0;
    let updatedEvents = 0;
    
    // Process each event
    for (const event of events) {
      const result = await processEvent(event, workspaceId);
      
      if (result.action === "created") {
        newEvents++;
      } else if (result.action === "updated") {
        updatedEvents++;
      }
      
      await delay(100);
    }
    
    console.log(`${logPrefix} Query "${query}": ${events.length} found, ${newEvents} new, ${updatedEvents} updated`);
    
    return {
      eventsFound: events.length,
      newEvents,
      updatedEvents,
    };
    
  } catch (error: any) {
    console.warn(`${logPrefix} Error searching events: ${error.message}`);
    return { eventsFound: 0, newEvents: 0, updatedEvents: 0 };
  }
}

// ============================================
// STEP 4: PROCESS FREEHOUSE RESEARCH QUEUE
// ============================================

interface ResearchResult {
  processed: number;
  freehouses: number;
  pubCompanies: number;
  errors: string[];
}

/**
 * Process the AI research queue to determine freehouse status.
 */
async function processFreehouseResearchQueue(workspaceId: number, limit: number): Promise<ResearchResult> {
  const db = getDrizzleDb();
  const logPrefix = "[nightly:research]";
  
  const result: ResearchResult = {
    processed: 0,
    freehouses: 0,
    pubCompanies: 0,
    errors: [],
  };
  
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`${logPrefix} ANTHROPIC_API_KEY not set, skipping freehouse research`);
    return result;
  }
  
  try {
    // Get pending research queue items
    const queueItems = await db
      .select({
        queue: aiResearchQueue,
        pub: pubsMaster,
      })
      .from(aiResearchQueue)
      .innerJoin(pubsMaster, eq(aiResearchQueue.pubId, pubsMaster.id))
      .where(
        and(
          eq(aiResearchQueue.workspaceId, workspaceId),
          eq(aiResearchQueue.researchType, "find_freehouse"),
          eq(aiResearchQueue.status, "pending"),
          sql`${aiResearchQueue.attempts} < ${aiResearchQueue.maxAttempts}`
        )
      )
      .orderBy(asc(aiResearchQueue.priority), asc(aiResearchQueue.createdAt))
      .limit(limit);
    
    console.log(`${logPrefix} Found ${queueItems.length} items in research queue`);
    
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    for (const item of queueItems) {
      try {
        // Mark as processing
        await db
          .update(aiResearchQueue)
          .set({
            status: "processing",
            attempts: sql`${aiResearchQueue.attempts} + 1`,
            lastAttemptAt: new Date(),
          })
          .where(eq(aiResearchQueue.id, item.queue.id));
        
        // Research freehouse status using Claude
        const researchResult = await researchFreehouseStatus(anthropic, item.pub);
        
        result.processed++;
        
        // Update pub record
        await db
          .update(pubsMaster)
          .set({
            isFreehouse: researchResult.isFreehouse,
            pubCompany: researchResult.pubCompany,
            updatedAt: new Date(),
          })
          .where(eq(pubsMaster.id, item.pub.id));
        
        if (researchResult.isFreehouse) {
          result.freehouses++;
        } else if (researchResult.pubCompany) {
          result.pubCompanies++;
        }
        
        // Mark queue item as complete
        await db
          .update(aiResearchQueue)
          .set({
            status: "completed",
            result: researchResult,
            completedAt: new Date(),
          })
          .where(eq(aiResearchQueue.id, item.queue.id));
        
        console.log(`${logPrefix} Researched "${item.pub.name}": ${researchResult.isFreehouse ? "FREEHOUSE" : researchResult.pubCompany || "Unknown"}`);
        
        await delay(CONFIG.API_DELAY);
        
      } catch (error: any) {
        result.errors.push(`Queue item ${item.queue.id}: ${error.message}`);
        
        // Mark as failed
        await db
          .update(aiResearchQueue)
          .set({
            status: sql`CASE WHEN ${aiResearchQueue.attempts} >= ${aiResearchQueue.maxAttempts} THEN 'failed' ELSE 'pending' END`,
            errorMessage: error.message,
          })
          .where(eq(aiResearchQueue.id, item.queue.id));
      }
    }
    
  } catch (error: any) {
    result.errors.push(`Research queue error: ${error.message}`);
  }
  
  return result;
}

interface FreehouseResearchResult {
  isFreehouse: boolean | null;
  pubCompany: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * Use Claude to research if a pub is a freehouse.
 */
async function researchFreehouseStatus(
  anthropic: Anthropic,
  pub: SelectPubsMaster
): Promise<FreehouseResearchResult> {
  const address = [pub.addressLine1, pub.city, pub.postcode].filter(Boolean).join(", ");
  
  const prompt = `You are an expert on UK pubs and the pub industry.

Research if this pub is a "freehouse" (independent, not tied to a brewery or pub company) or owned by a pub company.

PUB DETAILS:
Name: ${pub.name}
Address: ${address || "Unknown"}
Postcode: ${pub.postcode || "Unknown"}

CONTEXT:
- A "freehouse" is a pub not tied to a brewery, so it can sell any beers
- Major UK pub companies include: Greene King, Marston's, Punch Taverns, Ei Group (now Stonegate), Star Pubs & Bars (Heineken), Admiral Taverns, Mitchells & Butlers
- Tied pubs are owned/leased from breweries or pub companies
- Some pubs appear independent but are owned by holding companies

Based on the pub name and location, determine:
1. Is this likely a freehouse? (true/false/null if uncertain)
2. If not a freehouse, who owns it?
3. Your confidence level (0-1)

Respond with ONLY a JSON object:
{
  "isFreehouse": true|false|null,
  "pubCompany": "Company Name" or null,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;

  try {
    const response = await anthropic.messages.create({
      model: CONFIG.CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    
    // Extract text from response
    const textContent = response.content.find(c => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }
    
    // Parse JSON
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON in response");
    }
    
    const result = JSON.parse(jsonMatch[0]) as FreehouseResearchResult;
    return result;
    
  } catch (error: any) {
    console.warn(`[nightly:research] Claude error for "${pub.name}":`, error.message);
    return {
      isFreehouse: null,
      pubCompany: null,
      confidence: 0,
      reasoning: `Research failed: ${error.message}`,
    };
  }
}

// ============================================
// STEP 5: LOG ACTIVITY
// ============================================

interface SearchLogData {
  resultsReturned: number;
  newPubsAdded: number;
  existingPubsFound: number;
  duplicatesSkipped: number;
}

/**
 * Log a search to the search_log table.
 */
async function logSearch(
  workspaceId: number,
  searchType: string,
  searchArea: string,
  data: SearchLogData
): Promise<void> {
  const db = getDrizzleDb();
  
  try {
    const logEntry: InsertSearchLog = {
      workspaceId,
      searchDate: new Date().toISOString().split("T")[0], // YYYY-MM-DD
      searchType,
      searchArea,
      searchTerm: searchArea,
      resultsReturned: data.resultsReturned,
      newPubsAdded: data.newPubsAdded,
      existingPubsFound: data.existingPubsFound,
      duplicatesSkipped: data.duplicatesSkipped,
      createdAt: new Date(),
    };
    
    await db.insert(searchLog).values(logEntry);
    
  } catch (error) {
    console.warn("[nightly:log] Failed to log search:", error);
  }
}

// ============================================
// CRON JOB SCHEDULER
// ============================================

let nightlyTask: cron.ScheduledTask | null = null;
let queueProcessorTask: cron.ScheduledTask | null = null;

interface CronJobOptions {
  /** Workspace IDs to run nightly updates for */
  workspaceIds?: number[];
  /** Cron expression for nightly update (default: 2am daily) */
  nightlySchedule?: string;
  /** Cron expression for queue processor (default: every 5 minutes) */
  queueSchedule?: string;
  /** Whether to run cron jobs (default: true in production) */
  enabled?: boolean;
}

/**
 * Setup all cron jobs for database maintenance.
 * 
 * Jobs:
 * - Nightly database update: 2am daily (by default)
 * - Sync queue processor: Every 5 minutes (by default)
 */
export function setupCronJobs(options: CronJobOptions = {}): void {
  const {
    workspaceIds = [],
    nightlySchedule = "0 2 * * *",    // 2am daily
    queueSchedule = "*/5 * * * *",    // Every 5 minutes
    enabled = process.env.NODE_ENV === "production" || process.env.ENABLE_CRON === "true",
  } = options;
  
  // Check if cron should be enabled
  if (!enabled) {
    console.log("⏸️ Cron jobs disabled (set ENABLE_CRON=true to enable in development)");
    return;
  }
  
  // Stop any existing tasks
  stopCronJobs();
  
  console.log("🕐 Setting up cron jobs...");
  
  // Nightly database update
  nightlyTask = cron.schedule(nightlySchedule, async () => {
    console.log(`[${new Date().toISOString()}] 🌙 Running nightly database update...`);
    
    try {
      // If no workspace IDs provided, get all active workspaces
      const workspaces = workspaceIds.length > 0 
        ? workspaceIds 
        : await getActiveWorkspaces();
      
      for (const workspaceId of workspaces) {
        try {
          await nightlyDatabaseUpdate(workspaceId);
        } catch (error) {
          console.error(`Nightly update failed for workspace ${workspaceId}:`, error);
        }
      }
      
    } catch (error) {
      console.error("Nightly database update failed:", error);
    }
  });
  
  // Queue processor (for sync operations)
  queueProcessorTask = cron.schedule(queueSchedule, async () => {
    console.log(`[${new Date().toISOString()}] 🔄 Processing sync queue...`);
    
    try {
      // Get all active workspaces
      const workspaces = workspaceIds.length > 0 
        ? workspaceIds 
        : await getActiveWorkspaces();
      
      for (const workspaceId of workspaces) {
        try {
          // Process a smaller batch more frequently
          await processFreehouseResearchQueue(workspaceId, 10);
        } catch (error) {
          console.error(`Queue processing failed for workspace ${workspaceId}:`, error);
        }
      }
      
    } catch (error) {
      console.error("Sync queue processing failed:", error);
    }
  });
  
  console.log("✅ Cron jobs started:");
  console.log(`   - Nightly update: ${nightlySchedule}`);
  console.log(`   - Queue processor: ${queueSchedule}`);
}

/**
 * Stop all cron jobs.
 */
export function stopCronJobs(): void {
  if (nightlyTask) {
    nightlyTask.stop();
    nightlyTask = null;
  }
  if (queueProcessorTask) {
    queueProcessorTask.stop();
    queueProcessorTask = null;
  }
  console.log("⏹️ Cron jobs stopped");
}

/**
 * Check if cron jobs are running.
 */
export function isCronRunning(): boolean {
  return nightlyTask !== null || queueProcessorTask !== null;
}

/**
 * Manually trigger the nightly update (for testing).
 */
export async function triggerNightlyUpdate(workspaceId: number): Promise<NightlyUpdateSummary> {
  console.log(`🔧 Manually triggering nightly update for workspace ${workspaceId}`);
  return nightlyDatabaseUpdate(workspaceId);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get all active workspace IDs.
 * In production, query the database for workspaces with active subscriptions.
 */
async function getActiveWorkspaces(): Promise<number[]> {
  // TODO: Query database for active workspaces
  // For now, return empty array (must be provided explicitly)
  console.warn("[nightly] No workspaceIds provided and getActiveWorkspaces not implemented");
  return [];
}

/**
 * Delay helper.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// RE-EXPORTS (for convenience)
// ============================================

// All exports are inline with their declarations above

