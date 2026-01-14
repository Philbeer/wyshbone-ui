# Agent Instructions for Wyshbone UI

This document contains mandatory instructions for AI agents working in this repository.

## Overview

Wyshbone UI is a CRM application with:
- **Frontend**: React + Vite (client/)
- **Backend**: Express API (server/)
- **Database**: Drizzle ORM with PostgreSQL/Supabase

## Testing Strategy

### Local Development (Fast)

For most local changes, smoke tests are **NOT required**. Use fast checks:

```bash
npm run check      # TypeScript typecheck
```

### CI/CD (Automatic)

Smoke tests run automatically in GitHub Actions on:
- Push to main/develop branches
- Pull requests

### Manual Smoke Tests

Run `npm run smoke` only when:
- User explicitly requests it
- Making significant CRM changes
- Before major deployments

See `.cursor/rules/qa-gate.mdc` for details.

---

## Development Commands

```bash
# Start development server (FE + BE)
npm run dev

# Run database migrations
npm run db:push

# Build for production
npm run build

# Run UI smoke test (requires dev server running)
npm run smoke

# Run UI smoke test with browser visible
npm run smoke:headed

# Run UI smoke test with Playwright UI
npm run smoke:ui
```

---

## Project Structure

```
wyshbone-ui/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Route pages
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities
│   │   └── contexts/       # React contexts
│   └── vite.config.ts
├── server/                 # Express backend
│   ├── routes.ts           # API routes
│   ├── storage.ts          # Database operations
│   └── index.ts            # Server entry
├── shared/                 # Shared types/schemas
│   └── schema.ts           # Drizzle schema + types
├── .cursor/rules/          # Cursor agent rules
│   └── qa-gate.mdc         # QA automation rules
└── AGENTS.md               # This file
```

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Database schema | `shared/schema.ts` |
| API routes | `server/routes.ts` |
| Products page | `client/src/pages/crm/products.tsx` |
| Orders page | `client/src/pages/crm/orders.tsx` |
| Stock page | `client/src/pages/crm/stock.tsx` |
| UI Smoke Tests | `tests/ui-smoke.spec.ts` |
| Playwright Config | `playwright.config.ts` |

---

## Rules Reminder

1. **No deployments** without explicit "deploy now" instruction
2. **Smoke tests are optional locally** - they run in CI automatically
3. **Run `npm run smoke` only when requested** or for major CRM changes
4. **Fast local checks**: Use `npm run check` for TypeScript validation

## Smoke Test (Optional Locally, Auto in CI)

The `npm run smoke` command runs Playwright tests covering core CRM flows.

**When to use locally:**
- User explicitly requests smoke tests
- Major changes to products/orders/customers
- Before deployment

**CI runs automatically** on push to main/develop and on PRs.

**Prerequisites:** Run `npm run dev` first, then in another terminal run `npm run smoke`

---

## Common Gotchas

- Select components must never have empty string values
- Foreign key selects need "none" option for optional fields
- Always check both Console AND Network tabs for errors
- Data should persist after page refresh

---

*Last updated: December 2024*

