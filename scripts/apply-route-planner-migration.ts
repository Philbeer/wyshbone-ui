// Apply route planner migration
import postgres from "postgres";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

// Load .env file
config();

// Supabase is the only supported database.
const DATABASE_URL = process.env.SUPABASE_DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("SUPABASE_DATABASE_URL environment variable is required");
}

const sql = postgres(DATABASE_URL);

async function applyMigration() {
  try {
    console.log("Reading migration file...");
    const migrationSQL = readFileSync(
      join(process.cwd(), "migrations", "2026_01_03_route_planner.sql"),
      "utf-8"
    );

    console.log("Applying route planner migration...");
    await sql.unsafe(migrationSQL);

    console.log("✓ Migration applied successfully!");
  } catch (error) {
    console.error("✗ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

applyMigration();
