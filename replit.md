# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered assistant designed to enhance business research, facilitate contact finding, and streamline business discovery using the Wyshbone Global Database. It provides comprehensive analysis, lead generation, and business discovery, especially when user intent is ambiguous. The project aims to deliver a robust platform for sales and lead generation, capable of serving a broad market with its dual-mode AI architecture and integrated workflows.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.
CRITICAL DATABASE RULE: ALL database connections MUST use `SUPABASE_DATABASE_URL` directly. NO fallback patterns—Replit's runtime auto-provides `DATABASE_URL` for its built-in Postgres, which conflicts with Supabase. Using `SUPABASE_DATABASE_URL` exclusively avoids this runtime conflict. The app crashes on startup if `SUPABASE_DATABASE_URL` is not set or empty.

## System Architecture
The application features a Node.js/Express backend and a React frontend, built with TypeScript, Tailwind CSS, and shadcn/ui, with TanStack Query managing API state. Core AI interactions utilize OpenAI's GPT models. The system supports multi-tenant user isolation with session-based authentication and robust data security.

**3-Way Chat Router (Trust-Hardened):**
- **CHAT_INFO:** GPT-5 streaming for informational/conversational responses. No execution language. Legacy SYSTEM_PROMPT from `memory.ts` is stripped via `omitLegacySystemPrompt: true`; only the CHAT_INFO prompt + user context + facts are sent to the LLM.
- **CLARIFY_FOR_RUN:** Entity-finding intent detected but missing info (location, entity type, or has semantic constraints). Creates an **in-memory** clarify session (no DB writes). Multi-turn: user replies are intercepted by session handler before the 3-way router runs. UI shows amber "Clarifying before run" badge. Session auto-transitions to RUN_SUPERVISOR when all parameters gathered (no confirmation required). If user sends a new entity request during clarification, the old session is closed and the new request is re-routed through the 3-way router.
- **RUN_SUPERVISOR:** Entity-finding intent with complete parameters. Creates supervisor task for execution.
- **Routing:** Single `decideChatMode()` in `server/lib/decideChatMode.ts` returns exactly one of the three modes. Informational question prefixes ("who are", "what is", etc.) are checked FIRST and short-circuit to CHAT_INFO. Then entity intent is checked (before CHAT_INFO patterns) to enforce the invariant: any "find entities" input → CLARIFY_FOR_RUN or RUN_SUPERVISOR, never CHAT_INFO.
- **Clarify Sessions:** `server/lib/clarifySession.ts` manages **in-memory** multi-turn clarification (no DB dependency). Sessions stored in a `Map<conversationId, ClarifySession>` with 30-min TTL and periodic GC. All session operations are synchronous. `handleClarifyResponse()` returns `ask_more | run_supervisor | cancelled` but **never closes sessions itself** — only `routes.ts` can close a session, and only after successful supervisor task creation (or explicit cancel). Semantic constraints require explicit resolution via `semantic_constraint_resolved` flag; entity_type + location alone are not sufficient if a semantic constraint exists. Auto-transitions to RUN_SUPERVISOR when entity type + location + semantic constraint (if any) are all satisfied (no confirmation step). Active session check in `server/routes.ts` runs BEFORE the 3-way router.
- **DB Health Gate:** Before entering RUN_SUPERVISOR (both from router and from clarify→run transition), `checkDbHealth()` verifies DB connectivity. If DB is down, returns a truthful "system unavailable" message and **preserves the clarify session intact** so the user can retry without re-entering all their answers. CLARIFY_FOR_RUN never touches the DB at all. A DB failure can never destroy a clarify session.
- **Bypass Endpoints Removed:** `POST /agent/chat` and `POST /api/agent/chat` return HTTP 410 (Gone). `POST /api/tower/chat-test` is gated behind `ENABLE_DEV_CHAT_ENDPOINTS=true`.
- **Shared Infrastructure:** Both lanes use a unified execution layer and PostgreSQL for conversation history.

**UI/UX Decisions:**
The user interface adheres to Material Design principles, featuring a dark mode, Inter font, consistent spacing, real-time chat, auto-expanding input, theme toggle, and a collapsible sidebar with a default UK country selector. Accessibility (WCAG AA) is a key consideration.

