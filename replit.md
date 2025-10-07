# Wyshbone Chat Agent

A modern AI chat interface built with Node.js, Express, and React that integrates with OpenAI's GPT-5 model. This application provides a clean, professional chat experience with tool integration capabilities.

## Project Overview

**Purpose**: AI-powered chat assistant for Wyshbone with practical, UK-focused responses and tool integration capabilities.

**Tech Stack**:
- Backend: Node.js, Express, TypeScript
- Frontend: React, TypeScript, Tailwind CSS, shadcn/ui
- AI: OpenAI GPT-5
- State Management: TanStack Query (React Query)

## Features

### Core Functionality
- **AI Chat Interface**: Real-time conversations with GPT-5 powered AI assistant
- **System Prompt**: Wyshbone AI personality - concise, practical, UK-focused
- **Tool Integration**: Stub endpoint for Bubble integration (add notes to leads)
- **Theme Toggle**: Dark/Light mode support with smooth transitions
- **Error Handling**: Comprehensive error messages displayed as system notifications
- **Loading States**: Animated typing indicators during AI responses

### API Endpoints

#### POST /api/chat
- **Input**: `{ messages: [{role, content}], user: {id, email} }`
- **Output**: `{ reply: "..." }`
- Integrates with OpenAI GPT-5
- Adds Wyshbone system prompt automatically
- Returns AI-generated response

#### POST /api/places/search
- **Input**: `{ query, locationText?, lat?, lng?, radiusMeters?, typesFilter?, maxResults? }`
- **Output**: `{ results: [{placeId, resourceName, name, address, businessStatus, phone, website, types, rating, userRatingCount, location}], generated_at }`
- Uses Google Places API (New v1) for verified business discovery
- Filters to OPERATIONAL businesses only
- Returns real Google Place IDs (never fabricated)
- Supports location bias via coordinates or text resolution

#### POST /api/prospects/enrich
- **Input**: `{ items: [{placeId, name, address, website?, phone?}], concurrency?, contacts? }`
- **Output**: `{ enriched: [{...original, domain, contact_email, socials, category, summary, suggested_intro, lead_score, contacts?}] }`
- Uses OpenAI Responses API with web_search for enrichment
- Adds domain, contact email, social links, business classification
- Generates summary and suggested outreach intro
- Calculates lead score (0-100) based on online presence
- Enforces exact Place ID matching (no fabrication)
- **Optional contacts enrichment**: Set `contacts.enabled=true` to discover public contacts (managers, owners)
  - Supports roles filtering, maxPerPlace, minConfidence thresholds
  - Returns only PUBLIC contact info with verifiable source URLs
  - Never guesses emails, phone numbers, or names

#### POST /api/prospects/enrich_contacts
- **Input**: `{ items: [{placeId, name, address, website?}], roles?, maxPerPlace?, minConfidence?, concurrency? }`
- **Output**: `{ enriched: [{placeId, contacts: [{name, title, role_normalized, source_url, source_type, confidence, email_public?, phone_public?, linkedin_url?}]}] }`
- Contacts-only enrichment endpoint
- Discovers public contact information (managers, owners) with strict guardrails
- Filters by role, confidence threshold, and max contacts per place
- Requires verifiable source URL for each contact
- No email/phone guessing - only returns clearly published public information

#### POST /api/prospects/search_and_enrich
- **Input**: `{ query, locationText?, lat?, lng?, radiusMeters?, typesFilter?, maxResults?, enrich?, concurrency? }`
- **Output**: `{ verified: true, results: [{...places data, ...enrichment data}], generated_at }`
- Combined endpoint: searches Google Places first, then enriches with GPT
- End-to-end prospecting workflow in one call
- Can disable enrichment with `enrich: false`

#### POST /api/tool/add_note
- **Input**: `{ userToken, leadId, note }`
- **Output**: `{ ok: true }`
- Currently a stub that logs payload to console
- Ready for future Bubble Backend Workflow integration

### UI Components

**Header**
- Wyshbone AI branding with logo
- "Add Note to Bubble" demo button
- Theme toggle (dark/light mode)

**Chat Interface**
- Message display area with smooth scrolling
- User messages: right-aligned, primary accent color
- AI messages: left-aligned with avatar icon
- System messages: centered notifications for success/error
- Empty state with welcome message

**Input Area**
- Auto-expanding textarea (min 48px, max 200px)
- Keyboard shortcuts: Enter to send, Shift+Enter for new line
- Send button with disabled state during loading
- Accessible focus indicators (2px accent ring)

## Architecture

### Data Models (shared/schema.ts)
- `ChatMessage`: `{ role: "user" | "assistant" | "system", content: string }`
- `ChatRequest`: `{ messages: ChatMessage[], user: {id, email} }`
- `ChatResponse`: `{ reply: string }`
- `AddNoteRequest`: `{ userToken, leadId, note }`
- `AddNoteResponse`: `{ ok: boolean }`

### Frontend Structure
- `client/src/pages/chat.tsx`: Main chat interface component
- `client/src/App.tsx`: Application router
- State managed in React component (no persistence)
- TanStack Query for API calls with proper error handling

### Backend Structure
- `server/routes.ts`: API route handlers
- `server/openai.ts`: OpenAI client configuration
- CORS enabled for all routes
- Zod schema validation on all endpoints

## Recent Changes (October 2025)

