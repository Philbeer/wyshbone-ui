# Wyshbone UI - Quick Architecture Audit

## 1. File Structure

```
wyshbone-ui/
├── client/                    # React frontend (Vite)
│   └── src/
│       ├── components/        # UI components
│       │   ├── agent/         # AgentChatPanel, AgentWorkspace, ToolStatusCard
│       │   ├── tower/         # WhatJustHappenedPanel (activity log viewer)
│       │   └── ui/            # shadcn/ui components
│       ├── contexts/          # React contexts (User, Plan, Agent, Demo, etc.)
│       ├── features/          # Feature modules (brewery, crm, leads, xero, diary)
│       ├── hooks/             # Custom hooks (useSuppliers, useEntityResolution)
│       ├── layouts/           # Layout components (AgentFirst, Mobile, Split)
│       ├── lib/               # Utilities (queryClient, supabase, events)
│       ├── pages/             # Route pages
│       │   ├── crm/           # CRM pages (customers, orders, products, suppliers)
│       │   ├── brewcrm/       # Brewery-specific CRM pages
│       │   ├── admin/         # Admin pages (database-maintenance)
│       │   └── dev/           # Dev tools (sleeper-agent-monitor)
│       ├── services/          # API services (ClaudeService, AnthropicService)
│       └── verticals/         # Industry vertical configs (brewery)
│
├── server/                    # Express backend
│   ├── routes/                # API route modules
│   │   ├── xero-oauth.ts      # Xero OAuth flow
│   │   ├── xero-sync.ts       # Xero sync & webhooks
│   │   ├── sleeper-agent.ts   # Background agent jobs
│   │   ├── entity-review.ts   # AI entity matching review queue
│   │   ├── activity-log.ts    # Activity logging
│   │   └── suppliers.ts       # Supplier management
│   ├── lib/                   # Server utilities
│   │   ├── matching.ts        # AI entity matching (Claude)
│   │   ├── xero-import.ts     # Xero data import
│   │   ├── sleeper-agent.ts   # Background processing
│   │   ├── activity-log.ts    # Activity logging helper
│   │   └── agent-kernel.ts    # MEGA agent core
│   ├── cron/                  # Scheduled jobs
│   │   ├── nightly-maintenance.ts  # Database updates, pub verification
│   │   └── xero-sync.ts       # Scheduled Xero sync
│   ├── routes.ts              # Main route definitions (~12,000 lines)
│   ├── storage.ts             # Database operations (Drizzle ORM)
│   ├── anthropic-agent.ts     # Claude AI agent with tools
│   ├── openai.ts              # OpenAI integration
│   ├── googlePlaces.ts        # Google Places API
│   └── deepResearch.ts        # Deep research feature
│
├── shared/                    # Shared between client & server
│   └── schema.ts              # Database schema (Drizzle) + Zod types
│
├── supervisor/                # Supervisor service (separate Replit deployment)
│   └── server/                # Lead generation orchestration
│
├── tower/                     # Tower service (AI observability - separate)
│   └── ...                    # Conversation quality analysis
│
└── migrations/                # Database migrations
```

---

## 2. Database Tables (from schema.ts)

### Agent/AI Related (12 tables)
| Table | Purpose |
|-------|---------|
| `deep_research_runs` | AI research job tracking |
| `scheduled_monitors` | Recurring AI monitoring tasks |
| `lead_gen_plans` | Lead generation plan approval |
| `facts` | Extracted user facts for memory |
| `conversations` | Chat session tracking |
| `messages` | Chat message history |
| `entity_review_queue` | AI matching review queue |
| `agent_intelligence` | AI insights/discoveries |
| `ai_research_queue` | Research job queue |
| `pubs_master` | Master pub database (88k+ pubs) |
| `entity_sources` | Multi-source entity tracking |
| `search_log` | AI search/discovery logs |

### CRM Related (20+ tables)
| Table | Purpose |
|-------|---------|
| `crm_customers` | Customer records |
| `crm_orders` | Sales orders |
| `crm_order_lines` | Order line items |
| `crm_products` | Generic products |
| `crm_stock` | Inventory tracking |
| `crm_delivery_runs` | Delivery scheduling |
| `crm_call_diary` | Sales call scheduling |
| `crm_activities` | Activity log |
| `crm_tasks` | Task management |
| `suppliers` | Supplier records |
| `supplier_purchases` | Bills/purchases |
| `supplier_products` | Supplier product catalog |

### Brewery Vertical (10 tables)
| Table | Purpose |
|-------|---------|
| `brew_products` | Beer products |
| `brew_batches` | Brew batches |
| `brew_inventory_items` | Inventory |
| `brew_containers` | Cask/keg tracking |
| `brew_duty_reports` | HMRC duty reports |
| `brew_price_books` | Pricing tiers |
| `brew_product_prices` | Per-product pricing |
| `brew_trade_store_*` | B2B trade store |

### Route Planner (NEW - 3 tables)
| Table | Purpose |
|-------|---------|
| `delivery_routes` | Route definitions |
| `route_stops` | Stops on routes |
| `route_optimization_results` | AI optimization results |

