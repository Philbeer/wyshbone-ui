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
import { guardRoute } from '../lib/assertNoExecutionInUI.js';

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
toolsExecuteRouter.post('/api/tools/execute', express.json(), guardRoute('tools_execute'));

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
