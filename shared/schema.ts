import { z } from "zod";
import { pgTable, text, integer, jsonb, bigint, index, serial, numeric, date, timestamp, uuid, real, varchar, boolean, doublePrecision } from "drizzle-orm/pg-core";
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
  clientRequestId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Chat response schema
export const chatResponseSchema = z.object({
  reply: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Tool add note request schema
export const addNoteRequestSchema = z.object({
  userToken: z.string(),
  leadId: z.string(),
  note: z.string(),
});

export type AddNoteRequest = z.infer<typeof addNoteRequestSchema>;

// Tool add note response schema
export const addNoteResponseSchema = z.object({
  ok: z.boolean(),
});

export type AddNoteResponse = z.infer<typeof addNoteResponseSchema>;

// Search request schema
export const searchRequestSchema = z.object({
  query: z.string(),
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

// Search response schema (wyshbone_results)
export const searchResponseSchema = z.object({
  query: z.string(),
  generated_at: z.string(),
  results: z.array(z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string(),
  })),
  notes: z.string(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

// Bubble run batch request schema
export const bubbleRunBatchRequestSchema = z.object({
  business_types: z.array(z.string()).min(1, "At least one business type is required"),
  roles: z.array(z.string()).optional(),
  delay_ms: z.number().int().min(0).optional(),
  number_countiestosearch: z.number().int().min(1).optional(),
  smarlead_id: z.string().optional(),
  counties: z.array(z.string()).optional(), // Explicit counties override auto-generation
  country: z.string().optional(), // Country/state for the locations
  userEmail: z.string().email().optional(), // User's email for batch execution
});

export type BubbleRunBatchRequest = z.infer<typeof bubbleRunBatchRequestSchema>;

// Bubble run batch response schema
export const bubbleRunBatchResponseSchema = z.object({
  ok: z.boolean(),
  results: z.array(z.object({
    business_type: z.string(),
    role: z.string(),
    ok: z.boolean(),
    status: z.number(),
    county: z.string().optional(),
  })),
});

export type BubbleRunBatchResponse = z.infer<typeof bubbleRunBatchResponseSchema>;

// Job schema for region-powered bulk search
export const jobSchema = z.object({
  id: z.string(),
  business_type: z.string(),
  country: z.enum(["UK", "US"]),
  granularity: z.enum(["county", "borough", "state"]),
  region_ids: z.array(z.string()),
  cursor: z.number().int().min(0),
  processed: z.array(z.string()),
  failed: z.array(z.object({
    region_id: z.string(),
    region_name: z.string(),
    error: z.string(),
  })).optional(),
  status: z.enum(["pending", "running", "paused", "done", "cancelled"]),
  created_by_email: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Job = z.infer<typeof jobSchema>;

// Job create request schema
export const jobCreateRequestSchema = z.object({
  business_type: z.string().min(1),
  country: z.enum(["UK", "US"]),
  granularity: z.enum(["county", "borough", "state"]),
  region_filter: z.string().optional(),
  userEmail: z.string().email(),
});

export type JobCreateRequest = z.infer<typeof jobCreateRequestSchema>;

// Job create response schema
export const jobCreateResponseSchema = z.object({
  jobId: z.string(),
  total_regions: z.number(),
});

export type JobCreateResponse = z.infer<typeof jobCreateResponseSchema>;

// Job status response schema
export const jobStatusResponseSchema = z.object({
  jobId: z.string(),
  business_type: z.string(),
  status: z.enum(["pending", "running", "paused", "done", "cancelled"]),
  processed_count: z.number(),
  total: z.number(),
  percent: z.number(),
  recent_region: z.string().optional(),
  failed: z.array(z.object({
    region_id: z.string(),
    region_name: z.string(),
    error: z.string(),
  })),
  created_at: z.string(),
  updated_at: z.string(),
});

export type JobStatusResponse = z.infer<typeof jobStatusResponseSchema>;

// ============= LOCATION HINTS TABLE =============

// Location Hints table - stores worldwide location data for smart search
export const locationHints = pgTable("location_hints", {
  id: serial("id").primaryKey(),
  country: text("country").notNull(),
  geonameid: text("geonameid"),
  subcountry: text("subcountry"),
  townCity: text("town_city"),
}, (table) => ({
  countryIdx: index("location_hints_country_idx").on(table.country),
  townCityIdx: index("location_hints_town_city_idx").on(table.townCity),
}));

// Location Hints insert/select schemas
export const insertLocationHintSchema = createInsertSchema(locationHints);
export const selectLocationHintSchema = createSelectSchema(locationHints);
export type InsertLocationHint = typeof locationHints.$inferInsert;
export type SelectLocationHint = typeof locationHints.$inferSelect;

// Deep Research Drizzle table
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
  // AFR Correlation & Decision Tracking
  clientRequestId: text("client_request_id"), // Idempotency key from frontend
  routerDecision: text("router_decision"), // 'direct_response' | 'deep_research' | 'supervisor_plan'
  routerReason: text("router_reason"), // Why this routing decision was made
  conversationId: text("conversation_id"), // Link to conversation
}, (table) => ({
  userIdIdx: index("deep_research_runs_user_id_idx").on(table.userId),
  statusIdx: index("status_idx").on(table.status),
  updatedAtIdx: index("updated_at_idx").on(table.updatedAt),
  responseIdIdx: index("response_id_idx").on(table.responseId),
  clientRequestIdIdx: index("deep_research_runs_client_request_id_idx").on(table.clientRequestId),
  conversationIdIdx: index("deep_research_runs_conversation_id_idx").on(table.conversationId),
}));

// Deep Research Zod schemas for validation
export const deepResearchRunStatusSchema = z.enum(["queued", "in_progress", "running", "completed", "failed", "stopped"]);
export const deepResearchRunModeSchema = z.enum(["report", "json"]);
export const deepResearchIntensitySchema = z.enum(["standard", "ultra"]);

export const deepResearchRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  label: z.string(),
  prompt: z.string(),
  mode: deepResearchRunModeSchema,
  counties: z.array(z.string()).optional(),
  windowMonths: z.number().optional(),
  schemaName: z.string().optional(),
  schema: z.any().optional(),
  intensity: deepResearchIntensitySchema.optional(),
  responseId: z.string().optional(),
  status: deepResearchRunStatusSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  outputText: z.string().optional(),
  error: z.string().optional(),
});

export type DeepResearchRun = z.infer<typeof deepResearchRunSchema>;

export const deepResearchCreateRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  label: z.string().optional(),
  mode: deepResearchRunModeSchema.optional(),
  counties: z.array(z.string()).optional(),
  windowMonths: z.number().optional(),
  schemaName: z.string().optional(),
  schema: z.any().optional(),
  intensity: deepResearchIntensitySchema.optional(),
  conversationId: z.string().optional(), // For context-aware vague prompt enhancement
  userId: z.string().optional(), // For context-aware vague prompt enhancement
});

export type DeepResearchCreateRequest = z.infer<typeof deepResearchCreateRequestSchema>;

export const deepResearchRunSummarySchema = deepResearchRunSchema.extend({
  hasOutput: z.boolean(),
  outputPreview: z.string().optional(),
}).omit({ outputText: true });

export type DeepResearchRunSummary = z.infer<typeof deepResearchRunSummarySchema>;

// Deep Research Drizzle insert/select schemas
export const insertDeepResearchRunSchema = createInsertSchema(deepResearchRuns);
export const selectDeepResearchRunSchema = createSelectSchema(deepResearchRuns);
export type InsertDeepResearchRun = typeof deepResearchRuns.$inferInsert;
export type SelectDeepResearchRun = typeof deepResearchRuns.$inferSelect;

// ============= MEMORY SYSTEM TABLES =============

// Conversations table - stores user conversation sessions
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default("Conversation"),
  type: text("type").notNull().default("chat"), // "chat" or "monitor_run"
  monitorId: text("monitor_id"), // Link to scheduled monitor if type=monitor_run
  runSequence: integer("run_sequence"), // Sequential number for monitor runs (1, 2, 3...)
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
  metadata: jsonb("metadata"),
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

// Conversation insert/select schemas
export const insertConversationSchema = createInsertSchema(conversations);
export const selectConversationSchema = createSelectSchema(conversations);
export type InsertConversation = typeof conversations.$inferInsert;
export type SelectConversation = typeof conversations.$inferSelect;

// Message insert/select schemas
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export type InsertMessage = typeof messages.$inferInsert;
export type SelectMessage = typeof messages.$inferSelect;

// Fact insert/select schemas
export const insertFactSchema = createInsertSchema(facts);
export const selectFactSchema = createSelectSchema(facts);
export type InsertFact = typeof facts.$inferInsert;
export type SelectFact = typeof facts.$inferSelect;

// ============= SCHEDULED MONITORS TABLE =============

// Scheduled Monitors table - stores recurring monitoring tasks
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
  status: text("status").notNull().default("active"), // 'active'|'paused'|'suggested'
  suggestedBy: text("suggested_by"), // 'ai'|'user'
  suggestedReason: text("suggested_reason"), // AI's reasoning for suggestion
  suggestionMetadata: jsonb("suggestion_metadata"), // Additional context for suggestions
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

// Scheduled Monitor Zod schemas for validation
export const scheduledMonitorScheduleSchema = z.enum(["once", "hourly", "daily", "weekly", "biweekly", "monthly"]);
export const scheduledMonitorTypeSchema = z.enum(["business_search", "deep_research", "wyshbone_database"]);
export const scheduledMonitorDaySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export const scheduledMonitorStatusSchema = z.enum(["active", "paused", "suggested"]);
export const suggestedBySchema = z.enum(["ai", "user"]);

export const scheduledMonitorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conversationId: z.string().optional().nullable(),
  label: z.string(),
  description: z.string(),
  schedule: scheduledMonitorScheduleSchema,
  scheduleDay: scheduledMonitorDaySchema.optional().nullable(),
  scheduleTime: z.string().optional().nullable(),
  monitorType: scheduledMonitorTypeSchema,
  config: z.any().optional(),
  isActive: z.number(),
  status: scheduledMonitorStatusSchema,
  suggestedBy: suggestedBySchema.optional().nullable(),
  suggestedReason: z.string().optional().nullable(),
  suggestionMetadata: z.any().optional().nullable(),
  emailNotifications: z.number(),
  emailAddress: z.string().optional().nullable(),
  lastRunAt: z.number().optional().nullable(),
  nextRunAt: z.number().optional().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ScheduledMonitor = z.infer<typeof scheduledMonitorSchema>;

export const scheduledMonitorCreateRequestSchema = z.object({
  label: z.string().min(1, "Label is required"),
  description: z.string().min(1, "Description is required"),
  schedule: scheduledMonitorScheduleSchema,
  scheduleDay: scheduledMonitorDaySchema.optional(),
  scheduleTime: z.string().optional(),
  monitorType: scheduledMonitorTypeSchema,
  config: z.any().optional(),
});

export type ScheduledMonitorCreateRequest = z.infer<typeof scheduledMonitorCreateRequestSchema>;

// Scheduled Monitor Drizzle insert/select schemas
export const insertScheduledMonitorSchema = createInsertSchema(scheduledMonitors);
export const selectScheduledMonitorSchema = createSelectSchema(scheduledMonitors);
export type InsertScheduledMonitor = typeof scheduledMonitors.$inferInsert;
export type SelectScheduledMonitor = typeof scheduledMonitors.$inferSelect;

// ============= AGENT ACTIVITIES TABLE =============

// Agent Activities table - stores autonomous agent actions for tracking and analysis
export const agentActivities = pgTable("agent_activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  taskGenerated: text("task_generated").notNull(), // What task the agent decided to do
  actionTaken: text("action_taken").notNull(), // What action was executed (tool name, API call, etc.)
  actionParams: jsonb("action_params"), // Parameters passed to the action
  results: jsonb("results"), // Results of the action execution
  interestingFlag: integer("interesting_flag").notNull().default(0), // 1 = interesting, 0 = routine
  status: text("status").notNull(), // 'success', 'failed', 'pending', 'skipped'
  errorMessage: text("error_message"), // Error details if status='failed'
  durationMs: integer("duration_ms"), // How long the action took to execute
  conversationId: text("conversation_id"), // Link to conversation if part of chat flow
  runId: text("run_id"), // Group related activities into a single run
  metadata: jsonb("metadata"), // Additional context (source, triggers, etc.)
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  // AFR Correlation & Decision Tracking
  clientRequestId: text("client_request_id"), // Idempotency key from frontend - all activities from same user message share this
  routerDecision: text("router_decision"), // 'direct_response' | 'deep_research' | 'supervisor_plan' | 'tool_call'
  routerReason: text("router_reason"), // Why this routing decision was made
  parentActivityId: text("parent_activity_id"), // For hierarchical grouping (e.g., tool call within plan)
}, (table) => ({
  userIdTimestampIdx: index("agent_activities_user_id_timestamp_idx").on(table.userId, table.timestamp),
  interestingFlagIdx: index("agent_activities_interesting_flag_idx").on(table.interestingFlag, table.timestamp),
  statusIdx: index("agent_activities_status_idx").on(table.status, table.timestamp),
  runIdIdx: index("agent_activities_run_id_idx").on(table.runId, table.timestamp),
  conversationIdIdx: index("agent_activities_conversation_id_idx").on(table.conversationId),
  clientRequestIdIdx: index("agent_activities_client_request_id_idx").on(table.clientRequestId),
  parentActivityIdIdx: index("agent_activities_parent_id_idx").on(table.parentActivityId),
}));

