# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered assistant designed to enhance business research, facilitate contact finding, and streamline business discovery using the Wyshbone Global Database. It intelligently offers these capabilities when user intent is ambiguous, aiming to provide comprehensive analysis, lead generation, and business discovery. The project aims to deliver a robust platform for sales and lead generation, capable of serving a broad market with its dual-mode AI architecture and integrated workflows.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.

**CRITICAL DATABASE RULE:** ALL database connections MUST use `SUPABASE_DATABASE_URL` directly. NO fallback patterns—Replit's runtime auto-provides `DATABASE_URL` for its built-in Postgres, which conflicts with Supabase. Using `SUPABASE_DATABASE_URL` exclusively avoids this runtime conflict. The app crashes on startup if `SUPABASE_DATABASE_URL` is not set or empty.

## System Architecture
The application features a Node.js/Express backend and a React frontend, built with TypeScript, Tailwind CSS, and shadcn/ui. TanStack Query manages API state. Core AI interactions utilize OpenAI's GPT models. The system supports multi-tenant user isolation with session-based authentication and robust data security.

**Dual-Mode AI Architecture:**
- **Standard Mode:** Streaming GPT-5 chat with tool calling for fast, interactive responses.
- **MEGA Mode:** GPT-4o planner-executor pattern for complex multi-step tasks with intelligent delegation.
- **Shared Infrastructure:** Both modes use a unified execution layer and PostgreSQL for conversation history.
- **Bidirectional Flow:** MEGA can delegate streaming tasks back to Standard mode, with automatic mode reversion.

**UI/UX Decisions:**
The user interface adheres to Material Design principles, featuring a dark mode, Inter font, consistent spacing, real-time chat, auto-expanding input, theme toggle, and a collapsible sidebar with a default UK country selector. Accessibility (WCAG AA) is a key consideration.

