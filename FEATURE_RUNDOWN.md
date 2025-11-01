# Wyshbone Chat Agent - Comprehensive Feature Rundown

## Executive Summary
Production-ready multi-tenant AI-powered chat and research platform designed for Bubble integration. Provides intelligent lead generation, deep research capabilities, scheduled monitoring, and persistent knowledge management with enterprise-grade security.

---

## 1. CORE PLATFORM CAPABILITIES

### 1.1 Multi-Tenant Architecture (Production-Ready)
- **Session-Based Authentication**: Secure iframe embedding via session tokens with shared secret validation
- **30-Minute Session Expiry**: Auto-cleanup of expired sessions
- **Complete Data Isolation**: 17+ protected API endpoints with user-scoped data filtering
- **Cross-Tenant Security**: 401/403 error handling, resource ownership verification, audit logging
- **Development Mode**: URL parameter fallback for testing
- **PostgreSQL Storage**: User sessions table with automatic expiry management

### 1.2 AI Chat System
- **GPT-5 Integration**: Real-time conversational AI with streaming responses
- **Server-Sent Events (SSE)**: Live typing indicators and progressive message delivery
- **Intelligent Context Management**: Prioritizes recent conversation over historical facts
- **UK-Focused Responses**: Configurable regional focus with practical, concise outputs
- **Web Search Integration**: Real-time information retrieval via OpenAI API
- **Multi-Tool Support**: Extensible architecture for custom tools and integrations

---

## 2. RESEARCH & INTELLIGENCE FEATURES

### 2.1 Deep Research System
- **Comprehensive Analysis**: Multi-source research with GPT-5 orchestration
- **Context Extraction**: Automatically interprets vague prompts ("deep dive", "yes") by analyzing conversation history
- **Report Management**: Full CRUD operations with ownership verification
- **Auto-Summarization**: GPT-4o-powered summaries with typo-tolerant detection ("sumarise", "tldr")
- **Session Tracking**: IP-based tracking of last viewed reports for smart summarization
- **Duplicate Prevention**: Intelligent report tracking and reuse

### 2.2 Contact Finding & Lead Generation
- **Wyshbone Global Database**: Verified business discovery with operational status filtering
- **Prospect Enrichment**: AI-powered extraction of domains, emails, social links, classification
- **Lead Scoring**: Automated scoring system for prospect qualification
- **Public Contact Discovery**: Strict verification with source URL validation
- **Bubble Workflow Integration**: Batch processing with dynamic parameter mapping

### 2.3 Location Intelligence (Global Coverage)
- **29,483 Worldwide Locations**: Pre-seeded database across 200+ countries
- **Intelligent Resolution**: Natural language parsing with city hints and local dictionaries
- **GeoNames Integration**: Tri-layer API with caching, rate limiting, exponential backoff
- **482+ Static Region Datasets**: UK counties, US states, global administrative regions
- **Ambiguity Detection**: Smart disambiguation with synonym handling (e.g., UK location names)
- **Country Mismatch Alerts**: Conservative warnings without auto-switching defaults

---

## 3. AUTOMATION & MONITORING

### 3.1 Scheduled Monitors (Agentic System)
- **AI-Powered Creation**: Natural language monitor setup via chat interface
- **Full CRUD Operations**: Complete lifecycle management via API
- **Flexible Scheduling**: Daily, weekly, biweekly, monthly with day/time specification
- **Monitor Types**: Deep research, business search, Wyshbone Global Database queries
- **UK Timezone Support**: Smart date/time calculation with proper timezone handling
- **Conversation Linking**: Each monitor creates/links to dedicated conversation threads

### 3.2 Email Notifications (Resend Integration)
- **Professional HTML Templates**: Responsive email designs with result summaries
- **Toggle On/Off**: Per-monitor email notification control
- **Automatic Credential Management**: Replit Resend connector handles API keys
- **Result Summaries**: Run details, result counts, direct application links
- **Template System**: Extensible email template architecture

### 3.3 Background Job System
- **Global Job Management**: Run searches across geographic areas worldwide
- **Natural Language Jobs**: Auto-creation from commands ("Run dentists across all London boroughs")
- **Job Control**: Status, pause, resume, cancel commands
- **Sequential Processing**: Region-by-region execution with ISO alpha-2 country codes
- **Real-Time Progress**: Live status updates and completion tracking

---

## 4. KNOWLEDGE & MEMORY SYSTEM

