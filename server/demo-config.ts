/**
 * DEMO MODE CONFIGURATION
 * 
 * Controls demo mode behavior for local development and testing.
 * 
 * Environment Variables:
 * - DEMO_MODE: 'true' to enable demo mode (also enabled when NODE_ENV=development)
 * - DEMO_PERSISTENCE: 'database' (default) or 'memory'
 *   - database: All writes go to Supabase (proves real DB works)
 *   - memory: Use in-memory storage (for offline testing)
 */

export interface DemoConfig {
  /** Whether demo mode is enabled */
  enabled: boolean;
  /** Where to persist data: 'database' or 'memory' */
  persistence: 'database' | 'memory';
  /** Demo user credentials */
  user: {
    id: string;
    email: string;
  };
}

// Demo user constants
export const DEMO_USER_ID = 'demo-user';
export const DEMO_USER_EMAIL = 'demo@wyshbone.com';

/**
 * Get current demo mode configuration
 */
export function getDemoConfig(): DemoConfig {
  const isDev = process.env.NODE_ENV === 'development';
  const demoModeEnv = process.env.DEMO_MODE?.toLowerCase();
  
  // Demo mode is enabled if:
  // 1. DEMO_MODE=true explicitly set
  // 2. NODE_ENV=development (implicit demo mode)
  const enabled = demoModeEnv === 'true' || isDev;
  
  // Persistence defaults to 'database' to prove real DB works
  // Can be set to 'memory' for offline testing
  const persistenceEnv = process.env.DEMO_PERSISTENCE?.toLowerCase();
  const persistence: 'database' | 'memory' = 
    persistenceEnv === 'memory' ? 'memory' : 'database';
  
  return {
    enabled,
    persistence,
    user: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
    },
  };
}

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  return getDemoConfig().enabled;
}

/**
 * Check if we should use database persistence in demo mode
 */
export function useDatabasePersistence(): boolean {
  const config = getDemoConfig();
  return config.persistence === 'database';
}

/**
 * Log demo mode configuration on startup
 */
export function logDemoConfig(): void {
  const config = getDemoConfig();
  
  if (config.enabled) {
    console.log('\n============================================================');
    console.log('🎭 DEMO MODE CONFIGURATION');
    console.log('============================================================');
    console.log(`   Enabled: ${config.enabled}`);
    console.log(`   Persistence: ${config.persistence}`);
    console.log(`   Demo User: ${config.user.email}`);
    console.log('');
    console.log('   All /api/* routes will accept requests without auth.');
    console.log('   Requests are treated as demo-user.');
    if (config.persistence === 'database') {
      console.log('   Data persists to Supabase (real database).');
    } else {
      console.log('   Data stored in memory (lost on restart).');
    }
    console.log('============================================================\n');
  }
}

