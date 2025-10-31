# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered chat assistant with three core capabilities: (1) Deep Research for comprehensive analysis, (2) Contact Finding via Bubble workflows for lead generation, and (3) Google Places Search for quick business listings. The system intelligently offers all three options when user intent is ambiguous, ensuring users can choose the best approach for their needs.

## Multi-Tenant Architecture
The system implements multi-tenant user isolation where each user (identified by email and ID from Bubble) has completely separate data:
- **Authentication Method**: URL parameters (`?user_email=` and `?user_id=`) for Bubble integration
- **Data Isolation**: All database tables include userId/created_by_email fields to ensure users only see their own data
- **Security Note**: ⚠️ **DEVELOPMENT ONLY** - Current URL parameter approach is not secure for production. Production deployment MUST implement token-based authentication with signature verification before going live.
- **Fallback Behavior**: When no URL parameters provided, system defaults to "demo-user" for local testing

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Google Places as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands. **CRITICAL: The AI must ALWAYS ask for confirmation when making assumptions or combining current input with historical facts/context - chat history and facts serve as background reference, not primary drivers.**

## System Architecture
The application utilizes a modern web stack, featuring Node.js/Express for the backend and React with TypeScript, Tailwind CSS, and shadcn/ui for the frontend. TanStack Query manages API state. Core AI interactions leverage OpenAI's GPT-5 via its Chat Completions API, supporting web search for real-time information.

**UI/UX Decisions:**
The user interface adheres to modern Material Design principles, inspired by ChatGPT, Linear, and Slack. It features a dark mode, Inter font, consistent spacing, a real-time chat interface, an auto-expanding input, a theme toggle, and a collapsible sidebar with a default country selector (United Kingdom by default, stored in localStorage). Accessibility (WCAG AA) is a key consideration.

**Technical Implementations & Feature Specifications:**
- **AI Chat Interface:** Provides real-time conversations with a GPT-5 assistant, enforcing a concise, practical, and UK-focused AI personality via the system prompt.
- **Tool Integration:**
    - **Google Places API (New v1):** Used for verified business discovery and prospect search/enrichment, filtering for operational businesses and returning Google Place IDs.
    - **OpenAI GPT-5 for Enrichment:** Enriches prospects with domain, contact email, social links, business classification, summary, and lead score. Includes optional public contact discovery with strict verification of source URLs.
    - **Bubble Workflow Integration:** Supports triggering Bubble backend workflows in batch based on natural language input, with configurable delays and dynamic parameter mapping. Features multi-country support, automatic location detection, country mismatch detection, and a mandatory user confirmation flow for all batch requests.
    - **Job Management & Worldwide Location Coverage:** A background job system for running searches across geographic areas globally.
        - **Intelligent Location Resolution:** Parses natural language location inputs using city hints, local dictionaries, and GeoNames geocoding fallback, returning structured location data.
        - **GeoNames Integration:** A tri-layer API approach for administrative regions with caching, rate limiting, and exponential backoff. Handles country-specific admin levels (ADM1, ADM2).
        - **Region Data:** Utilizes 482+ static region datasets (e.g., UK counties, US states) for fast lookups, complemented by dynamic GeoNames lookups for worldwide coverage.
        - **Natural Language Job Creation:** Automatically creates jobs from commands like "Run dentists across all London boroughs."
        - **Job Control Commands:** Provides commands for managing job status (status, pause, resume, cancel).
        - **Background Worker:** Processes regions sequentially, passing ISO alpha-2 country codes to Bubble's workflow.
        - **Progress Tracking:** Offers real-time status updates for jobs.
    - **Stub Endpoint:** `/api/tool/add_note` for future Bubble integration.
    - **Location Hints Database:** A PostgreSQL table (`location_hints`) with 29,483 worldwide location records across 200+ countries. Features smart search API with pagination, country filtering, and prefix/contains matching. Supports autocomplete and location disambiguation.
    - **Location Ambiguity Resolver:** Intelligently disambiguates location names using the location hints database, handling UK synonyms and providing conservative warning logic to the user without auto-switching the default country.
- **Streaming Responses:** Utilizes Server-Sent Events (SSE) for real-time AI responses and animated typing indicators.
- **Error Handling:** Provides comprehensive error messages as system notifications.
- **Conversational Planning:** A GPT-based planner intelligently decides whether to "search," "use_cache," or "respond" to prevent unnecessary searches and ensure venue deduplication.
- **Deep Research Context Extraction:** When users use vague follow-up phrases like "deep dive", "yes", or "go ahead", the system uses a **server-side prompt enhancement layer** that:
    1. **Detects vague prompts** using pattern matching (checks against: 'deep dive', 'yes', 'do it', 'go ahead', 'sure', 'okay', 'please', 'start', 'begin')
    2. **Extracts actual topic** from recent conversation history (last 8 messages) using GPT-4o-mini
    3. **Replaces vague prompt** with the extracted topic before validation (e.g., "deep dive" → "pubs in Kendal")
    4. **Validates topic source** to distinguish explicit vs. inferred topics
    5. **Asks for confirmation** when topics are inferred from context
    
    This ensures the AI **always uses conversation context** instead of passing vague phrases literally to the research system.
