/**
 * Database Update Job Management
 * 
 * Manages long-running database maintenance jobs with:
 * - Progress tracking
 * - Cost calculation
 * - Graceful cancellation
 * - Result aggregation
 */

import { getDrizzleDb } from '../storage';
import { pubsMaster } from '@shared/schema';
import { isNull, lt, asc, sql } from 'drizzle-orm';

// ============================================
// TYPES
// ============================================

export interface JobSettings {
  pubsPerNight: number;
  enableGoogle: boolean;
  enableWhatpub: boolean;
  enableDeepResearch: boolean;
}

export interface JobProgress {
  currentPub: number;
  totalPubs: number;
  currentPubName: string;
  lastPubId: number | null;
}

export interface JobResults {
  updated: number;
  newUrls: number;
  managersFound: number;
  freehousesDetected: number;
  errors: number;
  closedPubs: number;
}

export interface JobCosts {
  incurred: number;  // in GBP
  estimated: number; // in GBP
}

export interface JobTiming {
  startedAt: Date;
  completedAt: Date | null;
  estimatedCompletion: Date | null;
}

export interface JobState {
  id: string;
  workspaceId: number;
  status: 'pending' | 'running' | 'cancelled' | 'completed' | 'failed';
  settings: JobSettings;
  progress: JobProgress;
  results: JobResults;
  costs: JobCosts;
  timing: JobTiming;
  shouldCancel: boolean; // Flag for graceful shutdown
  lastPubProcessed: string | null;
  nextPubToProcess: string | null;
  errorMessage: string | null;
}

// Cost per pub for each data source (in GBP)
const COSTS_PER_PUB = {
  google: 0.019,      // £0.019 per pub
  whatpub: 0.008,     // £0.008 per pub
  deepResearch: 0.045 // £0.045 per pub
};

// Average time per pub in milliseconds
const AVG_TIME_PER_PUB = 2000; // 2 seconds

// Store active jobs in memory
const activeJobs = new Map<string, JobState>();

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateCostPerPub(settings: JobSettings): number {
  let cost = 0;
  if (settings.enableGoogle) cost += COSTS_PER_PUB.google;
  if (settings.enableWhatpub) cost += COSTS_PER_PUB.whatpub;
  if (settings.enableDeepResearch) cost += COSTS_PER_PUB.deepResearch;
  return cost;
}

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// MOCK PROCESSING FUNCTIONS
// (Replace with real implementations)
// ============================================

async function updateFromGooglePlaces(pub: any): Promise<{ isClosed: boolean; updated: boolean }> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock result - in production, this would call Google Places API
  return {
    isClosed: Math.random() < 0.02, // 2% chance of being closed
    updated: true
  };
}

async function analyzeWhatpub(pub: any): Promise<{ newUrl: boolean; manager: string | null; freehouseConfidence: number } | null> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Mock result - in production, this would scrape whatpub and use Claude
  return {
    newUrl: Math.random() < 0.1, // 10% chance of finding new URL
    manager: Math.random() < 0.3 ? 'John Smith' : null, // 30% chance of finding manager
    freehouseConfidence: Math.random() // Random confidence
  };
}

async function deepResearch(pub: any): Promise<{ ownerInfo: string | null }> {
  // Simulate expensive API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock result
  return {
    ownerInfo: Math.random() < 0.5 ? 'Some Owner Ltd' : null
  };
}

// ============================================
// CORE JOB FUNCTIONS
// ============================================

interface SinglePubResult {
  updated: boolean;
  newUrl: boolean;
  managerFound: boolean;
  isFreehouse: boolean;
  isClosed: boolean;
  cost: number;
}