### 4.1 Persistent Memory
- **Conversation Persistence**: All chat messages stored in PostgreSQL with full history
- **Fact Extraction**: Automatic extraction of preferences, requirements, contextual info
- **Intelligent Scoring**: 0-100 importance scoring with recency boost algorithm
- **Category Classification**: industry/place/subject/preference/general taxonomies
- **Context Building**: Combines historical conversations with extracted facts
- **Priority Architecture**: Current conversation (last 5-10 messages) prioritized over stored facts

### 4.2 Conversation Management
- **ConversationId Round-Trip**: Backend-generated IDs streamed to frontend
- **Auto-Generated Labels**: GPT-powered conversation labeling from message content
- **Label Regeneration**: One-time bulk update system for existing conversations
- **New Chat Feature**: Clears visual thread while preserving learned facts
- **Thread Navigation**: Click-to-load conversation history from sidebar
- **Message History**: Full message playback with user/assistant attribution

### 4.3 Developer Tools
- **Memory Debug Interface**: `/debug` endpoint for inspecting conversations, messages, facts
- **User Profile Summary**: Aggregated view of extracted knowledge per user
- **Fact Inspector**: Browse and analyze extracted facts by category and score
- **Conversation Explorer**: Full conversation thread viewer with message details

---

## 5. BUBBLE INTEGRATION

### 5.1 Workflow Automation
- **Batch Processing**: Natural language batch workflow execution
- **Configurable Delays**: Per-request timing controls
- **Dynamic Parameter Mapping**: Flexible workflow input configuration
- **Multi-Country Support**: Automatic location detection and country handling
- **Mandatory Confirmation**: User approval flow for all batch requests
- **Error Handling**: Comprehensive error capture and user feedback

### 5.2 API Endpoints
- **Create Session**: `POST /api/create-session` - Shared secret validation
- **Validate Session**: `GET /api/validate-session/:sessionId` - Token verification
- **Add Note**: `POST /api/tool/add_note` - Future Bubble integration stub
- **Batch Workflow**: Natural language trigger system with parameter extraction

---

## 6. USER EXPERIENCE & INTERFACE

### 6.1 Modern UI Design
- **Design Inspiration**: ChatGPT, Linear, Slack patterns
- **Dark Mode**: Full theme switching with localStorage persistence
- **Inter Font**: Professional typography throughout
- **WCAG AA Compliance**: Accessibility-first design principles
- **Responsive Layout**: Mobile-friendly interface with adaptive components

### 6.2 Chat Interface
- **Real-Time Streaming**: Live AI responses with typing indicators
- **Auto-Expanding Input**: Dynamic textarea with smart height adjustment
- **Message Threading**: Clear user/assistant message distinction
- **Error Notifications**: System messages for comprehensive error feedback
- **Loading States**: Skeleton screens and loading indicators

### 6.3 Sidebar Features
- **Collapsible Design**: Expandable/collapsible sidebar with persistent state
- **Default Country Selector**: UK default with localStorage persistence
- **Conversation History**: Chronological list with auto-generated labels
- **Monitor Management**: Live status indicators, next run times, type badges
- **Email Notification Icons**: Visual indicators for monitors with email enabled
- **Theme Toggle**: Easy dark/light mode switching

### 6.4 Monitor UI Components
- **Live Status Indicators**: Active/inactive badges
- **UK Date/Time Format**: DD/MM/YYYY with 24-hour time throughout
- **Type Badges**: Research/Contacts/Places visual labels
- **Edit Dialog**: Update label, schedule, frequency, time, email preference
- **Delete Confirmation**: Safety dialogs prevent accidental deletions
- **Conversation Navigation**: One-click access to monitor conversation threads

---

## 7. TECHNICAL ARCHITECTURE

### 7.1 Technology Stack
- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Vite
- **UI Framework**: Tailwind CSS, shadcn/ui
- **State Management**: TanStack Query (React Query v5)
- **Routing**: Wouter (lightweight routing)
- **Database**: PostgreSQL (Neon-backed)
- **ORM**: Drizzle ORM with Zod validation
- **AI**: OpenAI GPT-5, GPT-4o, GPT-4o-mini

### 7.2 Database Schema
- **Tables**: user_sessions, conversations, messages, facts, scheduled_monitors, location_hints, deep_research_reports, jobs
- **Data Isolation**: userId/created_by_email fields on all user-scoped tables
- **Indexes**: Optimized queries with strategic indexing
- **Validation**: Drizzle-Zod schemas for type-safe operations