// Agent Activities insert/select schemas
export const insertAgentActivitySchema = createInsertSchema(agentActivities);
export const selectAgentActivitySchema = createSelectSchema(agentActivities);
export type InsertAgentActivity = typeof agentActivities.$inferInsert;
export type SelectAgentActivity = typeof agentActivities.$inferSelect;

// ============= AGENT RUNS TABLE =============
// First-class Run lifecycle record for Live Activity Panel
// Status is authoritative for terminal detection - NEVER infer from events
export const agentRunStatusEnum = z.enum([
  "starting",    // Run created, waiting for initial processing
  "planning",    // Chat has produced initial ack, planning phase
  "executing",   // Tool/action execution in progress
  "finalizing",  // Execution loop finished, final response streaming
  "completed",   // Everything finished successfully
  "failed",      // Run failed with error
  "stopped",     // User cancelled/stopped the run
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusEnum>;

export const agentRunTerminalStateEnum = z.enum(["completed", "failed", "stopped"]);
export type AgentRunTerminalState = z.infer<typeof agentRunTerminalStateEnum>;

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  clientRequestId: text("client_request_id").notNull().unique(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  supervisorRunId: text("supervisor_run_id"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  status: text("status").notNull().default("starting"),
  terminalState: text("terminal_state"),
  uiReady: integer("ui_ready").notNull().default(0),
  lastEventAt: bigint("last_event_at", { mode: "number" }),
  error: text("error"),
  errorDetails: jsonb("error_details"),
  metadata: jsonb("metadata"),
}, (table) => ({
  clientRequestIdIdx: index("agent_runs_client_request_id_idx").on(table.clientRequestId),
  userIdIdx: index("agent_runs_user_id_idx").on(table.userId),
  statusIdx: index("agent_runs_status_idx").on(table.status),
  createdAtIdx: index("agent_runs_created_at_idx").on(table.createdAt),
  userIdCreatedAtIdx: index("agent_runs_user_id_created_at_idx").on(table.userId, table.createdAt),
}));

// Agent Runs insert/select schemas
export const insertAgentRunSchema = createInsertSchema(agentRuns);
export const selectAgentRunSchema = createSelectSchema(agentRuns);
export type InsertAgentRun = typeof agentRuns.$inferInsert;
export type SelectAgentRun = typeof agentRuns.$inferSelect;

// Users table for authentication and subscription management
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  isDemo: integer("is_demo").notNull().default(0), // 1 = demo user, 0 = regular user
  demoCreatedAt: bigint("demo_created_at", { mode: "number" }), // When demo account was created (for cleanup)
  role: text("role").notNull().default("sales"), // 'admin', 'sales', 'driver' - LEGACY: use org_members.role for new code
  currentOrgId: text("current_org_id"), // Active organisation - FK to organisations.id
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionTier: text("subscription_tier").default("free"), // 'free', 'basic', 'pro', 'business', 'enterprise'
  subscriptionStatus: text("subscription_status").default("inactive"), // 'active', 'inactive', 'cancelled', 'past_due'
  monitorCount: integer("monitor_count").notNull().default(0), // Track active monitors
  deepResearchCount: integer("deep_research_count").notNull().default(0), // Track deep research runs this period
  lastResetAt: bigint("last_reset_at", { mode: "number" }), // When usage counters were last reset
  
  // Personalization fields - lightweight company/domain context
  companyName: text("company_name"),
  companyDomain: text("company_domain"),
  roleHint: text("role_hint"), // e.g., "Founder", "Sales", "Fundraising"
  primaryObjective: text("primary_objective"), // e.g., "Find pubs buying cask"
  secondaryObjectives: text("secondary_objectives").array(), // optional list
  targetMarkets: text("target_markets").array(), // e.g., ["UK pubs", "bottle shops"]
  productsOrServices: text("products_or_services").array(), // e.g., ["cask ale", "cans"]
  preferences: jsonb("preferences"), // { tone, cadence }
  inferredIndustry: text("inferred_industry"), // e.g., "Brewery", "Charity"
  lastContextRefresh: bigint("last_context_refresh", { mode: "number" }), // When context was last updated
  confidence: integer("confidence"), // 0-100 (how confident we are about inference)
  
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  subscriptionTierIdx: index("users_subscription_tier_idx").on(table.subscriptionTier),
  isDemoIdx: index("users_is_demo_idx").on(table.isDemo, table.demoCreatedAt),
}));

// User Zod schemas
export const userRoleSchema = z.enum(["admin", "sales", "driver"]);
export type UserRole = z.infer<typeof userRoleSchema>;
export const subscriptionTierSchema = z.enum(["free", "basic", "pro", "business", "enterprise"]);
export const subscriptionStatusSchema = z.enum(["active", "inactive", "cancelled", "past_due"]);

export const onboardingChecklistSchema = z.object({
  signedUp: z.boolean().optional(),
  completedProfile: z.boolean().optional(),
  setGoal: z.boolean().optional(),
  addedCustomer: z.boolean().optional(),
  createdOrder: z.boolean().optional(),
  usedChat: z.boolean().optional(),
}).optional();

export const userPreferencesSchema = z.object({
  tone: z.enum(["concise", "detailed"]).optional(),
  cadence: z.enum(["one_question", "short_flow"]).optional(),
  // Onboarding state
  generalOnboardingCompleted: z.boolean().optional(),
  generalOnboardingCompletedAt: z.string().optional(),
  breweryOnboardingCompleted: z.boolean().optional(),
  breweryOnboardingCompletedAt: z.string().optional(),
  onboardingChecklist: onboardingChecklistSchema,
}).optional();

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional().nullable(),
  isDemo: z.number().int(),
  demoCreatedAt: z.number().optional().nullable(),
  role: userRoleSchema.default("sales"),
  currentOrgId: z.string().optional().nullable(),
  stripeCustomerId: z.string().optional().nullable(),
  stripeSubscriptionId: z.string().optional().nullable(),
  subscriptionTier: subscriptionTierSchema,
  subscriptionStatus: subscriptionStatusSchema,
  monitorCount: z.number().int(),
  deepResearchCount: z.number().int(),
  lastResetAt: z.number().optional().nullable(),
  
  // Personalization fields
  companyName: z.string().optional().nullable(),
  companyDomain: z.string().optional().nullable(),
  roleHint: z.string().optional().nullable(),
  primaryObjective: z.string().optional().nullable(),
  secondaryObjectives: z.array(z.string()).optional().nullable(),
  targetMarkets: z.array(z.string()).optional().nullable(),
  productsOrServices: z.array(z.string()).optional().nullable(),
  preferences: userPreferencesSchema.nullable(),
  inferredIndustry: z.string().optional().nullable(),
  lastContextRefresh: z.number().optional().nullable(),
  confidence: z.number().int().min(0).max(100).optional().nullable(),
  
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type User = z.infer<typeof userSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const signupRequestSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  demoSessionId: z.string().optional(), // For transferring demo data
  organisationName: z.string().min(2, "Organisation name must be at least 2 characters").max(80, "Organisation name must be 80 characters or less").optional(),
  inviteToken: z.string().optional(), // For accepting an invite during signup
});

export const loginRequestSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileRequestSchema = z.object({
  companyName: z.string().optional(),
  companyDomain: z.string().optional(),
  roleHint: z.string().optional(),
  primaryObjective: z.string().optional(),
  secondaryObjectives: z.array(z.string()).optional(),
  targetMarkets: z.array(z.string()).optional(),
  productsOrServices: z.array(z.string()).optional(),
  preferences: userPreferencesSchema,
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// User Drizzle insert/select schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

// ============================================================================
// MULTI-TENANT ORGANISATION SYSTEM
// ============================================================================

// Organisations table - each org is an isolated tenant
export const organisations = pgTable("organisations", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  createdByIdx: index("orgs_created_by_idx").on(table.createdByUserId),
}));

// Org membership roles - same values as legacy user roles
export const orgMemberRoleSchema = z.enum(["admin", "sales", "driver"]);
export type OrgMemberRole = z.infer<typeof orgMemberRoleSchema>;

// Org Members table - links users to orgs with role
export const orgMembers = pgTable("org_members", {
  id: text("id").primaryKey(), // UUID
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("sales"), // 'admin', 'sales', 'driver'
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  orgIdIdx: index("org_members_org_id_idx").on(table.orgId),
  userIdIdx: index("org_members_user_id_idx").on(table.userId),
  uniqueOrgUser: index("org_members_unique_idx").on(table.orgId, table.userId),
}));

// Org invite status
export const orgInviteStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);
export type OrgInviteStatus = z.infer<typeof orgInviteStatusSchema>;

// Org Invites table - pending invitations
export const orgInvites = pgTable("org_invites", {
  id: text("id").primaryKey(), // UUID
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("sales"), // 'admin', 'sales', 'driver'
  token: text("token").notNull().unique(), // secure random token
  status: text("status").notNull().default("pending"), // 'pending', 'accepted', 'revoked', 'expired'
  invitedByUserId: text("invited_by_user_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  acceptedAt: bigint("accepted_at", { mode: "number" }),
}, (table) => ({
  orgIdIdx: index("org_invites_org_id_idx").on(table.orgId),
  emailIdx: index("org_invites_email_idx").on(table.email),
  tokenIdx: index("org_invites_token_idx").on(table.token),
}));

// Organisation Zod schemas
export const organisationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdByUserId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const orgMemberSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  userId: z.string(),
  role: orgMemberRoleSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const orgInviteSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  email: z.string().email(),
  role: orgMemberRoleSchema,
  token: z.string(),
  status: orgInviteStatusSchema,
  invitedByUserId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  acceptedAt: z.number().optional().nullable(),
});

export type Organisation = z.infer<typeof organisationSchema>;
export type OrgMember = z.infer<typeof orgMemberSchema>;
export type OrgInvite = z.infer<typeof orgInviteSchema>;

// Request schemas for org APIs
export const createOrgRequestSchema = z.object({
  name: z.string().min(1, "Organisation name is required"),
});

export const createInviteRequestSchema = z.object({
  email: z.string().email("Valid email is required"),
  role: orgMemberRoleSchema.default("sales"),
});

export const acceptInviteRequestSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
});

export const updateMemberRoleRequestSchema = z.object({
  role: orgMemberRoleSchema,
});

export type CreateOrgRequest = z.infer<typeof createOrgRequestSchema>;
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
export type UpdateMemberRoleRequest = z.infer<typeof updateMemberRoleRequestSchema>;

// Drizzle insert/select schemas for organisations
export const insertOrganisationSchema = createInsertSchema(organisations);
export const selectOrganisationSchema = createSelectSchema(organisations);
export type InsertOrganisation = typeof organisations.$inferInsert;
export type SelectOrganisation = typeof organisations.$inferSelect;

export const insertOrgMemberSchema = createInsertSchema(orgMembers);
export const selectOrgMemberSchema = createSelectSchema(orgMembers);
export type InsertOrgMember = typeof orgMembers.$inferInsert;
export type SelectOrgMember = typeof orgMembers.$inferSelect;

export const insertOrgInviteSchema = createInsertSchema(orgInvites);
export const selectOrgInviteSchema = createSelectSchema(orgInvites);
export type InsertOrgInvite = typeof orgInvites.$inferInsert;
export type SelectOrgInvite = typeof orgInvites.$inferSelect;

// ============================================================================

// User Sessions table for secure multi-tenant authentication
export const userSessions = pgTable("user_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  defaultCountry: text("default_country"),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
  expiresAtIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
}));

// User Session Zod schemas
export const createSessionRequestSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  userEmail: z.string().email("Valid email is required"),
  default_country: z.string().optional(),
});

export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
  expiresAt: z.number(),
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type SelectUserSession = typeof userSessions.$inferSelect;

// Integrations table for CRM/accounting OAuth connections
export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(), // 'xero', 'salesforce', 'microsoft-business-central', 'google-sheets'
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: bigint("expires_at", { mode: "number" }),
  metadata: jsonb("metadata"), // Provider-specific data (e.g., Xero tenant ID)
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("integrations_user_id_idx").on(table.userId),
  providerIdx: index("integrations_provider_idx").on(table.provider),
}));

// Integration Zod schemas
export const integrationProviderSchema = z.enum([
  "salesforce",
  "xero",
  "microsoft-business-central",
  "google-sheets",
]);

