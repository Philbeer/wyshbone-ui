# Wyshbone UI Repository - Complete System Analysis

> **Generated:** December 31, 2024  
> **Repository:** wyshbone-ui  
> **Purpose:** Comprehensive documentation of the Wyshbone CRM application architecture

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Chat System Architecture](#chat-system-architecture)
7. [Tool Integration](#tool-integration)
8. [Authentication](#authentication)
9. [Feature Status Matrix](#feature-status-matrix)
10. [Key Files Inventory](#key-files-inventory)
11. [Environment Variables](#environment-variables)
12. [Dependencies](#dependencies)
13. [Known Issues](#known-issues)
14. [Related Repositories](#related-repositories)

---

## Overview

### What is Wyshbone UI?

Wyshbone is an **AI-powered sales assistant CRM** that helps users:
- Find businesses via Google Places API
- Perform deep research on markets/companies using OpenAI
- Find contact emails using Hunter.io integration
- Set up scheduled monitoring for business changes
- Manage CRM data (customers, orders, products)
- Special brewery CRM vertical with inventory, containers, duty reports

### Main Purpose

The application provides an "Agent First, CRM Second" approach where:
1. **AI Sales Agent** - Chat interface that uses Claude/GPT to execute tools automatically
2. **CRM System** - Traditional CRUD operations for managing business data
3. **Automation** - Scheduled monitors, nudges, and proactive suggestions

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  React + Vite + Tailwind + TanStack Query + wouter (router)     │
├─────────────────────────────────────────────────────────────────┤
│                         BACKEND                                  │
│  Express.js API Server (Node.js + TypeScript)                   │
├─────────────────────────────────────────────────────────────────┤
│                     EXTERNAL SERVICES                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Claude  │  │ OpenAI  │  │ Google  │  │ Supabase│            │
│  │ API     │  │ API     │  │ Places  │  │ Realtime│            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                        DATABASE                                  │
│  PostgreSQL via Drizzle ORM (Neon/Supabase serverless)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
wyshbone-ui/
├── client/                    # React Frontend
│   ├── src/
│   │   ├── App.tsx           # Main router & layout
│   │   ├── main.tsx          # Entry point
│   │   ├── index.css         # Tailwind + custom CSS
│   │   ├── api/              # API client utilities
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/          # shadcn/ui base components
│   │   │   ├── agent/       # Agent-first chat components
│   │   │   ├── mobile/      # Mobile-specific components
│   │   │   ├── results/     # Results panel components
│   │   │   └── tower/       # Tower integration components
│   │   ├── contexts/        # React contexts (User, Plan, Results)
│   │   ├── features/        # Feature modules (CRM, Leads, Brewery)
│   │   ├── hooks/           # Custom React hooks
│   │   ├── layouts/         # Layout components (Desktop, Mobile)
│   │   ├── lib/             # Utilities (queryClient, supabase)
│   │   ├── pages/           # Route pages
│   │   │   ├── chat.tsx     # Main chat page
│   │   │   ├── crm/         # CRM pages
│   │   │   └── brewcrm/     # Brewery CRM pages
│   │   ├── services/        # API services (ClaudeService)
│   │   └── verticals/       # Industry vertical configs
│   └── vite.config.ts
│
├── server/                    # Express Backend
│   ├── index.ts              # Server entry point
│   ├── routes.ts             # All API routes (~12,000 lines)
│   ├── storage.ts            # Database operations
│   ├── auth.ts               # Authentication utilities
│   ├── deepResearch.ts       # OpenAI Responses API integration
│   ├── googlePlaces.ts       # Google Places API
│   ├── batchService.ts       # Hunter.io email finder
│   ├── leadClarification.ts  # Intent detection
│   ├── intent-detector.ts    # Chat intent classification
│   ├── memory.ts             # Conversation memory
│   ├── monitor-executor.ts   # Scheduled monitor execution
│   ├── lib/
│   │   ├── actions.ts        # Tool execution registry
│   │   ├── agent-kernel.ts   # Autonomous orchestrator
│   │   └── towerClient.ts    # Tower logging client
│   └── routes/
│       ├── nango.ts          # OAuth integrations
│       └── xero-oauth.ts     # Xero accounting integration
│
├── shared/                    # Shared Types & Schema
│   ├── schema.ts             # Drizzle ORM schema (all tables)
│   └── conversationConfig.ts # Chat system prompts
│
├── supervisor/               # SUPERVISOR SERVICE (separate app)
│   ├── server/
│   │   ├── supervisor.ts     # Main polling service
│   │   ├── plan-executor.ts  # Plan execution logic
│   │   ├── actions/
│   │   │   ├── registry.ts   # Action type definitions
│   │   │   └── executors.ts  # Tool implementations
│   │   └── routes.ts         # Supervisor API
│   └── client/              # Supervisor debug UI
│
├── tower/                    # TOWER SERVICE (evaluation/QA)
│   ├── server/              # Evaluation API
│   ├── client/              # Tower dashboard
│   └── src/evaluator/       # Auto-evaluation logic
│
├── docs/                     # Documentation
├── tests/                    # Playwright tests
├── drizzle/                  # Database migrations
└── migrations/               # Legacy migrations
```

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| Vite | 7.x | Build tool |
| TypeScript | 5.6.3 | Type safety |
| Tailwind CSS | 4.x | Styling |
| TanStack Query | - | Data fetching & caching |
| wouter | - | Lightweight routing |
| shadcn/ui | - | Component library |
| Lucide Icons | - | Icon library |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | - | Runtime |
| Express | 4.21.x | HTTP server |
| Drizzle ORM | 0.44.x | Database queries |
| PostgreSQL | - | Database (via Neon/Supabase) |
| Zod | 3.24.x | Schema validation |

### AI/ML Services
| Service | Purpose |
|---------|---------|
| Anthropic Claude API | Chat intelligence (Agent-First UI) |
| OpenAI GPT-4/Responses API | Deep research, intent detection |
| Google Places API | Business search |
| Hunter.io | Email finding |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL hosting + Realtime |
| Stripe | Subscription payments |
| Resend | Email notifications |
| Xero | Accounting integration |

---

## Database Schema

### Core Tables (40+ tables)

#### Memory System
```sql
-- conversations: Chat session storage
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT DEFAULT 'Conversation',
  type TEXT DEFAULT 'chat',        -- 'chat' | 'monitor_run'
  monitor_id TEXT,
  run_sequence INTEGER,
  created_at BIGINT NOT NULL
);

-- messages: Individual chat messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,              -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- facts: Extracted user context
CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  score INTEGER DEFAULT 50,
  category TEXT DEFAULT 'general',
  created_at BIGINT NOT NULL
);
```

#### Deep Research
```sql
CREATE TABLE deep_research_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT DEFAULT 'report',      -- 'report' | 'json'
  intensity TEXT DEFAULT 'standard', -- 'standard' | 'ultra'
  status TEXT DEFAULT 'queued',    -- 'queued' | 'running' | 'completed' | 'failed'
  response_id TEXT,                -- OpenAI Responses API ID
  output_text TEXT,
  error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
```

#### Scheduled Monitors
```sql
CREATE TABLE scheduled_monitors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  schedule TEXT NOT NULL,          -- 'daily' | 'weekly' | 'monthly'
  monitor_type TEXT NOT NULL,      -- 'business_search' | 'deep_research'
  config JSONB,
  is_active INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',    -- 'active' | 'paused' | 'suggested'
  last_run_at BIGINT,
  next_run_at BIGINT,
  created_at BIGINT NOT NULL
);
```

#### Users & Auth
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_demo INTEGER DEFAULT 0,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'inactive',
  -- Personalization
  company_name TEXT,
  primary_objective TEXT,
  target_markets TEXT[],
  inferred_industry TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE user_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
```

#### Lead Gen Plans
```sql
CREATE TABLE lead_gen_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  steps JSONB NOT NULL,            -- Array of LeadGenStep objects
  status TEXT NOT NULL,            -- 'pending_approval' | 'approved' | 'executing' | 'completed'
  supervisor_task_id TEXT,
  tool_metadata JSONB,
  created_at BIGINT NOT NULL
);
```

#### CRM Core
```sql
CREATE TABLE crm_customers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_contact_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  price_book_id INTEGER,
  xero_contact_id VARCHAR(100),
  created_at BIGINT NOT NULL
);

CREATE TABLE crm_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  order_date BIGINT NOT NULL,
  status TEXT DEFAULT 'draft',     -- 'draft' | 'confirmed' | 'dispatched' | 'delivered'
  delivery_run_id TEXT,
  subtotal_ex_vat INTEGER DEFAULT 0,
  vat_total INTEGER DEFAULT 0,
  total_inc_vat INTEGER DEFAULT 0,
  xero_invoice_id TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE crm_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  default_unit_price_ex_vat INTEGER DEFAULT 0,
  default_vat_rate INTEGER DEFAULT 2000,  -- basis points
  is_active INTEGER DEFAULT 1,
  track_stock INTEGER DEFAULT 0
);
```

#### Brewery Vertical (15+ tables)
```sql
-- brew_products: Beer products
CREATE TABLE brew_products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  style TEXT,
  abv INTEGER NOT NULL,            -- basis points (450 = 4.5%)
  default_package_type TEXT,       -- 'cask' | 'keg' | 'can' | 'bottle'
  duty_band TEXT NOT NULL
);

-- brew_containers: Cask/keg tracking
CREATE TABLE brew_containers (
  id TEXT PRIMARY KEY,
  container_code TEXT NOT NULL,
  container_type TEXT NOT NULL,    -- 'cask' | 'keg'
  volume_litres INTEGER NOT NULL,
  status TEXT DEFAULT 'at_brewery' -- 'at_brewery' | 'with_customer' | 'lost'
);

-- brew_price_books: Customer pricing tiers
CREATE TABLE brew_price_books (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_default INTEGER DEFAULT 0,
  discount_type VARCHAR(20),
  discount_value INTEGER
);
```

---

## API Endpoints

### Authentication (8 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/auth/signup` | Create new account | ✅ Working |
| POST | `/api/auth/login` | User login | ✅ Working |
| POST | `/api/auth/demo` | Create demo account | ✅ Working |
| POST | `/api/auth/url-session` | Create session from URL params | ✅ Working |
| POST | `/api/auth/logout` | End session | ✅ Working |
| GET | `/api/auth/me` | Get current user | ✅ Working |
| PUT | `/api/auth/profile` | Update profile | ✅ Working |
| POST | `/api/create-session` | Create new session | ✅ Working |

### Chat (4 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| GET | `/api/chat/greeting` | Get personalized greeting | ✅ Working |
| POST | `/api/chat` | Main chat endpoint (streaming) | ✅ Working |
| POST | `/api/agent/chat` | Claude-powered chat | ⏳ Partial |
| POST | `/agent/chat` | Supervisor chat | ✅ Working |

### Deep Research (7 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/deep-research` | Start research run | ✅ Working |
| GET | `/api/deep-research` | List user's runs | ✅ Working |
| GET | `/api/deep-research/:id` | Get specific run | ✅ Working |
| POST | `/api/deep-research/:id/stop` | Cancel run | ✅ Working |
| POST | `/api/deep-research/:id/duplicate` | Clone run | ✅ Working |
| POST | `/api/deep-research/:id/view` | Mark as viewed | ✅ Working |
| POST | `/api/deep-research/summarize-last-viewed` | Get summary | ✅ Working |

### Places/Search (5 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/places/search` | Google Places search | ✅ Working |
| POST | `/api/places/verify` | Verify place details | ✅ Working |
| POST | `/api/search` | Legacy search | ✅ Working |
| POST | `/api/prospects/enrich` | Enrich with emails | ✅ Working |
| POST | `/api/prospects/search_and_enrich` | Combined search+enrich | ✅ Working |

### Batch Jobs (3 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/batch/create` | Start email finder job | ✅ Working |
| GET | `/api/batch/:id` | Get job status | ✅ Working |
| GET | `/api/batch` | List user's jobs | ✅ Working |

### Scheduled Monitors (8 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/scheduled-monitors` | Create monitor | ✅ Working |
| GET | `/api/scheduled-monitors/:userId` | List monitors | ✅ Working |
| GET | `/api/scheduled-monitors/detail/:id` | Get monitor | ✅ Working |
| PATCH | `/api/scheduled-monitors/:id` | Update monitor | ✅ Working |
| DELETE | `/api/scheduled-monitors/:id` | Delete monitor | ✅ Working |
| GET | `/api/suggested-monitors/:userId` | AI suggestions | ✅ Working |
| POST | `/api/suggested-monitors/:id/approve` | Accept suggestion | ✅ Working |
| POST | `/api/suggested-monitors/:id/reject` | Reject suggestion | ✅ Working |

### Plan System (8 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| GET | `/api/plan-status` | Get current plan status | ✅ Working |
| GET | `/api/goal` | Get user's goal | ✅ Working |
| PUT | `/api/goal` | Update goal | ✅ Working |
| POST | `/api/goal` | Create goal | ✅ Working |
| GET | `/api/plan` | Get active plan | ✅ Working |
| POST | `/api/plan/approve` | Approve plan | ✅ Working |
| POST | `/api/plan/regenerate` | Request new plan | ✅ Working |
| POST | `/api/plan/start` | Start execution | ✅ Working |

### CRM Core (50+ endpoints)
| Category | Endpoints | Status |
|----------|-----------|--------|
| Customers | 7 endpoints (CRUD, search) | ✅ Working |
| Orders | 5 endpoints (CRUD) | ✅ Working |
| Order Lines | 4 endpoints (CRUD) | ✅ Working |
| Products | 5 endpoints (CRUD) | ✅ Working |
| Stock | 5 endpoints (CRUD) | ✅ Working |
| Delivery Runs | 5 endpoints (CRUD) | ✅ Working |
| Call Diary | 10 endpoints | ✅ Working |
| Activities | CRUD | ✅ Working |
| Tasks | CRUD | ✅ Working |
| Tags | CRUD | ✅ Working |
| Settings | 3 endpoints | ✅ Working |

### Brewery CRM (30+ endpoints)
| Category | Endpoints | Status |
|----------|-----------|--------|
| Brew Products | 5 endpoints | ✅ Working |
| Batches | 5 endpoints | ✅ Working |
| Inventory | 5 endpoints | ✅ Working |
| Containers | 5 endpoints | ✅ Working |
| Container Movements | 3 endpoints | ✅ Working |
| Duty Reports | 3 endpoints | ✅ Working |
| Price Books | 5 endpoints | ✅ Working |
| Trade Store | 5 endpoints | ✅ Working |

### Integrations (6 endpoints)
| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/integrations/authorization-url` | Start OAuth | ✅ Working |
| GET | `/api/integrations/oauth-callback` | OAuth callback | ✅ Working |
| GET | `/api/integrations` | List integrations | ✅ Working |
| DELETE | `/api/integrations/:id` | Disconnect | ✅ Working |
| GET | `/api/integrations/verify/:provider` | Check status | ✅ Working |
| Xero | Multiple endpoints | ✅ Working |

---

## Chat System Architecture

### Message Flow

```
User Types Message
        │
        ▼
┌───────────────────┐
│  AgentChatPanel   │  (Agent-First UI)
│  OR ChatPage      │  (Classic UI)
└───────────────────┘
        │
        ├─── Agent-First: Direct Claude API ───┐
        │                                       │
        ├─── Classic: Backend /api/chat ───────┤
        │                                       │
        ▼                                       ▼
┌───────────────────┐              ┌────────────────┐
│  ClaudeService.ts │              │  server/       │
│  (Frontend)       │              │  routes.ts     │
└───────────────────┘              └────────────────┘
        │                                   │
        │ Tool Use                          │ Intent Detection
        ▼                                   ▼
┌───────────────────┐              ┌────────────────┐
│ Execute Backend   │              │ agent-kernel   │
│ API Endpoints     │              │ GPT-4 tools    │
└───────────────────┘              └────────────────┘
        │                                   │
        └───────────────┬───────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Tool Execution │
              │  (actual APIs)  │
              └─────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │ Return Results  │
              │ to Chat         │
              └─────────────────┘
```

### Two Chat Implementations

#### 1. Agent-First (Claude API - Frontend)
**File:** `client/src/services/ClaudeService.ts`

- Uses Anthropic Claude API directly from frontend
- `dangerouslyAllowBrowser: true` for client-side calls
- Streaming responses via `AsyncGenerator`
- 5 tools defined with examples for Claude
- Executes tools by calling backend endpoints

```typescript
// Tool execution flow
async *sendMessage(userMessage: string): AsyncGenerator<ChatChunk> {
  // 1. Add to conversation history
  // 2. Call Claude with tools
  // 3. If tool_use returned, execute on backend
  // 4. Send result back to Claude
  // 5. Claude formats response naturally
}
```

#### 2. Classic (Backend GPT-4)
**File:** `server/routes.ts` (POST /api/chat)

- Server-side chat processing
- Uses OpenAI GPT-4 for intent detection
- Calls `agent-kernel.ts` for tool orchestration
- Streaming via SSE (Server-Sent Events)
- Supabase Realtime for supervisor messages

---

## Tool Integration

### 5 Core Tools

#### 1. Quick Search (Google Places)
```typescript
{
  name: "search_google_places",
  description: "Fast search for businesses by location and type",
  parameters: {
    query: string,      // "pubs", "breweries"
    location: string,   // "Leeds", "Manchester"
    country: string,    // default: "GB"
    maxResults: number  // default: 20
  },
  endpoint: "POST /api/places/search",
  execution: "Synchronous (~2-5s)"
}
```

#### 2. Deep Research (OpenAI Responses API)
```typescript
{
  name: "deep_research",
  description: "Comprehensive research with web sources",
  parameters: {
    prompt: string,           // "craft beer market analysis"
    intensity: "quick" | "thorough" | "deep"
  },
  endpoint: "POST /api/deep-research",
  execution: "Async (30s-3min), polling for status"
}
```

#### 3. Email Finder (Hunter.io)
```typescript
{
  name: "email_finder",
  description: "Find verified contact emails",
  parameters: {
    query: string,      // Company name
    location: string,
    targetRole: string  // "owner", "manager"
  },
  endpoint: "POST /api/batch/create",
  execution: "Async (2-5min), polling for completion"
}
```

#### 4. Scheduled Monitor
```typescript
{
  name: "create_scheduled_monitor",
  description: "Set up recurring monitoring",
  parameters: {
    label: string,
    schedule: "daily" | "weekly" | "monthly",
    description: string
  },
  endpoint: "POST /api/scheduled-monitors",
  execution: "Synchronous"
}
```

#### 5. Nudges
```typescript
{
  name: "get_nudges",
  description: "Get proactive suggestions",
  parameters: {
    context?: string
  },
  endpoint: "GET /api/nudges",
  execution: "Synchronous"
}
```

### Tool Execution Registry
**File:** `server/lib/actions.ts`

Maps tool names to executor functions:
```typescript
const TASK_TYPE_HANDLERS = {
  search_google_places: executeGooglePlacesSearch,
  generate_leads: executeDeepResearch,
  saleshandy_batch_call: executeBatchEmailFinder,
  create_scheduled_monitor: createMonitor,
};
```

---

## Authentication

### Auth Flow

```
┌────────────────────────────────────────────────────┐
│                   LOGIN FLOW                        │
├────────────────────────────────────────────────────┤
│                                                    │
│  1. User submits email/password                    │
│     POST /api/auth/login                           │
│                                                    │
│  2. Server validates credentials                   │
│     - bcrypt.compare(password, hash)               │
│                                                    │
│  3. Server creates session                         │
│     - Generate session ID (crypto.randomBytes)     │
│     - Store in user_sessions table                 │
│     - Set cookie with session ID                   │
│                                                    │
│  4. Frontend stores user info                      │
│     - localStorage: wyshbone_user                  │
│     - localStorage: wyshbone_sid                   │
│                                                    │
│  5. Subsequent requests include:                   │
│     - x-session-id header                          │
│     - OR: ?user_id=&user_email= params (dev only)  │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Auth Implementation
**File:** `server/auth.ts`

```typescript
// Password hashing
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Subscription tiers
const TIER_LIMITS = {
  free: { monitors: 2, deepResearch: 2 },
  basic: { monitors: 10, deepResearch: 25 },
  pro: { monitors: 50, deepResearch: 100 },
  business: { monitors: 200, deepResearch: 500 },
  enterprise: { monitors: Infinity, deepResearch: Infinity },
};
```

### Dev Mode Auth
**File:** `client/src/lib/queryClient.ts`

In development, auth params are added to URLs:
```typescript
function addDevAuthParams(url: string): string {
  if (MODE !== 'development') return url;
  const user = localStorage.getItem('wyshbone_user');
  return `${url}?user_id=${user.id}&user_email=${user.email}`;
}
```

---

## Feature Status Matrix

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| **Chat** |
| Classic Chat | ✅ Working | `client/src/pages/chat.tsx` | GPT-4 powered |
| Agent-First Chat | ⏳ Partial | `client/src/components/agent/AgentChatPanel.tsx` | Claude API, auth issues |
| Message Streaming | ✅ Working | SSE for classic, AsyncGenerator for agent | |
| Conversation History | ✅ Working | `server/memory.ts` | Stored in DB |
| **Tools** |
| Quick Search | ✅ Working | Google Places API | ~$0.03 per search |
| Deep Research | ⏳ Partial | OpenAI Responses API | 401 auth errors occurring |
| Email Finder | ✅ Working | Hunter.io API | Async job |
| Scheduled Monitors | ✅ Working | `server/monitor-executor.ts` | |
| Nudges | ✅ Working | `client/src/features/subconscious/` | |
| **CRM** |
| Customers | ✅ Working | `client/src/pages/crm/customers.tsx` | Full CRUD |
| Orders | ✅ Working | `client/src/pages/crm/orders.tsx` | Full CRUD |
| Products | ✅ Working | `client/src/pages/crm/products.tsx` | Full CRUD |
| Stock | ✅ Working | `client/src/pages/crm/stock.tsx` | Full CRUD |
| Delivery Runs | ✅ Working | `client/src/pages/crm/delivery-runs.tsx` | Full CRUD |
| Call Diary | ✅ Working | `client/src/pages/crm/diary.tsx` | Full CRUD |
| Activities | ✅ Working | `client/src/pages/crm/activities.tsx` | Full CRUD |
| Tasks | ✅ Working | `client/src/pages/crm/tasks.tsx` | Full CRUD |
| Dashboard | ⏳ Partial | `client/src/pages/crm/dashboard.tsx` | Basic stats |
| **Brewery CRM** |
| Brew Products | ✅ Working | `client/src/pages/brewcrm/products.tsx` | |
| Batches | ✅ Working | `client/src/pages/brewcrm/batches.tsx` | |
| Containers | ✅ Working | `client/src/pages/brewcrm/containers.tsx` | Cask/keg tracking |
| Container Scan | ⏳ Partial | `client/src/pages/brewcrm/container-scan.tsx` | QR scanning |
| Inventory | ✅ Working | `client/src/pages/brewcrm/inventory.tsx` | |
| Duty Reports | ✅ Working | `client/src/pages/brewcrm/duty-reports.tsx` | UK HMRC |
| Price Books | ✅ Working | `client/src/pages/brewcrm/price-books.tsx` | |
| Trade Store | ⏳ Partial | `client/src/pages/brewcrm/trade-store-settings.tsx` | B2B portal |
| **Integrations** |
| Xero | ✅ Working | `server/routes/xero-oauth.ts` | Accounting sync |
| Stripe | ✅ Working | Payment processing | Subscriptions |
| **Auth** |
| Login/Signup | ✅ Working | `client/src/pages/auth.tsx` | |
| Demo Mode | ✅ Working | `client/src/contexts/DemoModeContext.tsx` | |
| Sessions | ✅ Working | DB-backed sessions | |
| **UI** |
| Classic Layout | ✅ Working | | Sidebar + Chat |
| Agent-First Layout | ⏳ Partial | 40/60 split screen | Layout toggle |
| Mobile Layout | ⏳ Partial | Bottom nav | Basic |
| Results Panel | ⏳ Partial | Right panel for tool results | |

---

## Key Files Inventory

### Top 20 Most Important Files

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | `client/src/App.tsx` | Main router & layouts | ✅ Working |
| 2 | `server/routes.ts` | All API endpoints | ✅ Working |
| 3 | `shared/schema.ts` | Database schema | ✅ Working |
| 4 | `server/storage.ts` | Database operations | ✅ Working |
| 5 | `client/src/pages/chat.tsx` | Classic chat page | ✅ Working |
| 6 | `client/src/services/ClaudeService.ts` | Claude API integration | ⏳ Auth issues |
| 7 | `server/deepResearch.ts` | OpenAI research | ⏳ 401 errors |
| 8 | `server/googlePlaces.ts` | Places API | ✅ Working |
| 9 | `client/src/lib/queryClient.ts` | API client | ✅ Working |
| 10 | `shared/conversationConfig.ts` | Chat prompts | ✅ Working |
| 11 | `server/auth.ts` | Auth utilities | ✅ Working |
| 12 | `server/intent-detector.ts` | Intent classification | ✅ Working |
| 13 | `server/lib/actions.ts` | Tool registry | ✅ Working |
| 14 | `server/lib/agent-kernel.ts` | Orchestrator | ✅ Working |
| 15 | `client/src/contexts/UserContext.tsx` | User state | ✅ Working |
| 16 | `client/src/contexts/PlanContext.tsx` | Plan state | ✅ Working |
| 17 | `client/src/contexts/ResultsPanelContext.tsx` | Results state | ✅ Working |
| 18 | `server/batchService.ts` | Hunter.io integration | ✅ Working |
| 19 | `server/monitor-executor.ts` | Monitor execution | ✅ Working |
| 20 | `client/src/components/app-sidebar.tsx` | Main sidebar | ✅ Working |

---

## Environment Variables

### Required (Backend)
```bash
DATABASE_URL=postgres://...          # Neon/Supabase PostgreSQL
SUPABASE_URL=https://xxx.supabase.co # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # Supabase service key
GOOGLE_PLACES_API_KEY=AIza...        # Google Places API
OPENAI_API_KEY=sk-...                # OpenAI API key
```

### Optional (Backend)
```bash
HUNTER_API_KEY=...                   # Hunter.io for emails
SALESHANDY_API_KEY=...               # SalesHandy campaigns
STRIPE_SECRET_KEY=sk_...             # Stripe payments
SIMULATE_TOOLS=true                  # Mock API responses
```

### Frontend (via Vite)
```bash
VITE_ANTHROPIC_API_KEY=sk-ant-...    # Claude API (frontend)
VITE_API_BASE_URL=http://...         # Backend URL (if separate)
```

---

## Dependencies

### Key NPM Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.71.2 | Claude API |
| `openai` | ^6.1.0 | GPT-4 API |
| `drizzle-orm` | ^0.44.7 | Database ORM |
| `@supabase/supabase-js` | ^2.80.0 | Supabase client |
| `express` | ^4.21.2 | HTTP server |
| `zod` | ^3.24.2 | Schema validation |
| `bcryptjs` | ^3.0.3 | Password hashing |
| `stripe` | ^19.3.0 | Payments |
| `resend` | ^6.3.0 | Email sending |
| `xero-node` | ^13.3.0 | Xero integration |
| `react` | 18.x | UI framework |
| `@tanstack/react-query` | - | Data fetching |
| `tailwindcss` | ^4.1.17 | CSS framework |

---

## Known Issues

### 1. Deep Research 401 Errors
**Location:** `server/deepResearch.ts`, `client/src/services/ClaudeService.ts`
**Error:** `401 Unauthorized` when starting deep research
**Cause:** User ID/session ID not being passed correctly from frontend
**Fix:** Ensure `localStorage` has `wyshbone_user` and `wyshbone_sid` set

### 2. Agent-First Chat Auth
**Location:** `client/src/services/ClaudeService.ts`
**Error:** Tool execution fails with auth errors
**Cause:** `addDevAuthParams` requires user in localStorage
**Workaround:** Use Classic layout, or manually set localStorage

### 3. Results Panel Not Showing
**Location:** `client/src/contexts/ResultsPanelContext.tsx`
**Error:** Tool results don't appear in right panel
**Cause:** Context not properly propagating
**Status:** Partially fixed, needs testing

### 4. TypeScript Errors (Pre-existing)
**Location:** Various
**Errors:** `TS2304: Cannot find name 'isMobile'`, etc.
**Status:** Not blocking functionality

---

## Related Repositories

### Supervisor (`supervisor/`)
- **Purpose:** Background task execution, plan management
- **Key Files:**
  - `server/supervisor.ts` - Polling service
  - `server/plan-executor.ts` - Plan execution
  - `server/actions/` - Tool implementations
- **Communication:** Direct database access + Supabase Realtime

### Tower (`tower/`)
- **Purpose:** Quality evaluation, auto-detection of issues
- **Key Files:**
  - `src/evaluator/` - Evaluation logic
  - `server/routes.ts` - Evaluation API
  - `client/` - QA dashboard
- **Features:**
  - Conversation quality analysis
  - Patch failure detection
  - Behaviour tests
  - Auto-investigation

---

## Quick Reference Commands

```bash
# Development
npm run dev              # Start FE + BE
npm run dev:backend      # Backend only (port 5001)
npm run dev:ui           # Frontend only (port 5173)

# Database
npm run db:push          # Push schema to database

# Testing
npm run check            # TypeScript typecheck
npm run smoke            # Playwright smoke tests
npm run smoke:headed     # Tests with browser visible

# Build
npm run build            # Production build
npm run start            # Run production
```

---

*Last updated: December 31, 2024*

