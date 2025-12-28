/**
 * ERROR HELPERS
 * 
 * Provides actionable error messages for common failures.
 * These errors are safe to show to users and include hints for resolution.
 */

export interface ApiError {
  code: string;
  message: string;
  hint?: string;
}

/**
 * Create a structured API error response
 */
export function createApiError(code: string, message: string, hint?: string): ApiError {
  return { code, message, hint };
}

/**
 * Analyze a database error and return an actionable error
 */
export function analyzeDatabaseError(error: any, operation: string): ApiError {
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || error?.cause?.code;
  
  // DNS resolution failure
  if (errorCode === 'ENOTFOUND' || errorMessage.includes('ENOTFOUND')) {
    return createApiError(
      'DB_DNS_FAILED',
      `Database connection failed: DNS resolution error`,
      'Check SUPABASE_URL in .env.local. The database hostname could not be resolved. ' +
      'This may be a network issue or the Supabase project may be paused.'
    );
  }
  
  // Connection refused
  if (errorCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
    return createApiError(
      'DB_CONNECTION_REFUSED',
      'Database connection refused',
      'Check that Supabase is running and DATABASE_URL is correct in .env.local.'
    );
  }
  
  // Connection timeout
  if (errorCode === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
    return createApiError(
      'DB_TIMEOUT',
      'Database connection timed out',
      'The database may be overloaded or network is slow. Try again.'
    );
  }
  
  // Relation (table) does not exist
  if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
    const tableMatch = errorMessage.match(/relation "([^"]+)" does not exist/);
    const tableName = tableMatch?.[1] || 'unknown';
    return createApiError(
      'DB_TABLE_MISSING',
      `Table "${tableName}" does not exist`,
      `Run database migrations: npm run db:push. The table ${tableName} needs to be created.`
    );
  }
  
  // Column does not exist
  if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
    const columnMatch = errorMessage.match(/column "([^"]+)" does not exist/);
    const columnName = columnMatch?.[1] || 'unknown';
    return createApiError(
      'DB_COLUMN_MISSING',
      `Column "${columnName}" does not exist`,
      `Run database migrations: npm run db:push. Schema may be out of sync.`
    );
  }
  
  // Unique constraint violation
  if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
    return createApiError(
      'DB_DUPLICATE_KEY',
      'Record already exists',
      'A record with this ID already exists. This may be a retry of a previous request.'
    );
  }
  
  // NOT NULL constraint violation
  if (errorMessage.includes('null value') && errorMessage.includes('violates not-null')) {
    const columnMatch = errorMessage.match(/column "([^"]+)"/);
    const columnName = columnMatch?.[1] || 'unknown';
    return createApiError(
      'DB_NULL_VIOLATION',
      `Required field "${columnName}" is missing`,
      `Ensure all required fields are provided in the request.`
    );
  }
  
  // Invalid input syntax (type mismatch)
  if (errorMessage.includes('invalid input syntax')) {
    return createApiError(
      'DB_TYPE_ERROR',
      'Invalid data type',
      'Check that all fields have the correct data types (string, number, etc).'
    );
  }
  
  // Missing environment variables
  if (errorMessage.includes('SUPABASE_URL') || errorMessage.includes('DATABASE_URL')) {
    return createApiError(
      'CONFIG_MISSING',
      'Database configuration missing',
      'Set SUPABASE_URL and DATABASE_URL in .env.local file.'
    );
  }
  
  // Generic database error
  return createApiError(
    'DB_ERROR',
    `Database ${operation} failed`,
    `Error: ${errorMessage.substring(0, 200)}. Check server logs for details.`
  );
}

/**
 * Check if an error is a database connectivity issue (DNS, connection refused, etc)
 */
export function isDatabaseConnectivityError(error: any): boolean {
  const errorCode = error?.code || error?.cause?.code;
  const errorMessage = error?.message || String(error);
  
  return (
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ETIMEDOUT' ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('connection')
  );
}

/**
 * Create an auth error for demo mode
 */
export function createAuthError(isDemoMode: boolean): ApiError {
  if (isDemoMode) {
    return createApiError(
      'AUTH_DEMO_MISSING',
      'Demo authentication failed',
      'Demo mode is enabled but auth bypass did not work. Check server logs.'
    );
  }
  return createApiError(
    'AUTH_REQUIRED',
    'Authentication required',
    'Please log in to access this resource.'
  );
}

