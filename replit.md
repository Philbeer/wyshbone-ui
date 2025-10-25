# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered chat assistant built with Node.js, Express, and React, integrating with OpenAI's GPT-5. Its primary purpose is to provide a clean, professional, and practical chat experience, delivering UK-focused responses and robust tool integration capabilities for tasks such as business discovery, lead enrichment, and triggering Bubble workflows. The project aims to streamline prospecting and lead management for Wyshbone.

## User Preferences
I want the agent to focus on practical, UK-focused responses. I want to ensure that any contact information discovered is public and verifiable, with no guessing of private details. I prefer a workflow that prioritizes Google Places as the authoritative source for business discovery. The agent should be able to intelligently decide when to search for new venues versus using cached information and support conversational queries without triggering unnecessary searches. I want the agent to auto-detect and execute Bubble batch workflows based on natural language commands.

## System Architecture
The application uses a modern web stack: Node.js/Express for the backend and React with TypeScript, Tailwind CSS, and shadcn/ui for the frontend. TanStack Query manages API state. The core AI interaction uses OpenAI's GPT-5 via its Responses API, enabling web search for real-time information.

**UI/UX Decisions:**
The user interface follows modern Material Design principles, drawing inspiration from ChatGPT, Linear, and Slack. It features a dark mode primary color scheme, Inter font family, and a consistent spacing system. Key UI components include a chat interface with real-time message display, an auto-expanding input area, a theme toggle, and a collapsible sidebar with a default country selector (196 countries available). The default country (stored in localStorage, defaults to United Kingdom) is used for all searches unless the user explicitly specifies a different location in their message. Accessibility (WCAG AA) is a key consideration.

**Technical Implementations & Feature Specifications:**
- **AI Chat Interface:** Real-time conversations with a GPT-5 assistant. The system prompt enforces a concise, practical, and UK-focused AI personality.
- **Tool Integration:**
    - **Google Places API (New v1):** For verified business discovery (`/api/places/search`, `/api/prospects/search_and_enrich`). Filters for OPERATIONAL businesses and returns real Google Place IDs.
    - **OpenAI GPT-5 for Enrichment:** Enriches prospects with domain, contact email, social links, business classification, summary, and lead score (`/api/prospects/enrich`). Includes optional public contact discovery with strict guardrails (`/api/prospects/enrich_contacts`). Contacts must have verifiable source URLs.
    - **Bubble Workflow Integration:** Trigger Bubble backend workflows in batch (`/api/tool/bubble_run_batch`) based on natural language input via Chat Completions API tool calling, supporting configurable delays and dynamic parameter mapping. **Multi-Country Support:** Supports UK counties and US state counties (e.g., Texas). Automatically detects location from phrases like "in Texas" and maps to appropriate country codes (Texas → USA). **Country Mismatch Detection:** When user requests a location in a different country than the sidebar default (e.g., "Texas" when default is "United Kingdom"), system alerts the user and suggests either changing the default country via dropdown or confirming the location is actually in the default country. **Country-Wide Searches:** When only a country is specified (e.g., "breweries India"), sends the full country name (e.g., "India") as the location instead of "-" to provide better context to Google Places API. **Confirmation Flow:** Before executing batch requests, the chatbot auto-generates counties based on detected location, displays a detailed preview of all planned API calls with parameters and country, and **ALWAYS requires user confirmation ("yes")** or cancellation ("no") before proceeding. Old detection patterns disabled - all workflows must go through tool calling with mandatory confirmation.
    - **Job Management & Worldwide Location Coverage:** Background job system with comprehensive worldwide region support for running searches across geographic areas. Features:
        - **Intelligent Location Resolution** (`server/location-resolver.ts`): Parses natural language location inputs with 95+ city hints, local dictionaries, and GeoNames geocoding fallback. Returns structured data: country (full name), country_code (ISO alpha-2), region filter, granularity, and confidence scores. Includes 35+ country name mappings (IN→India, GB→United Kingdom, etc.) to ensure full country names are sent to Bubble's Google Places API integration.
        - **GeoNames Integration** (`server/geocode.ts`): Tri-layer API approach for administrative regions:
            - Layer 1: countryInfoJSON → childrenJSON (fetches ADM1 via geonameId)
            - Layer 2: ADM2 retrieval via ADM1 iteration (all states/provinces processed for complete county/department coverage)
            - Layer 3: searchJSON fallback with name_startsWith filter
            - Includes 24-hour caching, 1 req/sec rate limiting, and exponential backoff retry
        - **Per-Country Admin Level Mapping:** Handles country-specific admin structures (JP prefectures=ADM1, CO departments=ADM1, FR departments=ADM2, US counties=ADM2, etc.)
        - **Region Data (482+ Static Regions):** 8 local datasets for instant lookups - UK counties (49), London boroughs (33), GB devolved regions (65), US states (50), Texas counties (238), Ireland counties (26), Australia states (8), Canada provinces (13). Dynamic GeoNames lookup provides unlimited worldwide coverage beyond these.
        - **Three-Tier Hybrid Service** (`server/regions.ts`) with ISO-safe country codes:
            - **Local Datasets:** Primary source (fastest, no API cost), maps country/granularity to JSON files
            - **24-Hour Cache:** Stores GeoNames results to minimize API calls
            - **Dynamic Fallback:** GeoNames API (preferred) → Google Places API Text Search (final fallback)
        - **ISO Country Code Mapping:** Maps user-friendly names to ISO alpha-2 codes (UK→GB, US→US, Ireland→IE, Australia→AU, Canada→CA, etc.). Recognizes major cities (London, Melbourne, Medellín, Kyoto) and maps to correct country codes
        - **Region API Endpoints:**
            - `GET /api/regions/list?country=UK&granularity=county` - Returns RegionsResult with source, country_code, regions[]
            - `GET /api/regions/debug/supported` - Lists all available datasets
            - `POST /api/regions/clear-cache` - Clears cached regions
        - **Natural Language Job Creation:** Auto-detects patterns like "Run dentists across all London boroughs" and creates jobs automatically
        - **Job Control Commands:** "status job <id>", "pause job <id>", "resume job <id>", "cancel job <id>"
        - **Background Worker:** Processes regions sequentially with 500ms delay, passes region.country_code (ISO alpha-2) to Bubble's run_search_for_region workflow for Google Places integration
        - **Progress Tracking:** Real-time status updates with processed/failed region tracking and percentage complete
        - **Startup Documentation:** Server prints example API endpoints and dataset statistics on startup
    - **Stub Endpoint:** `/api/tool/add_note` for future Bubble integration.
    - **Location Hints Database:** PostgreSQL table with 29,483+ worldwide location records (countries, cities, subcountries) sourced from CSV. Features:
        - **Performance-Optimized Search:** pg_trgm extension with GIN indexes on lower(country), lower(subcountry), lower(town_city) for efficient case-insensitive searches. Composite index on (country, town_city) for common query patterns.
        - **Search API Endpoints:**
            - `GET /api/location-hints/search?query=<term>&country=<optional>&limit=<1-100>&offset=<num>` - Smart search with prefix-first ranking, pagination, and 2-character minimum. Returns results with metadata (limit, offset, hasMore).
            - `GET /api/location-hints/countries` - Lists all countries with city counts
            - `GET /api/location-hints/by-country?country=<name>&limit=<num>` - Get locations for specific country
        - **Data Coverage:** Top countries include United States (3,307 cities), India (2,522), China (1,965), Brazil (1,319), Japan (1,232), Germany (1,117), Russian Federation (1,103), United Kingdom (853), Spain (735), France (669)
        - **Import Script:** `server/load-location-hints.ts` parses CSV and loads data in batches using neon serverless client
        - **Location Ambiguity Resolver** (`server/locationResolver.ts`, `server/locationGuard.ts`): Intelligent location disambiguation system that queries the 29k cities database to handle ambiguous location names:
            - **UK Synonym Handling:** Recognizes UK synonyms (United Kingdom, UK, Great Britain, GB, England, Scotland, Wales, Northern Ireland) as equivalent for matching
            - **Conservative Warning Logic:** Never auto-switches default country; instead warns users and asks them to manually change the dropdown:
                - **Single non-default match:** Shows warning message, proceeds with current default
                - **Multiple non-default matches:** Shows disambiguation message, STOPS and asks user to change dropdown first
            - **Silent Default Match:** If the location exists in the default country (including UK synonyms), proceeds silently without prompts
            - **Integration Point:** Wired into `server/routes.ts` bubble_run_batch tool handler - checks params.country before workflow execution
