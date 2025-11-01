import { storage } from './storage';
import { getRegions } from './regions';

const BASE = process.env.BUBBLE_BASE_URL || "";
const WORKFLOW_SLUG = "run_search_for_region";

type RunningJob = {
  jobId: string;
  shouldStop: boolean;
};

const runningJobs = new Map<string, RunningJob>();

async function callBubbleForRegion(params: {
  business_type: string;
  country: string;
  region_id: string;
  region_name: string;
  region_code: string;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!BASE) {
    throw new Error("BUBBLE_BASE_URL is not configured");
  }

  const url = `${BASE}/api/1.1/wf/${WORKFLOW_SLUG}`;
  
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_type: params.business_type,
        country: params.country,
        region_id: params.region_id,
        region_code: params.region_code, // ISO country code for Wyshbone Global Database
      })
    });

    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log(`${resp.ok ? '✅' : '❌'} Bubble response for ${params.region_name} (${resp.status}):`, 
      JSON.stringify(data).substring(0, 150));

    return { ok: resp.ok, status: resp.status };
  } catch (error: any) {
    console.error(`❌ Error calling Bubble for ${params.region_name}:`, error.message);
    return { ok: false, status: 500, error: error.message };
  }
}

export async function runJob(jobId: string): Promise<void> {
  const job = await storage.getJob(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }

  console.log(`🚀 Starting job ${jobId}: ${job.business_type} across ${job.region_ids.length} regions`);

  // Get region details
  const regionsResult = await getRegions(job.country, job.granularity);
  const regions = regionsResult.regions;

  const regionMap = new Map(regions.map(r => [r.id, r]));
  const runningInfo = runningJobs.get(jobId);

  // Process regions starting from cursor
  for (let i = job.cursor; i < job.region_ids.length; i++) {
    // Check if job should stop
    const currentJob = await storage.getJob(jobId);
    if (!currentJob || currentJob.status === "paused" || currentJob.status === "cancelled") {
      console.log(`⏸️ Job ${jobId} paused/cancelled at region ${i}/${job.region_ids.length}`);
      return;
    }

    if (runningInfo?.shouldStop) {
      console.log(`⏸️ Job ${jobId} stopped by user at region ${i}/${job.region_ids.length}`);
      await storage.updateJob(jobId, { status: "paused", cursor: i });
      return;
    }

    const regionId = job.region_ids[i];
    const region = regionMap.get(regionId);
    
    if (!region) {
      console.warn(`⚠️ Region ${regionId} not found in region map`);
      continue;
    }

    console.log(`🔄 Processing region ${i + 1}/${job.region_ids.length}: ${region.name}`);

    // Call Bubble workflow
    const result = await callBubbleForRegion({
      business_type: job.business_type,
      country: job.country,
      region_id: regionId,
      region_name: region.name,
      region_code: region.country_code, // ISO country code for Wyshbone Global Database
    });

    // Update job progress
    if (result.ok) {
      await storage.updateJob(jobId, {
        cursor: i + 1,
        processed: [...job.processed, regionId],
      });
      job.processed.push(regionId);
    } else {
      await storage.updateJob(jobId, {
        cursor: i + 1,
        failed: [
          ...(job.failed || []),
          {
            region_id: regionId,
            region_name: region.name,
            error: result.error || `HTTP ${result.status}`,
          }
        ],
      });
      job.failed = job.failed || [];
      job.failed.push({
        region_id: regionId,
        region_name: region.name,
        error: result.error || `HTTP ${result.status}`,
      });
    }

    job.cursor = i + 1;

    // Small delay between requests (500ms)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Job complete
  await storage.updateJob(jobId, { status: "done" });
  runningJobs.delete(jobId);
  
  console.log(`✅ Job ${jobId} completed: ${job.processed.length} successful, ${job.failed?.length || 0} failed`);
}

export function startJobWorker(jobId: string): void {
  if (runningJobs.has(jobId)) {
    console.log(`Job ${jobId} is already running`);
    return;
  }

  runningJobs.set(jobId, { jobId, shouldStop: false });
  
  // Run in background
  runJob(jobId).catch(error => {
    console.error(`Error running job ${jobId}:`, error);
    runningJobs.delete(jobId);
  });
}

export function stopJobWorker(jobId: string): void {
  const job = runningJobs.get(jobId);
  if (job) {
    job.shouldStop = true;
    console.log(`Signaling job ${jobId} to stop`);
  }
}