1. **Initial Implementation**
   - Created chat UI with message display, input area, and header
   - Implemented POST /chat endpoint with OpenAI GPT-5 integration
   - Added POST /tool/add_note stub endpoint
   - Configured CORS middleware

2. **Error Handling & Accessibility**
   - Added error handling for chat and tool mutations
   - Implemented proper focus states on textarea (2px accent ring)
   - Removed emoji characters in favor of text-based messages
   - Fixed TypeScript errors in API response handling

3. **Testing & Validation**
   - Comprehensive end-to-end testing completed
   - Verified chat functionality with GPT-5 responses
   - Confirmed tool button integration
   - Validated theme toggle functionality
   - Ensured accessibility standards (WCAG AA)

4. **Google Places Integration & GPT Enrichment (October 7, 2025)**
   - Added `searchPlaces()` function to server/googlePlaces.ts for Places v1 API
   - Implemented POST /api/places/search endpoint for verified business discovery
   - Implemented POST /api/prospects/enrich endpoint for GPT-powered enrichment
   - Implemented POST /api/prospects/search_and_enrich combined endpoint
   - Updated system prompt to enforce Places-first workflow
   - Added backend validation to prevent Place ID fabrication
   - Created README.md with curl examples for all new endpoints
   - All endpoints filter to OPERATIONAL businesses only
   - Enrichment uses OpenAI Responses API with web_search and JSON schema

5. **Public Contact Discovery (October 7, 2025)** ✅ COMPLETED
   - Extended POST /api/prospects/enrich with optional contact enrichment
   - Added POST /api/prospects/enrich_contacts for contacts-only enrichment
   - Implemented strict guardrails: only PUBLIC info with verifiable source URLs
   - Never guesses personal emails, phone numbers, or names
   - Contact schema includes: name, title, role_normalized, source_url, source_type, confidence, email_public, phone_public, linkedin_url, notes
   - Supports role filtering, maxPerPlace limits, and minConfidence thresholds
   - Backend validation enforces: source URL validation (HTTP/HTTPS), role matching, confidence threshold, Place ID integrity
   - Place ID mismatches are rejected (not overwritten) to prevent hallucinated data
   - Updated system prompt to emphasize public-only contact discovery
   - Added curl examples to README for contact enrichment
   - Fixed JSON schema validation: added required arrays and additionalProperties: false to all schemas
   - Tested successfully with real UK pub data (The Swan Hotel, Arundel) returning verified contacts

6. **Intelligent Search Flow with Venue Deduplication (October 7, 2025)** ✅ COMPLETED
   - Refactored POST /api/search to use GPT planner that decides when to search vs. use cached venues
   - Updated SYSTEM_PROMPT to remove "ALWAYS call /api/places/search first" - now GPT evaluates context
   - Implemented 3-step architecture:
     1. GPT Planner analyzes query + conversation + venue cache → decides "search" or "use_cache"
     2. If "search": calls Google Places API as PRIMARY source (not web search)
     3. GPT Formatter creates response from cached venues, marks them as served
   - Added venue cache system (server/memory.ts) tracking served/unserved venues per session
   - Prevents duplicate results: "find 5 pubs" then "find 5 more" returns different venues
   - Google Places remains the authoritative source - web enrichment happens separately
   - Tested successfully: follow-up queries return completely different venues (no overlaps)

7. **Three-Way Planner with Conversational Support (October 7, 2025)** ✅ COMPLETED
   - Fixed regression where conversational questions triggered venue searches
   - Extended planner to support THREE actions: "search", "use_cache", and "respond"
   - **"search"** - User wants to discover new venue listings (e.g., "find pubs in London")
   - **"use_cache"** - User wants more results from existing search (e.g., "show 5 more")
   - **"respond"** - User asks conversational/analytical questions (e.g., "how many pubs are in London?", "what makes a good pub?")
   - Added conversational response format: `{conversational: true, answer: "...", generated_at}`
   - Fixed OpenAI API requirement: planner prompt must contain lowercase "json" for json_object response format
   - Tested successfully: conversational questions return estimates/discussion, not venue lists
   - System now correctly distinguishes between search intent vs. conversation

## Environment Variables

- `OPENAI_API_KEY`: Required for OpenAI GPT-5 integration and prospect enrichment
- `GOOGLE_MAPS_API_KEY`: Required for Google Places API (New v1) business discovery
- `SESSION_SECRET`: Pre-configured session secret

## Design Guidelines

The application follows modern Material Design principles with inspiration from ChatGPT, Linear, and Slack. See `design_guidelines.md` for complete design specifications including:
- Color palette (dark mode primary, light mode secondary)
- Typography (Inter font family, hierarchical sizing)
- Spacing system (Tailwind units: 2, 4, 6, 8, 12, 16)
- Component specifications
- Interaction patterns
- Accessibility requirements

## Future Enhancements

1. **Bubble Integration**: Connect `/tool/add_note` to actual Bubble Backend Workflow URL
2. **Message Persistence**: Store chat history in database
3. **User Authentication**: Add login/session management
4. **Additional Tools**: Expand tool integration capabilities
5. **Streaming Responses**: Implement streaming for real-time AI responses
6. **Message History**: Virtualize long chat histories for performance

## Running the Project

The application runs on port 5000 with both frontend and backend served together:
```
npm run dev
```

Visit `http://localhost:5000` to access the chat interface.