- **Streaming Responses:** Server-Sent Events (SSE) for real-time AI responses and animated typing indicators.
- **Error Handling:** Comprehensive error messages as system notifications.
- **Conversational Planning:** A three-way GPT planner decides whether to "search" (discover new venues), "use_cache" (more results from existing searches), or "respond" (for general conversational questions), preventing unnecessary searches and ensuring venue deduplication.
- **Persistent Memory System:** Database-backed conversation history and knowledge accumulation for long-term context and proactive assistance. Features:
    - **Conversation Persistence:** All chat messages saved to PostgreSQL with conversation IDs maintained across sessions
    - **Fact Extraction:** Automatic extraction of user preferences, business requirements, and contextual information after each conversation using GPT-4
    - **Knowledge Scoring:** Facts rated 0-1 for importance, with high-score facts (≥0.7) automatically included in future AI context
    - **ConversationId Round-Trip:** Backend generates conversation IDs and streams them to frontend via SSE; frontend captures and maintains IDs for session continuity
    - **Context Building:** Historical conversations and extracted facts combined to provide personalized, context-aware responses
    - **Memory Debug View:** Developer interface at `/debug` for inspecting conversations, messages, and extracted facts in real-time with 5-second auto-refresh
    - **API Endpoints:** 
        - `GET /api/debug/conversations` - List all stored conversations
        - `GET /api/debug/conversations/:id/messages` - View messages in a specific conversation
        - `GET /api/debug/facts` - View all extracted facts with scores and metadata
- **Data Models:** Standardized `ChatMessage`, `ChatRequest`, `AddNoteRequest`, `BubbleRunBatchRequest`, and associated response schemas are defined. Database schemas include `conversations`, `messages`, and `facts` tables.
- **Backend Validation:** Zod schema validation is used on all endpoints, with CORS enabled.

## External Dependencies
- **OpenAI GPT-5:** For AI chat responses, prospect enrichment, and web search capabilities.
- **Google Places API (New v1):** For business discovery and location-based searches.
- **GeoNames API:** For worldwide administrative region discovery and geocoding. Provides ADM1 (states/provinces) and ADM2 (counties/departments) data with 24-hour caching.
- **Bubble:** External platform for backend workflows, integrated via dedicated API endpoints for batch operations.