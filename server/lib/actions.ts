/**
 * Shared action execution module
 * Both Standard and MEGA modes use this to ensure identical business logic
 */

import { searchPlaces } from "../googlePlaces";
import { startBackgroundResponsesJob } from "../deepResearch";
import { executeBatchJob } from "../batchService";
import type { IStorage } from "../storage";

export type ActionResult = {
  ok: boolean;
  data?: any;
  note?: string;
  error?: string;
};

/**
 * Execute an action with consistent business logic
 * Used by both Standard streaming mode and MEGA structured mode
 */
export async function executeAction(params: {
  action: string;
  params: any;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  storage?: IStorage;
}): Promise<ActionResult> {
  const { action, params: actionParams, userId, sessionId, storage } = params;

  try {
    switch (action) {
      case "SEARCH_PLACES":
      case "search_wyshbone_database": {
        const { query, locationText, location, maxResults = 30, country = "GB" } = actionParams || {};
        
        if (!query) {
          return { ok: false, error: "Missing query parameter" };
        }

        console.log(`🔍 Executing Wyshbone search: "${query}" in ${locationText || location || "unspecified"}`);

        const results = await searchPlaces({
          query,
          locationText: locationText || location,
          maxResults,
          region: country
        });

        console.log(`✅ Found ${results.length} places`);

        // Frontend expects "places" array
        return {
          ok: true,
          data: {
            places: results,
            count: results.length,
            query,
            location: locationText || location,
            country
          },
          note: `Found ${results.length} businesses`
        };
      }

      case "DEEP_RESEARCH":
      case "deep_research": {
        const { prompt, topic, label, counties, windowMonths, mode = "report" } = actionParams || {};
        const researchTopic = prompt || topic;

        if (!researchTopic) {
          return { ok: false, error: "Missing research topic" };
        }

        if (!userId) {
          return { ok: false, error: "User authentication required for deep research" };
        }

        console.log(`🔬 Starting deep research: "${researchTopic}"`);

        const run = await startBackgroundResponsesJob({
          prompt: researchTopic,
          label: label || researchTopic,
          mode,
          counties,
          windowMonths
        }, undefined, userId);

        console.log(`✅ Deep research started: ${run.id}`);

        // Frontend expects "run" object with id property
        return {
          ok: true,
          data: {
            run: {
              id: run.id,
              label: run.label || researchTopic,
              status: "running"
            },
            topic: researchTopic
          },
          note: `Research started: ${run.id}`
        };
      }

      case "BATCH_CONTACT_FINDER":
      case "batch_contact_finder": {
        const { query, location, country = "GB", targetRole = "General Manager", limit = 30 } = actionParams || {};

        if (!query || !location) {
          return { ok: false, error: "Missing query or location parameter" };
        }

        if (!userId) {
          return { ok: false, error: "User authentication required for batch contact finder" };
        }

        console.log(`📧 Starting batch contact finder: "${query}" in ${location}`);

        // Get API keys
        const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
        const hunterApiKey = process.env.HUNTER_API_KEY;
        const salesHandyToken = process.env.SALES_HANDY_API_TOKEN;
        const salesHandyCampaignId = process.env.SALES_HANDY_CAMPAIGN_ID;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (!googleApiKey || !hunterApiKey || !salesHandyToken || !salesHandyCampaignId) {
          return {
            ok: false,
            error: "Batch contact finder requires API keys (Google Places, Hunter.io, SalesHandy)"
          };
        }

        const result = await executeBatchJob({
          query,
          location,
          country,
          targetRole,
          limit,
          personalize: true,
          googleApiKey,
          hunterApiKey,
          salesHandyToken,
          salesHandyCampaignId,
          openaiKey
        });

        console.log(`✅ Batch job completed: ${result.created.length} contacts added`);

        // Frontend expects "job" object with id property
        return {
          ok: true,
          data: {
            job: {
              id: `batch_${Date.now()}`,
              query,
              location,
              targetRole,
              status: "completed"
            },
            totalFound: result.items.length,
            created: result.created.length,
            skipped: result.skipped.length
          },
          note: `Batch complete: ${result.created.length} contacts added to SalesHandy`
        };
      }

      case "DRAFT_EMAIL":
      case "draft_email": {
        const { to_role = "General Manager", purpose = "intro", product = "your product" } = actionParams || {};
        
        const body = `Subject: Quick ${product} intro — potential fit?

Hi ${to_role},

I'll keep it brief — we help teams like yours with ${product}.
If useful, I can share a 60-second summary or a short sample list.

Would you be open to a quick look?

Best,
Wyshbone`;

        return {
          ok: true,
          data: { draft: body },
          note: "Email draft created"
        };
      }

      case "CREATE_SCHEDULED_MONITOR":
      case "create_scheduled_monitor": {
        if (!storage) {
          return { ok: false, error: "Storage not available for scheduled monitoring" };
        }

        if (!userId) {
          return { ok: false, error: "User authentication required for scheduled monitoring" };
        }

        const { 
          label, 
          description, 
          schedule = "weekly", 
          scheduleDay, 
          scheduleTime = "09:00", 
          monitorType = "deep_research",
          config,
          emailAddress
        } = actionParams || {};

        if (!label) {
          return { ok: false, error: "Missing label parameter" };
        }

        console.log(`⏰ Creating scheduled monitor: "${label}" (${schedule})`);

        // Calculate next run time
        const now = new Date();
        const nextRunAt = new Date(now);
        
        if (schedule === "hourly") {
          nextRunAt.setHours(nextRunAt.getHours() + 1);
        } else if (schedule === "daily") {
          const [hours, minutes] = scheduleTime.split(":").map(Number);
          nextRunAt.setHours(hours, minutes, 0, 0);
          if (nextRunAt <= now) {
            nextRunAt.setDate(nextRunAt.getDate() + 1);
          }
        } else if (schedule === "weekly") {
          const [hours, minutes] = scheduleTime.split(":").map(Number);
          nextRunAt.setHours(hours, minutes, 0, 0);
          const targetDay = scheduleDay || 1; // Default to Monday
          const currentDay = nextRunAt.getDay();
          const daysUntilTarget = (targetDay - currentDay + 7) % 7;
          nextRunAt.setDate(nextRunAt.getDate() + (daysUntilTarget || 7));
        } else if (schedule === "biweekly") {
          const [hours, minutes] = scheduleTime.split(":").map(Number);
          nextRunAt.setHours(hours, minutes, 0, 0);
          const targetDay = scheduleDay || 1;
          const currentDay = nextRunAt.getDay();
          const daysUntilTarget = (targetDay - currentDay + 7) % 7;
          nextRunAt.setDate(nextRunAt.getDate() + (daysUntilTarget || 14));
        } else if (schedule === "monthly") {
          const [hours, minutes] = scheduleTime.split(":").map(Number);
          nextRunAt.setHours(hours, minutes, 0, 0);
          nextRunAt.setMonth(nextRunAt.getMonth() + 1);
        }

        const monitor = await storage.createScheduledMonitor({
          userId,
          label,
          description: description || label,
          schedule,
          scheduleDay: scheduleDay || null,
          scheduleTime,
          monitorType,
          config: config || {},
          emailAddress: emailAddress || null,
          emailNotifications: emailAddress ? 1 : 0,
          isActive: 1,
          status: "active",
          nextRunAt: nextRunAt.getTime()
        });

        console.log(`✅ Scheduled monitor created: ${monitor.id}`);

        return {
          ok: true,
          data: {
            monitor: {
              id: monitor.id,
              label: monitor.label,
              schedule: monitor.schedule,
              nextRunAt: monitor.nextRunAt
            }
          },
          note: `Monitor created: runs ${schedule} starting ${nextRunAt.toLocaleDateString()}`
        };
      }

      default:
        return {
          ok: false,
          error: `Unknown action: ${action}`
        };
    }
  } catch (error: any) {
    console.error(`❌ Action execution error (${action}):`, error);
    return {
      ok: false,
      error: error.message || "Action execution failed"
    };
  }
}