export const integrationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: integrationProviderSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional().nullable(),
  expiresAt: z.number().optional().nullable(),
  metadata: z.any().optional().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Integration = z.infer<typeof integrationSchema>;

export const createIntegrationRequestSchema = z.object({
  provider: integrationProviderSchema,
});

export type CreateIntegrationRequest = z.infer<typeof createIntegrationRequestSchema>;

// Integration Drizzle insert/select schemas
export const insertIntegrationSchema = createInsertSchema(integrations);
export const selectIntegrationSchema = createSelectSchema(integrations);
export type InsertIntegration = typeof integrations.$inferInsert;
export type SelectIntegration = typeof integrations.$inferSelect;

// Batch Jobs table for Google Places + Hunter.io + SalesHandy pipeline
export const batchJobs = pgTable("batch_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull(), // 'running', 'completed', 'failed'
  query: text("query").notNull(),
  location: text("location").notNull(),
  country: text("country").notNull(),
  targetRole: text("target_role").notNull(),
  limit: integer("limit").notNull().default(60),
  personalize: integer("personalize").notNull().default(1), // 1 = true, 0 = false (SQLite-style boolean)
  campaignId: text("campaign_id"),
  items: jsonb("items"), // Array of outlets found with contact details
  totalFound: integer("total_found"),
  totalSent: integer("total_sent"),
  totalSkipped: integer("total_skipped"),
  error: text("error"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }),
}, (table) => ({
  userIdIdx: index("batch_jobs_user_id_idx").on(table.userId),
  statusIdx: index("batch_jobs_status_idx").on(table.status),
  createdAtIdx: index("batch_jobs_created_at_idx").on(table.createdAt),
}));

// Batch Job Zod schemas
export const batchJobStatusSchema = z.enum(["running", "completed", "failed"]);

export const hunterContactSchema = z.object({
  email: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  confidence: z.number().optional(),
  score: z.number(), // Ranking score based on position match
});

export const batchJobItemSchema = z.object({
  place_id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  domain: z.string().optional(),
  personal_line: z.string().optional(),
  selected_email: z.string().optional(),
  selected_status: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  position: z.string().optional(),
  hunter_contacts: z.array(hunterContactSchema).optional(), // All Hunter.io results with scores
});

export const batchJobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: batchJobStatusSchema,
  query: z.string(),
  location: z.string(),
  country: z.string(),
  targetRole: z.string(),
  limit: z.number().int(),
  personalize: z.number().int(),
  campaignId: z.string().optional().nullable(),
  items: z.array(batchJobItemSchema).optional().nullable(),
  totalFound: z.number().int().optional().nullable(),
  totalSent: z.number().int().optional().nullable(),
  totalSkipped: z.number().int().optional().nullable(),
  error: z.string().optional().nullable(),
  createdAt: z.number(),
  completedAt: z.number().optional().nullable(),
});

export type BatchJob = z.infer<typeof batchJobSchema>;
export type BatchJobItem = z.infer<typeof batchJobItemSchema>;

export const createBatchJobRequestSchema = z.object({
  query: z.string().min(1, "Query is required"),
  location: z.string().min(1, "Location is required"),
  country: z.string().min(1, "Country is required"),
  targetRole: z.string().optional().default("Head of Sales"),
  limit: z.number().int().min(1).max(100).optional().default(60),
  personalize: z.boolean().optional().default(true),
  campaignId: z.string().optional(),
});

export type CreateBatchJobRequest = z.infer<typeof createBatchJobRequestSchema>;

export const batchJobResponseSchema = z.object({
  batchId: z.string(),
  total: z.number().int(),
  sent: z.number().int(),
  skipped: z.number().int(),
});

export type BatchJobResponse = z.infer<typeof batchJobResponseSchema>;

// Batch Job Drizzle insert/select schemas
export const insertBatchJobSchema = createInsertSchema(batchJobs);
export const selectBatchJobSchema = createSelectSchema(batchJobs);
export type InsertBatchJob = typeof batchJobs.$inferInsert;
export type SelectBatchJob = typeof batchJobs.$inferSelect;

// ============= LEADGEN PLANS TABLE =============
// Lead generation plans for UI-030 (plan approval before execution)
export const leadGenPlans = pgTable("lead_gen_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  conversationId: text("conversation_id"),
  goal: text("goal").notNull(),
  steps: jsonb("steps").notNull(), // Array of LeadGenStep objects
  status: text("status").notNull(), // 'pending_approval', 'approved', 'rejected', 'executing', 'completed', 'failed'
  supervisorTaskId: text("supervisor_task_id"),
  toolMetadata: jsonb("tool_metadata"), // { toolName, toolArgs, userId }
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("lead_gen_plans_user_id_idx").on(table.userId),
  sessionIdIdx: index("lead_gen_plans_session_id_idx").on(table.sessionId),
  statusIdx: index("lead_gen_plans_status_idx").on(table.status),
}));

export const insertLeadGenPlanSchema = createInsertSchema(leadGenPlans);
export const selectLeadGenPlanSchema = createSelectSchema(leadGenPlans);
export type InsertLeadGenPlan = typeof leadGenPlans.$inferInsert;
export type SelectLeadGenPlan = typeof leadGenPlans.$inferSelect;

// ============= CRM TABLES =============
// Core CRM Settings (multi-vertical support)
export const crmSettings = pgTable("crm_settings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(), // User ID serves as workspace ID for now
  industryVertical: text("industry_vertical").notNull().default("generic"), // 'generic', 'brewery', 'animal_physio', 'other'
  defaultCountry: text("default_country").notNull().default("United Kingdom"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_settings_workspace_id_idx").on(table.workspaceId),
}));

export const insertCrmSettingsSchema = createInsertSchema(crmSettings);
export const selectCrmSettingsSchema = createSelectSchema(crmSettings);
export type InsertCrmSettings = typeof crmSettings.$inferInsert;
export type SelectCrmSettings = typeof crmSettings.$inferSelect;

// CRM Customers (shared across all verticals)
export const crmCustomers = pgTable("crm_customers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  primaryContactName: text("primary_contact_name"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  postcode: text("postcode"),
  country: text("country").notNull().default("United Kingdom"),
  notes: text("notes"),
  priceBookId: integer("price_book_id"), // References brew_price_books.id
  // Xero sync fields
  xeroContactId: varchar("xero_contact_id", { length: 100 }),
  lastXeroSyncAt: timestamp("last_xero_sync_at"),
  xeroSyncStatus: varchar("xero_sync_status", { length: 20 }).default("synced"), // 'synced', 'pending', 'error'
  lastSyncError: text("last_sync_error"), // Error message from last failed sync
  isSample: boolean("is_sample").default(false), // Flag for onboarding sample data
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_customers_workspace_id_idx").on(table.workspaceId),
  nameIdx: index("crm_customers_name_idx").on(table.name),
  priceBookIdIdx: index("crm_customers_price_book_id_idx").on(table.priceBookId),
  xeroContactIdIdx: index("crm_customers_xero_contact_id_idx").on(table.xeroContactId),
  isSampleIdx: index("crm_customers_is_sample_idx").on(table.isSample),
}));

export const insertCrmCustomerSchema = createInsertSchema(crmCustomers);
export const selectCrmCustomerSchema = createSelectSchema(crmCustomers);
export type InsertCrmCustomer = typeof crmCustomers.$inferInsert;
export type SelectCrmCustomer = typeof crmCustomers.$inferSelect;

// CRM Delivery Runs
export const crmDeliveryRuns = pgTable("crm_delivery_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  driverName: text("driver_name"),
  vehicle: text("vehicle"),
  scheduledDate: bigint("scheduled_date", { mode: "number" }).notNull(), // Unix timestamp
  status: text("status").notNull().default("planned"), // 'planned', 'in_progress', 'completed', 'cancelled'
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_delivery_runs_workspace_id_idx").on(table.workspaceId),
  statusIdx: index("crm_delivery_runs_status_idx").on(table.status),
  scheduledDateIdx: index("crm_delivery_runs_scheduled_date_idx").on(table.scheduledDate),
}));

export const insertCrmDeliveryRunSchema = createInsertSchema(crmDeliveryRuns);
export const selectCrmDeliveryRunSchema = createSelectSchema(crmDeliveryRuns);
export type InsertCrmDeliveryRun = typeof crmDeliveryRuns.$inferInsert;
export type SelectCrmDeliveryRun = typeof crmDeliveryRuns.$inferSelect;

// CRM Orders
export const crmOrders = pgTable("crm_orders", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id").notNull(),
  orderNumber: text("order_number").notNull(),
  orderDate: bigint("order_date", { mode: "number" }).notNull(),
  status: text("status").notNull().default("draft"), // 'draft', 'confirmed', 'dispatched', 'delivered', 'cancelled'
  deliveryDate: bigint("delivery_date", { mode: "number" }),
  deliveryRunId: text("delivery_run_id"),
  currency: text("currency").notNull().default("GBP"),
  subtotalExVat: integer("subtotal_ex_vat").default(0), // In pence/cents - calculated from line items
  discountType: text("discount_type").default("none"), // 'none', 'percentage', 'fixed'
  discountValue: integer("discount_value").default(0), // Percentage (basis points) or fixed amount (pence)
  discountAmount: integer("discount_amount").default(0), // Calculated discount in pence/cents
  shippingExVat: integer("shipping_ex_vat").default(0), // Shipping cost ex VAT in pence/cents
  shippingVatRate: integer("shipping_vat_rate").default(2000), // VAT rate for shipping in basis points
  shippingVatAmount: integer("shipping_vat_amount").default(0), // VAT on shipping in pence/cents
  vatTotal: integer("vat_total").default(0), // In pence/cents - calculated from line items
  totalIncVat: integer("total_inc_vat").default(0), // In pence/cents - calculated from line items
  totalAmount: integer("total_amount"), // DEPRECATED: kept for backwards compatibility, use totalIncVat
  xeroInvoiceId: text("xero_invoice_id"), // Xero invoice reference if exported
  xeroInvoiceNumber: text("xero_invoice_number"), // Xero invoice number for display (e.g. INV-0001)
  xeroExportedAt: bigint("xero_exported_at", { mode: "number" }), // When exported to Xero
  xeroStatus: varchar("xero_status", { length: 20 }), // Xero invoice status: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  xeroUpdatedAt: timestamp("xero_updated_at"), // Last time Xero status was updated (from webhook/poll)
  xeroStatusSource: varchar("xero_status_source", { length: 20 }), // How status was updated: 'export', 'webhook', 'poll'
  lastXeroSyncAt: timestamp("last_xero_sync_at"), // Last sync timestamp
  syncStatus: varchar("sync_status", { length: 20 }).default("synced"), // 'synced', 'pending', 'failed'
  lastSyncError: text("last_sync_error"), // Error message from last failed sync
  notes: text("notes"),
  isSample: boolean("is_sample").default(false), // Flag for onboarding sample data
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_orders_workspace_id_idx").on(table.workspaceId),
  customerIdIdx: index("crm_orders_customer_id_idx").on(table.customerId),
  deliveryRunIdIdx: index("crm_orders_delivery_run_id_idx").on(table.deliveryRunId),
  statusIdx: index("crm_orders_status_idx").on(table.status),
  orderDateIdx: index("crm_orders_order_date_idx").on(table.orderDate),
  xeroInvoiceIdIdx: index("crm_orders_xero_invoice_id_idx").on(table.xeroInvoiceId),
  isSampleIdx: index("crm_orders_is_sample_idx").on(table.isSample),
}));

export const insertCrmOrderSchema = createInsertSchema(crmOrders);
export const selectCrmOrderSchema = createSelectSchema(crmOrders);
export type InsertCrmOrder = typeof crmOrders.$inferInsert;
export type SelectCrmOrder = typeof crmOrders.$inferSelect;

// CRM Order Lines
export const crmOrderLines = pgTable("crm_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id"), // FK to crm_products or vertical product tables
  description: text("description"), // Editable override of product name/description
  quantity: integer("quantity").notNull().default(1),
  unitPriceExVat: integer("unit_price_ex_vat").notNull(), // In pence/cents
  vatRate: integer("vat_rate").notNull().default(0), // Stored as basis points (e.g., 2000 = 20%, 500 = 5%)
  lineSubtotalExVat: integer("line_subtotal_ex_vat").notNull(), // quantity * unitPriceExVat (pence/cents)
  lineVatAmount: integer("line_vat_amount").notNull(), // lineSubtotalExVat * vatRate (pence/cents)
  lineTotalIncVat: integer("line_total_inc_vat").notNull(), // lineSubtotalExVat + lineVatAmount (pence/cents)
  // Legacy fields - kept for backwards compatibility
  genericItemName: text("generic_item_name"),
  genericItemCode: text("generic_item_code"),
  quantityUnits: integer("quantity_units"),
  unitPrice: integer("unit_price"),
  lineTotal: integer("line_total"),
  verticalType: text("vertical_type"),
  verticalRefId: text("vertical_ref_id"),
  // Xero sync field
  xeroLineItemId: text("xero_line_item_id"), // Xero LineItemID for sync tracking
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  orderIdIdx: index("crm_order_lines_order_id_idx").on(table.orderId),
  productIdIdx: index("crm_order_lines_product_id_idx").on(table.productId),
  verticalRefIdIdx: index("crm_order_lines_vertical_ref_id_idx").on(table.verticalRefId),
}));

