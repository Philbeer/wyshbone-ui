# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered assistant designed to enhance business research, facilitate contact finding, and streamline business discovery using the Wyshbone Global Database. It provides comprehensive analysis, lead generation, and business discovery, especially when user intent is ambiguous. The project aims to deliver a robust platform for sales and lead generation, capable of serving a broad market with its dual-mode AI architecture and integrated workflows.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.

CRITICAL DATABASE RULE: ALL database connections MUST use `SUPABASE_DATABASE_URL` directly. NO fallback patterns—Replit's runtime auto-provides `DATABASE_URL` for its built-in Postgres, which conflicts with Supabase. Using `SUPABASE_DATABASE_URL` exclusively avoids this runtime conflict. The app crashes on startup if `SUPABASE_DATABASE_URL` is not set or empty.

## System Architecture
The application features a Node.js/Express backend and a React frontend, built with TypeScript, Tailwind CSS, and shadcn/ui, with TanStack Query managing API state. Core AI interactions utilize OpenAI's GPT models. The system supports multi-tenant user isolation with session-based authentication and robust data security.

**2-Lane Chat Architecture (Feb 2026 refactor):**
- **CHAT Lane:** GPT-5 streaming with tool calling for conversational responses. All messages POST to `/api/chat`.
- **RUN Lane:** Supervisor delegation for lead-finding, deep research, and batch tasks. Creates `supervisor_tasks` row and returns immediately.
- **Routing:** `server/lib/decideChatMode.ts` uses keyword matching to fork CHAT vs RUN. `detectSupervisorIntent()` gates actual task enqueue — if intent doesn't require supervisor, falls through to CHAT lane.
- **Client-side:** No pre-routing interception. UI always POSTs to `/api/chat`; server decides the lane. Client `classifyIntent()` remains for UX/history handling only (NEW_REPLACE/CONTINUE/MODIFY/NEW_UNRELATED).
- **MEGA Mode:** GPT-4o planner-executor pattern for complex multi-step tasks with intelligent delegation.
- **Shared Infrastructure:** Both modes use a unified execution layer and PostgreSQL for conversation history.

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
- **Agent Flight Recorder (AFR) & Live Activity Panel:** User-facing system showing real-time decision paths and execution progress via correlation IDs, idempotent run creation, transparent router decision logging, and a unified timeline of events. Includes run lifecycle management with `agent_runs` database table for authoritative status tracking and user attribution for security. The "View results" button on completed/stopped/awaiting runs opens a ResultsModal that fetches artefacts from the `artefacts` table. Supports tabbed display of multiple artefact types (leads_list, tower_judgement, run_summary, plan_update, deep_research_result, chat_response, email_drafts, plan_result, delivery_summary). The `delivery_summary` artefact renders exact matches, closest matches, shortfall banner, and suggested next question — all from payload data only, with no UI-side inference or computation. Tower-aware status derivation: for lead-finding runs (SEARCH_PLACES, BATCH_CONTACT_FINDER), "Completed" only appears when Tower verdict is ACCEPT; otherwise shows "Awaiting judgement" with a warning banner. ResultsModal header shows Tower verdict badge, Plan version indicator, and target vs delivered counts with percentage. Artefacts are persisted on plan completion.
- **User Results View (`UserResultsView`):** Standalone, user-facing component (`client/src/components/results/UserResultsView.tsx`) that renders run outcomes from a single `delivery_summary` object. Uses canonical delivery status (PASS/PARTIAL/STOP) from `delivery_summary.status` — NEVER computes success from raw lead counts. If status is missing, shows "Status unavailable" rather than inferring PASS. Status resolution logic lives in `client/src/utils/deliveryStatus.ts`. Shows status badge, delivered vs requested counts, exact/closest matches, stop reason (for STOP), CVL verification sections, and "What was learned" panel (from RunBundle.related_rule_updates). Includes user feedback buttons (Accept/Retry/Abandon/Export) that call `POST /api/feedback/{action}` endpoints via `client/src/api/feedbackClient.ts`. Reusable in chat, modal, or page context.
- **What Was Learned Panel (`WhatWasLearnedPanel`):** Component (`client/src/components/results/WhatWasLearnedPanel.tsx`) displaying insights from `RuleUpdate` data (rule_text, confidence, evidence_run_ids). Uses user-facing language — "What was learned" not "Rules" or "Beliefs". Shows up to 3 active insights per run.
- **CVL V1 Artefact Renderers (Phase 1):** Five new artefact types rendered in LiveActivityPanel: `constraints_extracted` (shows constraint list with hard/soft badges), `constraint_capability_check` (capability assessment), `verification_summary` (verified vs requested counts, per-constraint status), `verification_evidence` (evidence snippets with source labels), `lead_verification` (per-lead constraint checks). All renderers in `client/src/components/results/CvlArtefactViews.tsx`. Evidence display is strict: shows "Not verified" explicitly when evidence is absent. The "requested count" display uses neutral "Target (system)" label when no CVL data exists, and "Requested" only when CVL `constraints_extracted.requested_count_user` is present. Stop-state action buttons (Verify via websites, Broaden radius, Relax constraint, Return best-effort list) appear for stop/change_plan verdicts with "Not wired yet" toast and chat prefill. Tower rationale is displayed when verdict is stop or change_plan.
- **Tower Analytics Integration:** Comprehensive logging for all chat interactions using a unified runId system.
- **Hacker News Discovery:** Feature for finding relevant Hacker News discussions, offering AI-powered draft reply generation and relevance scoring.
- **Delivery Management System:** Mobile-first Driver UI with role-based access control.
- **Multi-Tenant Organisation System:** Production-grade organisation-based roles system with invite flow and server-side org isolation.
- **User Role System:** Formal role-based access control (admin, sales, driver) based on org membership.