**Technical Implementations & Features:**
- **AI Chat Interface:** Provides real-time conversations with an AI assistant, enforcing a concise, practical, and UK-focused personality via the system prompt.
- **Agentic V1 Workflow:** Goal-driven initialization where users define sales/lead goals, trigger plan generation, approve plans, and monitor execution progress.
- **Unified Action Layer:** Four core functions execute identically across AI modes: DEEP_RESEARCH (multi-source web research), SEARCH_PLACES (Google Places API for business discovery), CREATE_SCHEDULED_MONITOR (agentic recurring task scheduler), and BATCH_CONTACT_FINDER (cost-optimized contact discovery).
- **Tool Integration:** Includes Wyshbone Global Database (Google Places API), OpenAI GPT-5 for prospect enrichment and verifiable public contact discovery, and Bubble Workflow Integration for batch backend workflows with multi-country support.
- **Job Management & Worldwide Location Coverage:** A background job system for global searches, intelligent location resolution, and natural language job creation.
- **Streaming Responses:** Uses Server-Sent Events (SSE) for real-time AI responses.
- **Conversational Planning:** A GPT-based planner decides whether to search, use cache, or respond to prevent redundant searches.
- **Deep Research Context Extraction:** A server-side prompt enhancement layer extracts and validates topics from conversation history for vague follow-up phrases.
- **Auto-Summarize Research Reports:** Automatically summarizes previously viewed deep research reports using GPT-4o.
- **Persistent Memory System:** A database-backed system for conversation history and knowledge accumulation, extracting and scoring facts for importance and recency.
- **Scheduled Monitors:** An agentic monitoring system for recurring tasks with flexible scheduling, email notifications, and intelligent analysis. Features a "Smart Summary Mode" for concise, actionable chat reports.
- **Xero OAuth Integration:** Direct OAuth 2.0 integration for connecting Xero accounting accounts securely. Features server-side state binding using the `oauth_states` database table to prevent cross-user token binding attacks. States expire after 10 minutes and are atomically consumed to prevent replay attacks. See docs/xero-oauth-session-binding.md for details.
- **Batch Contact Discovery Pipeline:** Cost-optimized contact finding using Google Places API, Hunter.io (domain/email discovery/verification), and SalesHandy (prospect campaign management).
- **Stripe Subscription System:** Implements a freemium model with various paid tiers, managing user subscriptions and usage limits.
- **Agent Flight Recorder (AFR) & Live Activity Panel:** A user-facing "Live Activity" system showing real-time decision paths and execution progress. The system tracks requests via correlation IDs (client_request_id), provides idempotent run creation, logs router decisions transparently, and displays a unified timeline of all events grouped by request. Features: router decision logging for all 4 routing paths (supervisor_plan, tool_call, deep_research, direct_response), GET /api/afr/stream endpoint aggregating events from agent_activities and deep_research_runs, LiveActivityPanel component with real-time timeline, expandable event details, auto-scroll, and "jump to latest" button, adaptive polling (1.5s when active, 10s when idle), and status-aware pulse animations. Uses CurrentRequestContext to propagate activeClientRequestId from chat input to LiveActivityPanel before server events exist, with idsMatch logic preventing premature terminal status display, 2-second overlay on new prompts, 800ms terminal stability check, and thinking indicators during execution gaps.
- **Run Lifecycle Management (AFR Enhancement):** First-class `agent_runs` database table provides authoritative status tracking with state machine validation. Lifecycle statuses: starting → planning → executing → finalizing → completed/failed/stopped. Terminal state is ONLY determined from agent_runs.terminal_state (never inferred from events). UI display gated by `ui_ready` flag - panel shows "Working" until backend confirms router decision. State transitions validated with ALLOWED_TRANSITIONS graph to prevent invalid/terminal regressions. DB CHECK constraints enforce allowed status/terminal_state values. Run manager (server/lib/run-manager.ts) handles create/transition/complete/fail lifecycle. Migration: migrations/0003_create_agent_runs.sql.
- **Run User Attribution (Security Fix):** Deep research runs are now created with strict userId enforcement. Chat endpoint calls `startBackgroundResponsesJob` directly (no internal HTTP fetch) passing authenticated user.id explicitly. In production, unauthenticated requests are rejected with 401. Body.userId is only accepted in demo mode for testing.
- **Tower Analytics Integration:** Comprehensive logging system for tracking all chat interactions for monitoring and analytics, utilizing a unified runId system for conversation-level insights.
- **Hacker News Discovery:** A feature for finding relevant Hacker News discussions based on keywords, offering AI-powered draft reply generation and relevance scoring based on Wyshbone's fit.
- **Delivery Management System:** Mobile-first Driver UI with role-based access control supporting three user roles (admin, sales, driver). Drivers access delivery routes at /driver/today with stop details.
- **Multi-Tenant Organisation System:** Production-grade organisation-based roles system with invite flow. Each user belongs to an organisation with membership roles (admin/sales/driver). Features include: org creation for first-time users, email-based invites with secure tokens, role management by admins, and server-side org isolation. Access via Settings → Team. See docs/org-and-roles.md for full documentation.
- **User Role System:** Formal role-based access control now uses org membership roles. Admins have full access including team management. Drivers access delivery UI only. Sales users access CRM features. Legacy user.role field kept for backwards compatibility.

## Database Configuration
- **Primary & Only Database:** Supabase PostgreSQL accessed exclusively via `SUPABASE_DATABASE_URL`
- **NO Fallback:** Replit's built-in Postgres is NOT used—`DATABASE_URL` is managed by Replit's runtime and conflicts
- **Startup Validation:** Server crashes with clear error if `SUPABASE_DATABASE_URL` is missing or empty
- **Startup Logging:** Logs database host (masked) on startup to verify Supabase connection (e.g., "Host: aws-1-eu-west-2.pooler.supabase.com")
- **Supabase Pooler:** Uses `prepare: false` in postgres connection config to disable prepared statements for pgbouncer compatibility
- **Startup Migrations:** `runStartupMigrations()` in `server/storage.ts` handles schema drift by adding missing columns using PostgreSQL's `IF NOT EXISTS` syntax
- **Drizzle Config:** Uses `SUPABASE_DATABASE_URL` exclusively for schema operations
- **Schema Types:** All org-related tables use TEXT ids (UUIDs) and BIGINT timestamps - `organisations`, `org_members`, `org_invites` tables and `users.current_org_id` column must all be TEXT type

