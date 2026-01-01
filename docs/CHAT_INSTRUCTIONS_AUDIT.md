# Chat Instructions Audit

## 🚨 PROBLEM IDENTIFIED

The chat is asking unnecessary follow-up questions because there are **multiple layers of legacy "ask before acting" systems** designed for GPT that conflict with Claude's natural tool-use behavior.

---

## Current Chat Instruction Layers

### 1. **Main System Prompt** (`shared/conversationConfig.ts`)

**File:** `shared/conversationConfig.ts`
**Used in:** `server/routes.ts` line 2229-2234

This is the PRIMARY problem. The system prompt contains instructions that FORCE the bot to ask questions:

```typescript
// Lines 74-85 - THE MAIN CULPRIT
"If the user asks a broad search without specifying the method, answer with:

'I can help you with that in four ways:

🔬 **Deep Research** — full analysis and insights  
🔍 **Quick Search** — fast list of businesses  
📧 **Email Finder** — find verified contacts and build outreach  
⏰ **Scheduled Monitoring** — check this automatically over time

Which option would you like?'"
```

**Also includes:**
- Lines 88-103: "Suggestion Engine" that triggers on "real ambiguity"
- Lines 114-121: "Clarification Rules" that limit when to ask
- Lines 47: "You may only call ONE tool per user request" ← restrictive

---

### 2. **Lead Clarification System** (`server/leadClarification.ts`)

**File:** `server/leadClarification.ts`  
**Used in:** `server/routes.ts` lines 2457-2502

A **complete separate system** that intercepts requests BEFORE tools are called:

```typescript
// Line 226
"Thanks! Just a bit more detail:\n\n${questions...}"

// Line 281  
"To get this right, I need a bit more detail:\n\n${questions...}"
```

**Triggers when:**
- Keywords match: "find", "search", "pubs", "restaurants", "leads", etc.
- Detected "lead intent"
- Missing fields: targetRegion, targetPersona, volume, timing

**Flow:**
1. User says "pubs in leeds"
2. `detectLeadIntent()` → TRUE (contains "pubs")
3. `extractLeadContext()` → extracts partial context
4. `getMissingLeadFields()` → finds missing fields
5. Returns clarifying questions → BLOCKS tool execution

---

### 3. **Lead Context Helper** (`server/leadContextHelper.ts`)

**File:** `server/leadContextHelper.ts`

Defines the required fields for lead requests:

```typescript
interface LeadRequestContext {
  targetRegion?: string;    // "North West", "London"
  targetPersona?: string;   // "pub landlords", "owners"
  volume?: string;          // "50", "25-30"
  timing?: string;          // "this week", "ASAP"
}
```

If ANY of these are missing, clarification questions are triggered!

---

### 4. **Agent Kernel Intent Detection** (`server/lib/agent-kernel.ts`)

**File:** `server/lib/agent-kernel.ts` line 617

```typescript
"natural_response": "I can help with that in four ways..."
```

Yet another hardcoded response pattern!

---

## 🔴 Root Cause Analysis

| System | Purpose | Problem |
|--------|---------|---------|
| `conversationConfig.ts` | System prompt | Tells bot to list 4 options instead of acting |
| `leadClarification.ts` | Pre-tool check | Blocks tools until all fields are filled |
| `leadContextHelper.ts` | Field requirements | Requires region/persona/volume/timing |
| `agent-kernel.ts` | Fallback response | Hardcoded "four ways" pattern |

**These systems were built for GPT-style chatbots** that need explicit instruction to use tools.

**Claude doesn't need this!** Claude naturally:
- Understands when to use tools
- Asks questions only when truly necessary
- Can infer missing parameters from context
- Chains multiple tools intelligently

---

## 🟢 Recommended Cleanup

### Option A: Minimal System Prompt (Recommended)

Replace the entire `WyshboneChatConfig.systemPrompt` with:

```typescript
export const WyshboneChatConfig = {
  systemPrompt: `You are Wyshbone AI, a sales assistant that helps find businesses and contacts.

AVAILABLE TOOLS:
1. search_google_places - Quick business search by location/type
2. deep_research - Comprehensive research with web sources
3. saleshandy_batch_call - Find emails and add to campaigns  
4. create_scheduled_monitor - Set up recurring monitoring

BEHAVIOR:
- When users ask to find businesses, use search_google_places immediately
- When users want research or analysis, use deep_research immediately
- When users want emails or contacts, use saleshandy_batch_call immediately
- When users want recurring checks, use create_scheduled_monitor immediately
- Only ask clarifying questions if location is completely missing
- Prefer action over questions

EXAMPLES:
- "pubs in Leeds" → search_google_places(query="pubs", location="Leeds, UK")
- "research the craft beer market" → deep_research(prompt="craft beer market analysis")
- "find emails for those pubs" → saleshandy_batch_call with previous results
`,
  // ... rest unchanged
};
```

### Option B: Disable Lead Clarification (Quick Fix)

In `server/routes.ts`, comment out the clarification check:

```typescript
// DISABLED: Lead clarification was causing unnecessary questions
// const clarificationResult = await handleLeadClarification({...});

// Just proceed with tools
const clarificationResult = { type: 'skip' };
```

### Option C: Reduce Required Fields (Moderate Fix)

In `server/leadContextHelper.ts`, make all fields optional:

```typescript
// Change getMissingLeadFields to return empty array
export function getMissingLeadFields(): string[] {
  return []; // Never require clarification
}
```

---

## 📍 Files to Modify

| Priority | File | Change |
|----------|------|--------|
| 🔴 HIGH | `shared/conversationConfig.ts` | Simplify system prompt |
| 🔴 HIGH | `server/routes.ts` | Disable leadClarification call |
| 🟡 MED | `server/leadClarification.ts` | Delete or disable entirely |
| 🟡 MED | `server/lib/agent-kernel.ts` | Remove hardcoded "four ways" |
| 🟢 LOW | `server/leadContextHelper.ts` | Remove if not needed |

---

## ⚡ Quick Test After Fix

After changes, test:
- "pubs in leeds" → Should immediately search, NOT ask questions
- "find breweries" → Should search with user's default country
- "research craft beer market" → Should start research immediately
- "get emails for coffee shops in London" → Should find contacts immediately

---

## Summary

The chat has **4 separate systems** fighting each other:
1. System prompt saying "ask which option"
2. Lead clarification requiring region/persona/volume/timing
3. Lead context helper defining "required" fields
4. Agent kernel with hardcoded "four ways" fallback

**Solution:** Remove/simplify these and let Claude use its natural tool-calling intelligence!