**Database Configuration:**
- Uses Supabase PostgreSQL exclusively via `SUPABASE_DATABASE_URL`.
- The server crashes if `SUPABASE_DATABASE_URL` is missing.
- `runStartupMigrations()` handles schema drift.
- Org-related tables use TEXT ids (UUIDs) and BIGINT timestamps.

**Thin Client Architecture (Hard Rule — Feb 2026):**
- **HARD RULE:** UI server must NEVER execute leadgen tools (Google Places, deep research, region jobs, batch contacts). The ONLY execution path is creating a `supervisor_tasks` row in Supabase.
- **`assertNoExecutionInUI()` guardrail:** All legacy execution endpoints (`/api/search`, `/api/places/*`, `/api/prospects/*`, `/api/tool/bubble_run_batch`, `/api/debug/demo-plan-run`, `/api/plan/start`, `/api/plan/create-test`, `/api/deep-research` POST, `/api/tools/execute`) return 501 with explicit "UI execution path forbidden" error if hit.
- **CHAT lane:** Pure GPT-5 streaming with no tools — no tool definitions, no tool-call processing, no artefact creation.
- **RUN lane:** Inserts `supervisor_tasks` row and returns immediately. Supervisor backend handles the full agent loop.
- Background workers, cron jobs, and long-running execution are disabled by default.
- Supervisor Client handles job delegation, status, and cancellation via `SUPERVISOR_BASE_URL`.
- AFR events track job delegation.

**Supervisor Completion & Delivery Pipeline (Feb 2026):**
- **Supervisor writes artefacts directly.** The UI server does NOT run a completion poller or evaluate Supervisor results. All `delivery_summary`, `verification_summary`, `tower_judgement`, and other artefacts are written by the Supervisor service itself.
- **Removed (Feb 2026):** `server/lib/supervisor-completion-handler.ts`, `server/lib/delivery-evaluator.ts`, `server/lib/artefact-persister.ts` — these were redundant server-side completion handler/evaluator/persister systems. The webhook endpoint `POST /api/supervisor/supervisor-completed` and the background completion poller were also removed.
- **Client-side polling** (`client/src/pages/chat.tsx`): When `isWaitingForSupervisor=true`, polls `/api/afr/artefacts` every 5s for `delivery_summary`. Also fetches on SSE `completed` event. Renders `UserResultsView` inline in chat with canonical status badge (PASS/PARTIAL/STOP), delivered/requested counts, lead cards, stop reason, and feedback buttons.
- **Concurrent run tracking (Feb 2026):** `inFlightSupervisorRunsRef` is a `Map<string, {runId, crid}>` that tracks ALL in-flight supervisor runs. Polling iterates over all map entries so back-to-back RUN-lane requests each get their delivery_summary rendered independently. Completion of one run removes only that entry from the map; `isWaitingForSupervisor=false` only fires when the map is empty. ds-* delivery summary messages use upsert logic and are preserved during intent-based message clearing (NEW_REPLACE/NEW_UNRELATED). Timeout watchdog clears the entire map to prevent infinite polling.
- **Canonical delivery status** (`client/src/utils/deliveryStatus.ts`): Resolves status from `delivery_summary.status` field. NEVER infers PASS from raw counts. Missing status → "Status unavailable".

**AFR Artefact Ingestion & Retrieval Contract:**
- **POST `/api/afr/artefacts`**: Persists an artefact for a run, with required `runId` and `type`.
- **GET `/api/afr/artefacts`**: Retrieves artefacts for a run, supporting lookup by `runId` or `client_request_id`.
- **POST `/api/afr/run-bridge`**: Links a Supervisor run to the canonical UI `runId`.

**Data Ownership & Persistence Guardrails:**
The UI never owns persistence. All artefacts, runs, judgements, and business data come from Supabase via the backend. The frontend is a read/display layer only; it does not write directly to any database. All data mutations flow through backend API endpoints to Supabase PostgreSQL. `SUPABASE_DATABASE_URL` is the single source of truth for database connectivity.

## External Dependencies
- **OpenAI GPT-5:** AI chat responses, prospect enrichment, web search, AI-generated personal lines.
- **Wyshbone Global Database (Google Places API):** Business discovery and location-based searches.
- **GeoNames API:** Worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows.
- **Resend API:** Transactional email notifications.
- **Xero:** Accounting platform integration.
- **Hunter.io:** Domain discovery, email finding, and verification.
- **SalesHandy:** Automated prospect management and campaign integration.