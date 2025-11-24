-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "user_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text,
	"type" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suggested_leads" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suggested_leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text,
	"company_name" text,
	"address" text,
	"website" text,
	"email" text,
	"confidence" numeric,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pubs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pubs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text,
	"address" text,
	"city" text,
	"county" text,
	"postcode" text,
	"country" text,
	"lat" double precision,
	"lon" double precision,
	"phone" text,
	"website" text,
	"tags" text[]
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"is_demo" integer DEFAULT 0 NOT NULL,
	"demo_created_at" bigint,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_tier" text DEFAULT 'free',
	"subscription_status" text DEFAULT 'inactive',
	"monitor_count" integer DEFAULT 0 NOT NULL,
	"deep_research_count" integer DEFAULT 0 NOT NULL,
	"last_reset_at" bigint,
	"company_name" text,
	"company_domain" text,
	"role_hint" text,
	"primary_objective" text,
	"secondary_objectives" text[],
	"target_markets" text[],
	"products_or_services" text[],
	"preferences" jsonb,
	"inferred_industry" text,
	"last_context_refresh" bigint,
	"confidence" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_confidence_check" CHECK ((confidence >= 0) AND (confidence <= 100))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT 'Conversation' NOT NULL,
	"type" text DEFAULT 'chat' NOT NULL,
	"monitor_id" text,
	"run_sequence" integer,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_conversation_id" text,
	"source_message_id" text,
	"fact" text NOT NULL,
	"score" integer DEFAULT 50 NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"default_country" text,
	"expires_at" bigint NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"schedule" text NOT NULL,
	"schedule_day" text,
	"schedule_time" text,
	"monitor_type" text NOT NULL,
	"config" jsonb,
	"is_active" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suggested_by" text,
	"suggested_reason" text,
	"suggestion_metadata" jsonb,
	"email_notifications" integer DEFAULT 0 NOT NULL,
	"email_address" text,
	"last_run_at" bigint,
	"next_run_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deep_research_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"label" text NOT NULL,
	"prompt" text NOT NULL,
	"mode" text DEFAULT 'report' NOT NULL,
	"counties" text[],
	"window_months" integer,
	"schema_name" text,
	"schema" jsonb,
	"intensity" text DEFAULT 'standard' NOT NULL,
	"response_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"output_text" text,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" bigint,
	"metadata" jsonb,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisor_tasks" (
	"id" varchar PRIMARY KEY DEFAULT (gen_random_uuid()) NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"task_type" varchar NOT NULL,
	"request_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar DEFAULT 'pending',
	"result" jsonb,
	"error" text,
	"created_at" bigint NOT NULL,
	"processed_at" bigint,
	CONSTRAINT "valid_status" CHECK ((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))
);
--> statement-breakpoint
CREATE TABLE "batch_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"query" text NOT NULL,
	"location" text NOT NULL,
	"country" text NOT NULL,
	"target_role" text NOT NULL,
	"limit" integer DEFAULT 60 NOT NULL,
	"personalize" integer DEFAULT 1 NOT NULL,
	"campaign_id" text,
	"items" jsonb,
	"total_found" integer,
	"total_sent" integer,
	"total_skipped" integer,
	"error" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"completed_at" bigint
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" bigint NOT NULL,
	"source" text DEFAULT 'ui',
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
ALTER TABLE "supervisor_tasks" ADD CONSTRAINT "supervisor_tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_users_inferred_industry" ON "users" USING btree ("inferred_industry" text_ops);--> statement-breakpoint
CREATE INDEX "idx_users_is_demo" ON "users" USING btree ("is_demo" int4_ops,"demo_created_at" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_users_subscription_tier" ON "users" USING btree ("subscription_tier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_created_at" ON "conversations" USING btree ("created_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_monitor_id" ON "conversations" USING btree ("monitor_id" int4_ops,"run_sequence" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_user_id" ON "conversations" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_facts_category" ON "facts" USING btree ("category" int8_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_facts_user_id_score" ON "facts" USING btree ("user_id" int8_ops,"score" int8_ops,"created_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_user_sessions_expires_at" ON "user_sessions" USING btree ("expires_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scheduled_monitors_is_active" ON "scheduled_monitors" USING btree ("is_active" int8_ops,"next_run_at" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_scheduled_monitors_status" ON "scheduled_monitors" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_scheduled_monitors_user_id" ON "scheduled_monitors" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_deep_research_runs_user_id" ON "deep_research_runs" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_deep_research_status" ON "deep_research_runs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_deep_research_updated_at" ON "deep_research_runs" USING btree ("updated_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_integrations_provider" ON "integrations" USING btree ("provider" text_ops);--> statement-breakpoint
CREATE INDEX "idx_integrations_user_id" ON "integrations" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_supervisor_tasks_conversation" ON "supervisor_tasks" USING btree ("conversation_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_supervisor_tasks_status" ON "supervisor_tasks" USING btree ("status" int8_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_supervisor_tasks_user" ON "supervisor_tasks" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id" int8_ops,"created_at" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_source" ON "messages" USING btree ("source" text_ops);
*/