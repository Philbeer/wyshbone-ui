# Supervisor Tool Integration Guide

## Overview

This document explains how **Wyshbone Supervisor** should integrate with the **Wyshbone UI unified tool execution endpoint**.

**Architecture:**
- **Single Source of Truth:** All tool logic lives in `wyshbone-ui/server/lib/actions.ts`
- **Unified Endpoint:** `/api/tools/execute` exposes all tools via HTTP
- **Zero Duplication:** Supervisor calls the UI endpoint instead of duplicating tool code
- **Tower Logging:** All tool executions are automatically logged to Tower for analytics

---

## Available Tools

The unified endpoint supports 6 tools:

### 1. search_google_places
Search for businesses using Google Places API

**Aliases:** `SEARCH_PLACES`, `search_wyshbone_database`

**Parameters:**
```json
{
  "query": "craft breweries",           // Required: Search query
  "location": "Leeds, UK",               // Optional: Location to search
  "maxResults": 30,                      // Optional: Max results (default: 30)
  "country": "GB"                        // Optional: Country code (default: "GB")
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "places": [...],                     // Array of place objects
    "count": 25,
    "query": "craft breweries",
    "location": "Leeds",
    "country": "GB"
  },
  "note": "Found 25 businesses"
}
```

---

### 2. deep_research
Start background research job with AI analysis

**Aliases:** `DEEP_RESEARCH`

**Auth:** Required (userId must be provided)

**Parameters:**
```json
{
  "prompt": "Analyze craft beer market trends",  // Required: Research topic
  "label": "Beer Market Analysis",               // Optional: Display label
  "mode": "report",                              // Optional: Research mode (default: "report")
  "counties": ["Yorkshire", "Lancashire"],       // Optional: Geographic focus
  "windowMonths": 12                             // Optional: Time window
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "run": {
      "id": "run_abc123",                        // Research run ID
      "label": "Beer Market Analysis",
      "status": "running"
    },
    "topic": "Analyze craft beer market trends"
  },
  "note": "Research started: run_abc123"
}
```

---

### 3. batch_contact_finder
Find and enrich contacts for businesses, send to SalesHandy

**Aliases:** `BATCH_CONTACT_FINDER`

**Auth:** Required (userId must be provided)

**Parameters:**
```json
{
  "query": "independent pubs",                   // Required: Business type
  "location": "Manchester",                      // Required: Location
  "country": "GB",                               // Optional: Country code (default: "GB")
  "targetRole": "General Manager",               // Optional: Contact role (default: "General Manager")
  "limit": 30                                    // Optional: Max businesses (default: 30)
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "batchId": "batch_xyz789",                   // Batch job ID
    "status": "running",
    "viewUrl": "/batch/batch_xyz789"             // UI URL to view progress
  },
  "note": "📧 **SalesHandy Batch Started!**\n\n..."  // Detailed status message
}
```

---

### 4. draft_email
Generate draft email content for outreach

**Aliases:** `DRAFT_EMAIL`

**Auth:** Not required

**Parameters:**
```json
{
  "to_role": "General Manager",                  // Optional: Recipient role
  "purpose": "intro",                            // Optional: Email purpose
  "product": "craft beer distribution"           // Optional: Product/service
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "draft": "Subject: Quick craft beer distribution intro...\n\n..."
  },
  "note": "Email draft created"
}
```

---

### 5. create_scheduled_monitor
Create scheduled monitoring job that runs periodically

**Aliases:** `CREATE_SCHEDULED_MONITOR`

**Auth:** Required (userId must be provided)

**Parameters:**
```json
{
  "label": "Weekly Brewery Monitor",             // Required: Monitor name
  "description": "Track new breweries weekly",   // Optional: Description
  "schedule": "weekly",                          // Optional: "hourly", "daily", "weekly", "biweekly", "monthly"
  "scheduleDay": 1,                              // Optional: Day of week (0-6, 0=Sunday) for weekly/biweekly
  "scheduleTime": "09:00",                       // Optional: Time in HH:MM format
  "monitorType": "deep_research",                // Optional: Monitor type
  "config": { "query": "new breweries" },        // Optional: Monitor configuration
  "emailAddress": "user@example.com"             // Optional: Email for notifications
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "monitor": {
      "id": "mon_def456",                        // Monitor ID
      "label": "Weekly Brewery Monitor",
      "schedule": "weekly",
      "nextRunAt": 1735027200000                 // Unix timestamp
    }
  },
  "note": "Monitor created: runs weekly starting 12/24/2025"
}
```

---

### 6. get_nudges
Get AI-generated suggestions and nudges for follow-ups

**Aliases:** `GET_NUDGES`

