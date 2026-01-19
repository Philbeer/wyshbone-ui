import { defineConfig } from "drizzle-kit";

// Prefer SUPABASE_DATABASE_URL to match the app's database connection
const DATABASE_CONNECTION_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_CONNECTION_URL) {
  throw new Error("SUPABASE_DATABASE_URL or DATABASE_URL must be set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_CONNECTION_URL,
  },
});