export const insertCrmOrderLineSchema = createInsertSchema(crmOrderLines);
export const selectCrmOrderLineSchema = createSelectSchema(crmOrderLines);
export type InsertCrmOrderLine = typeof crmOrderLines.$inferInsert;
export type SelectCrmOrderLine = typeof crmOrderLines.$inferSelect;

// ============= SUPPLIERS (who we BUY FROM) =============
// Suppliers table - companies/merchants we purchase from
export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  
  // Basic Info
  name: text("name").notNull(),
  supplierType: text("supplier_type"), // brewery_supplier, hop_merchant, maltster, packaging, equipment, services, etc.
  
  // Contact
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  postcode: text("postcode"),
  country: text("country").default("UK"),
  
  // Business
  companyNumber: text("company_number"),
  vatNumber: text("vat_number"),
  
  // Relationship
  isOurSupplier: integer("is_our_supplier").default(0), // 1 = true, 0 = false
  firstPurchaseDate: bigint("first_purchase_date", { mode: "number" }),
  lastPurchaseDate: bigint("last_purchase_date", { mode: "number" }),
  totalPurchasesAmount: doublePrecision("total_purchases_amount").default(0), // In GBP
  purchaseCount: integer("purchase_count").default(0),
  
  // Intelligence (for supply chain insights)
  otherBreweriesCount: integer("other_breweries_count").default(0), // How many other breweries use this supplier
  trendingScore: doublePrecision("trending_score").default(0), // Popularity/trend indicator
  
  // Xero Integration
  xeroContactId: text("xero_contact_id").unique(),
  lastXeroSyncAt: bigint("last_xero_sync_at", { mode: "number" }),
  
  // Discovery
  discoveredBy: text("discovered_by"), // 'xero', 'manual', 'ai_sleeper_agent'
  discoveredAt: bigint("discovered_at", { mode: "number" }),
  
  // Notes
  notes: text("notes"),
  
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("suppliers_workspace_id_idx").on(table.workspaceId),
  xeroContactIdIdx: index("suppliers_xero_contact_id_idx").on(table.xeroContactId),
  isOurSupplierIdx: index("suppliers_is_our_supplier_idx").on(table.isOurSupplier),
  supplierTypeIdx: index("suppliers_supplier_type_idx").on(table.supplierType),
  nameIdx: index("suppliers_name_idx").on(table.name),
}));

export const insertSupplierSchema = createInsertSchema(suppliers);
export const selectSupplierSchema = createSelectSchema(suppliers);
export type InsertSupplier = typeof suppliers.$inferInsert;
export type SelectSupplier = typeof suppliers.$inferSelect;

// Supplier Purchases (Bills from suppliers)
export const supplierPurchases = pgTable("supplier_purchases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  supplierId: text("supplier_id").notNull(), // References suppliers.id
  
  // Xero
  xeroBillId: text("xero_bill_id").unique(),
  xeroBillNumber: text("xero_bill_number"),
  
  // Purchase
  purchaseDate: bigint("purchase_date", { mode: "number" }).notNull(),
  dueDate: bigint("due_date", { mode: "number" }),
  totalAmount: doublePrecision("total_amount").notNull(), // In GBP
  currency: text("currency").default("GBP"),
  status: text("status").default("draft"), // 'draft', 'submitted', 'authorised', 'paid', 'voided'
  
  // Items
  lineItems: jsonb("line_items"), // [{ description, quantity, unitPrice, amount, accountCode }]
  
  // Notes
  reference: text("reference"),
  notes: text("notes"),
  
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  syncedAt: bigint("synced_at", { mode: "number" }),
}, (table) => ({
  workspaceIdIdx: index("supplier_purchases_workspace_id_idx").on(table.workspaceId),
  supplierIdIdx: index("supplier_purchases_supplier_id_idx").on(table.supplierId),
  xeroBillIdIdx: index("supplier_purchases_xero_bill_id_idx").on(table.xeroBillId),
  purchaseDateIdx: index("supplier_purchases_purchase_date_idx").on(table.purchaseDate),
  statusIdx: index("supplier_purchases_status_idx").on(table.status),
}));

export const insertSupplierPurchaseSchema = createInsertSchema(supplierPurchases);
export const selectSupplierPurchaseSchema = createSelectSchema(supplierPurchases);
export type InsertSupplierPurchase = typeof supplierPurchases.$inferInsert;
export type SelectSupplierPurchase = typeof supplierPurchases.$inferSelect;

// Supplier Products (items we buy from each supplier)
export const supplierProducts = pgTable("supplier_products", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  supplierId: text("supplier_id").notNull(), // References suppliers.id
  
  // Product Info
  productName: text("product_name").notNull(),
  productCategory: text("product_category"), // 'hops', 'malt', 'yeast', 'packaging', 'equipment', 'chemicals', 'other'
  productCode: text("product_code"), // Supplier's product code/SKU
  unit: text("unit"), // 'kg', 'litre', 'unit', 'pallet', 'case', etc.
  
  // Pricing
  lastPrice: doublePrecision("last_price"), // Last price paid in GBP
  lastPurchaseDate: bigint("last_purchase_date", { mode: "number" }),
  priceHistory: jsonb("price_history"), // [{ date, price, quantity }]
  
  // Notes
  notes: text("notes"),
  
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("supplier_products_workspace_id_idx").on(table.workspaceId),
  supplierIdIdx: index("supplier_products_supplier_id_idx").on(table.supplierId),
  productCategoryIdx: index("supplier_products_product_category_idx").on(table.productCategory),
  productNameIdx: index("supplier_products_product_name_idx").on(table.productName),
}));

export const insertSupplierProductSchema = createInsertSchema(supplierProducts);
export const selectSupplierProductSchema = createSelectSchema(supplierProducts);
export type InsertSupplierProduct = typeof supplierProducts.$inferInsert;
export type SelectSupplierProduct = typeof supplierProducts.$inferSelect;

// ============= UNIVERSAL CRM PRODUCTS TABLE =============
// Universal products table for ALL verticals (brewery, physio, trades, etc.)
// Brewery-specific fields (abv, dutyBand, style, etc.) are nullable and only populated for brewery products
export const crmProducts = pgTable("crm_products", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  sku: text("sku"),
  description: text("description"), // Generic product description (all verticals)
  category: text("category"), // Generic category (e.g., 'Services', 'Goods', 'Digital')
  unitType: text("unit_type").default("each"), // 'each', 'hour', 'kg', 'litre', 'pack' (all verticals)
  // Brewery-specific fields (nullable - only populated for brewery products)
  style: text("style"), // e.g., "IPA", "Stout"
  imageUrl: text("image_url"), // Product image URL (e.g., beer label from Untappd)
  abv: integer("abv"), // Stored as basis points (e.g., 450 = 4.5%)
  defaultPackageType: text("default_package_type"), // 'cask', 'keg', 'can', 'bottle'
  defaultPackageSizeLitres: integer("default_package_size_litres"), // In millilitres (e.g., 40900 = 40.9L)
  dutyBand: text("duty_band"), // 'beer_standard', 'beer_small_producer', etc.
  // Pricing & status (all verticals)
  defaultUnitPriceExVat: integer("default_unit_price_ex_vat").default(0), // In pence/cents
  defaultVatRate: integer("default_vat_rate").default(2000), // Stored as basis points (e.g., 2000 = 20%, 500 = 5%)
  isActive: integer("is_active").notNull().default(1), // 1 = true, 0 = false
  trackStock: integer("track_stock").default(0), // 1 = track inventory, 0 = don't track (for non-brewery verticals)
  isSample: boolean("is_sample").default(false), // Flag for onboarding sample data
  // Xero sync fields (all verticals)
  xeroItemId: text("xero_item_id"), // Xero ItemID for sync tracking
  xeroItemCode: text("xero_item_code"), // Xero Item Code (maps to SKU)
  lastXeroSyncAt: timestamp("last_xero_sync_at"), // Last sync timestamp
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_products_workspace_id_idx").on(table.workspaceId),
  skuIdx: index("crm_products_sku_idx").on(table.sku),
  isActiveIdx: index("crm_products_is_active_idx").on(table.isActive),
  categoryIdx: index("crm_products_category_idx").on(table.category),
  isSampleIdx: index("crm_products_is_sample_idx").on(table.isSample),
  xeroItemIdIdx: index("crm_products_xero_item_id_idx").on(table.xeroItemId),
  xeroItemCodeIdx: index("crm_products_xero_item_code_idx").on(table.xeroItemCode),
}));

export const insertCrmProductSchema = createInsertSchema(crmProducts);
export const selectCrmProductSchema = createSelectSchema(crmProducts);
export type InsertCrmProduct = typeof crmProducts.$inferInsert;
export type SelectCrmProduct = typeof crmProducts.$inferSelect;

// Brewery Batches
export const brewBatches = pgTable("brew_batches", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(),
  batchCode: text("batch_code").notNull(),
  brewDate: bigint("brew_date", { mode: "number" }).notNull(),
  status: text("status").notNull().default("planned"), // 'planned', 'in_progress', 'fermenting', 'packaging', 'packaged', 'cancelled'
  plannedVolumeLitres: integer("planned_volume_litres").notNull(), // In millilitres
  actualVolumeLitres: integer("actual_volume_litres"), // In millilitres
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_batches_workspace_id_idx").on(table.workspaceId),
  productIdIdx: index("brew_batches_product_id_idx").on(table.productId),
  statusIdx: index("brew_batches_status_idx").on(table.status),
  batchCodeIdx: index("brew_batches_batch_code_idx").on(table.batchCode),
}));

export const insertBrewBatchSchema = createInsertSchema(brewBatches);
export const selectBrewBatchSchema = createSelectSchema(brewBatches);
export type InsertBrewBatch = typeof brewBatches.$inferInsert;
export type SelectBrewBatch = typeof brewBatches.$inferSelect;

// Brewery Inventory Items
export const brewInventoryItems = pgTable("brew_inventory_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(),
  batchId: text("batch_id"),
  packageType: text("package_type").notNull(), // 'cask', 'keg', 'can', 'bottle'
  packageSizeLitres: integer("package_size_litres").notNull(), // In millilitres
  quantityUnits: integer("quantity_units").notNull(),
  location: text("location").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_inventory_items_workspace_id_idx").on(table.workspaceId),
  productIdIdx: index("brew_inventory_items_product_id_idx").on(table.productId),
  batchIdIdx: index("brew_inventory_items_batch_id_idx").on(table.batchId),
  locationIdx: index("brew_inventory_items_location_idx").on(table.location),
}));

export const insertBrewInventoryItemSchema = createInsertSchema(brewInventoryItems);
export const selectBrewInventoryItemSchema = createSelectSchema(brewInventoryItems);
export type InsertBrewInventoryItem = typeof brewInventoryItems.$inferInsert;
export type SelectBrewInventoryItem = typeof brewInventoryItems.$inferSelect;

// Brewery Containers (casks/kegs tracking)
export const brewContainers = pgTable("brew_containers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  containerCode: text("container_code").notNull(),
  containerType: text("container_type").notNull(), // 'cask', 'keg'
  volumeLitres: integer("volume_litres").notNull(), // In millilitres
  status: text("status").notNull().default("at_brewery"), // 'at_brewery', 'with_customer', 'lost', 'retired'
  lastCustomerId: text("last_customer_id"),
  lastOutboundDate: bigint("last_outbound_date", { mode: "number" }),
  lastReturnDate: bigint("last_return_date", { mode: "number" }),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_containers_workspace_id_idx").on(table.workspaceId),
  containerCodeIdx: index("brew_containers_container_code_idx").on(table.containerCode),
  statusIdx: index("brew_containers_status_idx").on(table.status),
  lastCustomerIdIdx: index("brew_containers_last_customer_id_idx").on(table.lastCustomerId),
}));

export const insertBrewContainerSchema = createInsertSchema(brewContainers);
export const selectBrewContainerSchema = createSelectSchema(brewContainers);
export type InsertBrewContainer = typeof brewContainers.$inferInsert;
export type SelectBrewContainer = typeof brewContainers.$inferSelect;

// Brewery Duty Reports
export const brewDutyReports = pgTable("brew_duty_reports", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  periodStart: bigint("period_start", { mode: "number" }).notNull(),
  periodEnd: bigint("period_end", { mode: "number" }).notNull(),
  totalLitres: integer("total_litres").notNull(), // In millilitres
  totalDutyAmount: integer("total_duty_amount").notNull(), // In pence
  breakdownJson: jsonb("breakdown_json").notNull(), // Per product/ABV band breakdown
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_duty_reports_workspace_id_idx").on(table.workspaceId),
  periodStartIdx: index("brew_duty_reports_period_start_idx").on(table.periodStart),
}));