**Auth:** Required (userId must be provided)

**Parameters:**
```json
{
  "limit": 10                                    // Optional: Max nudges to return (default: 10)
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "nudges": [],                                // Array of nudge objects (currently empty - TODO)
    "count": 0,
    "message": "No pending nudges at the moment"
  },
  "note": "No nudges available"
}
```

---

## HTTP API Specification

### Base URL
```
http://localhost:5001  (development)
https://your-ui-domain.com  (production)
```

### Endpoint: Execute Tool
```
POST /api/tools/execute
Content-Type: application/json
```

**Request Body:**
```json
{
  "tool": "search_google_places",               // Required: Tool name
  "params": {                                    // Optional: Tool-specific parameters
    "query": "pubs",
    "location": "Leeds"
  },
  "userId": "user_123",                          // Optional but recommended: User ID
  "sessionId": "session_456",                    // Optional: Session ID for context
  "conversationId": "conv_789"                   // Optional: Conversation ID for chat context
}
```

**Response:**
```json
{
  "ok": true,                                    // Boolean: Success/failure
  "data": { ... },                               // Object: Tool-specific response data
  "note": "Found 25 businesses",                 // String: Human-readable message
  "error": null                                  // String: Error message if ok=false
}
```

**HTTP Status Codes:**
- `200 OK` - Tool executed (check `ok` field for success/failure)
- `400 Bad Request` - Missing required fields (e.g., no `tool` specified)
- `500 Internal Server Error` - Server error during execution

**Important:** The endpoint always returns `200 OK` even if the tool fails. Check the `ok` field in the response to determine success.

---

### Endpoint: List Available Tools
```
GET /api/tools/list
```

**Response:**
```json
{
  "ok": true,
  "tools": [
    {
      "name": "search_google_places",
      "aliases": ["SEARCH_PLACES", "search_wyshbone_database"],
      "description": "Search for businesses using Google Places API",
      "params": { ... },
      "requiresAuth": false
    },
    ...
  ],
  "count": 6
}
```

---

## Supervisor Integration Pattern

### Step 1: Configure UI Endpoint URL

In Supervisor's configuration, set the UI base URL:

```typescript
// supervisor/config.ts
export const WYSHBONE_UI_URL = process.env.WYSHBONE_UI_URL || 'http://localhost:5001';
```

---

### Step 2: Create Tool Execution Client

Create a client module to call the UI endpoint:

```typescript
// supervisor/lib/tools-client.ts
import fetch from 'node-fetch';

const UI_BASE_URL = process.env.WYSHBONE_UI_URL || 'http://localhost:5001';

export interface ToolExecuteRequest {
  tool: string;
  params?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
}

export interface ToolExecuteResponse {
  ok: boolean;
  data?: any;
  note?: string;
  error?: string;
}

/**
 * Execute a tool via Wyshbone UI unified endpoint
 */
export async function executeTool(request: ToolExecuteRequest): Promise<ToolExecuteResponse> {
  const endpoint = `${UI_BASE_URL}/api/tools/execute`;

  console.log(`🔧 Supervisor calling UI tool: ${request.tool}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result: ToolExecuteResponse = await response.json();

    if (result.ok) {
      console.log(`✅ Tool succeeded: ${request.tool}`);
    } else {
      console.log(`❌ Tool failed: ${request.tool} - ${result.error}`);
    }

    return result;
  } catch (error: any) {
    console.error(`❌ Tool execution error: ${request.tool}`, error.message);
    return {
      ok: false,
      error: `Failed to call UI endpoint: ${error.message}`,
    };
  }
}

/**
 * List available tools from UI
 */
export async function listAvailableTools(): Promise<any[]> {
  const endpoint = `${UI_BASE_URL}/api/tools/list`;

  try {
    const response = await fetch(endpoint);
    const result = await response.json();
    return result.tools || [];
  } catch (error: any) {
    console.error('Failed to fetch tool list:', error.message);
    return [];
  }
}
```

---

### Step 3: Use in Supervisor

Replace direct tool calls with calls to the UI endpoint:

**Before (Duplicated Code):**
```typescript
// ❌ BAD: Tool logic duplicated in Supervisor
import { searchGooglePlaces } from './tools/search-places';

async function handleToolCall(toolName: string, params: any) {
  if (toolName === 'search_google_places') {
    // Duplicated Google Places API logic here
    const results = await searchGooglePlaces(params);
    return results;
  }
}
```

**After (Unified Endpoint):**
```typescript
// ✅ GOOD: Supervisor calls UI endpoint
import { executeTool } from './lib/tools-client';

