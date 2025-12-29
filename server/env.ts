/**
 * Environment Loader - MUST BE IMPORTED FIRST
 * 
 * Loads environment variables from .env files with proper path resolution.
 * Priority: DOTENV_CONFIG_PATH > .env.local > .env
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

// Get the directory of this file (server/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root is one level up from server/
const repoRoot = resolve(__dirname, '..');

interface EnvLoadResult {
  loaded: boolean;
  path: string;
  error?: string;
}

/**
 * Load environment variables from .env files
 * Priority: DOTENV_CONFIG_PATH > .env.local > .env
 */
function loadEnv(): EnvLoadResult {
  // Priority 1: Explicit path via DOTENV_CONFIG_PATH
  if (process.env.DOTENV_CONFIG_PATH) {
    const explicitPath = resolve(process.env.DOTENV_CONFIG_PATH);
    if (existsSync(explicitPath)) {
      const result = config({ path: explicitPath, override: true });
      if (!result.error) {
        return { loaded: true, path: explicitPath };
      }
      return { loaded: false, path: explicitPath, error: result.error.message };
    }
    return { loaded: false, path: explicitPath, error: 'File not found' };
  }

  // Priority 2: .env.local at repo root
  const envLocalPath = resolve(repoRoot, '.env.local');
  if (existsSync(envLocalPath)) {
    const result = config({ path: envLocalPath, override: true });
    if (!result.error) {
      return { loaded: true, path: envLocalPath };
    }
  }

  // Priority 3: .env at repo root
  const envPath = resolve(repoRoot, '.env');
  if (existsSync(envPath)) {
    const result = config({ path: envPath, override: true });
    if (!result.error) {
      return { loaded: true, path: envPath };
    }
    return { loaded: false, path: envPath, error: 'Failed to parse' };
  }

  // No env file found
  return { 
    loaded: false, 
    path: `(looked in ${envLocalPath} and ${envPath})`,
    error: 'No .env or .env.local file found'
  };
}

/**
 * Required environment variables for the backend
 */
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_PLACES_API_KEY',
  'OPENAI_API_KEY',
] as const;

/**
 * Optional but recommended environment variables
 */
const OPTIONAL_ENV_VARS = [
  'HUNTER_API_KEY',
  'SALESHANDY_API_KEY',
  'STRIPE_SECRET_KEY',
  'SIMULATE_TOOLS',  // Set to 'true' to force simulation mode (no real API calls)
] as const;

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  present: string[];
  warnings: string[];
}

/**
 * Validate that required environment variables are set
 */
function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const present: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  for (const key of OPTIONAL_ENV_VARS) {
    if (!process.env[key]) {
      warnings.push(`${key} not set (optional)`);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
    warnings,
  };
}

// ============================================
// EXECUTE ENV LOADING ON IMPORT
// ============================================

const envResult = loadEnv();

console.log(`\n${'='.repeat(60)}`);
console.log(`🔧 [ENV] Environment Configuration`);
console.log(`${'='.repeat(60)}`);
console.log(`   Repo root: ${repoRoot}`);

if (envResult.loaded) {
  console.log(`   ✅ Loaded: ${envResult.path}`);
} else {
  console.log(`   ❌ NOT LOADED: ${envResult.path}`);
  if (envResult.error) {
    console.log(`   Error: ${envResult.error}`);
  }
}

// Validate required vars
const validation = validateEnv();

console.log(`\n   Required variables:`);
for (const key of REQUIRED_ENV_VARS) {
  const isSet = process.env[key] ? '✅' : '❌';
  const value = process.env[key];
  // Mask sensitive values
  const masked = value 
    ? (key.includes('KEY') || key.includes('SECRET') || key.includes('URL') 
        ? value.substring(0, 15) + '...' 
        : value.substring(0, 30) + (value.length > 30 ? '...' : ''))
    : '(not set)';
  console.log(`   ${isSet} ${key}: ${masked}`);
}

if (validation.warnings.length > 0) {
  console.log(`\n   Optional variables (warnings):`);
  for (const warning of validation.warnings) {
    console.log(`   ⚠️  ${warning}`);
  }
}

console.log(`${'='.repeat(60)}\n`);

// Handle missing required vars
const isDev = process.env.NODE_ENV === 'development';

if (!validation.valid) {
  console.error(`\n${'!'.repeat(60)}`);
  console.error(`❌ ${isDev ? 'WARNING' : 'FATAL'}: Missing required environment variables:`);
  console.error(`${'!'.repeat(60)}`);
  for (const key of validation.missing) {
    console.error(`   • ${key}`);
  }
  console.error(`\nTo fix:`);
  console.error(`   1. Create a .env.local file in the repo root: ${repoRoot}`);
  console.error(`   2. Add the missing variables to .env.local`);
  console.error(`   3. Restart the server`);
  console.error(`\nExample .env.local:`);
  console.error(`   DATABASE_URL=postgres://...`);
  console.error(`   SUPABASE_URL=https://xxx.supabase.co`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY=eyJ...`);
  console.error(`   GOOGLE_PLACES_API_KEY=AIza...`);
  console.error(`   OPENAI_API_KEY=sk-...`);
  console.error(`${'!'.repeat(60)}\n`);
  
  // In development mode, warn but continue (stub behavior available)
  if (isDev) {
    console.warn(`\n⚠️  DEV MODE: Continuing with missing env vars. Some features will use stub responses.\n`);
  } else {
    // In production, fail fast
    process.exit(1);
  }
}

// Export for use by other modules
export { envResult, validation, repoRoot, REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS };

