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
CREATE TABLE "location_hints" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"geonameid" text,
	"subcountry" text,
	"town_city" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
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
	"email_notifications" integer DEFAULT 0 NOT NULL,
	"email_address" text,
	"last_run_at" bigint,
	"next_run_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
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
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_created_at_idx" ON "conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversations_monitor_id_idx" ON "conversations" USING btree ("monitor_id","run_sequence");--> statement-breakpoint
CREATE INDEX "deep_research_runs_user_id_idx" ON "deep_research_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_idx" ON "deep_research_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "updated_at_idx" ON "deep_research_runs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "response_id_idx" ON "deep_research_runs" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "facts_user_id_score_idx" ON "facts" USING btree ("user_id","score","created_at");--> statement-breakpoint
CREATE INDEX "facts_category_idx" ON "facts" USING btree ("category","created_at");--> statement-breakpoint
CREATE INDEX "location_hints_country_idx" ON "location_hints" USING btree ("country");--> statement-breakpoint
CREATE INDEX "location_hints_town_city_idx" ON "location_hints" USING btree ("town_city");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "scheduled_monitors_user_id_idx" ON "scheduled_monitors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_monitors_is_active_idx" ON "scheduled_monitors" USING btree ("is_active","next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_monitors_conversation_id_idx" ON "scheduled_monitors" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions" USING btree ("expires_at");