# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered assistant designed to enhance business research, facilitate contact finding, and streamline business discovery using the Wyshbone Global Database. It intelligently offers these capabilities when user intent is ambiguous, aiming to provide comprehensive analysis, lead generation, and business discovery. The project aims to deliver a robust platform for sales and lead generation, capable of serving a broad market with its dual-mode AI architecture and integrated workflows.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.

**CRITICAL DATABASE RULE:** ALWAYS use `SUPABASE_DATABASE_URL` for all database connections, NEVER use `DATABASE_URL` directly. The pattern should be: `process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL` to ensure Supabase is always preferred. This applies to all files: routes, cron jobs, lib utilities, and any new code. The Replit DATABASE_URL is only a fallback if Supabase is unavailable.

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
- **Agent Flight Recorder (AFR):** An internal development tool for visualizing agent decision loops, run details, and judgment ledgers. Features robust JSON extraction that iterates through all code fences and balanced JSON blocks, with AFR run creation happening BEFORE parsing to ensure visibility of failed attempts.
- **Run User Attribution (Security Fix):** Deep research runs are now created with strict userId enforcement. Chat endpoint calls `startBackgroundResponsesJob` directly (no internal HTTP fetch) passing authenticated user.id explicitly. In production, unauthenticated requests are rejected with 401. Body.userId is only accepted in demo mode for testing.
- **Tower Analytics Integration:** Comprehensive logging system for tracking all chat interactions for monitoring and analytics, utilizing a unified runId system for conversation-level insights.
- **Hacker News Discovery:** A feature for finding relevant Hacker News discussions based on keywords, offering AI-powered draft reply generation and relevance scoring based on Wyshbone's fit.
- **Delivery Management System:** Mobile-first Driver UI with role-based access control supporting three user roles (admin, sales, driver). Drivers access delivery routes at /driver/today with stop details.
- **Multi-Tenant Organisation System:** Production-grade organisation-based roles system with invite flow. Each user belongs to an organisation with membership roles (admin/sales/driver). Features include: org creation for first-time users, email-based invites with secure tokens, role management by admins, and server-side org isolation. Access via Settings → Team. See docs/org-and-roles.md for full documentation.
- **User Role System:** Formal role-based access control now uses org membership roles. Admins have full access including team management. Drivers access delivery UI only. Sales users access CRM features. Legacy user.role field kept for backwards compatibility.

## Database Configuration
- **Primary Database:** Supabase PostgreSQL (production data, accessed via `SUPABASE_DATABASE_URL`)
- **Fallback:** Replit's built-in PostgreSQL (accessed via `DATABASE_URL`)
- **Connection Priority:** App prefers `SUPABASE_DATABASE_URL` over `DATABASE_URL` to ensure consistent database usage
- **Supabase Pooler:** Uses `prepare: false` in postgres connection config to disable prepared statements for pgbouncer compatibility
- **Startup Migrations:** `runStartupMigrations()` in `server/storage.ts` handles schema drift by adding missing columns using PostgreSQL's `IF NOT EXISTS` syntax
- **Drizzle Config:** Updated in `drizzle.config.ts` to prefer `SUPABASE_DATABASE_URL` for schema operations
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