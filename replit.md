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
- **AI Chat Interface:** Real-time conversations with an AI assistant, enforcing a concise, practical, and UK-focused personality.
- **Agentic V1 Workflow:** Goal-driven initialization for sales/lead goals, plan generation, approval, and execution monitoring.
- **Unified Action Layer:** Four core functions (DEEP_RESEARCH, SEARCH_PLACES, CREATE_SCHEDULED_MONITOR, BATCH_CONTACT_FINDER) execute identically across AI modes.
- **Job Management & Worldwide Location Coverage:** Background job system for global searches, intelligent location resolution, and natural language job creation.
- **Streaming Responses:** Uses Server-Sent Events (SSE) for real-time AI responses.
- **Conversational Planning:** GPT-based planner decides whether to search, use cache, or respond.
- **Deep Research Context Extraction & Auto-Summarize:** Server-side prompt enhancement extracts and validates topics, and GPT-4o automatically summarizes research reports.
- **Persistent Memory System:** Database-backed conversation history and knowledge accumulation.
- **Scheduled Monitors:** Agentic monitoring system for recurring tasks with flexible scheduling, email notifications, and "Smart Summary Mode."
- **Xero OAuth Integration:** Direct OAuth 2.0 integration for secure Xero accounting connections with server-side state binding.
- **Batch Contact Discovery Pipeline:** Cost-optimized contact finding using multiple external services.
- **Stripe Subscription System:** Freemium model with paid tiers, managing user subscriptions and usage limits.
- **Agent Flight Recorder (AFR) & Live Activity Panel:** User-facing system showing real-time decision paths and execution progress via correlation IDs, idempotent run creation, transparent router decision logging, and a unified timeline of events. Includes run lifecycle management with `agent_runs` database table for authoritative status tracking and user attribution for security. The "View results" button on completed runs opens a ResultsModal that fetches artefacts from the `artefacts` table (keyed by `run_id`). Supports tabbed display of multiple artefact types: `leads_list` (table view), `email_drafts` (card view with subject/to/body), and `plan_result` (step summaries). Artefacts are persisted by `persistArtefacts()` in `server/leadgen-executor.ts` on plan completion.
- **Tower Analytics Integration:** Comprehensive logging for all chat interactions using a unified runId system.
- **Hacker News Discovery:** Feature for finding relevant Hacker News discussions, offering AI-powered draft reply generation and relevance scoring.
- **Delivery Management System:** Mobile-first Driver UI with role-based access control.
- **Multi-Tenant Organisation System:** Production-grade organisation-based roles system with invite flow and server-side org isolation.
- **User Role System:** Formal role-based access control (admin, sales, driver) based on org membership.

**Database Configuration:**
- Uses Supabase PostgreSQL exclusively via `SUPABASE_DATABASE_URL`.
- Server crashes if `SUPABASE_DATABASE_URL` is missing.
- Logs database host on startup for verification.
- Uses `prepare: false` for pgbouncer compatibility.
- `runStartupMigrations()` handles schema drift.
- Drizzle config uses `SUPABASE_DATABASE_URL`.
- Org-related tables use TEXT ids (UUIDs) and BIGINT timestamps.

**Thin Client Architecture:**
- UI delegates long-running jobs to a Supervisor service (`SUPERVISOR_BASE_URL`).
- Background workers, cron jobs, and long-running execution are disabled by default.
- Fallback to local execution is available if `ENABLE_UI_BACKGROUND_WORKERS` is true.
- Supervisor Client (`server/lib/supervisorClient.ts`) handles job delegation, status, and cancellation.
- AFR events track job delegation and local fallback execution.

## External Dependencies
- **OpenAI GPT-5:** AI chat responses, prospect enrichment, web search, AI-generated personal lines.
- **Wyshbone Global Database (Google Places API):** Business discovery and location-based searches.
- **GeoNames API:** Worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows.
- **Resend API:** Transactional email notifications.
- **Xero:** Accounting platform integration.
- **Hunter.io:** Domain discovery, email finding, and verification.
- **SalesHandy:** Automated prospect management and campaign integration.

## Session 2 Complete (2026-02-05)

**Session 2 Invariants:**
- UI does NOT run background workers by default (thin client architecture).
- Long-running jobs are delegated to Supervisor service:
  - `nightly-maintenance`: Database cleanup and optimization
  - `xero-sync`: Xero accounting sync cron
  - `monitor-worker`: Monitor execution worker
  - `monitor-executor`: Monitor execution engine
  - `deep-research-poll`: Deep research polling (manual trigger)
