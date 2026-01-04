/**
 * Unified Tool Execution Endpoint
 *
 * Single source of truth for all tool execution.
 * Both UI and Supervisor call this endpoint to execute tools.
 *
 * Supported Tools:
 * - search_google_places: Search for businesses using Google Places API
 * - deep_research: Start background research job
 * - batch_contact_finder: Find and enrich contacts for businesses
 * - draft_email: Generate draft email content
 * - create_scheduled_monitor: Create scheduled monitoring job
 * - get_nudges: Get AI-generated follow-up suggestions
 */

import express, { type Request, type Response } from 'express';
import { executeAction, type ActionResult } from '../lib/actions';
import type { IStorage } from '../storage';
import { logRunToTower, isTowerLoggingEnabled, type TowerRunLog } from '../lib/towerClient';

export const toolsExecuteRouter = express.Router();

/**
 * Tool execution request schema
 */
interface ToolExecuteRequest {
  /** Tool name (e.g., "search_google_places", "deep_research") */
  tool: string;
  /** Tool parameters (varies by tool) */
  params?: Record<string, any>;
  /** User ID (required for most tools) */
  userId?: string;
  /** Session ID for request context */
  sessionId?: string;
  /** Conversation ID for chat context */
  conversationId?: string;
}

/**
 * POST /api/tools/execute
 *
 * Execute a tool with given parameters.
 * Returns standardized ActionResult with ok/data/error fields.
 *
 * @example
 * ```json
 * POST /api/tools/execute
 * {
 *   "tool": "search_google_places",
 *   "params": {
 *     "query": "craft breweries",
 *     "location": "Leeds",
 *     "maxResults": 20
 *   },
 *   "userId": "user123",
 *   "sessionId": "session456"
 * }
 * ```
 */