**Technical Implementations & Features:**
- **AI Chat Interface:** Real-time conversations with an AI assistant, enforcing a concise, practical, and UK-focused personality.
- **Agentic V1 Workflow:** Goal-driven initialization for sales/lead goals, plan generation, approval, and execution monitoring.
- **Unified Action Layer:** Four core functions (DEEP_RESEARCH, SEARCH_PLACES, CREATE_SCHEDULED_MONITOR, BATCH_CONTACT_FINDER) execute identically across AI modes.
- **Job Management & Worldwide Location Coverage:** Background job system for global searches, intelligent location resolution, and natural language job creation.
- **Streaming Responses:** Uses Server-Sent Events (SSE) for real-time AI responses.
- **Conversational Planning:** GPT-based planner decides whether to search, use cache, or respond.
- **Deep Research Context Extraction & Auto-Summarize:** Server-side prompt enhancement and GPT-4o summarization for research reports.
- **Persistent Memory System:** Database-backed conversation history and knowledge accumulation.
- **Scheduled Monitors:** Agentic monitoring system for recurring tasks with flexible scheduling, email notifications, and "Smart Summary Mode."
- **Xero OAuth Integration:** Direct OAuth 2.0 integration for secure Xero accounting connections.
- **Batch Contact Discovery Pipeline:** Cost-optimized contact finding using multiple external services.
- **Stripe Subscription System:** Freemium model with paid tiers, managing user subscriptions and usage limits.
- **Agent Flight Recorder (AFR) & Live Activity Panel:** User-facing system showing real-time decision paths and execution progress via correlation IDs, idempotent run creation, transparent router decision logging, and a unified timeline of events.
- **User Results View (`UserResultsView`):** Standalone component rendering run outcomes from `delivery_summary` objects.
- **What Was Learned Panel (`WhatWasLearnedPanel`):** Component displaying insights from `RuleUpdate` data.
- **CVL V1 Artefact Renderers:** Five new artefact types rendered in LiveActivityPanel: `constraints_extracted`, `constraint_capability_check`, `verification_summary`, `verification_evidence`, `lead_verification`.
- **Learning Layer v1 (Telemetry + Policies UI):** Fire-and-forget telemetry system for user interaction events linked to `run_id`.
- **RunResultBubble Durability:** Structured results are persisted to the messages table via a JSONB `metadata` column for hydration on page reload.
- **Tower Analytics Integration:** Comprehensive logging for all chat interactions using a unified `runId` system.
- **Hacker News Discovery:** Feature for finding relevant Hacker News discussions, offering AI-powered draft reply generation and relevance scoring.
- **Delivery Management System:** Mobile-first Driver UI with role-based access control.
- **Multi-Tenant Organisation System:** Production-grade organisation-based roles system with invite flow and server-side org isolation.
- **User Role System:** Formal role-based access control (admin, sales, driver) based on org membership.

**Database Configuration:**
- Uses Supabase PostgreSQL exclusively via `SUPABASE_DATABASE_URL`.
- The server crashes if `SUPABASE_DATABASE_URL` is missing.
- `runStartupMigrations()` handles schema drift.

**Thin Client Architecture:**
- The UI server must NEVER execute leadgen tools. The ONLY execution path is creating a `supervisor_tasks` row in Supabase.
- All legacy execution endpoints return 501.
- CHAT lane is pure GPT-5 streaming with no tools.
- RUN lane inserts `supervisor_tasks` row and returns immediately; Supervisor backend handles the full agent loop.

**Supervisor Completion & Delivery Pipeline:**
- Supervisor writes artefacts directly; the UI server does not run a completion poller.
- Client-side polls `/api/afr/artefacts` for `delivery_summary` when `isWaitingForSupervisor=true`.
- Rich result bubble (`RunResultBubble`) rendered inline in chat for RUN lane `delivery_summary` artefacts.
- Two-State Results Bubble: `RunResultBubble` has a `provisional` prop for provisional rendering before final `delivery_summary`.
- Terminal Run Fallback: When polling finds leads but no delivery_summary, mission-level artefacts (`run_summary`, `outcome_log`, `policy_application_snapshot`, `verification_summary`, `run_halted`, `tower_judgement`) count as terminal. No time-based finalisation — provisional bubbles wait for delivery_summary or mission-terminal artefact.
- Realtime Subscription Robustness: `subscribeSupervisorMessages` listens on both INSERT and UPDATE events. The realtime callback only cleans up run state and stops polling when `delivery_summary` is actually found; on failure it leaves the polling loop active. Processed message IDs are deduped via `processedRealtimeMsgIdsRef`. A `finalizeResultsUI()` safety net force-fetches messages from the DB 1s after terminal detection to catch any messages missed by realtime.
- Orphaned Run Recovery: On page load (after history loads), a recovery effect fetches recent `/api/afr/runs?conversation_id=<current>`, finds completed runs for the current conversation that don't have result bubbles rendered, fetches their artefacts, and creates final result messages. Recovery is conversation-scoped to prevent cross-conversation contamination. The `/api/afr/runs` endpoint supports `conversation_id` and `user_id` query parameters for filtering.
- Activity Panel Completion Lifecycle: `wyshbone:results_final` CustomEvent sets `userVisibleComplete=true` for immediate "Completed" status.
- Late Event Suppression: Freeze is a **rendering-only** concern. All events are always ingested into `allEvents`/`rawEvents` for state derivation (terminal detection, tower-aware status, mapped status). Only the `frozenDisplayEvents` array (fed to `usePacedPlaybackQueue` for rendering) is truncated after Phase 1. Phase 2 ("artefacts saved" tick) requires `effectiveTerminal` — no timeout fallback.
- Polling Fetch Pattern: `fetchStream` uses a "skip if in-flight" semaphore (`fetchInFlightRef`) instead of aborting previous requests. This prevents a race condition where the ~1.2s server response time overlaps with the 1.5s polling interval, causing abort-before-parse failures that leave the stream stuck on stale data. Cache-busting (`_t` timestamp param, `cache: 'no-store'`) and server-side `Cache-Control: no-store` headers on `/api/afr/stream` prevent HTTP caching of terminal state transitions.
- Supervisor Bubble Suppression Guard: Prevents contradictory free-text chat bubbles from appearing with `delivery_summary` results.

