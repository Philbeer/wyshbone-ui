# Wyshbone Chat Agent

## Overview
The Wyshbone Chat Agent is an AI-powered chat assistant designed to provide a clean, professional, and practical chat experience with a focus on UK-centric responses. It integrates with OpenAI's GPT-5 to facilitate business discovery, lead enrichment, and the triggering of Bubble workflows, aiming to streamline prospecting and lead management for Wyshbone.

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
    - **Location Hints Database:** A PostgreSQL table with 29,483+ worldwide location records, optimized for performance with `pg_trgm` and GIN indexes. Includes a smart search API with pagination and country filtering.
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
- **Data Models:** Standardized schemas for `ChatMessage`, `ChatRequest`, `AddNoteRequest`, `BubbleRunBatchRequest`, and database tables (`conversations`, `messages`, `facts`).
- **Backend Validation:** Zod schema validation is used on all endpoints, with CORS enabled.

## External Dependencies
- **OpenAI GPT-5:** For AI chat responses, prospect enrichment, and web search.
- **Google Places API (New v1):** For business discovery and location-based searches.
- **GeoNames API:** For worldwide administrative region discovery and geocoding.
- **Bubble:** External platform for backend workflows, integrated via dedicated API endpoints.