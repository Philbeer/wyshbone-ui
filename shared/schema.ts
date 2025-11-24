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
}, (table) => ({
  userIdIdx: index("deep_research_runs_user_id_idx").on(table.userId),
  statusIdx: index("status_idx").on(table.status),
  updatedAtIdx: index("updated_at_idx").on(table.updatedAt),
  responseIdIdx: index("response_id_idx").on(table.responseId),
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

// Users table for authentication and subscription management
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  isDemo: integer("is_demo").notNull().default(0), // 1 = demo user, 0 = regular user
  demoCreatedAt: bigint("demo_created_at", { mode: "number" }), // When demo account was created (for cleanup)
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
export const subscriptionTierSchema = z.enum(["free", "basic", "pro", "business", "enterprise"]);
export const subscriptionStatusSchema = z.enum(["active", "inactive", "cancelled", "past_due"]);

export const userPreferencesSchema = z.object({
  tone: z.enum(["concise", "detailed"]).optional(),
  cadence: z.enum(["one_question", "short_flow"]).optional(),
}).optional();

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional().nullable(),
  isDemo: z.number().int(),
  demoCreatedAt: z.number().optional().nullable(),
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
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_customers_workspace_id_idx").on(table.workspaceId),
  nameIdx: index("crm_customers_name_idx").on(table.name),
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
  vatTotal: integer("vat_total").default(0), // In pence/cents - calculated from line items
  totalIncVat: integer("total_inc_vat").default(0), // In pence/cents - calculated from line items
  totalAmount: integer("total_amount"), // DEPRECATED: kept for backwards compatibility, use totalIncVat
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("crm_orders_workspace_id_idx").on(table.workspaceId),
  customerIdIdx: index("crm_orders_customer_id_idx").on(table.customerId),
  deliveryRunIdIdx: index("crm_orders_delivery_run_id_idx").on(table.deliveryRunId),
  statusIdx: index("crm_orders_status_idx").on(table.status),
  orderDateIdx: index("crm_orders_order_date_idx").on(table.orderDate),
}));

export const insertCrmOrderSchema = createInsertSchema(crmOrders);
export const selectCrmOrderSchema = createSelectSchema(crmOrders);
export type InsertCrmOrder = typeof crmOrders.$inferInsert;
export type SelectCrmOrder = typeof crmOrders.$inferSelect;

// CRM Order Lines
export const crmOrderLines = pgTable("crm_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id"), // FK to brew_products or other vertical product tables
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

// ============= BREWERY VERTICAL TABLES =============
// Brewery Products (beers)
export const brewProducts = pgTable("brew_products", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  style: text("style"),
  sku: text("sku"),
  abv: integer("abv").notNull(), // Stored as basis points (e.g., 450 = 4.5%)
  defaultPackageType: text("default_package_type").notNull(), // 'cask', 'keg', 'can', 'bottle'
  defaultPackageSizeLitres: integer("default_package_size_litres").notNull(), // In millilitres (e.g., 40900 = 40.9L)
  dutyBand: text("duty_band").notNull(), // 'beer_standard', 'beer_small_producer', etc.
  defaultUnitPriceExVat: integer("default_unit_price_ex_vat").default(0), // In pence/cents - used for order line defaults
  defaultVatRate: integer("default_vat_rate").default(2000), // Stored as basis points (e.g., 2000 = 20%, 500 = 5%)
  isActive: integer("is_active").notNull().default(1), // 1 = true, 0 = false
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  workspaceIdIdx: index("brew_products_workspace_id_idx").on(table.workspaceId),
  skuIdx: index("brew_products_sku_idx").on(table.sku),
  isActiveIdx: index("brew_products_is_active_idx").on(table.isActive),
}));

export const insertBrewProductSchema = createInsertSchema(brewProducts);
export const selectBrewProductSchema = createSelectSchema(brewProducts);
export type InsertBrewProduct = typeof brewProducts.$inferInsert;
export type SelectBrewProduct = typeof brewProducts.$inferSelect;

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
