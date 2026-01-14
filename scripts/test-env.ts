/**
 * Smoke test for environment configuration
 * Run with: npm run test:env
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

console.log('\n========================================');
console.log('🧪 Environment Smoke Test');
console.log('========================================\n');

console.log(`Repo root: ${repoRoot}\n`);

// Check which env files exist
const envLocalPath = resolve(repoRoot, '.env.local');
const envPath = resolve(repoRoot, '.env');

console.log('Env files:');
console.log(`  .env.local: ${existsSync(envLocalPath) ? '✅ EXISTS' : '❌ NOT FOUND'} (${envLocalPath})`);
console.log(`  .env:       ${existsSync(envPath) ? '✅ EXISTS' : '❌ NOT FOUND'} (${envPath})\n`);

// Load env
let loadedFrom = '(none)';
if (existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
  loadedFrom = envLocalPath;
} else if (existsSync(envPath)) {
  config({ path: envPath, override: true });
  loadedFrom = envPath;
}

console.log(`Loaded from: ${loadedFrom}\n`);

// Check required vars
const required = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_PLACES_API_KEY',
  'OPENAI_API_KEY',
];

console.log('Required variables:');
let allPresent = true;
for (const key of required) {
  const value = process.env[key];
  const present = !!value;
  const icon = present ? '✅' : '❌';
  const masked = value ? value.substring(0, 20) + '...' : '(not set)';
  console.log(`  ${icon} ${key}: ${present ? 'SET' : 'MISSING'} ${present ? `(${masked})` : ''}`);
  if (!present) allPresent = false;
}

console.log('\n========================================');
if (allPresent) {
  console.log('✅ All required environment variables are set!');
  console.log('   npm run dev:backend should work.');
} else {
  console.log('❌ Missing required environment variables!');
  console.log('   Create .env.local in repo root with missing vars.');
}
console.log('========================================\n');

process.exit(allPresent ? 0 : 1);