**AFR Artefact Ingestion & Retrieval Contract:**
- **POST `/api/afr/artefacts`**: Persists an artefact.
- **GET `/api/afr/artefacts`**: Retrieves artefacts.
- **POST `/api/afr/run-bridge`**: Links a Supervisor run to the canonical UI `runId`.

**Data Ownership & Persistence Guardrails:**
The UI never owns persistence. All artefacts, runs, judgements, and business data come from Supabase via the backend. The frontend is a read/display layer only; it does not write directly to any database. All data mutations flow through backend API endpoints to Supabase PostgreSQL. `SUPABASE_DATABASE_URL` is the single source of truth for database connectivity.

## Recent Changes (Feb 2026)
- **Recovery Pipeline Fix:** Rewrote orphaned run recovery to use `/api/afr/runs` endpoint (instead of `/api/afr/activities`) — fixes status field mismatch (`completed` vs `success`) and enables proper `client_request_id` correlation.
- **AFR Terminal Inference:** Server-side `/api/afr/stream` now infers `is_terminal: true` when `status === 'completed'/'failed'` even if `terminalState` is null, fixing Activity Panel terminal detection.
- **Unified `finalizeRunUI()`:** Consolidated three delivery detection paths (polling, realtime, recovery) into a single idempotent function for creating/updating result bubbles.
- **Activity Panel Bridge:** Added `wyshbone:activity_terminal` CustomEvent dispatch for coordinating Activity Panel completion state.
- **Duplicate Key Handling:** Fixed DrizzleQueryError handling in result-message endpoint — now correctly detects `error.cause.code === '23505'` for Postgres duplicate key errors wrapped by Drizzle ORM.
- **Removed Stale Timeout:** Removed destructive 2-minute stale timeout that was killing supervisor tracking state before runs could complete.
- **Conversation-Scoped Recovery:** `/api/afr/runs` endpoint now supports `conversation_id` and `user_id` query parameters. Client recovery passes current `conversationId` to prevent cross-conversation contamination. User scoping is enforced unless `all=true` is specified.
- **Reduced Dev Polling:** Plan polling reduced from 500ms to 2s, execution polling from 300ms to 1.5s in development mode to reduce log noise.
- **Post-Terminal Catch-Up Polling:** Fixed Activity Panel stalling by adding an 8-second catch-up polling window after terminal detection. When the Supervisor marks a run as completed before all activities are persisted, the panel now continues polling at 2s intervals to catch late-arriving events. Frozen display events use ID-based comparison and bypass freezing during catch-up to ensure all events render.
- **Artefact Retry Button:** When artefact fetch exhausts retries and shows a FAIL bubble with `stop_reason='artefacts_unavailable'`, a user-visible retry button dispatches `wyshbone:retry_artefacts` CustomEvent. Chat handler clears idempotency guards and re-runs `finalizeRunUI` up to 10 times with 500ms delays.

## External Dependencies
- **OpenAI GPT-5:** AI chat responses, prospect enrichment, web search, AI-generated personal lines.
- **Wyshbone Global Database (Google Places API):** Business discovery and location-based searches.
- **GeoNames API:** Worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows.
- **Resend API:** Transactional email notifications.
- **Xero:** Accounting platform integration.
- **Hunter.io:** Domain discovery, email finding, and verification.
- **SalesHandy:** Automated prospect management and campaign integration.