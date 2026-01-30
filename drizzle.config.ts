import { defineConfig } from "drizzle-kit";

// SINGLE SOURCE OF TRUTH: DATABASE_URL must point to Supabase Postgres
const DATABASE_CONNECTION_URL = process.env.DATABASE_URL;

if (!DATABASE_CONNECTION_URL || DATABASE_CONNECTION_URL.trim() === '') {
  throw new Error("DATABASE_URL must be set to your Supabase Postgres URL");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_CONNECTION_URL,
  },
});