### 7.3 API Architecture
- **17+ Protected Endpoints**: Complete authentication middleware coverage
- **Zod Validation**: Request/response validation on all endpoints
- **CORS Enabled**: Cross-origin support for iframe embedding
- **Error Standards**: Consistent 401/403/404/500 error handling
- **Streaming Support**: SSE for real-time AI responses
- **Session Headers**: x-session-id for authenticated requests

### 7.4 Security Features
- **Shared Secret Validation**: BUBBLE_SHARED_SECRET environment variable
- **Session Token System**: Cryptographically secure session IDs
- **Resource Ownership Checks**: Verify user owns data before operations
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM
- **XSS Protection**: React's built-in sanitization
- **Audit Logging**: Warning logs for unauthorized access attempts

---

## 8. INTELLIGENT SYSTEMS

### 8.1 Conversational Planning
- **GPT-Based Planner**: Decides "search", "use_cache", or "respond" actions
- **Venue Deduplication**: Prevents duplicate searches
- **Cache Intelligence**: Smart decision on when to use cached vs. fresh data
- **Natural Query Support**: Conversational queries without unnecessary searches

### 8.2 Context Understanding
- **Vague Prompt Detection**: Pattern matching for "deep dive", "yes", "go ahead", etc.
- **Topic Extraction**: GPT-4o-mini analyzes last 8 messages for context
- **Prompt Enhancement**: Server-side replacement of vague prompts with extracted topics
- **Confirmation Flow**: Asks user to confirm when topics inferred from context
- **Source Validation**: Distinguishes explicit vs. inferred topics

### 8.3 Smart Scheduling
- **Timezone Awareness**: UK timezone calculations for next run dates
- **Time Calculation**: Handles day changes, week boundaries, month rollovers
- **Frequency Management**: Daily/weekly/biweekly/monthly logic
- **Past-Time Handling**: Automatically advances to next valid run time
- **Edit Recalculation**: Updates next run when schedule modified

---

## 9. DATA QUALITY & VERIFICATION

### 9.1 Contact Discovery Standards
- **Public Data Only**: No guessing of private contact information
- **Source URL Verification**: Strict validation of contact info sources
- **Wyshbone Global Database Priority**: Authoritative source for business discovery
- **Operational Status Filtering**: Only active/operational businesses
- **Lead Score Validation**: AI-based qualification scoring

### 9.2 Location Data Quality
- **Pre-Seeded Database**: 29,483 verified worldwide locations
- **Multi-Source Validation**: City hints, local dictionaries, GeoNames fallback
- **Synonym Handling**: UK location name variations (e.g., "Greater London" vs "London")
- **Conservative Warnings**: Alerts user without auto-changing settings
- **Country Code Standardization**: ISO alpha-2 country codes throughout

---

## 10. EXTERNAL INTEGRATIONS

### 10.1 OpenAI Integration
- **GPT-5**: Primary chat and research model
- **GPT-4o**: Report summarization and complex analysis
- **GPT-4o-mini**: Context extraction and quick tasks
- **Web Search**: Real-time information via OpenAI API
- **Streaming Support**: Server-Sent Events for live responses

### 10.2 Wyshbone Global Database
- **Business Discovery**: Verified business listings with operational status
- **Place IDs**: Unique identifiers for business entities
- **Location-Based Search**: Geographic area searches with filters
- **Contact Information**: Phone, website, address extraction
- **Hours & Status**: Operating hours and business status verification

### 10.3 GeoNames API
- **Administrative Regions**: Country-specific ADM1/ADM2 level data
- **Geocoding**: Location name to coordinates resolution
- **Tri-Layer Caching**: Fast lookups with fallback to API
- **Rate Limiting**: Exponential backoff for API protection
- **Global Coverage**: Worldwide location data access

### 10.4 Resend API
- **Transactional Emails**: Monitor completion notifications
- **HTML Templates**: Professional responsive email designs
- **Automatic Credentials**: Replit connector manages API keys
- **Delivery Tracking**: Email send status and error handling

---

## 11. SCALABILITY & PERFORMANCE

### 11.1 Caching Strategies
- **Location Data Caching**: Static 482+ region datasets for instant lookup
- **GeoNames Caching**: Tri-layer cache reduces API calls
- **Session Caching**: Fast session validation lookups
- **Fact Caching**: Efficient knowledge retrieval with scoring