export const insertBrewDutyReportSchema = createInsertSchema(brewDutyReports);
export const selectBrewDutyReportSchema = createSelectSchema(brewDutyReports);
export type InsertBrewDutyReport = typeof brewDutyReports.$inferInsert;
export type SelectBrewDutyReport = typeof brewDutyReports.$inferSelect;

// Brewery Duty Lookup Bands (for UK duty calculations)
export const brewDutyLookupBands = pgTable("brew_duty_lookup_bands", {
  id: text("id").primaryKey(),
  regime: text("regime").notNull().default("UK"), // e.g., 'UK', 'EU'
  dutyCategoryKey: text("duty_category_key").notNull(), // e.g., 'beer_standard', 'beer_small_producer'
  thresholdHl: integer("threshold_hl").notNull().default(0), // Hectolitres threshold for this band
  m: real("m").notNull(), // Multiplier for duty calculation
  c: real("c").notNull(), // Constant for duty calculation
  baseRatePerHl: real("base_rate_per_hl").notNull(), // Base rate per hectolitre in pounds
  effectiveFrom: text("effective_from").notNull(), // Date string YYYY-MM-DD
  effectiveTo: text("effective_to"), // Date string YYYY-MM-DD, null if current
}, (table) => ({
  regimeIdx: index("brew_duty_lookup_bands_regime_idx").on(table.regime),
  categoryIdx: index("brew_duty_lookup_bands_category_idx").on(table.dutyCategoryKey),
}));

export const insertBrewDutyLookupBandSchema = createInsertSchema(brewDutyLookupBands);
export const selectBrewDutyLookupBandSchema = createSelectSchema(brewDutyLookupBands);
export type InsertBrewDutyLookupBand = typeof brewDutyLookupBands.$inferInsert;
export type SelectBrewDutyLookupBand = typeof brewDutyLookupBands.$inferSelect;

// Brewery Settings
export const brewSettings = pgTable("brew_settings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  defaultWarehouseLocation: text("default_warehouse_location"),
  defaultDutyRatePerLitre: integer("default_duty_rate_per_litre"), // In pence per litre
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_settings_workspace_id_idx").on(table.workspaceId),
}));

export const insertBrewSettingsSchema = createInsertSchema(brewSettings);
export const selectBrewSettingsSchema = createSelectSchema(brewSettings);
export type InsertBrewSettings = typeof brewSettings.$inferInsert;
export type SelectBrewSettings = typeof brewSettings.$inferSelect;

// NOTE: Universal CRM Products table is now defined at line ~1069 (renamed from brewProducts)
// It includes brewery-specific fields (abv, dutyBand, etc.) as nullable columns
// This old generic-only definition has been removed to avoid duplication

// ============= GENERIC CRM STOCK/INVENTORY TABLE =============
// Generic stock tracking for non-brewery verticals
export const crmStock = pgTable("crm_stock", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(), // FK to crm_products
  location: text("location").notNull().default("Main Warehouse"),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  quantityReserved: integer("quantity_reserved").notNull().default(0), // Reserved for pending orders
  reorderLevel: integer("reorder_level").default(0), // Alert when stock falls below this
  reorderQuantity: integer("reorder_quantity").default(0), // Suggested reorder amount
  costPricePerUnit: integer("cost_price_per_unit").default(0), // In pence/cents - for profit tracking
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_stock_workspace_id_idx").on(table.workspaceId),
  productIdIdx: index("crm_stock_product_id_idx").on(table.productId),
  locationIdx: index("crm_stock_location_idx").on(table.location),
}));

export const insertCrmStockSchema = createInsertSchema(crmStock);
export const selectCrmStockSchema = createSelectSchema(crmStock);
export type InsertCrmStock = typeof crmStock.$inferInsert;
export type SelectCrmStock = typeof crmStock.$inferSelect;

// ============= CRM CALL DIARY TABLE =============
// Sales diary for scheduling and tracking customer/lead calls
export const crmCallDiary = pgTable("crm_call_diary", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  entityType: text("entity_type").notNull(), // 'customer' or 'lead'
  entityId: text("entity_id").notNull(),
  scheduledDate: bigint("scheduled_date", { mode: "number" }).notNull(), // Unix timestamp
  completed: integer("completed").notNull().default(0), // 0 = false, 1 = true
  completedDate: bigint("completed_date", { mode: "number" }),
  notes: text("notes"),
  outcome: text("outcome"), // 'connected', 'voicemail', 'no-answer', 'rescheduled'
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  createdBy: text("created_by"),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_call_diary_workspace_id_idx").on(table.workspaceId),
  scheduledDateIdx: index("crm_call_diary_scheduled_date_idx").on(table.scheduledDate),
  entityIdx: index("crm_call_diary_entity_idx").on(table.entityType, table.entityId),
  completedIdx: index("crm_call_diary_completed_idx").on(table.completed),
}));

export const insertCrmCallDiarySchema = createInsertSchema(crmCallDiary);
export const selectCrmCallDiarySchema = createSelectSchema(crmCallDiary);
export type InsertCrmCallDiary = typeof crmCallDiary.$inferInsert;
export type SelectCrmCallDiary = typeof crmCallDiary.$inferSelect;

// ============================================
// BREW PRICE BOOKS
// ============================================
// Price books allow different pricing tiers (Trade, Retail, Wholesale, etc.)
export const brewPriceBooks = pgTable("brew_price_books", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isDefault: integer("is_default").default(0), // 1 = default price book for workspace
  parentPriceBookId: integer("parent_price_book_id"), // Self-reference for discount books
  discountType: varchar("discount_type", { length: 20 }), // 'percentage' | 'fixed'
  discountValue: integer("discount_value"), // basis points for %, pence for fixed
  isActive: integer("is_active").default(1), // 1 = active, 0 = inactive
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_price_books_workspace_id_idx").on(table.workspaceId),
  parentIdx: index("brew_price_books_parent_idx").on(table.parentPriceBookId),
  defaultIdx: index("brew_price_books_default_idx").on(table.workspaceId, table.isDefault),
}));

export const insertBrewPriceBookSchema = createInsertSchema(brewPriceBooks);
export const selectBrewPriceBookSchema = createSelectSchema(brewPriceBooks);
export type InsertBrewPriceBook = typeof brewPriceBooks.$inferInsert;
export type SelectBrewPriceBook = typeof brewPriceBooks.$inferSelect;

// ============================================
// BREW PRODUCT PRICES (per Price Book)
// ============================================
// Stores specific prices for each product in each price book
export const brewProductPrices = pgTable("brew_product_prices", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  productId: text("product_id").notNull(), // References crm_products.id
  priceBookId: integer("price_book_id").notNull(), // References brew_price_books.id
  price: integer("price").notNull(), // Price in pence/cents
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_product_prices_workspace_id_idx").on(table.workspaceId),
  productIdIdx: index("brew_product_prices_product_id_idx").on(table.productId),
  priceBookIdIdx: index("brew_product_prices_price_book_id_idx").on(table.priceBookId),
  uniqueProductBook: index("brew_product_prices_unique_idx").on(table.productId, table.priceBookId),
}));

export const insertBrewProductPriceSchema = createInsertSchema(brewProductPrices);
export const selectBrewProductPriceSchema = createSelectSchema(brewProductPrices);
export type InsertBrewProductPrice = typeof brewProductPrices.$inferInsert;
export type SelectBrewProductPrice = typeof brewProductPrices.$inferSelect;

// ============================================
// BREW PRICE BANDS (Quantity-based discounts)
// ============================================
// Allows quantity-based discounts that apply at order time
export const brewPriceBands = pgTable("brew_price_bands", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  priceBookId: integer("price_book_id").notNull(), // References brew_price_books.id
  productId: text("product_id"), // NULL = applies to all products in the price book
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity"), // NULL = no upper limit
  discountType: varchar("discount_type", { length: 20 }).notNull(), // 'percentage' | 'fixed'
  discountValue: integer("discount_value").notNull(), // basis points for %, pence for fixed
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_price_bands_workspace_id_idx").on(table.workspaceId),
  priceBookIdIdx: index("brew_price_bands_price_book_id_idx").on(table.priceBookId),
  productIdIdx: index("brew_price_bands_product_id_idx").on(table.productId),
}));

export const insertBrewPriceBandSchema = createInsertSchema(brewPriceBands);
export const selectBrewPriceBandSchema = createSelectSchema(brewPriceBands);
export type InsertBrewPriceBand = typeof brewPriceBands.$inferInsert;
export type SelectBrewPriceBand = typeof brewPriceBands.$inferSelect;

// ============================================
// TRADE STORE SETTINGS
// ============================================
export const brewTradeStoreSettings = pgTable("brew_trade_store_settings", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  isEnabled: integer("is_enabled").default(0),
  storeName: varchar("store_name", { length: 200 }),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#1a56db"),
  welcomeMessage: text("welcome_message"),
  requireApproval: integer("require_approval").default(1),
  showStockLevels: integer("show_stock_levels").default(1),
  allowBackorders: integer("allow_backorders").default(0),
  minOrderValue: integer("min_order_value"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("trade_store_settings_workspace_idx").on(table.workspaceId),
}));

export const insertBrewTradeStoreSettingsSchema = createInsertSchema(brewTradeStoreSettings);
export const selectBrewTradeStoreSettingsSchema = createSelectSchema(brewTradeStoreSettings);
export type InsertBrewTradeStoreSettings = typeof brewTradeStoreSettings.$inferInsert;
export type SelectBrewTradeStoreSettings = typeof brewTradeStoreSettings.$inferSelect;

// ============================================
// TRADE STORE ACCESS
// ============================================
export const brewTradeStoreAccess = pgTable("brew_trade_store_access", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id").notNull(),
  accessCode: varchar("access_code", { length: 100 }).notNull(),
  isActive: integer("is_active").default(1),
  approvedAt: bigint("approved_at", { mode: "number" }),
  lastLoginAt: bigint("last_login_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("trade_store_access_workspace_idx").on(table.workspaceId),
  accessCodeIdx: index("trade_store_access_code_idx").on(table.accessCode),
  customerIdIdx: index("trade_store_access_customer_idx").on(table.customerId),
}));

export const insertBrewTradeStoreAccessSchema = createInsertSchema(brewTradeStoreAccess);
export const selectBrewTradeStoreAccessSchema = createSelectSchema(brewTradeStoreAccess);
export type InsertBrewTradeStoreAccess = typeof brewTradeStoreAccess.$inferInsert;
export type SelectBrewTradeStoreAccess = typeof brewTradeStoreAccess.$inferSelect;

// ============================================
// TRADE STORE SESSIONS
// ============================================
export const brewTradeStoreSessions = pgTable("brew_trade_store_sessions", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id").notNull(),
  sessionToken: varchar("session_token", { length: 200 }).notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  sessionTokenIdx: index("trade_store_sessions_token_idx").on(table.sessionToken),
  customerIdIdx: index("trade_store_sessions_customer_idx").on(table.customerId),
}));

export const insertBrewTradeStoreSessionSchema = createInsertSchema(brewTradeStoreSessions);
export const selectBrewTradeStoreSessionSchema = createSelectSchema(brewTradeStoreSessions);
export type InsertBrewTradeStoreSession = typeof brewTradeStoreSessions.$inferInsert;
export type SelectBrewTradeStoreSession = typeof brewTradeStoreSessions.$inferSelect;

// ============================================
// CRM SAVED FILTERS
// ============================================
export const crmSavedFilters = pgTable("crm_saved_filters", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  filterConfig: jsonb("filter_config").notNull(),
  isDynamic: integer("is_dynamic").default(1),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("saved_filters_workspace_idx").on(table.workspaceId),
}));

export const insertCrmSavedFilterSchema = createInsertSchema(crmSavedFilters);
export const selectCrmSavedFilterSchema = createSelectSchema(crmSavedFilters);
export type InsertCrmSavedFilter = typeof crmSavedFilters.$inferInsert;
export type SelectCrmSavedFilter = typeof crmSavedFilters.$inferSelect;

// ============================================
// CRM CUSTOMER TAGS
// ============================================
export const crmCustomerTags = pgTable("crm_customer_tags", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6b7280"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("customer_tags_workspace_idx").on(table.workspaceId),
}));

export const insertCrmCustomerTagSchema = createInsertSchema(crmCustomerTags);
export const selectCrmCustomerTagSchema = createSelectSchema(crmCustomerTags);
export type InsertCrmCustomerTag = typeof crmCustomerTags.$inferInsert;
export type SelectCrmCustomerTag = typeof crmCustomerTags.$inferSelect;

