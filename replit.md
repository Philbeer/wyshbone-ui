# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered assistant designed to enhance business research, facilitate contact finding, and streamline business discovery using the Wyshbone Global Database. It provides comprehensive analysis, lead generation, and business discovery, especially when user intent is ambiguous. The project aims to deliver a robust platform for sales and lead generation, capable of serving a broad market with its dual-mode AI architecture and integrated workflows.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.
CRITICAL DATABASE RULE: ALL database connections MUST use `SUPABASE_DATABASE_URL` directly. NO fallback patterns—Replit's runtime auto-provides `DATABASE_URL` for its built-in Postgres, which conflicts with Supabase. Using `SUPABASE_DATABASE_URL` exclusively avoids this runtime conflict. The app crashes on startup if `SUPABASE_DATABASE_URL` is not set or empty.

## System Architecture
The application features a Node.js/Express backend and a React frontend, built with TypeScript, Tailwind CSS, and shadcn/ui, with TanStack Query managing API state. Core AI interactions utilize OpenAI's GPT models. The system supports multi-tenant user isolation with session-based authentication and robust data security.

**2-Lane Chat Architecture:**
- **CHAT Lane:** GPT-5 streaming with tool calling for conversational responses.
- **RUN Lane:** Supervisor delegation for lead-finding, deep research, and batch tasks.
- **Routing:** Uses keyword matching to fork CHAT vs RUN; client-side UI always POSTs to `/api/chat`, server decides the lane.
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
- Terminal Run Fallback: When polling finds leads but no delivery_summary, only mission-level artefacts (`run_summary`, `outcome_log`, `policy_application_snapshot`) count as terminal. Step-level `tower_judgement` FAIL/STOP (e.g. captcha) is NOT terminal. No time-based finalisation — provisional bubbles wait for delivery_summary or mission-terminal artefact.
- Activity Panel Completion Lifecycle: `wyshbone:results_final` CustomEvent sets `userVisibleComplete=true` for immediate "Completed" status.
- Late Event Suppression: Freezes Activity Panel event list when `userVisibleComplete=true`.
- Supervisor Bubble Suppression Guard: Prevents contradictory free-text chat bubbles from appearing with `delivery_summary` results.

**AFR Artefact Ingestion & Retrieval Contract:**
- **POST `/api/afr/artefacts`**: Persists an artefact.
- **GET `/api/afr/artefacts`**: Retrieves artefacts.
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