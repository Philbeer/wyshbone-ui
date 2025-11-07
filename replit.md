# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered chat assistant designed to facilitate deep research, contact finding via Bubble workflows, and quick business listings using the Wyshbone Global Database. It intelligently offers these options when user intent is ambiguous, aiming to provide comprehensive analysis, lead generation, and business discovery capabilities.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Wyshbone Global Database as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.

## System Architecture
The application is built with a Node.js/Express backend and a React frontend, utilizing TypeScript, Tailwind CSS, and shadcn/ui. TanStack Query manages API state. Core AI interactions leverage OpenAI's GPT-5. The system supports multi-tenant user isolation with session-based authentication and robust data security.

**UI/UX Decisions:**
The user interface follows Material Design principles, inspired by ChatGPT, Linear, and Slack, featuring a dark mode, Inter font, consistent spacing, real-time chat, auto-expanding input, theme toggle, and a collapsible sidebar with a default UK country selector. Accessibility (WCAG AA) is a key consideration.

**Technical Implementations:**
- **AI Chat Interface:** Provides real-time conversations with a GPT-5 assistant, enforcing a concise, practical, and UK-focused AI personality via the system prompt.
- **Tool Integration:**
    - **Wyshbone Global Database:** For verified business discovery and prospect search/enrichment, returning Place IDs.
    - **OpenAI GPT-5 for Enrichment:** Enriches prospects with domain, contact email, social links, business classification, summary, and lead score, including public contact discovery with source verification.
    - **Bubble Workflow Integration:** Triggers Bubble backend workflows in batch based on natural language input, with multi-country support, automatic location detection, and a mandatory user confirmation for batch requests.
    - **Job Management & Worldwide Location Coverage:** A background job system for running searches globally, featuring intelligent location resolution (using city hints, local dictionaries, and GeoNames), 482+ static region datasets, and natural language job creation and control.
    - **Location Hints Database:** A PostgreSQL table with 29,483 worldwide location records for smart search, autocomplete, and disambiguation, handling UK synonyms.
- **Streaming Responses:** Uses Server-Sent Events (SSE) for real-time AI responses.
- **Error Handling:** Provides comprehensive error messages as system notifications.
- **Conversational Planning:** A GPT-based planner decides whether to "search," "use_cache," or "respond" to prevent unnecessary searches and ensure venue deduplication.
- **Deep Research Context Extraction:** A server-side prompt enhancement layer detects vague follow-up phrases, extracts the actual topic from recent conversation history using GPT-4o-mini, and validates the topic source, asking for confirmation when topics are inferred.
- **Auto-Summarize Research Reports:** Automatically summarizes previously viewed deep research reports using GPT-4o based on natural language commands and session tracking.
- **Persistent Memory System:** A database-backed system for conversation history and knowledge accumulation. It saves all chat messages, extracts and scores facts (user preferences, business requirements) for importance and recency, and categorizes them. It prioritizes current conversation history over durable memory.
- **Data Models:** Standardized schemas for chat messages, requests, and database tables (`conversations`, `messages`, `facts`, `scheduled_monitors`).
- **Backend Validation:** Zod schema validation on all endpoints, with CORS enabled.
- **Scheduled Monitors:** An agentic monitoring system for recurring tasks (deep_research, business_search, wyshbone_database) created via chat or manual configuration. It offers full CRUD operations, flexible scheduling (once, hourly, daily, weekly, biweekly, monthly), and business-context-aware intelligence to analyze results, pull user facts from memory, prioritize customer opportunities, and provide personalized reasoning. Email notifications are sent via Resend API and default to enabled. Hourly scheduling enables rapid testing of agentic features within a single day. The UI includes a sidebar management interface with edit and delete actions. **Smart Summary Mode:** Monitor runs create concise, actionable summaries in chat (not overwhelming full reports), showing only new results, AI key findings, and significance level, while full reports are sent via email.
- **Xero OAuth Integration:** Direct OAuth 2.0 integration for securely connecting Xero accounting accounts. Features HMAC-signed state tokens with user identity preservation, 10-minute expiry protection, replay attack prevention, and session-based authentication. Supports token exchange, refresh, and secure storage of access/refresh tokens with tenant information. Production deployment requires XERO_CLIENT_ID, XERO_CLIENT_SECRET, and OAUTH_STATE_SECRET environment variables. The integration replaces paid third-party services with a native OAuth implementation.
- **Batch Contact Discovery Pipeline:** Cost-optimized contact finding system using Google Places API (text search only, no expensive Place Details), Hunter.io (domain + email discovery and verification), and SalesHandy (automated prospect campaign management). Features intelligent email ranking by position type, AI-generated personal lines, and asynchronous job processing. Accessible via REST API endpoints: `POST /api/batch/create`, `GET /api/batch/:id`, `GET /api/batch`. Requires GOOGLE_PLACES_API_KEY, HUNTER_API_KEY, SALES_HANDY_API_TOKEN, and SALES_HANDY_CAMPAIGN_ID.
- **Stripe Subscription System:** Freemium model with demo access (no signup required), free tier (2 monitors, 2 deep research), and paid tiers (Basic £35, Pro £70, Business £120, Enterprise £250). Session-based authentication with password hashing, usage tracking, and Stripe Checkout integration. Demo users can view deep research reports without signing up. Users signup → free tier → upgrade via Stripe → usage limits enforced. Backend maps tier names to Stripe price IDs from environment variables.

## External Dependencies
- **OpenAI GPT-5:** For AI chat responses, prospect enrichment, web search, and AI-generated personal lines.
- **Wyshbone Global Database:** For business discovery and location-based searches.
- **GeoNames API:** For worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows.
- **Resend API:** For sending transactional email notifications.
- **Xero:** Accounting platform integration via OAuth 2.0 for secure account connections.
- **Google Places API:** For business name discovery in batch contact finding pipeline (text search only).
- **Hunter.io:** For domain discovery, email finding, and email verification in batch processing.
- **SalesHandy:** For automated prospect management and campaign integration.

## Production Deployment Requirements
- **Required Environment Variables:**
  - `XERO_CLIENT_ID`: OAuth client ID from Xero Developer Portal
  - `XERO_CLIENT_SECRET`: OAuth client secret from Xero Developer Portal
  - `OAUTH_STATE_SECRET`: Strong random secret (32+ characters) for signing OAuth state tokens
  - `STRIPE_SECRET_KEY`: Stripe secret key for payment processing
  - `STRIPE_PRICE_BASIC`: Stripe price ID for £35/month Basic tier (price_1QqpqWLskJp7a0AbArn9hQGo6v4)
  - `STRIPE_PRICE_PRO`: Stripe price ID for £70/month Pro tier (price_1Qqpq1skJp7a0AbAmSRn8iGaRu)
  - `STRIPE_PRICE_BUSINESS`: Stripe price ID for £120/month Business tier (price_1Qqpq1skJp7a0AbAmyzaR8noO)
  - `STRIPE_PRICE_ENTERPRISE`: Stripe price ID for £250/month Enterprise tier (price_1Qqpq1skJp7a0AbAAKFqxeE)
  - `OAUTH_STATE_SECRET` must be rotated periodically for security hygiene
- **Security Notes:**
  - The application uses header-based authentication (x-session-id) for API calls
  - OAuth flows preserve user identity through HMAC-signed state tokens
  - State tokens expire after 10 minutes and include replay protection
  - Development mode allows query parameter authentication with warnings (disabled in production)