// CRITICAL: Configure DNS resolution FIRST (before any network imports)
// Some Supabase endpoints only have IPv6 addresses - prefer IPv6 to avoid ENOTFOUND errors
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv6first');

// CRITICAL: Load environment variables FIRST
// This must be the very first import - it validates env and exits if missing
import './env.js';

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { nangoRouter } from "./routes/nango";
import { taskTrackingRouter } from "./routes/task-tracking";
import { toolsExecuteRouter } from "./routes/tools-execute";
import { createSuppliersRouter } from "./routes/suppliers";
import { wabsScoresRouter } from "./routes/wabs-scores";
import { redditRouter } from "./routes/reddit";
import { hnRouter } from "./routes/hn";
import { storage, runStartupMigrations } from "./storage";
import { logDemoConfig } from "./demo-config";
import { runSchemaHealthCheck } from "./schema-check";

// Simple log function (no Vite dependency for production)
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const app = express();

// CORS configuration for cross-origin requests
// Supports localhost, Vercel, and Replit deployments
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5001',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }
    if (origin.endsWith('.vercel.app') || 
        origin.endsWith('.replit.app') || 
        origin.endsWith('.replit.dev') ||
        origin.endsWith('.repl.co') ||
        origin.includes('.replit.')) {
      return callback(null, origin);
    }
    console.log(`⚠️ CORS: Rejecting origin ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-session-id', 'Cache-Control']
}));

// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req: any, _res, buf, encoding) => {
    if (req.url === '/api/integrations/nango-webhook') {
      req.rawBody = buf.toString(encoding as BufferEncoding || 'utf8');
    }
  }
}));
app.use(express.urlencoded({ extended: false }));

// Mount Nango router
app.use(nangoRouter);

// Mount task tracking router (for Claude Code auto-detection)
app.use(taskTrackingRouter);
console.log('✅ Task tracking router mounted');

// Mount tools execution router (unified tool endpoint)
app.use(toolsExecuteRouter);
console.log('✅ Tools execution router mounted');

// Mount WABS scores router (WABS judgement system scores)
app.use(wabsScoresRouter);
console.log('✅ WABS scores router mounted');

// Mount Reddit router (Reddit opportunity finder)
app.use(redditRouter);
console.log('✅ Reddit router mounted');

// Mount Hacker News router (HN discovery)
app.use(hnRouter);
console.log('✅ Hacker News router mounted');

// Mount suppliers router (CRM suppliers management)
const suppliersRouter = createSuppliersRouter(storage);
app.use("/api/suppliers", suppliersRouter);
console.log('✅ Suppliers router mounted at /api/suppliers');

// Health check endpoint for load balancers and monitoring
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'wyshbone-ui',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check endpoint alias for Tower compatibility
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'wyshbone-ui',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Client error reporting endpoint - receives browser errors for debugging
interface ClientErrorPayload {
  message?: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
  href?: string;
  userAgent?: string;
  type?: string;
  timestamp?: string;
}

app.post('/api/client-error', (req, res) => {
  // ALWAYS log that we received a request (helps debug if requests are arriving)
  console.log(`[CLIENT_ERROR] ===== RECEIVED REQUEST =====`);
  console.log(`[CLIENT_ERROR] Method: ${req.method}, URL: ${req.originalUrl}`);
  console.log(`[CLIENT_ERROR] Content-Type: ${req.headers['content-type']}`);
  console.log(`[CLIENT_ERROR] Origin: ${req.headers['origin']}`);
  
  try {
    // Check if body was parsed
    if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
      console.log(`[CLIENT_ERROR] ⚠️ Body was empty or not parsed:`, req.body);
      console.log(`[CLIENT_ERROR] Raw body type:`, typeof req.body);
      res.status(204).send();
      return;
    }
    
    const payload = req.body as ClientErrorPayload;
    const timestamp = payload.timestamp || new Date().toISOString();
    const type = payload.type || 'unknown';
    const message = payload.message || 'No message';
    const href = payload.href || 'unknown';
    
    // Log with clear tag for easy filtering in logs
    console.log(`[CLIENT_ERROR] 🔴 ${timestamp} ${type} "${message}"`);
    console.log(`[CLIENT_ERROR] 📍 Location: ${href}`);
    
    if (payload.stack) {
      console.log(`[CLIENT_ERROR] 📋 Stack trace:`);
      // Split stack into lines for readability
      payload.stack.split('\n').slice(0, 10).forEach(line => {
        console.log(`[CLIENT_ERROR]    ${line}`);
      });
    }
    
    if (payload.url || payload.line || payload.column) {
      console.log(`[CLIENT_ERROR] 📄 Source: ${payload.url || 'unknown'}:${payload.line || '?'}:${payload.column || '?'}`);
    }
    
    console.log(`[CLIENT_ERROR] ===== END ERROR =====`);
  } catch (err) {
    // Log what we can even if parsing fails
    console.log(`[CLIENT_ERROR] ❌ Failed to parse error payload:`, err);
    console.log(`[CLIENT_ERROR] Raw body:`, req.body);
  }
  
  // Always return 204 quickly - never fail this endpoint
  res.status(204).send();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Log demo mode configuration
  logDemoConfig();
  
  // Run startup migrations to add missing columns (handles Supabase schema drift)
  await runStartupMigrations();
  
  // Run non-fatal schema health check (logs warnings if CRM tables missing)
  await runSchemaHealthCheck();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // NOTE: Vite dev server and static file serving removed.
  // Frontend is deployed separately on Vercel.
  // This backend only serves the API.

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  // Use 127.0.0.1 for Windows dev (0.0.0.0 causes ENOTSUP), 0.0.0.0 for production
  const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
  server.listen({
    port,
    host,
  }, async () => {
    log(`serving on port ${port}`);
    
    // THIN CLIENT MODE: Background workers are disabled by default
    // Set ENABLE_UI_BACKGROUND_WORKERS=true to enable local execution (fallback mode)
    // In production, all jobs should be delegated to Supervisor service
    const enableBackgroundWorkers = process.env.ENABLE_UI_BACKGROUND_WORKERS === 'true';
    const supervisorConfigured = !!process.env.SUPERVISOR_BASE_URL;
    
    // Extract hostname from SUPERVISOR_BASE_URL for logging (no secrets)
    let supervisorHost = '[not configured]';
    if (process.env.SUPERVISOR_BASE_URL) {
      try {
        supervisorHost = new URL(process.env.SUPERVISOR_BASE_URL).hostname;
      } catch {
        supervisorHost = '[invalid URL]';
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎛️  THIN CLIENT MODE - Background Worker Configuration');
    console.log('='.repeat(80));
    console.log(`   SUPERVISOR_BASE_URL: ${supervisorConfigured ? 'yes' : 'no'} (host: ${supervisorHost})`);
    console.log(`   ENABLE_UI_BACKGROUND_WORKERS: ${enableBackgroundWorkers}`);
    
    if (enableBackgroundWorkers) {
      console.log('\n⚠️  WARNING: UI is running background workers locally (fallback mode)');
      console.log('   This should only be used for development or when Supervisor is unavailable.');
      
      // Start monitor background worker
      const { startMonitorWorker } = await import('./monitor-worker');
      startMonitorWorker();
      console.log('   ✓ Monitor worker started (local)');
      
      // Start Xero sync cron jobs (if webhook key configured)
      if (process.env.XERO_CLIENT_ID) {
        const { startXeroSyncCron } = await import('./cron/xero-sync');
        const { getXeroSyncFunctions } = await import('./routes/xero-sync');
        const syncFunctions = getXeroSyncFunctions();
        if (syncFunctions) {
          startXeroSyncCron({
            processSyncQueue: syncFunctions.processSyncQueue,
            backupPollXero: syncFunctions.backupPollXero,
          });
          console.log('   ✓ Xero sync cron started (local)');
        }
      }
      
      // Start nightly database maintenance cron jobs
      const { setupCronJobs } = await import('./cron/nightly-maintenance');
      setupCronJobs();
      console.log('   ✓ Nightly maintenance cron started (local)');
    } else {
      console.log('\n✅ Background workers DISABLED - jobs will be delegated to Supervisor');
      console.log('   Monitor worker: disabled');
      console.log('   Xero sync cron: disabled');
      console.log('   Nightly maintenance: disabled');
      
      if (!supervisorConfigured) {
        console.log('\n⚠️  WARNING: SUPERVISOR_BASE_URL not configured!');
        console.log('   Job delegation will fail. Set SUPERVISOR_BASE_URL or enable ENABLE_UI_BACKGROUND_WORKERS=true');
      }
    }
    console.log('='.repeat(80) + '\n');
    
    // Print region service documentation
    console.log('\n' + '='.repeat(80));
    console.log('📍 HYBRID REGION SERVICE - ISO-Safe Country Codes for Wyshbone Global Database');
    console.log('='.repeat(80));
    console.log('\n🔍 Example API Endpoints:');
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=UK&granularity=county`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=UK&granularity=borough&region_filter=London`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=US&granularity=state`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=US&granularity=county&region_filter=Texas`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=IE&granularity=county`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=AU&granularity=state`);
    console.log(`   GET  http://localhost:${port}/api/regions/list?country=CA&granularity=province`);
    console.log(`   GET  http://localhost:${port}/api/regions/debug/supported`);
    console.log(`   POST http://localhost:${port}/api/regions/clear-cache`);
    
    console.log('\n🗺️  Country Code Mapping:');
    console.log('   UK → GB   |   US → US   |   Ireland → IE   |   Australia → AU   |   Canada → CA');
    
    try {
      const { getSupportedDatasets } = await import('./regions');
      const datasets = await getSupportedDatasets();
      console.log('\n📊 Local Datasets Available:');
      for (const [file, count] of Object.entries(datasets)) {
        console.log(`   ✓ ${file.padEnd(35)} ${count} regions`);
      }
    } catch (err) {
      console.log('\n⚠️  Could not load dataset info');
    }
    
    console.log('\n🌐 Dynamic Region Lookup:');
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY_DEFAULT;
    if (hasGoogleKey) {
      console.log('   ✅ Wyshbone Global Database enabled for dynamic region discovery');
      console.log('   📍 Automatic fallback: Unknown regions will be fetched from Wyshbone Global Database');
      console.log('   🔄 Results cached for 24 hours');
    } else {
      console.log('   ⚠️  Wyshbone Global Database API key not set (GOOGLE_API_KEY_DEFAULT)');
      console.log('   📍 Only local datasets available (no dynamic region discovery)');
    }
    
    console.log('\n🌐 Wyshbone Global Database Integration:');
    console.log('   Jobs will pass regionCode (ISO alpha-2) to Wyshbone Global Database');
    console.log('   Example: UK regions → regionCode: "GB", US regions → regionCode: "US"');
    console.log('\n' + '='.repeat(80) + '\n');
  });
})();