### Xero Integration (4 tables)
| Table | Purpose |
|-------|---------|
| `xero_connections` | OAuth tokens |
| `xero_import_jobs` | Import job tracking |
| `xero_sync_queue` | Sync queue |
| `xero_webhook_events` | Webhook log |

---

## 3. API Endpoints

### Agent/AI Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | Main chat (streaming, OpenAI) |
| `POST /api/agent/chat` | Claude AI with tools |
| `POST /agent/chat` | MEGA Agent (hybrid mode) |
| `POST /api/deep-research` | Start deep research |
| `GET /api/deep-research/:id` | Get research status |
| `POST /api/scheduled-monitors` | Create monitor |
| `GET /api/plan` | Get current plan |
| `POST /api/plan/approve` | Approve plan |
| `GET /api/goal` | Get user goal |

### Sleeper Agent (Background AI)
| Endpoint | Purpose |
|----------|---------|
| `POST /api/sleeper-agent/search` | Start discovery search |
| `POST /api/sleeper-agent/events` | Discover events |
| `GET /api/sleeper-agent/stats` | Get agent stats |
| `POST /api/sleeper-agent/nightly-update` | Trigger nightly job |

### Entity Review (AI Matching)
| Endpoint | Purpose |
|----------|---------|
| `GET /api/entity-review/queue` | Get review queue |
| `POST /api/entity-review/:id/approve` | Approve match |
| `POST /api/entity-review/:id/reject` | Reject match |

### Xero Integration
| Endpoint | Purpose |
|----------|---------|
| `GET /api/xero/authorize` | Start OAuth |
| `GET /api/xero/callback` | OAuth callback |
| `POST /api/xero/import/customers` | Import customers |
| `POST /api/xero/import/orders` | Import orders |
| `POST /api/xero/sync/order/:id` | Sync order to Xero |

### CRM Endpoints
- `GET/POST /api/crm/customers`
- `GET/POST /api/crm/orders`
- `GET/POST /api/crm/products`
- `GET/POST /api/suppliers`
- `POST /api/crm/orders/:id/export-xero`

---

## 4. Integration Points

### External Services Used
| Service | Env Variable | Purpose |
|---------|--------------|---------|
| **Supabase** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database, realtime, auth |
| **PostgreSQL** | `DATABASE_URL` | Primary database (via Drizzle ORM) |
| **OpenAI** | `OPENAI_API_KEY` | GPT for chat, planning |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude for agent, matching |
| **Google Places** | `GOOGLE_PLACES_API_KEY` | Business search |
| **Hunter.io** | `HUNTER_API_KEY` | Email finding |
| **Xero** | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` | Accounting integration |
| **Stripe** | `STRIPE_SECRET_KEY` | Subscriptions |
| **Resend** | `RESEND_API_KEY` | Email sending |

### Related Repositories/Services
| Service | Location | Purpose |
|---------|----------|---------|
| **Supervisor** | `supervisor/` or separate Replit | Lead generation orchestration |
| **Tower** | `tower/` or separate Replit | AI observability, evaluation |
| **BrewCRM Legacy** | `Legacy/brewery-crm-replit/` | Previous CRM (reference only) |

### Frontend Environment
| Variable | Purpose |
|----------|---------|
| `VITE_ANTHROPIC_API_KEY` | Claude API (browser-direct, discouraged) |
| `VITE_API_BASE_URL` | Backend URL override |

---

## 5. Current Agent Features

### ✅ Working
| Feature | Location |
|---------|----------|
| **Chat with Tools** | `/api/chat`, `/api/agent/chat` |
| **Deep Research** | `/api/deep-research` |
| **Scheduled Monitors** | `/api/scheduled-monitors` |
| **Google Places Search** | `/api/places/search` |
| **Xero Import** | `/api/xero/import/*` |
| **Entity Matching (AI)** | `server/lib/matching.ts` |
| **Activity Logging** | `/api/activity-log` |
| **Nightly Maintenance** | `server/cron/nightly-maintenance.ts` |

### 🔧 Partially Working / Needs Testing
| Feature | Status |
|---------|--------|
| **Sleeper Agent Discovery** | Backend exists, needs frontend polish |
| **Entity Review Queue** | Works, UI needs refinement |
| **Xero Export** | Recently fixed, needs verification |
| **Route Planner** | Schema exists, implementation pending |

### 📋 Stubbed / Planned
| Feature | Status |
|---------|--------|
| **Supervisor Integration** | Separate service, partially integrated |
| **Tower Logging** | Observability service, partially integrated |
| **Very Deep Program** | Multi-iteration research (exists but limited use) |
| **Trade Store** | Schema exists, UI incomplete |

---

## 6. Key Files Reference

| Purpose | File |
|---------|------|
| Database schema | `shared/schema.ts` |
| Main API routes | `server/routes.ts` |
| Database operations | `server/storage.ts` |
| Claude agent | `server/anthropic-agent.ts` |
| OpenAI chat | `server/openai.ts` |
| Entity matching | `server/lib/matching.ts` |
| Xero import | `server/lib/xero-import.ts` |
| Nightly jobs | `server/cron/nightly-maintenance.ts` |
| Frontend entry | `client/src/App.tsx` |
| Main chat page | `client/src/pages/chat.tsx` |
| CRM pages | `client/src/pages/crm/*.tsx` |

---

*Generated: January 2026*