toolsExecuteRouter.post('/api/tools/execute', express.json(), async (req: Request, res: Response) => {
  const startTime = Date.now();
  let runId: string | undefined;

  try {
    const { tool, params = {}, userId, sessionId, conversationId } = req.body as ToolExecuteRequest;

    // Validate required fields
    if (!tool) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required field: tool'
      });
    }

    // Generate runId for tracking
    runId = `tool_${tool}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Get storage and user info from request
    const storage = (req as any).storage as IStorage | undefined;
    const user = (req as any).user;
    const userEmail = user?.email || 'unknown@wyshbone.ai';

    console.log(`🔧 Tool execution request: ${tool} (${runId})`, {
      userId,
      sessionId,
      params: Object.keys(params).length > 0 ? Object.keys(params) : '(no params)'
    });

    // Execute the tool via unified action executor
    const result: ActionResult = await executeAction({
      action: tool,
      params,
      userId,
      sessionId,
      conversationId,
      storage
    });

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Log result
    if (result.ok) {
      console.log(`✅ Tool execution succeeded: ${tool} (${durationMs}ms)`);
    } else {
      console.log(`❌ Tool execution failed: ${tool} - ${result.error} (${durationMs}ms)`);
    }

    // Log to Tower for analytics (non-blocking)
    if (userId && isTowerLoggingEnabled()) {
      const towerLog: TowerRunLog = {
        runId,
        conversationId: conversationId || sessionId || 'standalone',
        userId,
        userEmail,
        status: result.ok ? 'success' : 'error',
        source: 'live_user',
        request: {
          inputText: `Tool: ${tool} with params: ${JSON.stringify(params)}`
        },
        response: result.ok ? {
          outputText: result.note || JSON.stringify(result.data)
        } : undefined,
        toolCalls: [{
          name: tool,
          args: params,
          result: result.ok ? result.data : undefined,
          error: result.ok ? undefined : result.error
        }],
        error: result.ok ? undefined : result.error,
        startedAt: startTime,
        completedAt: endTime,
        durationMs,
        mode: 'standard'
      };

      logRunToTower(towerLog).catch(err => {
        console.warn(`⚠️ Tower logging failed for ${runId}:`, err.message);
      });
    }

    // Return result
    // Always return 200 even if tool fails - the ok field indicates success/failure
    return res.status(200).json(result);

  } catch (error: any) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    console.error('❌ Tool execution error:', error);

    // Log error to Tower (non-blocking)
    if (runId && req.body.userId && isTowerLoggingEnabled()) {
      const user = (req as any).user;
      const userEmail = user?.email || 'unknown@wyshbone.ai';

      const towerLog: TowerRunLog = {
        runId,
        conversationId: req.body.conversationId || req.body.sessionId || 'standalone',
        userId: req.body.userId,
        userEmail,
        status: 'error',
        source: 'live_user',
        request: {
          inputText: `Tool: ${req.body.tool} with params: ${JSON.stringify(req.body.params || {})}`
        },
        error: error.message || 'Internal server error',
        startedAt: startTime,
        completedAt: endTime,
        durationMs,
        mode: 'standard'
      };

      logRunToTower(towerLog).catch(err => {
        console.warn(`⚠️ Tower logging failed for ${runId}:`, err.message);
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error during tool execution'
    });
  }
});

/**
 * GET /api/tools/list
 *
 * List all available tools with their descriptions.
 * Useful for Supervisor to discover available tools.
 */
toolsExecuteRouter.get('/api/tools/list', (req: Request, res: Response) => {
  const tools = [
    {
      name: 'search_google_places',
      aliases: ['SEARCH_PLACES', 'search_wyshbone_database'],
      description: 'Search for businesses using Google Places API',
      params: {
        query: 'Search query (e.g., "craft breweries")',
        location: 'Location to search (e.g., "Leeds, UK")',
        maxResults: 'Maximum results to return (default: 30)',
        country: 'Country code for region (default: "GB")'
      },
      requiresAuth: false
    },
    {
      name: 'deep_research',
      aliases: ['DEEP_RESEARCH'],
      description: 'Start background research job with AI analysis',
      params: {
        prompt: 'Research topic or prompt',
        label: 'Label for the research run (optional)',
        mode: 'Research mode: "report" or other (default: "report")',
        counties: 'Counties to focus research on (optional)',
        windowMonths: 'Time window in months (optional)'
      },
      requiresAuth: true
    },
    {
      name: 'batch_contact_finder',
      aliases: ['BATCH_CONTACT_FINDER'],
      description: 'Find and enrich contacts for businesses, send to SalesHandy',
      params: {
        query: 'Business type query (e.g., "pubs")',
        location: 'Location to search (e.g., "Manchester")',
        country: 'Country code (default: "GB")',
        targetRole: 'Target contact role (default: "General Manager")',
        limit: 'Max businesses to process (default: 30)'
      },
      requiresAuth: true
    },
    {
      name: 'draft_email',
      aliases: ['DRAFT_EMAIL'],
      description: 'Generate draft email content for outreach',
      params: {
        to_role: 'Recipient role (default: "General Manager")',
        purpose: 'Email purpose (default: "intro")',
        product: 'Product/service to mention (default: "your product")'
      },
      requiresAuth: false
    },
    {
      name: 'create_scheduled_monitor',
      aliases: ['CREATE_SCHEDULED_MONITOR'],
      description: 'Create scheduled monitoring job that runs periodically',
      params: {
        label: 'Monitor label (required)',
        description: 'Monitor description (optional)',
        schedule: 'Schedule frequency: "hourly", "daily", "weekly", "biweekly", "monthly" (default: "weekly")',
        scheduleDay: 'Day of week for weekly/biweekly (0-6, 0=Sunday)',
        scheduleTime: 'Time to run in HH:MM format (default: "09:00")',
        monitorType: 'Type of monitor (default: "deep_research")',
        config: 'Monitor configuration object (optional)',
        emailAddress: 'Email for notifications (optional)'
      },
      requiresAuth: true
    },
    {
      name: 'get_nudges',
      aliases: ['GET_NUDGES'],
      description: 'Get AI-generated suggestions and nudges for follow-ups',
      params: {
        limit: 'Maximum nudges to return (default: 10)'
      },
      requiresAuth: true
    }
  ];

  res.json({
    ok: true,
    tools,
    count: tools.length
  });
});