// ============================================
// CRM CUSTOMER TAG ASSIGNMENTS
// ============================================
export const crmCustomerTagAssignments = pgTable("crm_customer_tag_assignments", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id").notNull(),
  tagId: integer("tag_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  customerIdIdx: index("tag_assignments_customer_idx").on(table.customerId),
  tagIdIdx: index("tag_assignments_tag_idx").on(table.tagId),
}));

export const insertCrmCustomerTagAssignmentSchema = createInsertSchema(crmCustomerTagAssignments);
export const selectCrmCustomerTagAssignmentSchema = createSelectSchema(crmCustomerTagAssignments);
export type InsertCrmCustomerTagAssignment = typeof crmCustomerTagAssignments.$inferInsert;
export type SelectCrmCustomerTagAssignment = typeof crmCustomerTagAssignments.$inferSelect;

// ============================================
// CRM CUSTOMER GROUPS
// ============================================
export const crmCustomerGroups = pgTable("crm_customer_groups", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("customer_groups_workspace_idx").on(table.workspaceId),
}));

export const insertCrmCustomerGroupSchema = createInsertSchema(crmCustomerGroups);
export const selectCrmCustomerGroupSchema = createSelectSchema(crmCustomerGroups);
export type InsertCrmCustomerGroup = typeof crmCustomerGroups.$inferInsert;
export type SelectCrmCustomerGroup = typeof crmCustomerGroups.$inferSelect;

// ============================================
// CRM ACTIVITIES
// ============================================
export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id"),
  leadId: text("lead_id"),
  activityType: varchar("activity_type", { length: 50 }).notNull(), // 'call', 'meeting', 'email', 'note'
  subject: varchar("subject", { length: 200 }),
  notes: text("notes"),
  outcome: varchar("outcome", { length: 100 }),
  durationMinutes: integer("duration_minutes"),
  completedAt: bigint("completed_at", { mode: "number" }),
  createdBy: text("created_by"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("activities_workspace_idx").on(table.workspaceId),
  customerIdIdx: index("activities_customer_idx").on(table.customerId),
  leadIdIdx: index("activities_lead_idx").on(table.leadId),
  activityTypeIdx: index("activities_type_idx").on(table.activityType),
}));

export const insertCrmActivitySchema = createInsertSchema(crmActivities);
export const selectCrmActivitySchema = createSelectSchema(crmActivities);
export type InsertCrmActivity = typeof crmActivities.$inferInsert;
export type SelectCrmActivity = typeof crmActivities.$inferSelect;

// ============================================
// CRM TASKS
// ============================================
export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  customerId: text("customer_id"),
  leadId: text("lead_id"),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  dueDate: bigint("due_date", { mode: "number" }).notNull(),
  priority: varchar("priority", { length: 20 }).default("normal"), // 'low', 'normal', 'high', 'urgent'
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'in_progress', 'completed', 'cancelled'
  completedAt: bigint("completed_at", { mode: "number" }),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("tasks_workspace_idx").on(table.workspaceId),
  customerIdIdx: index("tasks_customer_idx").on(table.customerId),
  dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  statusIdx: index("tasks_status_idx").on(table.status),
}));

export const insertCrmTaskSchema = createInsertSchema(crmTasks);
export const selectCrmTaskSchema = createSelectSchema(crmTasks);
export type InsertCrmTask = typeof crmTasks.$inferInsert;
export type SelectCrmTask = typeof crmTasks.$inferSelect;

// ============================================
// ROUTE PLANNER - Delivery Route Management
// ============================================

// Delivery Bases (Starting points for delivery routes - depots, warehouses, breweries)
export const deliveryBases = pgTable("delivery_bases", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(), // e.g., "Main Brewery", "London Depot"
  address: text("address").notNull(),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  postcode: text("postcode"),
  country: text("country").default("United Kingdom"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  isDefault: boolean("is_default").default(false), // Auto-selected for new routes
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  workspaceIdIdx: index("delivery_bases_workspace_id_idx").on(table.workspaceId),
  isDefaultIdx: index("delivery_bases_is_default_idx").on(table.isDefault),
}));

export const insertDeliveryBaseSchema = createInsertSchema(deliveryBases);
export const selectDeliveryBaseSchema = createSelectSchema(deliveryBases);
export type InsertDeliveryBase = typeof deliveryBases.$inferInsert;
export type SelectDeliveryBase = typeof deliveryBases.$inferSelect;

// Delivery Routes (Enhanced version of delivery_runs with optimization)
export const deliveryRoutes = pgTable("delivery_routes", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  deliveryDate: bigint("delivery_date", { mode: "number" }).notNull(), // Unix timestamp
  status: text("status").notNull().default("draft"), // 'draft', 'optimized', 'assigned', 'in_progress', 'completed', 'cancelled'

  // Driver assignment
  driverId: text("driver_id"), // FK to users or separate drivers table
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  driverEmail: text("driver_email"),

  // Vehicle info
  vehicleId: text("vehicle_id"),
  vehicleName: text("vehicle"),
  vehicleCapacityKg: integer("vehicle_capacity_kg"),
  vehicleCapacityM3: doublePrecision("vehicle_capacity_m3"),

  // Route metrics
  totalStops: integer("total_stops").notNull().default(0),
  completedStops: integer("completed_stops").notNull().default(0),
  totalDistanceMiles: doublePrecision("total_distance_miles"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),

  // Start/end location (depot/base)
  startBaseId: integer("start_base_id"), // FK to delivery_bases
  endBaseId: integer("end_base_id"), // FK to delivery_bases (null = return to start)
  startLocationName: text("start_location_name"),
  startLatitude: doublePrecision("start_latitude"),
  startLongitude: doublePrecision("start_longitude"),
  endLocationName: text("end_location_name"),
  endLatitude: doublePrecision("end_latitude"),
  endLongitude: doublePrecision("end_longitude"),

  // Timing
  scheduledStartTime: bigint("scheduled_start_time", { mode: "number" }),
  actualStartTime: bigint("actual_start_time", { mode: "number" }),
  scheduledEndTime: bigint("scheduled_end_time", { mode: "number" }),
  actualEndTime: bigint("actual_end_time", { mode: "number" }),

  // Optimization
  isOptimized: boolean("is_optimized").notNull().default(false),
  lastOptimizedAt: bigint("last_optimized_at", { mode: "number" }),
  optimizationVersion: integer("optimization_version").default(0), // Increment on re-optimization

  // Map data
  encodedPolyline: text("encoded_polyline"), // Google/Mapbox polyline

  // Notes and metadata
  notes: text("notes"),
  internalNotes: text("internal_notes"), // Not visible to driver
  metadata: jsonb("metadata"), // Flexible data for future features

  // Timestamps
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("delivery_routes_workspace_id_idx").on(table.workspaceId),
  deliveryDateIdx: index("delivery_routes_delivery_date_idx").on(table.deliveryDate),
  statusIdx: index("delivery_routes_status_idx").on(table.status),
  driverIdIdx: index("delivery_routes_driver_id_idx").on(table.driverId),
}));

export const insertDeliveryRouteSchema = createInsertSchema(deliveryRoutes);
export const selectDeliveryRouteSchema = createSelectSchema(deliveryRoutes);
export type InsertDeliveryRoute = typeof deliveryRoutes.$inferInsert;
export type SelectDeliveryRoute = typeof deliveryRoutes.$inferSelect;

// Route Stops (Individual delivery points on a route)
export const routeStops = pgTable("route_stops", {
  id: text("id").primaryKey(),
  routeId: text("route_id").notNull(), // FK to delivery_routes
  orderId: text("order_id"), // FK to crm_orders (optional, can have stops without orders)
  customerId: text("customer_id").notNull(), // FK to crm_customers

  // Sequence
  sequenceNumber: integer("sequence_number").notNull(), // Order in route (1-based)
  originalSequenceNumber: integer("original_sequence_number"), // Before optimization

  // Location
  customerName: text("customer_name").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city"),
  postcode: text("postcode"),
  country: text("country"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  // Contact info
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),

  // Delivery details
  deliveryInstructions: text("delivery_instructions"),
  accessNotes: text("access_notes"), // "Gate code: 1234", "Ring bell twice"

  // Time windows
  earliestDeliveryTime: bigint("earliest_delivery_time", { mode: "number" }),
  latestDeliveryTime: bigint("latest_delivery_time", { mode: "number" }),
  estimatedArrivalTime: bigint("estimated_arrival_time", { mode: "number" }),
  actualArrivalTime: bigint("actual_arrival_time", { mode: "number" }),

  // Status tracking
  status: text("status").notNull().default("pending"), // 'pending', 'en_route', 'arrived', 'delivered', 'failed', 'skipped'
  deliveredAt: bigint("delivered_at", { mode: "number" }),

  // Delivery completion
  recipientName: text("recipient_name"), // Who received it
  deliveryNotes: text("delivery_notes"), // Driver notes on completion
  deliveryPhotoUrl: text("delivery_photo_url"), // Proof of delivery photo
  signatureUrl: text("signature_url"), // Digital signature

  // Failure handling
  failureReason: text("failure_reason"), // 'customer_unavailable', 'address_incorrect', 'access_denied', 'other'
  failureNotes: text("failure_notes"),
  rescheduledToRouteId: text("rescheduled_to_route_id"), // If rescheduled

  // Distance from previous stop
  distanceFromPreviousMiles: doublePrecision("distance_from_previous_miles"),
  durationFromPreviousMinutes: integer("duration_from_previous_minutes"),

  // Order details (denormalized for quick access)
  orderNumber: text("order_number"),
  itemCount: integer("item_count"),
  totalValue: integer("total_value"), // In pence/cents

  // Metadata
  metadata: jsonb("metadata"),

  // Timestamps
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  routeIdIdx: index("route_stops_route_id_idx").on(table.routeId),
  orderIdIdx: index("route_stops_order_id_idx").on(table.orderId),
  customerIdIdx: index("route_stops_customer_id_idx").on(table.customerId),
  statusIdx: index("route_stops_status_idx").on(table.status),
  sequenceIdx: index("route_stops_sequence_idx").on(table.routeId, table.sequenceNumber),
}));

export const insertRouteStopSchema = createInsertSchema(routeStops);
export const selectRouteStopSchema = createSelectSchema(routeStops);
export type InsertRouteStop = typeof routeStops.$inferInsert;
export type SelectRouteStop = typeof routeStops.$inferSelect;

// Route Optimization Results (Track optimization history and improvements)
export const routeOptimizationResults = pgTable("route_optimization_results", {
  id: text("id").primaryKey(),
  routeId: text("route_id").notNull(), // FK to delivery_routes
  workspaceId: text("workspace_id").notNull(),

  // Optimization metadata
  optimizationMethod: text("optimization_method").notNull(), // 'google_maps', 'mapbox', 'nearest_neighbor', 'genetic_algorithm'
  optimizationVersion: integer("optimization_version").notNull(),

  // Before optimization
  originalDistanceMiles: doublePrecision("original_distance_miles"),
  originalDurationMinutes: integer("original_duration_minutes"),
  originalSequence: jsonb("original_sequence"), // Array of stop IDs in original order

  // After optimization
  optimizedDistanceMiles: doublePrecision("optimized_distance_miles"),
  optimizedDurationMinutes: integer("optimized_duration_minutes"),
  optimizedSequence: jsonb("optimized_sequence"), // Array of stop IDs in optimized order

  // Improvements
  distanceSavedMiles: doublePrecision("distance_saved_miles"),
  distanceSavedPercent: doublePrecision("distance_saved_percent"),
  timeSavedMinutes: integer("time_saved_minutes"),
  timeSavedPercent: doublePrecision("time_saved_percent"),

  // API usage tracking
  apiProvider: text("api_provider"), // 'google_maps', 'mapbox'
  apiCallCount: integer("api_call_count").default(0),
  apiCostEstimate: doublePrecision("api_cost_estimate"), // Estimated cost in dollars

  // Detailed results
  waypointDistances: jsonb("waypoint_distances"), // Array of distances between each stop
  waypointDurations: jsonb("waypoint_durations"), // Array of durations between each stop
  fullResponseData: jsonb("full_response_data"), // Complete API response for debugging

  // Success/failure
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),

  // Timestamps
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  routeIdIdx: index("route_optimization_results_route_id_idx").on(table.routeId),
  workspaceIdIdx: index("route_optimization_results_workspace_id_idx").on(table.workspaceId),
  createdAtIdx: index("route_optimization_results_created_at_idx").on(table.createdAt),
}));

export const insertRouteOptimizationResultSchema = createInsertSchema(routeOptimizationResults);
export const selectRouteOptimizationResultSchema = createSelectSchema(routeOptimizationResults);
export type InsertRouteOptimizationResult = typeof routeOptimizationResults.$inferInsert;
export type SelectRouteOptimizationResult = typeof routeOptimizationResults.$inferSelect;