async function processSinglePub(pub: any, settings: JobSettings): Promise<SinglePubResult> {
  let cost = 0;
  const result: SinglePubResult = {
    updated: false,
    newUrl: false,
    managerFound: false,
    isFreehouse: false,
    isClosed: false,
    cost: 0
  };

  // Google Places update
  if (settings.enableGoogle) {
    const googleData = await updateFromGooglePlaces(pub);
    cost += COSTS_PER_PUB.google;
    result.updated = googleData.updated;
    result.isClosed = googleData.isClosed;
  }

  // whatpub analysis with Claude
  if (settings.enableWhatpub) {
    const whatpubData = await analyzeWhatpub(pub);
    cost += COSTS_PER_PUB.whatpub;
    if (whatpubData?.newUrl) result.newUrl = true;
    if (whatpubData?.manager) result.managerFound = true;
    if (whatpubData && whatpubData.freehouseConfidence > 0.7) result.isFreehouse = true;
  }

  // Deep research (expensive!)
  if (settings.enableDeepResearch) {
    await deepResearch(pub);
    cost += COSTS_PER_PUB.deepResearch;
  }

  result.cost = cost;
  return result;
}

async function processDatabaseUpdate(jobState: JobState): Promise<void> {
  const db = getDrizzleDb();

  try {
    // Get pubs to verify - those not verified recently
    const pubsToProcess = await db
      .select()
      .from(pubsMaster)
      .where(
        sql`${pubsMaster.lastVerifiedAt} IS NULL OR ${pubsMaster.lastVerifiedAt} < NOW() - INTERVAL '90 days'`
      )
      .orderBy(asc(pubsMaster.lastVerifiedAt))
      .limit(jobState.settings.pubsPerNight);

    // Update total count based on actual results
    jobState.progress.totalPubs = Math.min(pubsToProcess.length, jobState.settings.pubsPerNight);

    if (pubsToProcess.length === 0) {
      console.log(`[Job ${jobState.id}] No pubs to process`);
      jobState.status = 'completed';
      jobState.timing.completedAt = new Date();
      return;
    }

    console.log(`[Job ${jobState.id}] Starting to process ${pubsToProcess.length} pubs`);

    for (const pub of pubsToProcess) {
      // Check cancellation flag BEFORE starting each pub
      if (jobState.shouldCancel) {
        jobState.status = 'cancelled';
        jobState.timing.completedAt = new Date();
        jobState.nextPubToProcess = pub.name || `Pub #${pub.id}`;
        console.log(`[Job ${jobState.id}] Cancelled at pub ${jobState.progress.currentPub}`);
        break;
      }

      // Update current pub info
      jobState.progress.currentPubName = pub.name || `Pub #${pub.id}`;
      jobState.progress.lastPubId = pub.id;

      try {
        // Process this pub
        const result = await processSinglePub(pub, jobState.settings);

        // Update results
        if (result.updated) jobState.results.updated++;
        if (result.newUrl) jobState.results.newUrls++;
        if (result.managerFound) jobState.results.managersFound++;
        if (result.isFreehouse) jobState.results.freehousesDetected++;
        if (result.isClosed) jobState.results.closedPubs++;

        // Update cost
        jobState.costs.incurred += result.cost;

        // Mark pub as verified
        await db
          .update(pubsMaster)
          .set({ lastVerifiedAt: new Date() })
          .where(sql`${pubsMaster.id} = ${pub.id}`);

        jobState.lastPubProcessed = pub.name || `Pub #${pub.id}`;

      } catch (error: any) {
        console.error(`[Job ${jobState.id}] Error processing pub ${pub.id}:`, error);
        jobState.results.errors++;
      }

      // Update progress
      jobState.progress.currentPub++;

      // Update estimated completion time
      const elapsed = Date.now() - jobState.timing.startedAt.getTime();
      const avgTimePerPub = elapsed / jobState.progress.currentPub;
      const remaining = (jobState.progress.totalPubs - jobState.progress.currentPub) * avgTimePerPub;
      jobState.timing.estimatedCompletion = new Date(Date.now() + remaining);
    }

    // Mark as completed if not cancelled
    if (jobState.status !== 'cancelled') {
      jobState.status = 'completed';
      jobState.timing.completedAt = new Date();
    }

  } catch (error: any) {
    console.error(`[Job ${jobState.id}] Job failed:`, error);
    jobState.status = 'failed';
    jobState.errorMessage = error.message;
    jobState.timing.completedAt = new Date();
  }

  // Keep job in memory for 1 hour for status retrieval
  setTimeout(() => {
    activeJobs.delete(jobState.id);
    console.log(`[Job ${jobState.id}] Cleaned up from memory`);
  }, 3600000); // 1 hour
}

