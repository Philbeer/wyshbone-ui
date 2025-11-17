# Wyshbone UI - Complete Codebase Export

**Generated:** November 17, 2025  
**Application:** Lead Generation & Business Intelligence Platform  
**Architecture:** Full-stack TypeScript (React + Express + PostgreSQL)

---

## Table of Contents

1. [Core Schema & Types](#1-core-schema--types)
2. [Backend Infrastructure](#2-backend-infrastructure)
3. [AI & Agent Systems](#3-ai--agent-systems)
4. [Tool Integration](#4-tool-integration)
5. [Memory & Storage](#5-memory--storage)
6. [Frontend Components](#6-frontend-components)
7. [Configuration Files](#7-configuration-files)

---

## 1. Core Schema & Types

### shared/schema.ts
```typescript
import { z } from "zod";
import { pgTable, text, integer, jsonb, bigint, index, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Chat message schema
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// Chat request schema
export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
  }),
  defaultCountry: z.string().optional(),
  conversationId: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ============= MEMORY SYSTEM TABLES =============

// Conversations table - stores user conversation sessions
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default("Conversation"),
  type: text("type").notNull().default("chat"), // "chat" or "monitor_run"
  monitorId: text("monitor_id"),
  runSequence: integer("run_sequence"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("conversations_user_id_idx").on(table.userId),
  createdAtIdx: index("conversations_created_at_idx").on(table.createdAt),
  monitorIdIdx: index("conversations_monitor_id_idx").on(table.monitorId, table.runSequence),
}));

// Messages table - stores individual messages in conversations
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId, table.createdAt),
}));

// Facts table - stores extracted durable facts about users
export const facts = pgTable("facts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceConversationId: text("source_conversation_id"),
  sourceMessageId: text("source_message_id"),
  fact: text("fact").notNull(),
  score: integer("score").notNull().default(50),
  category: text("category").notNull().default("general"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdScoreIdx: index("facts_user_id_score_idx").on(table.userId, table.score, table.createdAt),
  categoryIdx: index("facts_category_idx").on(table.category, table.createdAt),
}));

// Users table for authentication and subscription management
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  isDemo: integer("is_demo").notNull().default(0),
  demoCreatedAt: bigint("demo_created_at", { mode: "number" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionTier: text("subscription_tier").default("free"),
  subscriptionStatus: text("subscription_status").default("inactive"),
  monitorCount: integer("monitor_count").notNull().default(0),
  deepResearchCount: integer("deep_research_count").notNull().default(0),
  lastResetAt: bigint("last_reset_at", { mode: "number" }),
  
  // Personalization fields
  companyName: text("company_name"),
  companyDomain: text("company_domain"),
  roleHint: text("role_hint"),
  primaryObjective: text("primary_objective"),
  secondaryObjectives: text("secondary_objectives").array(),
  targetMarkets: text("target_markets").array(),
  productsOrServices: text("products_or_services").array(),
  preferences: jsonb("preferences"),
  inferredIndustry: text("inferred_industry"),
  lastContextRefresh: bigint("last_context_refresh", { mode: "number" }),
  confidence: integer("confidence"),
  
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  subscriptionTierIdx: index("users_subscription_tier_idx").on(table.subscriptionTier),
  isDemoIdx: index("users_is_demo_idx").on(table.isDemo, table.demoCreatedAt),
}));

// Deep Research Runs table
export const deepResearchRuns = pgTable("deep_research_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id"),
  label: text("label").notNull(),
  prompt: text("prompt").notNull(),
  mode: text("mode").notNull().default("report"),
  counties: text("counties").array(),
  windowMonths: integer("window_months"),
  schemaName: text("schema_name"),
  schema: jsonb("schema"),
  intensity: text("intensity").notNull().default("standard"),
  responseId: text("response_id"),
  status: text("status").notNull().default("queued"),
  outputText: text("output_text"),
  error: text("error"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("deep_research_runs_user_id_idx").on(table.userId),
  statusIdx: index("status_idx").on(table.status),
  updatedAtIdx: index("updated_at_idx").on(table.updatedAt),
  responseIdIdx: index("response_id_idx").on(table.responseId),
}));

// Scheduled Monitors table
export const scheduledMonitors = pgTable("scheduled_monitors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  label: text("label").notNull(),
  description: text("description").notNull(),
  schedule: text("schedule").notNull(),
  scheduleDay: text("schedule_day"),
  scheduleTime: text("schedule_time"),
  monitorType: text("monitor_type").notNull(),
  config: jsonb("config"),
  isActive: integer("is_active").notNull().default(1),
  status: text("status").notNull().default("active"),
  suggestedBy: text("suggested_by"),
  suggestedReason: text("suggested_reason"),
  suggestionMetadata: jsonb("suggestion_metadata"),
  emailNotifications: integer("email_notifications").notNull().default(0),
  emailAddress: text("email_address"),
  lastRunAt: bigint("last_run_at", { mode: "number" }),
  nextRunAt: bigint("next_run_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("scheduled_monitors_user_id_idx").on(table.userId),
  isActiveIdx: index("scheduled_monitors_is_active_idx").on(table.isActive, table.nextRunAt),
  statusIdx: index("scheduled_monitors_status_idx").on(table.status),
  conversationIdIdx: index("scheduled_monitors_conversation_id_idx").on(table.conversationId),
}));
```

---

## 2. Backend Infrastructure

### server/routes.ts (Main Chat API)
```typescript
// Tower Integration: Unified runId per conversation
runId = getOrCreateRunId(conversationId);

// Goal Capture Flow
if (isAwaitingGoal && !isCommand) {
  console.log("🎯 Capturing user goal:", latestUserText);
  await storage.setUserGoal(sessionId, latestUserText);
  await storage.setAwaitingGoal(sessionId, false);
  
  // Log to Tower
  await completeRunLog(
    runId,
    conversationId,
    user.id,
    user.email,
    latestUserText,
    confirmationMsg,
    'success',
    runStartTime,
    undefined,
    undefined,
    'standard'
  );
}

// Standard Chat with GPT-5 Streaming
const stream = await openai.chat.completions.create({
  model: "gpt-5",
  messages: memoryMessages,
  stream: true,
  tools: toolDefinitions,
  tool_choice: "auto",
});

// Tool Calling Handler
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  if (delta?.tool_calls) {
    // Execute tools (SEARCH_PLACES, DEEP_RESEARCH, BATCH_CONTACT_FINDER)
    const result = await executeAction({
      action: toolCall.function.name,
      params: JSON.parse(toolCall.function.arguments),
      userId: user.id,
      sessionId,
      conversationId,
      storage
    });
  }
}
```

### server/openai.ts (AI Configuration)
```typescript
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./memory";
import type { SessionContext } from "./lib/context";

export const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export function buildPersonalizedSystemPrompt(context?: SessionContext): string {
  let prompt = SYSTEM_PROMPT.content;
  
  if (!context) {
    return prompt;
  }
  
  // Layer personalization on top
  if (context.companyName || context.companyDomain || context.inferredIndustry) {
    prompt += "\n\nCONTEXT AWARENESS:";
    
    if (context.companyName) {
      prompt += `\n- User works for: ${context.companyName}`;
    }
    
    if (context.inferredIndustry) {
      prompt += `\n- Industry: ${context.inferredIndustry}`;
    }
    
    if (context.primaryObjective) {
      prompt += `\n- Primary goal: ${context.primaryObjective}`;
    }
  }
  
  return prompt;
}
```

---

## 3. AI & Agent Systems

### server/lib/agent-kernel.ts (MEGA Agent - Autonomous Mode)
```typescript
/**
 * MEGA Agent: Multi-step autonomous executor
 * Uses GPT-5 with structured outputs for planning and execution
 */

export async function executeMegaAgent(params: {
  userMessage: string;
  conversationHistory: ChatMessage[];
  context?: SessionContext;
  userId: string;
  sessionId: string;
  conversationId: string;
  storage: IStorage;
  onProgress?: (data: any) => void;
}): Promise<MegaAgentResult> {
  
  // PHASE 1: Planning - Create multi-step plan
  const planningResponse = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: MEGA_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "execution_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            plan: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  step: { type: "integer" },
                  action: { type: "string" },
                  params: { type: "object" },
                  reasoning: { type: "string" }
                },
                required: ["step", "action", "params", "reasoning"]
              }
            }
          },
          required: ["plan"]
        }
      }
    }
  });

  const plan = JSON.parse(planningResponse.choices[0].message.content);
  
  // PHASE 2: Execution - Run each step
  const results = [];
  for (const step of plan.plan) {
    const result = await executeAction({
      action: step.action,
      params: step.params,
      userId: params.userId,
      sessionId: params.sessionId,
      conversationId: params.conversationId,
      storage: params.storage
    });
    
    results.push({ step, result });
    
    if (params.onProgress) {
      params.onProgress({ step, result });
    }
  }
  
  // PHASE 3: Synthesis - Create final response
  const synthesisResponse = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: "Synthesize execution results into user-friendly summary" },
      { role: "user", content: JSON.stringify({ plan, results }) }
    ]
  });
  
  return {
    plan,
    results,
    summary: synthesisResponse.choices[0].message.content
  };
}
```

### server/lib/actions.ts (Shared Action Execution)
```typescript
/**
 * Shared action execution module
 * Both Standard and MEGA modes use this for identical business logic
 */

export async function executeAction(params: {
  action: string;
  params: any;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  storage?: IStorage;
}): Promise<ActionResult> {
  
  switch (action) {
    case "SEARCH_PLACES": {
      const { query, locationText, location, maxResults = 30, country = "GB" } = actionParams;
      
      const results = await searchPlaces({
        query,
        locationText: locationText || location,
        maxResults,
        region: country
      });
      
      return {
        ok: true,
        data: {
          places: results,
          count: results.length,
          query,
          location: locationText || location,
          country
        }
      };
    }
    
    case "DEEP_RESEARCH": {
      const { prompt, topic, label, counties, windowMonths, mode = "report" } = actionParams;
      
      const run = await startBackgroundResponsesJob({
        prompt: researchTopic,
        label: label || researchTopic,
        mode,
        counties,
        windowMonths
      }, undefined, userId);
      
      return {
        ok: true,
        data: {
          run: {
            id: run.id,
            label: run.label || researchTopic,
            status: "running"
          }
        }
      };
    }
    
    case "BATCH_CONTACT_FINDER": {
      const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
      
      await storage.createBatchJob({
        id: batchId,
        userId,
        status: "running",
        query,
        location,
        country,
        targetRole,
        limit
      });
      
      // Execute asynchronously
      (async () => {
        const result = await executeBatchJob({
          query,
          location,
          country,
          targetRole,
          limit,
          personalize: true,
          googleApiKey,
          hunterApiKey,
          salesHandyToken,
          salesHandyCampaignId,
          openaiKey
        });
        
        await storage.updateBatchJob(batchId, {
          status: "completed",
          items: result.items,
          totalSent: result.created.length
        });
      })();
      
      return {
        ok: true,
        data: { batchId, status: "running" }
      };
    }
  }
}
```

---

## 4. Tool Integration

### server/googlePlaces.ts (Business Search)
```typescript
import axios from "axios";

export async function searchPlaces(options: {
  query: string;
  locationText?: string;
  maxResults?: number;
  region?: string;
}): Promise<Place[]> {
  const { query, locationText, maxResults = 30, region = "GB" } = options;
  
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const url = "https://places.googleapis.com/v1/places:searchText";
  
  const payload = {
    textQuery: `${query} in ${locationText}`,
    languageCode: "en",
    regionCode: region,
    maxResultCount: Math.min(maxResults, 20)
  };
  
  const response = await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber"
    }
  });
  
  return response.data.places || [];
}
```

### server/deepResearch.ts (Responses API - Deep Research)
```typescript
import { openai } from "./openai";

export async function startBackgroundResponsesJob(
  config: {
    prompt: string;
    label: string;
    mode?: "report" | "json";
    counties?: string[];
    windowMonths?: number;
  },
  sessionId?: string,
  userId?: string
): Promise<DeepResearchRun> {
  
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Create run record in database
  const run = await storage.createDeepResearchRun({
    id: runId,
    userId,
    sessionId,
    label: config.label,
    prompt: config.prompt,
    mode: config.mode || "report",
    counties: config.counties,
    windowMonths: config.windowMonths,
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  
  // Start Responses API job asynchronously
  (async () => {
    try {
      const response = await openai.responses.create({
        model: "gpt-5",
        instructions: config.prompt,
        response_format: config.mode === "json" ? { type: "json_object" } : undefined,
        tools: [
          {
            type: "function",
            function: {
              name: "web_search",
              description: "Search the web for current information"
            }
          }
        ]
      });
      
      await storage.updateDeepResearchRun(runId, {
        responseId: response.id,
        status: "in_progress"
      });
      
      // Poll for completion
      const poller = setInterval(async () => {
        const status = await openai.responses.retrieve(response.id);
        
        if (status.status === "completed") {
          clearInterval(poller);
          await storage.updateDeepResearchRun(runId, {
            status: "completed",
            outputText: status.output,
            updatedAt: Date.now()
          });
        }
      }, 5000);
      
    } catch (error) {
      await storage.updateDeepResearchRun(runId, {
        status: "failed",
        error: error.message
      });
    }
  })();
  
  return run;
}
```

### server/batchService.ts (Hunter.io + SalesHandy Pipeline)
```typescript
export async function executeBatchJob(params: {
  query: string;
  location: string;
  country: string;
  targetRole: string;
  limit: number;
  personalize: boolean;
  googleApiKey: string;
  hunterApiKey: string;
  salesHandyToken: string;
  salesHandyCampaignId: string;
  openaiKey: string;
}): Promise<BatchJobResult> {
  
  // 1. Search Google Places
  const places = await searchPlaces({
    query: params.query,
    locationText: params.location,
    maxResults: params.limit,
    region: params.country
  });
  
  // 2. Extract domains from websites
  const items = places.map(place => ({
    name: place.displayName.text,
    domain: extractDomain(place.websiteUri),
    phone: place.nationalPhoneNumber
  }));
  
  // 3. Find emails with Hunter.io
  for (const item of items) {
    if (!item.domain) continue;
    
    const hunterResponse = await axios.get(
      `https://api.hunter.io/v2/domain-search?domain=${item.domain}&api_key=${params.hunterApiKey}`
    );
    
    item.emails = hunterResponse.data.data.emails;
    item.bestEmail = rankEmailByRole(item.emails, params.targetRole);
  }
  
  // 4. Generate personalized outreach
  if (params.personalize) {
    for (const item of items) {
      if (!item.bestEmail) continue;
      
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Write personalized email for ${item.name} (${item.domain})`
        }]
      });
      
      item.personalizedMessage = aiResponse.choices[0].message.content;
    }
  }
  
  // 5. Add to SalesHandy campaign
  const created = [];
  for (const item of items) {
    if (!item.bestEmail) continue;
    
    const shResponse = await axios.post(
      "https://api.saleshandy.com/v1/prospects",
      {
        email: item.bestEmail.value,
        first_name: item.bestEmail.first_name,
        campaign_id: params.salesHandyCampaignId,
        custom_message: item.personalizedMessage
      },
      {
        headers: { "Authorization": `Bearer ${params.salesHandyToken}` }
      }
    );
    
    created.push(shResponse.data);
  }
  
  return { items, created, skipped: items.filter(i => !i.bestEmail) };
}
```

---

## 5. Memory & Storage

### server/memory.ts (Context System)
```typescript
import type { ChatMessage } from "@shared/schema";

export const SYSTEM_PROMPT = {
  role: "system" as const,
  content: `You are Wyshbone AI - a business intelligence assistant.

CORE CAPABILITIES:
1. Business Search (Google Places API)
2. Deep Research (Responses API with web search)
3. Contact Discovery (Hunter.io + SalesHandy)
4. Scheduled Monitoring

TOOL USAGE:
- SEARCH_PLACES: Find businesses in specific locations
- DEEP_RESEARCH: Conduct thorough research with citations
- BATCH_CONTACT_FINDER: Full pipeline from search to outreach
- CREATE_SCHEDULED_MONITOR: Set up recurring tasks

CONVERSATION STYLE:
- Action-first: Prefer doing over explaining
- Concise: One paragraph responses
- UK-focused: Default to British locations unless specified`
};

export async function buildContextWithFacts(
  userId: string,
  conversationHistory: ChatMessage[],
  maxMessages: number = 20,
  userContext?: SessionContext
): Promise<ChatMessage[]> {
  
  // Start with personalized system prompt
  const systemPrompt = buildPersonalizedSystemPrompt(userContext);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt }
  ];
  
  // Add relevant facts from database
  const facts = await storage.getTopFacts(userId, 10);
  if (facts.length > 0) {
    const factsContext = facts.map(f => f.fact).join("\n");
    messages.push({
      role: "system",
      content: `USER BACKGROUND:\n${factsContext}`
    });
  }
  
  // Add recent conversation history
  const recentHistory = conversationHistory.slice(-maxMessages);
  messages.push(...recentHistory);
  
  return messages;
}
```

### server/storage.ts (Database Interface)
```typescript
import { db } from "./db";
import { conversations, messages, facts, users, deepResearchRuns, scheduledMonitors } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Conversations
  createConversation(userId: string, label?: string): Promise<string>;
  getConversationHistory(conversationId: string): Promise<SelectMessage[]>;
  updateConversationLabel(conversationId: string, label: string): Promise<void>;
  
  // Messages
  saveMessage(conversationId: string, role: string, content: string): Promise<void>;
  
  // Facts
  saveFact(userId: string, fact: string, category?: string, score?: number): Promise<void>;
  getTopFacts(userId: string, limit: number): Promise<SelectFact[]>;
  
  // Users
  getUserById(userId: string): Promise<SelectUser | undefined>;
  updateUserContext(userId: string, context: Partial<SelectUser>): Promise<void>;
  
  // Deep Research
  createDeepResearchRun(data: InsertDeepResearchRun): Promise<SelectDeepResearchRun>;
  updateDeepResearchRun(id: string, updates: Partial<InsertDeepResearchRun>): Promise<void>;
  getDeepResearchRun(id: string): Promise<SelectDeepResearchRun | undefined>;
  
  // Scheduled Monitors
  createScheduledMonitor(data: InsertScheduledMonitor): Promise<SelectScheduledMonitor>;
  getActiveMonitors(userId: string): Promise<SelectScheduledMonitor[]>;
  updateMonitorNextRun(id: string, nextRunAt: number): Promise<void>;
}

export class PostgresStorage implements IStorage {
  async createConversation(userId: string, label = "Conversation"): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(conversations).values({
      id,
      userId,
      label,
      createdAt: Date.now()
    });
    return id;
  }
  
  async saveMessage(conversationId: string, role: string, content: string): Promise<void> {
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      conversationId,
      role,
      content,
      createdAt: Date.now()
    });
  }
  
  async getConversationHistory(conversationId: string): Promise<SelectMessage[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }
  
  async saveFact(userId: string, fact: string, category = "general", score = 50): Promise<void> {
    await db.insert(facts).values({
      id: crypto.randomUUID(),
      userId,
      fact,
      category,
      score,
      createdAt: Date.now()
    });
  }
  
  async getTopFacts(userId: string, limit: number): Promise<SelectFact[]> {
    return await db
      .select()
      .from(facts)
      .where(eq(facts.userId, userId))
      .orderBy(desc(facts.score), desc(facts.createdAt))
      .limit(limit);
  }
}
```

### server/lib/towerClient.ts (Tower Logging Integration)
```typescript
const TOWER_ENDPOINT = "https://d9960f9d-08d3-46d0-af1d-fd895f45aae5-00-2trq3oqtzu4yy.picard.replit.dev";

// Unified runId per conversation (created once, sent when complete)
const conversationRunIds = new Map<string, string>();

export function getOrCreateRunId(conversationId: string): string {
  if (!conversationRunIds.has(conversationId)) {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    conversationRunIds.set(conversationId, runId);
  }
  return conversationRunIds.get(conversationId)!;
}

export async function completeRunLog(
  runId: string,
  conversationId: string,
  userId: string,
  userEmail: string,
  userMessage: string,
  assistantResponse: string,
  status: 'success' | 'error' | 'timeout' | 'fail',
  startTime: number,
  toolsUsed?: string[],
  errorMessage?: string,
  mode?: 'standard' | 'mega'
): Promise<void> {
  try {
    const runLog = {
      runId,
      conversationId,
      userId,
      userEmail,
      userMessage: userMessage.substring(0, 500),
      assistantResponse: assistantResponse.substring(0, 1000),
      status,
      duration: Date.now() - startTime,
      toolsUsed: toolsUsed || [],
      errorMessage,
      mode: mode || 'standard',
      timestamp: new Date().toISOString()
    };
    
    await axios.post(`${TOWER_ENDPOINT}/api/runs`, runLog, {
      headers: { "Content-Type": "application/json" }
    });
    
    console.log(`✅ Tower log sent: ${runId} (${status})`);
  } catch (error) {
    console.error("❌ Failed to send Tower log:", error);
  }
}
```

---

## 6. Frontend Components

### client/src/pages/chat.tsx (Main Chat Interface)
```typescript
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);
    
    // Server-Sent Events streaming
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...messages, userMessage],
        user: { id: userId, email: userEmail }
      })
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let assistantMessage = "";
    
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          
          if (data.content) {
            assistantMessage += data.content;
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              
              if (lastMsg?.role === "assistant") {
                lastMsg.content = assistantMessage;
              } else {
                newMessages.push({ role: "assistant", content: assistantMessage });
              }
              
              return newMessages;
            });
          }
          
          if (data === "[DONE]") {
            setIsStreaming(false);
          }
        }
      }
    }
  };
  
  return (
    <div className="flex flex-col h-screen">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <Card
            key={idx}
            className={`mb-4 p-4 ${msg.role === "user" ? "bg-primary/10" : "bg-card"}`}
            data-testid={`message-${idx}`}
          >
            <div className="font-semibold mb-2">
              {msg.role === "user" ? "You" : "Wyshbone"}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </Card>
        ))}
      </ScrollArea>
      
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask Wyshbone anything..."
            className="flex-1"
            data-testid="input-message"
          />
          <Button
            onClick={sendMessage}
            disabled={isStreaming}
            data-testid="button-send"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### client/src/pages/research.tsx (Deep Research Monitor)
```typescript
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function Research() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ["/api/research/runs"],
    refetchInterval: 5000 // Poll every 5 seconds for status updates
  });
  
  if (isLoading) {
    return <Loader2 className="animate-spin" />;
  }
  
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Deep Research Runs</h1>
      
      <div className="grid gap-4">
        {runs?.map(run => (
          <Card key={run.id} data-testid={`run-${run.id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <CardTitle>{run.label}</CardTitle>
                <Badge
                  variant={
                    run.status === "completed" ? "default" :
                    run.status === "failed" ? "destructive" :
                    "secondary"
                  }
                  data-testid={`status-${run.id}`}
                >
                  {run.status}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{run.prompt}</p>
              
              {run.status === "completed" && run.outputText && (
                <div className="mt-4 p-4 bg-muted rounded-md">
                  <pre className="whitespace-pre-wrap text-sm">
                    {run.outputText}
                  </pre>
                </div>
              )}
              
              {run.status === "in_progress" && (
                <div className="flex items-center gap-2 mt-4">
                  <Loader2 className="animate-spin w-4 h-4" />
                  <span className="text-sm">Research in progress...</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Configuration Files

### .env.example
```bash
# OpenAI API
OPENAI_API_KEY=sk-...

# Google Places API
GOOGLE_PLACES_API_KEY=...

# Hunter.io (Email Finding)
HUNTER_API_KEY=...

# SalesHandy (Email Campaigns)
SALES_HANDY_API_TOKEN=...
SALES_HANDY_CAMPAIGN_ID=...

# Supabase (Optional - Supervisor Integration)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Tower (Analytics Endpoint)
TOWER_ENDPOINT=https://d9960f9d-08d3-46d0-af1d-fd895f45aae5-00-2trq3oqtzu4yy.picard.replit.dev

# Database
DATABASE_URL=postgresql://...
```

### package.json
```json
{
  "name": "wyshbone-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "openai": "^5.0.0",
    "express": "^4.18.0",
    "drizzle-orm": "^0.36.0",
    "@neondatabase/serverless": "^0.10.0",
    "react": "^18.3.0",
    "wouter": "^3.3.0",
    "@tanstack/react-query": "^5.0.0",
    "zod": "^3.23.0",
    "axios": "^1.7.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tsx": "^4.19.0",
    "drizzle-kit": "^0.27.0"
  }
}
```

---

## Architecture Summary

### System Components

1. **Standard Chat Mode**
   - GPT-5 streaming with tool calling
   - Real-time SSE (Server-Sent Events)
   - Unified runId per conversation (Tower logging)
   - Personalized system prompts based on user context

2. **MEGA Agent Mode** (Autonomous)
   - Multi-step planning with GPT-5
   - Structured outputs (JSON schema enforcement)
   - Sequential execution with progress updates
   - Final synthesis into user-friendly summary

3. **Memory System**
   - Conversations: Postgres table with labels and types
   - Messages: All messages stored with timestamps
   - Facts: Extracted durable insights about users
   - Progressive context gathering (lightweight, action-first)

4. **Tool Integration**
   - Google Places: Business search (up to 60 results with pagination)
   - Hunter.io: Email discovery by domain
   - SalesHandy: Campaign prospect addition
   - Responses API: Deep research with web search

5. **Monitoring & Analytics**
   - Tower: Centralized run logging (success/error/timeout/fail)
   - Scheduled Monitors: Recurring tasks (hourly/daily/weekly/monthly)
   - Deep Research Runs: Background jobs with status tracking

### Data Flow

```
User Input → Standard/MEGA Router
            ↓
Standard: GPT-5 Streaming + Tool Calling → Execute Action → Stream Response
MEGA: Plan → Execute Steps → Synthesize → Return Complete Result
            ↓
Both modes → Save to Database (conversations, messages, facts)
            ↓
Tower Logging (completeRunLog with unified runId)
```

### Key Design Patterns

- **Shared Action Execution**: Both Standard and MEGA use `server/lib/actions.ts` for consistency
- **Unified RunId**: One runId per conversation (created on first message, sent to Tower when complete)
- **Progressive Context**: Start with basic info, adapt based on what we learn
- **Action-First**: Prefer doing over explaining (concise responses, immediate execution)
- **Asynchronous Jobs**: Batch processing and deep research run in background

---

## File Organization

```
wyshbone-ui/
├── server/
│   ├── routes.ts                 # Main chat API + job control
│   ├── openai.ts                 # AI configuration + personalized prompts
│   ├── memory.ts                 # Context system + SYSTEM_PROMPT
│   ├── storage.ts                # Database interface (IStorage)
│   ├── googlePlaces.ts           # Google Places API integration
│   ├── deepResearch.ts           # Responses API (background jobs)
│   ├── batchService.ts           # Hunter.io + SalesHandy pipeline
│   ├── leadClarification.ts      # Lead parameter extraction
│   ├── locationGuard.ts          # Ambiguity detection for cities
│   ├── supabase-client.ts        # Supervisor integration
│   └── lib/
│       ├── agent-kernel.ts       # MEGA agent (autonomous mode)
│       ├── actions.ts            # Shared action execution
│       ├── towerClient.ts        # Tower logging integration
│       └── context.ts            # SessionContext type
├── client/src/
│   ├── pages/
│   │   ├── chat.tsx              # Main chat interface
│   │   ├── research.tsx          # Deep research monitor
│   │   ├── batch.tsx             # Batch job tracker
│   │   └── monitors.tsx          # Scheduled monitors
│   └── components/ui/            # Shadcn components
├── shared/
│   └── schema.ts                 # Drizzle tables + Zod schemas
└── .env.example                  # Environment variables template
```

---

**End of Export**