- Local fallback execution is only available when `ENABLE_UI_BACKGROUND_WORKERS=true`.
- Fallback mode is always loud in logs and AFR events.
- Production safety warnings are logged if background workers are enabled in production (`NODE_ENV=production`).

## Session 3 (2026-02-07) - AFR Performance Optimization

**Changes:**
- AFR page load optimized: shell renders <100ms with skeleton UI, data appears progressively
- Session-level cache (sessionStorage, 60s TTL) for stale-while-revalidate pattern on runs list
- Client-side pagination: first 20 runs visible, "Show more" button for rest
- Server-Timing headers on `/api/afr/runs` endpoint for DB query diagnostics
- Run Detail and Judgement Ledger now show skeleton placeholders during load
- Playback queue rewritten as `while(true)` loop with microtask yield to avoid recursive re-entry
- AFR entry points consolidated: `/dev/inspector` redirects to `/dev/afr`

**Performance baseline:**
- DB query (Supabase): ~390ms for 50 runs
- Client fetch total: ~430ms including network
- Perceived load: instant (cache hit) or skeleton → data in <500ms (cache miss)

**AFR Architecture:**
- Single entry point: `/dev/afr` (sidebar link + `/dev/inspector` redirect)
- Runs list: session-cached, paginated (20 per page), search with useMemo
- Run detail: lazy-loaded on click only
- Judgement ledger: skeleton UI during load

## AFR Artefact Ingestion & Retrieval Contract (2026-02-09)

**POST `/api/afr/artefacts`** — Persists an artefact for a run.
- File: `server/routes/afr.ts`
- Required fields (JSON body): `runId` (string), `type` (string)
- Optional fields: `payload` (object), `payloadJson` (object or JSON string — Supervisor format), `clientRequestId`, `createdAt` (ISO string), `title`, `summary`
- Payload canonicalization: `payload` object takes priority; else `payloadJson` is parsed (string→object if needed); else `{}`
- Title resolution: explicit `title` field → `payload.title` → falls back to `type`
- Summary resolution: explicit `summary` field → `payload.summary` → falls back to `""`
- Database: inserts into `artefacts` table (`run_id`, `type`, `title`, `summary`, `payload_json`, `created_at`)
- Returns: `{ artefactId: string }`

**GET `/api/afr/artefacts`** — Retrieves artefacts for a run.
- Supports `?runId=...` (direct lookup, preferred) and `?client_request_id=...` (resolves via `agent_runs` table)
- If both provided, `runId` wins
- Queries `artefacts` table by `run_id` column
- Returns array of artefact rows

**POST `/api/afr/run-bridge`** — Links a Supervisor run to the canonical UI runId.
- Accepts: `{ runId?, client_request_id?, supervisor_run_id }` (one of `runId` or `client_request_id` required)
- Updates `agent_runs.supervisor_run_id` column
- Returns `{ ok: true, runId, supervisor_run_id }`

**Run Bridge Architecture (2026-02-09):**
- `agent_runs` table has a `supervisor_run_id` column (nullable TEXT) linking UI runs to deep research/Supervisor runs
- The deep research delegation path (routes.ts) now persists a `chat_response` artefact with `delegated_to_supervisor: true` before early return
- This ensures every delegated run immediately has an artefact for "View results" even before final results arrive
- Supervisor can later POST leads artefacts under the same UI runId

**UI "View results" flow** (`client/src/components/live-activity-panel.tsx`):
- `SequenceStatusRow` receives both `clientRequestId` and `runId` (from `stream.run_id`)
- "View results" button appears when either ID is present and status is `completed`
- `ResultsModal` fetches by `runId` when available, falls back to `client_request_id`
- Delegation detection: if only `chat_response` exists with `delegated_to_supervisor: true`, shows blue info banner
- Missing leads: if artefacts exist but no `leads_list`, shows amber warning banner

## Data Ownership & Persistence Guardrails

**The UI never owns persistence.** All artefacts, runs, judgements, and business data come from Supabase via the backend. The frontend is a read/display layer only — it does not write directly to any database.

- All data mutations flow through backend API endpoints → Supabase PostgreSQL
- The DEV banner (bottom-left, development mode only) shows the active database connection: "Supabase" or "Local (DEV ONLY)"
- The `/api/config` endpoint exposes the DB type (derived from `SUPABASE_DATABASE_URL` hostname) for the dev banner
- `SUPABASE_DATABASE_URL` is the single source of truth for database connectivity; `DATABASE_URL` (Replit's built-in) is never used