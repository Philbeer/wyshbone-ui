-- Route Planner Tables Migration
-- Created: 2026-01-03

-- Delivery Routes Table
CREATE TABLE IF NOT EXISTS "delivery_routes" (
    "id" text PRIMARY KEY NOT NULL,
    "workspace_id" text NOT NULL,
    "name" text NOT NULL,
    "delivery_date" bigint NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "driver_id" text,
    "driver_name" text,
    "driver_phone" text,
    "driver_email" text,
    "vehicle_id" text,
    "vehicle" text,
    "vehicle_capacity_kg" integer,
    "vehicle_capacity_m3" double precision,
    "total_stops" integer DEFAULT 0 NOT NULL,
    "completed_stops" integer DEFAULT 0 NOT NULL,
    "total_distance_miles" double precision,
    "estimated_duration_minutes" integer,
    "start_location_name" text,
    "start_latitude" double precision,
    "start_longitude" double precision,
    "end_location_name" text,
    "end_latitude" double precision,
    "end_longitude" double precision,
    "scheduled_start_time" bigint,
    "actual_start_time" bigint,
    "scheduled_end_time" bigint,
    "actual_end_time" bigint,
    "is_optimized" boolean DEFAULT false NOT NULL,
    "last_optimized_at" bigint,
    "optimization_version" integer DEFAULT 0,
    "encoded_polyline" text,
    "notes" text,
    "internal_notes" text,
    "metadata" jsonb,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL
);

-- Route Stops Table
CREATE TABLE IF NOT EXISTS "route_stops" (
    "id" text PRIMARY KEY NOT NULL,
    "route_id" text NOT NULL,
    "order_id" text,
    "customer_id" text NOT NULL,
    "sequence_number" integer NOT NULL,
    "original_sequence_number" integer,
    "customer_name" text NOT NULL,
    "address_line1" text NOT NULL,
    "address_line2" text,
    "city" text,
    "postcode" text,
    "country" text,
    "latitude" double precision,
    "longitude" double precision,
    "contact_name" text,
    "contact_phone" text,
    "contact_email" text,
    "delivery_instructions" text,
    "access_notes" text,
    "earliest_delivery_time" bigint,
    "latest_delivery_time" bigint,
    "estimated_arrival_time" bigint,
    "actual_arrival_time" bigint,
    "status" text DEFAULT 'pending' NOT NULL,
    "delivered_at" bigint,
    "recipient_name" text,
    "delivery_notes" text,
    "delivery_photo_url" text,
    "signature_url" text,
    "failure_reason" text,
    "failure_notes" text,
    "rescheduled_to_route_id" text,
    "distance_from_previous_miles" double precision,
    "duration_from_previous_minutes" integer,
    "order_number" text,
    "item_count" integer,
    "total_value" integer,
    "metadata" jsonb,
    "created_at" bigint NOT NULL,
    "updated_at" bigint NOT NULL
);

-- Route Optimization Results Table
CREATE TABLE IF NOT EXISTS "route_optimization_results" (
    "id" text PRIMARY KEY NOT NULL,
    "route_id" text NOT NULL,
    "workspace_id" text NOT NULL,
    "optimization_method" text NOT NULL,
    "optimization_version" integer NOT NULL,
    "original_distance_miles" double precision,
    "original_duration_minutes" integer,
    "original_sequence" jsonb,
    "optimized_distance_miles" double precision,
    "optimized_duration_minutes" integer,
    "optimized_sequence" jsonb,
    "distance_saved_miles" double precision,
    "distance_saved_percent" double precision,
    "time_saved_minutes" integer,
    "time_saved_percent" double precision,
    "api_provider" text,
    "api_call_count" integer DEFAULT 0,
    "api_cost_estimate" double precision,
    "waypoint_distances" jsonb,
    "waypoint_durations" jsonb,
    "full_response_data" jsonb,
    "success" boolean DEFAULT true NOT NULL,
    "error_message" text,
    "created_at" bigint NOT NULL
);

-- Indexes for delivery_routes
CREATE INDEX IF NOT EXISTS "delivery_routes_workspace_id_idx" ON "delivery_routes" ("workspace_id");
CREATE INDEX IF NOT EXISTS "delivery_routes_delivery_date_idx" ON "delivery_routes" ("delivery_date");
CREATE INDEX IF NOT EXISTS "delivery_routes_status_idx" ON "delivery_routes" ("status");
CREATE INDEX IF NOT EXISTS "delivery_routes_driver_id_idx" ON "delivery_routes" ("driver_id");

-- Indexes for route_stops
CREATE INDEX IF NOT EXISTS "route_stops_route_id_idx" ON "route_stops" ("route_id");
CREATE INDEX IF NOT EXISTS "route_stops_order_id_idx" ON "route_stops" ("order_id");
CREATE INDEX IF NOT EXISTS "route_stops_customer_id_idx" ON "route_stops" ("customer_id");
CREATE INDEX IF NOT EXISTS "route_stops_status_idx" ON "route_stops" ("status");
CREATE INDEX IF NOT EXISTS "route_stops_sequence_idx" ON "route_stops" ("route_id", "sequence_number");

-- Indexes for route_optimization_results
CREATE INDEX IF NOT EXISTS "route_optimization_results_route_id_idx" ON "route_optimization_results" ("route_id");
CREATE INDEX IF NOT EXISTS "route_optimization_results_workspace_id_idx" ON "route_optimization_results" ("workspace_id");
CREATE INDEX IF NOT EXISTS "route_optimization_results_created_at_idx" ON "route_optimization_results" ("created_at");