async function handleToolCall(toolName: string, params: any, userId: string) {
  // All tools go through unified endpoint
  const result = await executeTool({
    tool: toolName,
    params,
    userId,
    sessionId: 'supervisor_session',
  });

  if (!result.ok) {
    throw new Error(`Tool failed: ${result.error}`);
  }

  return result.data;
}
```

---

### Step 4: Error Handling

Always check the `ok` field and handle errors appropriately:

```typescript
const result = await executeTool({
  tool: 'search_google_places',
  params: { query: 'pubs', location: 'Leeds' },
  userId: 'user123',
});

if (!result.ok) {
  // Tool execution failed
  console.error(`Tool error: ${result.error}`);

  // Decide how to handle:
  // - Retry with different params?
  // - Fallback to alternative approach?
  // - Report error to user?

  throw new Error(`search_google_places failed: ${result.error}`);
}

// Tool succeeded - use result.data
const places = result.data.places;
console.log(`Found ${places.length} places`);
```

---

## Benefits of Unified Endpoint

### 1. Single Source of Truth
- Tool logic lives in **one place** (`wyshbone-ui/server/lib/actions.ts`)
- Bugs fixed once, apply everywhere
- Features added once, available everywhere

### 2. Zero Code Duplication
- Supervisor doesn't duplicate Google Places API calls
- Supervisor doesn't duplicate Hunter.io integration
- Supervisor doesn't duplicate SalesHandy logic

### 3. Automatic Tower Logging
- Every tool call logged to Tower automatically
- Consistent logging format across UI and Supervisor
- No need to add logging code in Supervisor

### 4. Easier Maintenance
- One codebase to update when APIs change
- One place to add new tools
- One place to fix security issues

### 5. API Key Management
- API keys stored in UI environment only
- Supervisor doesn't need Google/Hunter/SalesHandy keys
- Centralized credential management

---

## Testing the Integration

### 1. Start UI Server
```bash
cd wyshbone-ui
npm run dev
# Server runs on http://localhost:5001
```

### 2. Test Endpoint Directly
```bash
# List available tools
curl http://localhost:5001/api/tools/list

# Execute a tool
curl -X POST http://localhost:5001/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_google_places",
    "params": {
      "query": "craft breweries",
      "location": "Leeds",
      "maxResults": 10
    },
    "userId": "test_user"
  }'
```

### 3. Test from Supervisor
```typescript
import { executeTool } from './lib/tools-client';

// Execute search
const result = await executeTool({
  tool: 'search_google_places',
  params: {
    query: 'pubs',
    location: 'Manchester',
    maxResults: 20,
  },
  userId: 'supervisor_test',
});

console.log('Tool result:', result);
```

### 4. Verify Tower Logging
- Check Tower dashboard for logged tool executions
- Verify runId, userId, and tool parameters are logged
- Confirm execution times and success/failure status

---

## Environment Variables

**Required in UI (.env):**
```bash
# Google Places API
GOOGLE_PLACES_API_KEY=your_google_api_key

# Hunter.io (for batch_contact_finder)
HUNTER_API_KEY=your_hunter_api_key

# SalesHandy (for batch_contact_finder)
SALES_HANDY_API_TOKEN=your_saleshandy_token
SALES_HANDY_CAMPAIGN_ID=your_campaign_id

# OpenAI (for batch_contact_finder personalization)
OPENAI_API_KEY=your_openai_key

# Tower Logging
TOWER_URL=https://your-tower-instance.com
TOWER_API_KEY=your_tower_api_key
```

**Required in Supervisor (.env):**
```bash
# UI Endpoint URL
WYSHBONE_UI_URL=http://localhost:5001  # Development
# WYSHBONE_UI_URL=https://ui.wyshbone.ai  # Production
```

---

## Migration Checklist

- [ ] UI: `/api/tools/execute` endpoint created
- [ ] UI: All 6 tools accessible via endpoint
- [ ] UI: Tower logging integrated
- [ ] Supervisor: Tools client module created
- [ ] Supervisor: Environment variable `WYSHBONE_UI_URL` set
- [ ] Supervisor: All tool calls routed through UI endpoint
- [ ] Supervisor: Duplicated tool code removed
- [ ] Testing: All tools work via HTTP endpoint
- [ ] Testing: Tower logs show tool executions
- [ ] Testing: Supervisor successfully calls UI endpoint
- [ ] Production: Deploy UI with new endpoint
- [ ] Production: Update Supervisor to use UI endpoint

---

## Support

For questions or issues with tool integration:
1. Check Tower logs for detailed execution traces
2. Verify `WYSHBONE_UI_URL` is set correctly in Supervisor
3. Ensure UI server is running and accessible
4. Check API keys are configured in UI environment

---

**Last Updated:** 2026-01-04
**Version:** 1.0