// ============================================
// BREW CONTAINER MOVEMENTS
// ============================================
export const brewContainerMovements = pgTable("brew_container_movements", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  containerId: text("container_id").notNull(),
  movementType: varchar("movement_type", { length: 50 }).notNull(), // 'filled', 'dispatched', 'returned', 'cleaned'
  fromLocation: varchar("from_location", { length: 100 }),
  toLocation: varchar("to_location", { length: 100 }),
  customerId: text("customer_id"),
  orderId: text("order_id"),
  batchId: text("batch_id"),
  notes: text("notes"),
  scannedBy: text("scanned_by"),
  scannedAt: bigint("scanned_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("container_movements_workspace_idx").on(table.workspaceId),
  containerIdIdx: index("container_movements_container_idx").on(table.containerId),
  customerIdIdx: index("container_movements_customer_idx").on(table.customerId),
  movementTypeIdx: index("container_movements_type_idx").on(table.movementType),
}));

export const insertBrewContainerMovementSchema = createInsertSchema(brewContainerMovements);
export const selectBrewContainerMovementSchema = createSelectSchema(brewContainerMovements);
export type InsertBrewContainerMovement = typeof brewContainerMovements.$inferInsert;
export type SelectBrewContainerMovement = typeof brewContainerMovements.$inferSelect;

// ============================================
// OAUTH STATES TABLE
// ============================================
// Server-side OAuth state records for secure session binding
// Ensures OAuth callbacks are bound to the initiating user/org
export const oauthStates = pgTable("oauth_states", {
  id: serial("id").primaryKey(),
  stateToken: varchar("state_token", { length: 64 }).notNull().unique(), // Cryptographically random token
  userId: text("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  orgId: text("org_id"), // Optional org_id for multi-tenant scenarios
  integration: varchar("integration", { length: 50 }).notNull(), // e.g., 'xero', 'stripe'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Short expiry (10-15 minutes)
  usedAt: timestamp("used_at"), // Set when the state is consumed
}, (table) => ({
  stateTokenIdx: index("oauth_states_token_idx").on(table.stateToken),
  userIdIdx: index("oauth_states_user_idx").on(table.userId),
  expiresAtIdx: index("oauth_states_expires_idx").on(table.expiresAt),
}));

export const insertOAuthStateSchema = createInsertSchema(oauthStates);
export const selectOAuthStateSchema = createSelectSchema(oauthStates);
export type InsertOAuthState = typeof oauthStates.$inferInsert;
export type SelectOAuthState = typeof oauthStates.$inferSelect;

// ============================================
// XERO CONNECTIONS TABLE
// ============================================
// Store Xero connection details per workspace (OAuth tokens)
export const xeroConnections = pgTable("xero_connections", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().unique(),
  tenantId: varchar("tenant_id", { length: 100 }).notNull(),
  tenantName: varchar("tenant_name", { length: 200 }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  lastImportAt: timestamp("last_import_at"),
  isConnected: boolean("is_connected").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdIdx: index("xero_connections_workspace_idx").on(table.workspaceId),
}));

export const insertXeroConnectionSchema = createInsertSchema(xeroConnections);
export const selectXeroConnectionSchema = createSelectSchema(xeroConnections);
export type InsertXeroConnection = typeof xeroConnections.$inferInsert;
export type SelectXeroConnection = typeof xeroConnections.$inferSelect;

// ============================================
// XERO IMPORT JOBS TABLE
// ============================================
// Track import jobs for progress reporting
export const xeroImportJobs = pgTable("xero_import_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  jobType: varchar("job_type", { length: 50 }).notNull(), // 'customers', 'orders', 'products'
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'running', 'completed', 'failed'
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  failedRecords: integer("failed_records").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdIdx: index("xero_import_jobs_workspace_idx").on(table.workspaceId),
  statusIdx: index("xero_import_jobs_status_idx").on(table.status),
}));

export const insertXeroImportJobSchema = createInsertSchema(xeroImportJobs);
export const selectXeroImportJobSchema = createSelectSchema(xeroImportJobs);
export type InsertXeroImportJob = typeof xeroImportJobs.$inferInsert;
export type SelectXeroImportJob = typeof xeroImportJobs.$inferSelect;

// ============================================
// XERO WEBHOOK EVENTS TABLE
// ============================================
// Track incoming webhook events from Xero
export const xeroWebhookEvents = pgTable("xero_webhook_events", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  eventId: varchar("event_id", { length: 100 }).unique().notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // CREATE, UPDATE, DELETE
  eventCategory: varchar("event_category", { length: 50 }).notNull(), // INVOICE, CONTACT, ITEM
  resourceId: varchar("resource_id", { length: 100 }).notNull(),
  tenantId: varchar("tenant_id", { length: 100 }).notNull(),
  eventDate: timestamp("event_date").notNull(),
  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdIdx: index("xero_webhook_events_workspace_idx").on(table.workspaceId),
  processedIdx: index("xero_webhook_events_processed_idx").on(table.processed),
  eventIdIdx: index("xero_webhook_events_event_id_idx").on(table.eventId),
}));

export const insertXeroWebhookEventSchema = createInsertSchema(xeroWebhookEvents);
export const selectXeroWebhookEventSchema = createSelectSchema(xeroWebhookEvents);
export type InsertXeroWebhookEvent = typeof xeroWebhookEvents.$inferInsert;
export type SelectXeroWebhookEvent = typeof xeroWebhookEvents.$inferSelect;

// ============================================
// XERO SYNC QUEUE TABLE
// ============================================
// Queue for retrying failed syncs to Xero
export const xeroSyncQueue = pgTable("xero_sync_queue", {
  id: serial("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(), // order, customer, product
  entityId: text("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(), // create, update, void
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  lastError: text("last_error"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  workspaceIdIdx: index("xero_sync_queue_workspace_idx").on(table.workspaceId),
  nextRetryAtIdx: index("xero_sync_queue_next_retry_idx").on(table.nextRetryAt),
  entityIdx: index("xero_sync_queue_entity_idx").on(table.entityType, table.entityId),
}));

export const insertXeroSyncQueueSchema = createInsertSchema(xeroSyncQueue);
export const selectXeroSyncQueueSchema = createSelectSchema(xeroSyncQueue);
export type InsertXeroSyncQueue = typeof xeroSyncQueue.$inferInsert;
export type SelectXeroSyncQueue = typeof xeroSyncQueue.$inferSelect;

// ============================================
// AI ENTITY RESOLUTION SYSTEM
// ============================================

// ============================================
// PUBS_MASTER TABLE
// ============================================
// Golden record for each pub entity. Combines and deduplicates data from
// multiple sources (spreadsheets, Xero, Google Places, manual entry) into
// a single authoritative record per pub.
export const pubsMaster = pgTable("pubs_master", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // Core identity
  name: varchar("name", { length: 255 }).notNull(),
  
  // Address fields
  addressLine1: varchar("address_line_1", { length: 255 }),
  addressLine2: varchar("address_line_2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  postcode: varchar("postcode", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  country: varchar("country", { length: 100 }).default("GB"),
  
  // Geolocation
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  
  // Pub attributes
  isFreehouse: boolean("is_freehouse"),
  pubCompany: varchar("pub_company", { length: 255 }),
  
  // Customer status
  isCustomer: boolean("is_customer").default(false),
  isClosed: boolean("is_closed").default(false),
  
  // CRM fields
  lastContactedAt: timestamp("last_contacted_at"),
  lastOrderAt: timestamp("last_order_at"),
  totalOrders: integer("total_orders").default(0),
  customerSince: date("customer_since"),
  
  // Lead scoring
  leadScore: integer("lead_score"),
  leadPriority: varchar("lead_priority", { length: 50 }),
  
  // Data quality
  dataQualityScore: real("data_quality_score"),
  lastVerifiedAt: timestamp("last_verified_at"),
  
  // Discovery tracking
  discoveredBy: varchar("discovered_by", { length: 50 }),
  discoveredAt: timestamp("discovered_at"),
  
  // Full-text search (stored as text, actual tsvector handled by DB)
  searchVector: text("search_vector"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  postcodeIdx: index("idx_pubs_postcode").on(table.postcode),
  customerIdx: index("idx_pubs_customer").on(table.isCustomer),
  freehouseIdx: index("idx_pubs_freehouse").on(table.isFreehouse),
  verifiedIdx: index("idx_pubs_verified").on(table.lastVerifiedAt),
  workspaceIdx: index("idx_pubs_workspace").on(table.workspaceId),
}));

export const insertPubsMasterSchema = createInsertSchema(pubsMaster);
export const selectPubsMasterSchema = createSelectSchema(pubsMaster);
export type InsertPubsMaster = typeof pubsMaster.$inferInsert;
export type SelectPubsMaster = typeof pubsMaster.$inferSelect;

// ============================================
// ENTITY_SOURCES TABLE
// ============================================
// Links master pub records to their source data. Each row represents one
// data source that contributed to a pub record, with confidence scores
// and AI reasoning for non-obvious matches.
export const entitySources = pgTable("entity_sources", {
  id: serial("id").primaryKey(),
  pubId: integer("pub_id").notNull().references(() => pubsMaster.id, { onDelete: "cascade" }),
  workspaceId: integer("workspace_id").notNull(),
  
  // Source identification
  sourceType: varchar("source_type", { length: 50 }).notNull(), // 'spreadsheet', 'xero', 'google_places', 'manual'
  sourceId: varchar("source_id", { length: 255 }),
  sourceData: jsonb("source_data").notNull(),
  
  // Match quality
  confidence: real("confidence").notNull().default(1.0),
  matchedAt: timestamp("matched_at").defaultNow(),
  matchedBy: varchar("matched_by", { length: 50 }),
  matchedReasoning: text("matched_reasoning"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  pubIdx: index("idx_entity_sources_pub").on(table.pubId),
  lookupIdx: index("idx_entity_sources_lookup").on(table.sourceType, table.sourceId),
  workspaceIdx: index("idx_entity_sources_workspace").on(table.workspaceId),
}));

export const insertEntitySourceSchema = createInsertSchema(entitySources);
export const selectEntitySourceSchema = createSelectSchema(entitySources);
export type InsertEntitySource = typeof entitySources.$inferInsert;
export type SelectEntitySource = typeof entitySources.$inferSelect;

// ============================================
// XERO_ORDERS TABLE (Entity Resolution System)
// ============================================
// Historical orders imported from Xero, linked to master pub records.
// Enables unified order history regardless of how the customer was originally created.
export const xeroOrdersEntity = pgTable("xero_orders", {
  id: serial("id").primaryKey(),
  pubId: integer("pub_id").notNull().references(() => pubsMaster.id, { onDelete: "cascade" }),
  
  // Xero identifiers
  xeroInvoiceId: varchar("xero_invoice_id", { length: 255 }).unique().notNull(),
  xeroInvoiceNumber: varchar("xero_invoice_number", { length: 100 }),
  
  // Order details
  orderDate: date("order_date").notNull(),
  dueDate: date("due_date"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 50 }),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => ({
  pubIdx: index("idx_xero_orders_pub").on(table.pubId),
  dateIdx: index("idx_xero_orders_date").on(table.orderDate),
}));

export const insertXeroOrderEntitySchema = createInsertSchema(xeroOrdersEntity);
export const selectXeroOrderEntitySchema = createSelectSchema(xeroOrdersEntity);
export type InsertXeroOrderEntity = typeof xeroOrdersEntity.$inferInsert;
export type SelectXeroOrderEntity = typeof xeroOrdersEntity.$inferSelect;

// ============================================
// THINGS TABLE
// ============================================
// Events, festivals, markets, and opportunities discovered by the AI agent.
// "Things" that are happening which represent potential sales opportunities.
// Can be linked to a pub (pub_event) or exist at standalone venues.
export const things = pgTable("things", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // Classification
  thingType: varchar("thing_type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Timing
  startDate: date("start_date"),
  endDate: date("end_date"),
  isRecurring: boolean("is_recurring").default(false),
  recurrencePattern: varchar("recurrence_pattern", { length: 100 }),
  nextOccurrence: date("next_occurrence"),
  
  // Location: Either linked to a pub OR standalone
  outletId: integer("outlet_id").references(() => pubsMaster.id, { onDelete: "set null" }),
  standaloneLocation: varchar("standalone_location", { length: 255 }),
  standaloneAddress: text("standalone_address"),
  standalonePostcode: varchar("standalone_postcode", { length: 20 }),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  
  // Contact & Details
  url: varchar("url", { length: 500 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  ticketPrice: numeric("ticket_price", { precision: 10, scale: 2 }),
  expectedAttendance: integer("expected_attendance"),
  organizer: varchar("organizer", { length: 255 }),
  
  // Status
  status: varchar("status", { length: 50 }).default("upcoming"),
  
  // User engagement tracking
  userInterested: boolean("user_interested").default(false),
  userAttended: boolean("user_attended").default(false),
  userNotes: text("user_notes"),
  userRating: integer("user_rating"),
  
  // Discovery metadata
  discoveredBy: varchar("discovered_by", { length: 50 }),
  discoveredAt: timestamp("discovered_at"),
  sourceUrl: varchar("source_url", { length: 500 }),
  
  // AI scoring
  relevanceScore: real("relevance_score"),
  leadPotentialScore: real("lead_potential_score"),
  
  // Data quality
  lastVerifiedAt: timestamp("last_verified_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("idx_things_workspace").on(table.workspaceId),
  outletIdx: index("idx_things_outlet").on(table.outletId),
  datesIdx: index("idx_things_dates").on(table.startDate, table.endDate),
  typeIdx: index("idx_things_type").on(table.thingType),
  statusIdx: index("idx_things_status").on(table.status),
  relevanceIdx: index("idx_things_relevance").on(table.relevanceScore),
}));

export const insertThingSchema = createInsertSchema(things);
export const selectThingSchema = createSelectSchema(things);
export type InsertThing = typeof things.$inferInsert;
export type SelectThing = typeof things.$inferSelect;

// ============================================
// AGENT_INTELLIGENCE TABLE
// ============================================
// Learned insights and patterns that the AI agent discovers while analyzing
// brewery data. Creates institutional memory that improves recommendations
// and predictions over time.
export const agentIntelligence = pgTable("agent_intelligence", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // What entity this intelligence relates to
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  
  // Intelligence classification
  intelligenceType: varchar("intelligence_type", { length: 50 }).notNull(),
  
  // The actual insight
  observation: text("observation").notNull(),
  data: jsonb("data"),
  
  // Confidence and provenance
  confidence: real("confidence").notNull(),
  source: varchar("source", { length: 100 }),
  evidence: text("evidence"),
  sampleSize: integer("sample_size"),
  
  // Usage tracking
  lastUsedAt: timestamp("last_used_at"),
  useCount: integer("use_count").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  workspaceIdx: index("idx_intelligence_workspace").on(table.workspaceId),
  entityIdx: index("idx_intelligence_entity").on(table.entityType, table.entityId),
  typeIdx: index("idx_intelligence_type").on(table.intelligenceType),
  confidenceIdx: index("idx_intelligence_confidence").on(table.confidence),
  expiresIdx: index("idx_intelligence_expires").on(table.expiresAt),
}));

export const insertAgentIntelligenceSchema = createInsertSchema(agentIntelligence);
export const selectAgentIntelligenceSchema = createSelectSchema(agentIntelligence);
export type InsertAgentIntelligence = typeof agentIntelligence.$inferInsert;
export type SelectAgentIntelligence = typeof agentIntelligence.$inferSelect;

// ============================================
// AI_RESEARCH_QUEUE TABLE
// ============================================
// Background job queue for AI research tasks. Jobs are picked up by workers
// to enrich pub data, verify addresses, check trading status, find contact details, etc.
export const aiResearchQueue = pgTable("ai_research_queue", {
  id: serial("id").primaryKey(),
  pubId: integer("pub_id").notNull().references(() => pubsMaster.id, { onDelete: "cascade" }),
  workspaceId: integer("workspace_id").notNull(),
  
  // Task details
  researchType: varchar("research_type", { length: 50 }).notNull(),
  priority: integer("priority").default(5),
  
  // Status tracking
  status: varchar("status", { length: 50 }).default("pending"),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  
  // Results
  result: jsonb("result"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  statusIdx: index("idx_research_queue_status").on(table.status, table.priority),
  pubIdx: index("idx_research_queue_pub").on(table.pubId),
  workspaceIdx: index("idx_research_queue_workspace").on(table.workspaceId),
}));

export const insertAiResearchQueueSchema = createInsertSchema(aiResearchQueue);
export const selectAiResearchQueueSchema = createSelectSchema(aiResearchQueue);
export type InsertAiResearchQueue = typeof aiResearchQueue.$inferInsert;
export type SelectAiResearchQueue = typeof aiResearchQueue.$inferSelect;

// ============================================
// ENTITY_REVIEW_QUEUE TABLE
// ============================================
// Human review queue for uncertain entity matches. When the AI finds a possible
// duplicate but confidence is below threshold, it queues the match for human review.
export const entityReviewQueue = pgTable("entity_review_queue", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // The incoming data that needs resolution
  newPubData: jsonb("new_pub_data").notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  sourceId: varchar("source_id", { length: 255 }),
  
  // Possible match (if AI found one)
  possibleMatchPubId: integer("possible_match_pub_id").references(() => pubsMaster.id, { onDelete: "cascade" }),
  confidence: real("confidence").notNull(),
  reasoning: text("reasoning"),
  
  // Review status
  status: varchar("status", { length: 50 }).default("pending"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewDecision: varchar("review_decision", { length: 50 }),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("idx_review_queue_status").on(table.status),
  workspaceIdx: index("idx_review_queue_workspace").on(table.workspaceId),
  matchIdx: index("idx_review_queue_match").on(table.possibleMatchPubId),
}));

export const insertEntityReviewQueueSchema = createInsertSchema(entityReviewQueue);
export const selectEntityReviewQueueSchema = createSelectSchema(entityReviewQueue);
export type InsertEntityReviewQueue = typeof entityReviewQueue.$inferInsert;
export type SelectEntityReviewQueue = typeof entityReviewQueue.$inferSelect;

// ============================================
// SEARCH_LOG TABLE
// ============================================
// Logs all pub discovery searches for analytics and audit. Tracks coverage
// of different areas, search efficiency, and helps identify gaps in the database.
export const searchLog = pgTable("search_log", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // Search details
  searchDate: date("search_date").notNull(),
  searchType: varchar("search_type", { length: 50 }),
  searchArea: varchar("search_area", { length: 100 }),
  searchTerm: varchar("search_term", { length: 255 }),
  
  // Results summary
  resultsReturned: integer("results_returned"),
  newPubsAdded: integer("new_pubs_added"),
  existingPubsFound: integer("existing_pubs_found"),
  duplicatesSkipped: integer("duplicates_skipped"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdx: index("idx_search_log_workspace").on(table.workspaceId, table.searchDate),
  areaIdx: index("idx_search_log_area").on(table.searchArea),
}));