## External Dependencies
- **OpenAI GPT-5:** For AI chat responses, prospect enrichment, web search, and AI-generated personal lines.
- **Wyshbone Global Database (Google Places API):** For business discovery and location-based searches.
- **GeoNames API:** For worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows.
- **Resend API:** For sending transactional email notifications.
- **Xero:** Accounting platform integration via OAuth 2.0.
- **Hunter.io:** For domain discovery, email finding, and email verification in batch processing.
- **SalesHandy:** For automated prospect management and campaign integration.

## Thin Client Architecture (Session 2)

The UI is designed as a thin client that delegates long-running jobs to the Supervisor service. Background workers, cron jobs, and long-running execution are disabled by default.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERVISOR_BASE_URL` | (none) | Base URL for the Supervisor service (e.g., `https://supervisor.example.com`). Required for job delegation. |
| `ENABLE_UI_BACKGROUND_WORKERS` | `false` | Set to `true` to enable local fallback execution of background workers. Should only be used for development or when Supervisor is unavailable. |

### Job Delegation Flow

1. When a job is triggered via UI API routes, the UI calls `SUPERVISOR_BASE_URL/api/supervisor/jobs/start`
2. If Supervisor responds with a `jobId`, the UI logs an AFR event `delegated_to_supervisor` and returns success
3. If Supervisor is unavailable and `ENABLE_UI_BACKGROUND_WORKERS=true`, the UI falls back to local execution with a visible `fallback_ui_execution_started` AFR event
4. If Supervisor is unavailable and fallback is disabled, the UI returns a 503 error

### Background Workers (Disabled by Default)

These workers are guarded behind `ENABLE_UI_BACKGROUND_WORKERS`:
- **Monitor Worker** (`server/monitor-worker.ts`): Polls scheduled monitors
- **Xero Sync Cron** (`server/cron/xero-sync.ts`): Syncs Xero data periodically
- **Nightly Maintenance** (`server/cron/nightly-maintenance.ts`): Database maintenance tasks
- **Job Worker** (`server/jobWorker.ts`): Processes region search jobs

### Supervisor Client

Located at `server/lib/supervisorClient.ts`, provides:
- `startJob(jobType, payload, options)`: Delegate a job to Supervisor
- `getJob(jobId)`: Get job status from Supervisor
- `cancelJob(jobId)`: Cancel a running job
- `isSupervisorConfigured()`: Check if SUPERVISOR_BASE_URL is set
- `isLocalFallbackEnabled()`: Check if ENABLE_UI_BACKGROUND_WORKERS is true

### AFR Events for Job Delegation

| Event | Description |
|-------|-------------|
| `job_queued` | Job is being queued for execution (logged for both Supervisor and local fallback) |
| `delegated_to_supervisor` | Job successfully delegated to Supervisor |
| `supervisor_call_failed` | Supervisor call failed |
| `fallback_ui_execution_started` | UI executing job locally (fallback) |
| `fallback_ui_execution_completed` | Local fallback execution completed successfully |
| `fallback_ui_execution_failed` | Local fallback execution failed with error |
| `fallback_ui_execution_paused` | Local fallback execution paused/stopped (user stopped or job cancelled) |

### AFR Lifecycle for Local Fallback

Complete lifecycle for local fallback jobs:
1. `job_queued` - Logged when startJobWorker is called
2. `fallback_ui_execution_started` - Logged immediately after job_queued
3. One of:
   - `fallback_ui_execution_completed` - Job finished successfully
   - `fallback_ui_execution_failed` - Job encountered an error
   - `fallback_ui_execution_paused` - Job was paused/stopped/cancelled

### Manual Test Checklist

1. **Start app with defaults** - Verify no background workers start (check logs for "Background workers DISABLED")
2. **Trigger a job** - Should attempt Supervisor delegation (will fail if not configured, returns 503)
3. **Set `ENABLE_UI_BACKGROUND_WORKERS=true`** - Workers should start, jobs should run locally with fallback warning
4. **Check Live Activity Panel** - Should show delegation events (`job_queued`, `delegated_to_supervisor` or `fallback_*`)
5. **Verify AFR logging** - Check `agent_activities` table for job delegation events