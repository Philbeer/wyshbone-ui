# Agent Instructions for Wyshbone UI

This document contains mandatory instructions for AI agents working in this repository.

## Overview

Wyshbone UI is a CRM application with:
- **Frontend**: React + Vite (client/)
- **Backend**: Express API (server/)
- **Database**: Drizzle ORM with PostgreSQL/Supabase

## Mandatory QA Gate

> ⚠️ **CRITICAL**: You MUST complete the smoke test before declaring ANY task "done".

See `.cursor/rules/qa-gate.mdc` for the complete rules. Summary below.

---

## QA Checklist (Run Before Every "Done")

### Generic Smoke Test

Every task completion requires verification of core functionality:

| # | Test | What to Check |
|---|------|---------------|
| 1 | **Boot FE+BE** | `npm run dev` starts without errors |
| 2 | **Create Product** | Add product form works, no 404/500, no hang |
| 3 | **List Products** | Products page shows the new product |
| 4 | **Edit Product** | Edit and save works without errors |
| 5 | **Create Order** | Add order form works |
| 6 | **Add Line Item** | Can add product as line item to order |
| 7 | **Refresh Test** | Hard refresh - all data persists |
| 8 | **Console/Network** | No 404, no 500, no red console errors |

### Task-Specific Checks

Add 1–3 additional checks based on what you changed:

- Modified a form? → Test that specific form's CRUD
- Changed an API route? → Test that endpoint directly
- Updated a shared component? → Test all pages using it
- Touched auth? → Test login/logout flow

---

## Failure Protocol

If ANY test fails:

1. **Identify**: Which endpoint/component failed? What's the error?
2. **Fix**: Update the code to resolve the issue
3. **Re-test**: Run the FULL smoke test again
4. **Repeat**: Until all tests pass

**Never** mark a task done with failing tests.

---

## Required Deliverable

Every completed task MUST include a QA Report:

```markdown
## QA Report

### Generic Smoke Test
| Step | Test | Result |
|------|------|--------|
| 1 | Boot FE+BE | ✅ |
| 2 | Create Product | ✅ |
| 3 | List Products | ✅ |
| 4 | Edit Product | ✅ |
| 5 | Create Order | ✅ |
| 6 | Add Line Item | ✅ |
| 7 | Refresh & Persistence | ✅ |
| 8 | No Console/Network Errors | ✅ |

### Task-Specific Checks
| Check | Result |
|-------|--------|
| [Your specific test 1] | ✅/❌ |
| [Your specific test 2] | ✅/❌ |

### Issues Found & Fixed
- None (or list what was fixed)

### Files Changed
- list/of/files.ts
```

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
2. **Always run smoke tests** before saying "done" - use `npm run smoke` for automated testing
3. **Fix failures** before completing tasks
4. **Include QA report** with every task completion

## Automated Smoke Test

The `npm run smoke` command runs Playwright tests covering the 8-step QA checklist:

1. **Boot FE+BE** - Verifies page loads
2. **Create Product** - Tests add product form
3. **List Products** - Verifies product appears in table
4. **Edit Product** - Tests edit functionality
5. **Create Order** - Tests add order form
6. **Add Line Item** - Tests line item functionality
7. **Refresh & Persistence** - Verifies data persists after reload
8. **Console/Network** - Checks for 404/500 errors

**Prerequisites:** Run `npm run dev` first, then in another terminal run `npm run smoke`

---

## Common Gotchas

- Select components must never have empty string values
- Foreign key selects need "none" option for optional fields
- Always check both Console AND Network tabs for errors
- Data should persist after page refresh

---

*Last updated: December 2024*