### 11.2 Query Optimization
- **Database Indexes**: Strategic indexing on userId, conversationId, sessionId
- **TanStack Query**: Smart client-side caching and invalidation
- **Pagination Support**: Location hints API with page-based results
- **Lazy Loading**: On-demand data fetching for conversations

### 11.3 Background Processing
- **Job Queue System**: Sequential region processing for large jobs
- **Rate Limiting**: API protection with exponential backoff
- **Session Cleanup**: Automatic expiry of old sessions
- **Monitor Execution**: Scheduled task runner for monitors

---

## 12. DEVELOPMENT & DEPLOYMENT

### 12.1 Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **Drizzle Kit**: Database migrations and schema management
- **Vite**: Fast development server with hot reload
- **shadcn/ui**: Pre-built accessible UI components
- **Lucide Icons**: Comprehensive icon library

### 12.2 Code Quality
- **Zod Validation**: Runtime type validation for all API endpoints
- **Shared Schemas**: Consistent types between frontend and backend
- **Error Boundaries**: Graceful error handling throughout
- **LSP Support**: Full TypeScript language server integration
- **Modular Architecture**: Clean separation of concerns

### 12.3 Production Readiness
- **Environment Variables**: Secure secrets management (BUBBLE_SHARED_SECRET, RESEND_API_KEY, OPENAI_API_KEY)
- **Session-Based Auth**: Production-ready iframe embedding
- **Error Logging**: Comprehensive server-side logging
- **CORS Configuration**: Secure cross-origin settings
- **Database Migrations**: Safe schema evolution with Drizzle

---

## 13. UNIQUE DIFFERENTIATORS

1. **Multi-Tenant Data Isolation**: Enterprise-grade security with complete user separation
2. **Agentic Monitoring**: AI-powered creation of recurring research tasks
3. **Global Location Intelligence**: 29,483 worldwide locations with smart disambiguation
4. **Context-Aware Research**: Automatically interprets vague prompts using conversation history
5. **Persistent Memory**: Facts accumulate over time while prioritizing current conversation
6. **Bubble Integration**: Seamless workflow automation with iframe embedding
7. **Email Notifications**: Professional reports delivered on schedule completion
8. **UK-Focused Design**: Dates, times, and defaults optimized for UK users
9. **Conversational Planning**: Intelligent cache vs. search decisions
10. **Auto-Summarization**: Smart detection and summarization of previous research

---

## 14. BUSINESS USE CASES

### Lead Generation
- Schedule recurring searches for target industries in specific regions
- Enrich prospects with AI-powered contact discovery
- Score leads automatically based on business criteria
- Export to Bubble workflows for CRM integration

### Market Research
- Deep research on industries, competitors, locations
- Auto-summarization of complex research reports
- Persistent knowledge accumulation about markets
- Scheduled monitoring of market changes

### Location-Based Intelligence
- Global coverage across 200+ countries
- Job automation for multi-region searches
- Location disambiguation for accurate targeting
- Integration with Wyshbone Global Database for verified data

### Customer Support & Intelligence
- Persistent memory learns customer preferences over time
- Context-aware responses using conversation history
- Multi-tenant isolation for agency/SaaS use cases
- Scheduled monitoring of customer inquiries

---

## 15. METRICS & STATISTICS

- **17+ Protected API Endpoints** with full authentication
- **29,483 Pre-Seeded Locations** across 200+ countries
- **482+ Static Region Datasets** for instant lookups
- **30-Minute Session Expiry** with automatic cleanup
- **7 Database Tables** with complete user isolation
- **3 AI Models** (GPT-5, GPT-4o, GPT-4o-mini) for specialized tasks
- **4 External APIs** (OpenAI, Wyshbone Global Database, GeoNames, Resend)
- **4 Monitor Types** (Deep Research, Business Search, Wyshbone Global Database, Custom)
- **5 Schedule Frequencies** (Daily, Weekly, Biweekly, Monthly, Custom)
- **6 Fact Categories** (Industry, Place, Subject, Preference, General, System)

---

## 16. FUTURE EXTENSIBILITY

The architecture supports:
- Additional AI models and providers
- Custom tool integrations
- Extended Bubble workflow types
- Additional external data sources
- Multi-language support
- Custom report templates
- Advanced analytics dashboards
- White-label configurations
- API access for third parties
- Webhook integrations