export const insertSearchLogSchema = createInsertSchema(searchLog);
export const selectSearchLogSchema = createSelectSchema(searchLog);
export type InsertSearchLog = typeof searchLog.$inferInsert;
export type SelectSearchLog = typeof searchLog.$inferSelect;

// ============================================
// ACTIVITY LOG - Local system activity tracking
// ============================================
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull(),
  
  // Activity details
  activityType: text("activity_type").notNull(), // database_update, xero_sync, ai_discovery, entity_match, event_found, price_alert
  category: text("category").notNull(), // system, ai, sync, user
  title: text("title").notNull(), // "Found 12 new pubs"
  description: text("description"), // More details
  
  // Context
  entityType: text("entity_type"), // pub, customer, order, supplier, event
  entityId: text("entity_id"),
  metadata: jsonb("metadata"), // Flexible data
  
  // User (if user-triggered)
  userId: text("user_id"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  workspaceIdx: index("idx_activity_log_workspace").on(table.workspaceId),
  activityTypeIdx: index("idx_activity_log_type").on(table.activityType),
  createdAtIdx: index("idx_activity_log_created").on(table.createdAt),
  categoryIdx: index("idx_activity_log_category").on(table.category),
}));

export const insertActivityLogSchema = createInsertSchema(activityLog);
export const selectActivityLogSchema = createSelectSchema(activityLog);
export type InsertActivityLog = typeof activityLog.$inferInsert;
export type SelectActivityLog = typeof activityLog.$inferSelect;

// ============================================
// AFR RULE UPDATES (Judgment Ledger)
// ============================================
export const afrRuleUpdates = pgTable("afr_rule_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ruleText: text("rule_text").notNull(),
  scope: text("scope").notNull(),
  confidence: text("confidence").notNull(), // low | med | high
  status: text("status").notNull(), // active | disabled | invalid
  updateType: text("update_type").notNull(), // create | adjust | retire
  reason: text("reason"),
  evidenceRunIds: text("evidence_run_ids").array(),
  source: text("source").notNull(), // human | agent | hybrid
  supersedesRuleId: uuid("supersedes_rule_id"),
}, (table) => ({
  statusIdx: index("afr_rule_updates_status_idx").on(table.status),
  createdAtIdx: index("afr_rule_updates_created_at_idx").on(table.createdAt),
  scopeIdx: index("afr_rule_updates_scope_idx").on(table.scope),
}));

export const afrRuleUpdateConfidenceSchema = z.enum(["low", "med", "high"]);
export const afrRuleUpdateStatusSchema = z.enum(["active", "disabled", "invalid"]);
export const afrRuleUpdateTypeSchema = z.enum(["create", "adjust", "retire"]);
export const afrRuleUpdateSourceSchema = z.enum(["human", "agent", "hybrid"]);

export const insertAfrRuleUpdateSchema = createInsertSchema(afrRuleUpdates);
export const selectAfrRuleUpdateSchema = createSelectSchema(afrRuleUpdates);
export type InsertAfrRuleUpdate = typeof afrRuleUpdates.$inferInsert;
export type SelectAfrRuleUpdate = typeof afrRuleUpdates.$inferSelect;

// ============================================
// AFR RUN BUNDLES (structured agent truth per run)
// ============================================
export const afrRunBundles = pgTable("afr_run_bundles", {
  runId: text("run_id").primaryKey(),
  bundle: jsonb("bundle").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const afrRunBundleSchema = z.object({
  goal_worth: z.string().nullable(),
  decisions: z.array(z.any()).default([]),
  expected_signals: z.array(z.any()).default([]),
  stop_conditions: z.array(z.any()).default([]),
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  tower_verdict: z.string().nullable(),
});

export const insertAfrRunBundleSchema = createInsertSchema(afrRunBundles);
export const selectAfrRunBundleSchema = createSelectSchema(afrRunBundles);
export type InsertAfrRunBundle = typeof afrRunBundles.$inferInsert;
export type SelectAfrRunBundle = typeof afrRunBundles.$inferSelect;
export type AfrRunBundleData = z.infer<typeof afrRunBundleSchema>;

// ============================================
// HN REPLIES TRACKING
// ============================================

export const hnReplies = pgTable("hn_replies", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  source: text("source").notNull().default("hackernews"),
  repliedAt: timestamp("replied_at").defaultNow().notNull(),
  userId: text("user_id"),
}, (table) => ({
  itemIdIdx: index("hn_replies_item_id_idx").on(table.itemId),
}));

export const insertHnReplySchema = createInsertSchema(hnReplies);
export const selectHnReplySchema = createSelectSchema(hnReplies);
export type InsertHnReply = typeof hnReplies.$inferInsert;
export type SelectHnReply = typeof hnReplies.$inferSelect;

// ============================================
// HN DONE TRACKING
// ============================================

export const hnDone = pgTable("hn_done", {
  itemId: integer("item_id").primaryKey(),
  source: text("source").notNull().default("hackernews"),
  done: boolean("done").notNull().default(true),
  doneAt: timestamp("done_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHnDoneSchema = createInsertSchema(hnDone);
export const selectHnDoneSchema = createSelectSchema(hnDone);
export type InsertHnDone = typeof hnDone.$inferInsert;
export type SelectHnDone = typeof hnDone.$inferSelect;

// ============================================
// RELATIONS
// ============================================
import { relations } from "drizzle-orm";

// PubsMaster relations
export const pubsMasterRelations = relations(pubsMaster, ({ many }) => ({
  entitySources: many(entitySources),
  xeroOrders: many(xeroOrdersEntity),
  things: many(things),
  researchQueue: many(aiResearchQueue),
  reviewQueue: many(entityReviewQueue),
}));

// EntitySources relations
export const entitySourcesRelations = relations(entitySources, ({ one }) => ({
  pub: one(pubsMaster, {
    fields: [entitySources.pubId],
    references: [pubsMaster.id],
  }),
}));

// XeroOrdersEntity relations
export const xeroOrdersEntityRelations = relations(xeroOrdersEntity, ({ one }) => ({
  pub: one(pubsMaster, {
    fields: [xeroOrdersEntity.pubId],
    references: [pubsMaster.id],
  }),
}));

// Things relations
export const thingsRelations = relations(things, ({ one }) => ({
  outlet: one(pubsMaster, {
    fields: [things.outletId],
    references: [pubsMaster.id],
  }),
}));

// AiResearchQueue relations
export const aiResearchQueueRelations = relations(aiResearchQueue, ({ one }) => ({
  pub: one(pubsMaster, {
    fields: [aiResearchQueue.pubId],
    references: [pubsMaster.id],
  }),
}));

// EntityReviewQueue relations
export const entityReviewQueueRelations = relations(entityReviewQueue, ({ one }) => ({
  possibleMatch: one(pubsMaster, {
    fields: [entityReviewQueue.possibleMatchPubId],
    references: [pubsMaster.id],
  }),
}));

export const telemetryEvents = pgTable("telemetry_events", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  eventType: text("event_type").notNull(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("telemetry_events_run_id_idx").on(table.runId),
  index("telemetry_events_event_type_idx").on(table.eventType),
]);