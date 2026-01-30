import { defineConfig } from "drizzle-kit";

// SINGLE SOURCE OF TRUTH: SUPABASE_DATABASE_URL (Replit auto-provides DATABASE_URL for its built-in Postgres)
const DATABASE_CONNECTION_URL = process.env.SUPABASE_DATABASE_URL;

if (!DATABASE_CONNECTION_URL || DATABASE_CONNECTION_URL.trim() === '') {
  throw new Error("SUPABASE_DATABASE_URL must be set to your Supabase Postgres URL");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_CONNECTION_URL,
  },
});
