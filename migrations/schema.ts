import { pgTable, bigint, text, jsonb, timestamp, numeric, doublePrecision, index, unique, check, integer, foreignKey, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const userSignals = pgTable("user_signals", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "user_signals_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	userId: text("user_id"),
	type: text(),
	payload: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const suggestedLeads = pgTable("suggested_leads", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "suggested_leads_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	userId: text("user_id"),
	companyName: text("company_name"),
	address: text(),
	website: text(),
	email: text(),
	confidence: numeric(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const pubs = pgTable("pubs", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "pubs_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: text(),
	address: text(),
	city: text(),
	county: text(),
	postcode: text(),
	country: text(),
	lat: doublePrecision(),
	lon: doublePrecision(),
	phone: text(),
	website: text(),
	tags: text().array(),
});

export const users = pgTable("users", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	name: text(),
	isDemo: integer("is_demo").default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	demoCreatedAt: bigint("demo_created_at", { mode: "number" }),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	subscriptionTier: text("subscription_tier").default('free'),
	subscriptionStatus: text("subscription_status").default('inactive'),
	monitorCount: integer("monitor_count").default(0).notNull(),
	deepResearchCount: integer("deep_research_count").default(0).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastResetAt: bigint("last_reset_at", { mode: "number" }),
	companyName: text("company_name"),
	companyDomain: text("company_domain"),
	roleHint: text("role_hint"),
	primaryObjective: text("primary_objective"),
	secondaryObjectives: text("secondary_objectives").array(),
	targetMarkets: text("target_markets").array(),
	productsOrServices: text("products_or_services").array(),
	preferences: jsonb(),
	inferredIndustry: text("inferred_industry"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastContextRefresh: bigint("last_context_refresh", { mode: "number" }),
	confidence: integer(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_users_inferred_industry").using("btree", table.inferredIndustry.asc().nullsLast().op("text_ops")),
	index("idx_users_is_demo").using("btree", table.isDemo.asc().nullsLast().op("int4_ops"), table.demoCreatedAt.asc().nullsLast().op("int4_ops")),
	index("idx_users_subscription_tier").using("btree", table.subscriptionTier.asc().nullsLast().op("text_ops")),
	unique("users_email_key").on(table.email),
	check("users_confidence_check", sql`(confidence >= 0) AND (confidence <= 100)`),
]);

export const conversations = pgTable("conversations", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	label: text().default('Conversation').notNull(),
	type: text().default('chat').notNull(),
	monitorId: text("monitor_id"),
	runSequence: integer("run_sequence"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_conversations_created_at").using("btree", table.createdAt.asc().nullsLast().op("int8_ops")),
	index("idx_conversations_monitor_id").using("btree", table.monitorId.asc().nullsLast().op("int4_ops"), table.runSequence.asc().nullsLast().op("text_ops")),
	index("idx_conversations_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const facts = pgTable("facts", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	sourceConversationId: text("source_conversation_id"),
	sourceMessageId: text("source_message_id"),
	fact: text().notNull(),
	score: integer().default(50).notNull(),
	category: text().default('general').notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_facts_category").using("btree", table.category.asc().nullsLast().op("int8_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("idx_facts_user_id_score").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.score.asc().nullsLast().op("int8_ops"), table.createdAt.asc().nullsLast().op("int8_ops")),
]);

export const userSessions = pgTable("user_sessions", {
	sessionId: text("session_id").primaryKey().notNull(),
	userId: text("user_id").notNull(),
	userEmail: text("user_email").notNull(),
	defaultCountry: text("default_country"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_user_sessions_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("int8_ops")),
	index("idx_user_sessions_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const scheduledMonitors = pgTable("scheduled_monitors", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	conversationId: text("conversation_id"),
	label: text().notNull(),
	description: text().notNull(),
	schedule: text().notNull(),
	scheduleDay: text("schedule_day"),
	scheduleTime: text("schedule_time"),
	monitorType: text("monitor_type").notNull(),
	config: jsonb(),
	isActive: integer("is_active").default(1).notNull(),
	status: text().default('active').notNull(),
	suggestedBy: text("suggested_by"),
	suggestedReason: text("suggested_reason"),
	suggestionMetadata: jsonb("suggestion_metadata"),
	emailNotifications: integer("email_notifications").default(0).notNull(),
	emailAddress: text("email_address"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastRunAt: bigint("last_run_at", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	nextRunAt: bigint("next_run_at", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_scheduled_monitors_is_active").using("btree", table.isActive.asc().nullsLast().op("int8_ops"), table.nextRunAt.asc().nullsLast().op("int4_ops")),
	index("idx_scheduled_monitors_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_scheduled_monitors_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const deepResearchRuns = pgTable("deep_research_runs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	sessionId: text("session_id"),
	label: text().notNull(),
	prompt: text().notNull(),
	mode: text().default('report').notNull(),
	counties: text().array(),
	windowMonths: integer("window_months"),
	schemaName: text("schema_name"),
	schema: jsonb(),
	intensity: text().default('standard').notNull(),
	responseId: text("response_id"),
	status: text().default('queued').notNull(),
	outputText: text("output_text"),
	error: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_deep_research_runs_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_deep_research_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_deep_research_updated_at").using("btree", table.updatedAt.asc().nullsLast().op("int8_ops")),
]);

export const integrations = pgTable("integrations", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	provider: text().notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expiresAt: bigint("expires_at", { mode: "number" }),
	metadata: jsonb(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
	index("idx_integrations_provider").using("btree", table.provider.asc().nullsLast().op("text_ops")),
	index("idx_integrations_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const supervisorTasks = pgTable("supervisor_tasks", {
	id: varchar().default((gen_random_uuid())).primaryKey().notNull(),
	conversationId: varchar("conversation_id").notNull(),
	userId: varchar("user_id").notNull(),
	taskType: varchar("task_type").notNull(),
	requestData: jsonb("request_data").default({}).notNull(),
	status: varchar().default('pending'),
	result: jsonb(),
	error: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	processedAt: bigint("processed_at", { mode: "number" }),
}, (table) => [
	index("idx_supervisor_tasks_conversation").using("btree", table.conversationId.asc().nullsLast().op("text_ops")),
	index("idx_supervisor_tasks_status").using("btree", table.status.asc().nullsLast().op("int8_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("idx_supervisor_tasks_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [conversations.id],
			name: "supervisor_tasks_conversation_id_fkey"
		}).onDelete("cascade"),
	check("valid_status", sql`(status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])`),
]);

export const batchJobs = pgTable("batch_jobs", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	status: text().notNull(),
	query: text().notNull(),
	location: text().notNull(),
	country: text().notNull(),
	targetRole: text("target_role").notNull(),
	limit: integer().default(60).notNull(),
	personalize: integer().default(1).notNull(),
	campaignId: text("campaign_id"),
	items: jsonb(),
	totalFound: integer("total_found"),
	totalSent: integer("total_sent"),
	totalSkipped: integer("total_skipped"),
	error: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	completedAt: bigint("completed_at", { mode: "number" }),
});

export const messages = pgTable("messages", {
	id: text().primaryKey().notNull(),
	conversationId: text("conversation_id").notNull(),
	role: text().notNull(),
	content: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	createdAt: bigint("created_at", { mode: "number" }).notNull(),
	source: text().default('ui'),
	metadata: jsonb().default({}),
}, (table) => [
	index("idx_messages_conversation_id").using("btree", table.conversationId.asc().nullsLast().op("int8_ops"), table.createdAt.asc().nullsLast().op("int8_ops")),
	index("idx_messages_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
]);
