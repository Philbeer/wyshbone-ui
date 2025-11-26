// CRITICAL: Load environment variables FIRST before any other imports
import dotenv from "dotenv";
dotenv.config({ path: '.env.local', override: true }); // Override cached Replit secrets
dotenv.config();

// Now import everything else AFTER env vars are loaded
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { nangoRouter } from "./routes/nango";

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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Start monitor background worker
    const { startMonitorWorker } = await import('./monitor-worker');
    startMonitorWorker();
    
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