// ============================================
// PUBLIC API
// ============================================

export async function startDatabaseUpdateJob(
  workspaceId: number,
  settings: JobSettings
): Promise<string> {
  const jobId = generateJobId();

  // Calculate estimated costs
  const costPerPub = calculateCostPerPub(settings);
  const totalCost = costPerPub * settings.pubsPerNight;
  const estimatedMs = settings.pubsPerNight * AVG_TIME_PER_PUB;

  // Initialize job state
  const jobState: JobState = {
    id: jobId,
    workspaceId,
    status: 'running',
    settings,
    progress: {
      currentPub: 0,
      totalPubs: settings.pubsPerNight,
      currentPubName: 'Initializing...',
      lastPubId: null
    },
    results: {
      updated: 0,
      newUrls: 0,
      managersFound: 0,
      freehousesDetected: 0,
      errors: 0,
      closedPubs: 0
    },
    costs: {
      incurred: 0,
      estimated: totalCost
    },
    timing: {
      startedAt: new Date(),
      completedAt: null,
      estimatedCompletion: new Date(Date.now() + estimatedMs)
    },
    shouldCancel: false,
    lastPubProcessed: null,
    nextPubToProcess: null,
    errorMessage: null
  };

  activeJobs.set(jobId, jobState);

  console.log(`[Job ${jobId}] Started - Processing ${settings.pubsPerNight} pubs, estimated cost £${totalCost.toFixed(2)}`);

  // Start processing asynchronously
  processDatabaseUpdate(jobState).catch(error => {
    console.error(`[Job ${jobId}] Unhandled error:`, error);
    jobState.status = 'failed';
    jobState.errorMessage = error.message;
  });

  return jobId;
}

export function getJobStatus(jobId: string): JobState | null {
  return activeJobs.get(jobId) || null;
}

export function getAllActiveJobs(): JobState[] {
  return Array.from(activeJobs.values()).filter(job => job.status === 'running');
}

export function cancelJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job || job.status !== 'running') {
    return false;
  }

  // Set cancellation flag (graceful shutdown)
  job.shouldCancel = true;
  console.log(`[Job ${jobId}] Cancellation requested`);
  return true;
}

export function getEstimatedCosts(settings: JobSettings): {
  perPub: number;
  total: number;
  breakdown: { source: string; cost: number }[];
} {
  const breakdown: { source: string; cost: number }[] = [];
  
  if (settings.enableGoogle) {
    breakdown.push({ source: 'Google Places', cost: settings.pubsPerNight * COSTS_PER_PUB.google });
  }
  if (settings.enableWhatpub) {
    breakdown.push({ source: 'whatpub Analysis', cost: settings.pubsPerNight * COSTS_PER_PUB.whatpub });
  }
  if (settings.enableDeepResearch) {
    breakdown.push({ source: 'Deep Research', cost: settings.pubsPerNight * COSTS_PER_PUB.deepResearch });
  }

  const total = breakdown.reduce((sum, item) => sum + item.cost, 0);
  const perPub = calculateCostPerPub(settings);

  return { perPub, total, breakdown };
}

export function getEstimatedDuration(pubCount: number): {
  ms: number;
  minutes: number;
  formatted: string;
} {
  const ms = pubCount * AVG_TIME_PER_PUB;
  const minutes = Math.ceil(ms / 60000);
  
  let formatted: string;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    formatted = `${hours}h ${mins}m`;
  } else {
    formatted = `${minutes} minutes`;
  }

  return { ms, minutes, formatted };
}

