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
export type InsertLocationHint = z.infer<typeof insertLocationHintSchema>;
export type SelectLocationHint = typeof locationHints.$inferSelect;

// Deep Research Drizzle table
export const deepResearchRuns = pgTable("deep_research_runs", {
  id: text("id").primaryKey(),
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
export type InsertDeepResearchRun = z.infer<typeof insertDeepResearchRunSchema>;
export type SelectDeepResearchRun = typeof deepResearchRuns.$inferSelect;

// ============= MEMORY SYSTEM TABLES =============

// Conversations table - stores user conversation sessions
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull().default("Conversation"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("conversations_user_id_idx").on(table.userId),
  createdAtIdx: index("conversations_created_at_idx").on(table.createdAt),
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
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type SelectConversation = typeof conversations.$inferSelect;

// Message insert/select schemas
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type SelectMessage = typeof messages.$inferSelect;

// Fact insert/select schemas
export const insertFactSchema = createInsertSchema(facts);
export const selectFactSchema = createSelectSchema(facts);
export type InsertFact = z.infer<typeof insertFactSchema>;
export type SelectFact = typeof facts.$inferSelect;

// ============= SCHEDULED MONITORS TABLE =============

// Scheduled Monitors table - stores recurring monitoring tasks
export const scheduledMonitors = pgTable("scheduled_monitors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  schedule: text("schedule").notNull(),
  scheduleDay: text("schedule_day"),
  scheduleTime: text("schedule_time"),
  monitorType: text("monitor_type").notNull(),
  config: jsonb("config"),
  isActive: integer("is_active").notNull().default(1),
  emailNotifications: integer("email_notifications").notNull().default(0),
  lastRunAt: bigint("last_run_at", { mode: "number" }),
  nextRunAt: bigint("next_run_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => ({
  userIdIdx: index("scheduled_monitors_user_id_idx").on(table.userId),
  isActiveIdx: index("scheduled_monitors_is_active_idx").on(table.isActive, table.nextRunAt),
}));

// Scheduled Monitor Zod schemas for validation
export const scheduledMonitorScheduleSchema = z.enum(["daily", "weekly", "biweekly", "monthly"]);
export const scheduledMonitorTypeSchema = z.enum(["business_search", "deep_research", "google_places"]);
export const scheduledMonitorDaySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

export const scheduledMonitorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  label: z.string(),
  description: z.string(),
  schedule: scheduledMonitorScheduleSchema,
  scheduleDay: scheduledMonitorDaySchema.optional(),
  scheduleTime: z.string().optional(),
  monitorType: scheduledMonitorTypeSchema,
  config: z.any().optional(),
  isActive: z.number(),
  emailNotifications: z.number(),
  lastRunAt: z.number().optional(),
  nextRunAt: z.number().optional(),
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
export type InsertScheduledMonitor = z.infer<typeof insertScheduledMonitorSchema>;
export type SelectScheduledMonitor = typeof scheduledMonitors.$inferSelect;