- **Auto-Summarize Research Reports:** Automatically summarizes previously viewed deep research reports through natural language commands.
    1. **Pattern Detection:** Detects summarize requests using a typo-tolerant regex pattern `/\bsumm?ari[sz]e(\s+(it|this|that|the(\s+report)?|the\s+deep\s+(dive|research)))?|tl;?dr\b/i` that handles common misspellings like "sumarise"
    2. **Last Viewed Tracking:** Tracks the most recently clicked/viewed deep research report per session using IP-based session IDs
    3. **GPT-4o Summarization:** Automatically generates concise summaries using GPT-4o when users type phrases like "summarize this", "sumarise it", or "tl;dr"
    4. **Session Continuity:** Uses consistent session tracking across sidebar and chat endpoints via `getSessionId()` (x-session-id header or IP fallback)
- **Persistent Memory System:** A database-backed system for conversation history and knowledge accumulation, serving as a background reference layer.
    - **Conversation Persistence:** All chat messages are saved to PostgreSQL with conversation IDs maintained.
    - **Fact Extraction:** Automatically extracts user preferences, business requirements, and contextual information from conversations and research prompts.
    - **Intelligent Knowledge Scoring:** Facts are scored for importance (0-100), with higher scores for industries, places, and subjects. A recency boost algorithm prioritizes recent facts.
    - **Category Classification:** Facts are categorized (industry/place/subject/preference/general) for filtering and prioritization.
    - **ConversationId Round-Trip:** Backend generates and streams conversation IDs to the frontend for session continuity.
    - **CRITICAL Message Priority Architecture:** The system enforces strict message ordering where current conversation (last 5-10 messages) takes ABSOLUTE PRIORITY over stored facts. Messages are ordered: System prompt → Conversation history (PRIORITY) → Durable memory (FALLBACK). When users use vague phrases ("deep dive", "yes", "go ahead"), the AI must first check current conversation for context before falling back to stored memory.
    - **Context Building:** Combines historical conversations and extracted facts for personalized responses, with current conversation always prioritized over durable memory.
    - **Memory Debug View:** A developer interface at `/debug` to inspect conversations, messages, and facts, including a User Profile Summary.
    - **New Chat Feature:** Clears the visual conversation thread while preserving learned facts in the database.
- **Data Models:** Standardized schemas for `ChatMessage`, `ChatRequest`, `AddNoteRequest`, `BubbleRunBatchRequest`, and database tables (`conversations`, `messages`, `facts`, `scheduled_monitors`).
- **Backend Validation:** Zod schema validation is used on all endpoints, with CORS enabled.
- **Scheduled Monitors:** Agentic monitoring system that allows users to create recurring tasks through natural conversation or manual configuration.
    - **AI-Powered Creation:** Chat interface suggests and creates monitors using the `create_scheduled_monitor` tool
    - **Full CRUD Operations:** Create, read, update, and delete monitors via `/api/scheduled-monitors` endpoints
    - **Flexible Scheduling:** Daily, weekly, biweekly, and monthly frequencies with optional day-of-week and time specification
    - **Monitor Types:** Supports deep_research, business_search, and google_places monitoring
    - **Smart Time Calculation:** PATCH endpoint properly handles scheduleTime changes, calculating next run date/time correctly accounting for UK timezone and user-specified execution times
    - **Email Notifications:** Integrated with Resend API to send professional HTML email reports when monitors complete
        - Toggle email notifications on/off per monitor via UI switch
        - Beautiful responsive email templates with monitor results summary
        - Automatic credential management via Replit Resend connector
        - Email includes run details, result counts, and direct link back to application
    - **Sidebar Management UI:** Collapsible section showing all monitors with:
        - Live status indicators (active/inactive)
        - Next run date/time in UK format (DD/MM/YYYY, 24-hour time)
        - Monitor type badges (Research/Contacts/Places)
        - Email notification icon when enabled
        - Edit and delete actions with confirmation dialogs
    - **Edit Dialog Features:** Allows changing monitor label, schedule frequency, day, time, and email notification preference (description read-only to prevent changing search intent)
    - **UK Date/Time Formatting:** All dates displayed in DD/MM/YYYY format with 24-hour time throughout the application

## External Dependencies
- **OpenAI GPT-5:** For AI chat responses, prospect enrichment, and web search.
- **Google Places API (New v1):** For business discovery and location-based searches.
- **GeoNames API:** For worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows, integrated via dedicated API endpoints.
- **Resend API:** For sending transactional email notifications when scheduled monitors complete.