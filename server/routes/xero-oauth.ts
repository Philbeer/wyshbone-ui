import { Router, type Request, type Response } from "express";
import { randomBytes, createHmac } from "crypto";
import type { IStorage } from "../storage";
import { XeroClient } from "xero-node";

// Secret for signing OAuth state tokens (REQUIRED in production)
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error("OAUTH_STATE_SECRET environment variable is required in production");
  }
  console.warn("⚠️ WARNING: Using default OAuth state secret in development mode - DO NOT USE IN PRODUCTION");
  return "default-dev-secret-for-testing-only";
})();

// Sign OAuth state payload
function signState(payload: string): string {
  const hmac = createHmac("sha256", STATE_SECRET);
  hmac.update(payload);
  return hmac.digest("hex");
}

// Verify and decode OAuth state
function verifyState(signedState: string): { userId: string; userEmail: string; timestamp: number } | null {
  try {
    const [payload, signature] = signedState.split(".");
    if (!payload || !signature) return null;
    
    // Verify signature
    const expectedSignature = signState(payload);
    if (signature !== expectedSignature) {
      console.error("Invalid OAuth state signature");
      return null;
    }
    
    // Decode payload
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    
    // Check expiry (10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (decoded.timestamp < tenMinutesAgo) {
      console.error("OAuth state expired");
      return null;
    }
    
    return decoded;
  } catch (error) {
    console.error("Error verifying OAuth state:", error);
    return null;
  }
}

// SECURITY: Authentication middleware to validate session and extract userId
async function getAuthenticatedUserId(req: Request, storage: IStorage): Promise<{ userId: string; userEmail: string } | null> {
  // Development fallback: allow URL parameters for testing ONLY
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  
  // If development mode and URL params present, allow (but warn)
  if (process.env.NODE_ENV === 'development' && urlUserId && urlUserEmail) {
    console.warn(`⚠️ DEV MODE: Using URL auth for ${urlUserEmail} - DISABLE IN PRODUCTION`);
    return { userId: urlUserId, userEmail: urlUserEmail };
  }
  
  // Production path: validate session
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    return null;
  }
  
  try {
    // Validate session and get user info
    const session = await storage.getSession(sessionId);
    if (!session) {
      return null;
    }
    
    return {
      userId: session.userId,
      userEmail: session.userEmail
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

const router = Router();

// Environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;

// Calculate base URL for OAuth redirects
// BACKEND_URL should be the public URL of this backend (e.g., https://wyshbone-api.onrender.com)
// In development, backend runs on port 5001
const BASE_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;

// Frontend URL for redirecting after OAuth (where the React app runs)
// In production, this might be the same as the backend if serving static files
// In development, Vite runs on port 5173
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');

const REDIRECT_URI = `${BASE_URL}/api/integrations/xero/callback`;

// Log the redirect URI for debugging
console.log("🔗 Xero OAuth Configuration:");
console.log(`   Client ID: ${XERO_CLIENT_ID ? '✅ Set (' + XERO_CLIENT_ID.substring(0, 8) + '...)' : '❌ NOT SET'}`);
console.log(`   Client Secret: ${XERO_CLIENT_SECRET ? '✅ Set' : '❌ NOT SET'}`);
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Base URL: ${BASE_URL}`);
console.log(`   Frontend URL: ${FRONTEND_URL || '(same origin)'}`);

// Xero OAuth endpoints
const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

// Replay protection: track used state tokens
const usedStates = new Set<string>();

// Clean up used states every 15 minutes
setInterval(() => {
  usedStates.clear();
}, 15 * 60 * 1000);

export function createXeroOAuthRouter(storage: IStorage) {
  // Initiate Xero OAuth flow
  router.get("/authorize", async (req, res) => {
    // Authenticate user from session
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized - please log in" });
    }

    if (!XERO_CLIENT_ID) {
      return res.status(500).json({ error: "Xero OAuth not configured" });
    }

    // Generate signed state token with user identity
    const statePayload = {
      userId: auth.userId,
      userEmail: auth.userEmail,
      timestamp: Date.now(),
      nonce: randomBytes(16).toString("hex")
    };
    const payload = Buffer.from(JSON.stringify(statePayload)).toString("base64");
    const signature = signState(payload);
    const state = `${payload}.${signature}`;

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: "code",
      client_id: XERO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email accounting.transactions accounting.contacts offline_access",
      state,
    });

    const authUrl = `${XERO_AUTH_URL}?${params.toString()}`;
    
    // Return the URL as JSON instead of redirecting (fixes Replit webview blocking)
    res.json({ authorizationUrl: authUrl });
  });

  // Handle OAuth callback from Xero
  router.get("/callback", async (req, res) => {
    console.log("🔔 [XERO] OAuth callback received!");
    console.log("🔔 [XERO] Query params:", JSON.stringify(req.query));
    
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      console.error("❌ [XERO] OAuth error from Xero:", error);
      return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=missing_code_or_state`);
    }

    // Verify and decode signed state
    const stateData = verifyState(state);
    if (!stateData) {
      return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=invalid_state`);
    }

    // Check for replay attacks
    if (usedStates.has(state)) {
      console.error("OAuth state replay detected!");
      return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=state_replay`);
    }

    // Mark state as used
    usedStates.add(state);

    try {
      console.log("🔄 [XERO] Exchanging authorization code for tokens...");
      console.log(`🔄 [XERO] Using redirect URI: ${REDIRECT_URI}`);
      console.log(`🔄 [XERO] Client ID present: ${!!XERO_CLIENT_ID}`);
      console.log(`🔄 [XERO] Client Secret present: ${!!XERO_CLIENT_SECRET}`);
      
      // Exchange code for tokens
      const tokenResponse = await fetch(XERO_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("❌ [XERO] Token exchange failed:", tokenResponse.status, tokenResponse.statusText);
        console.error("❌ [XERO] Error response:", errorText);
        return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=token_exchange_failed`);
      }
      
      console.log("✅ [XERO] Token exchange successful!");

      const tokens = await tokenResponse.json();

      // Get Xero tenant/organization info
      const connectionsResponse = await fetch(XERO_CONNECTIONS_URL, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!connectionsResponse.ok) {
        console.error("Failed to fetch Xero connections");
        return res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error&message=connections_fetch_failed`);
      }

      const connections = await connectionsResponse.json();
      const tenantId = connections[0]?.tenantId;
      const tenantName = connections[0]?.tenantName;

      // Store integration in database
      const integration = await storage.createIntegration({
        id: `xero-${stateData.userId}-${Date.now()}`,
        userId: stateData.userId,
        provider: "xero",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        metadata: {
          tenantId,
          tenantName,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      console.log("✅ [XERO] Integration created:", integration.id);
      console.log("✅ [XERO] Tenant:", tenantName, "ID:", tenantId);
      console.log("✅ [XERO] Redirecting to:", `${FRONTEND_URL}/auth/crm/settings?xero=connected`);

      // Redirect to CRM settings page with success indicator
      res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=connected`);
    } catch (error) {
      console.error("Xero OAuth error:", error);
      res.redirect(`${FRONTEND_URL}/auth/crm/settings?xero=error`);
    }
  });

  // Get user's Xero connections
  router.get("/connections", async (req, res) => {
    // Authenticate user from session
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized - please log in" });
    }

    try {
      const integrations = await storage.listIntegrations(auth.userId);
      const xeroIntegrations = integrations.filter((i) => i.provider === "xero");

      res.json({
        connections: xeroIntegrations.map((i) => ({
          id: i.id,
          tenantName: (i.metadata as any)?.tenantName || "Unknown",
          tenantId: (i.metadata as any)?.tenantId,
          createdAt: i.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching Xero connections:", error);
      res.status(500).json({ error: "Failed to fetch connections" });
    }
  });

  // Disconnect Xero integration
  router.delete("/disconnect/:integrationId", async (req, res) => {
    const { integrationId } = req.params;
    
    // Authenticate user from session
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized - please log in" });
    }

    try {
      const integration = await storage.getIntegration(integrationId);
      
      if (!integration || integration.userId !== auth.userId) {
        return res.status(404).json({ error: "Integration not found" });
      }

      await storage.deleteIntegration(integrationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Xero:", error);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  // Add a business contact to Xero
  router.post("/add-contact", async (req, res) => {
    // Authenticate user from session
    const auth = await getAuthenticatedUserId(req, storage);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized - please log in" });
    }

    try {
      // Get user's Xero integration
      const integrations = await storage.listIntegrations(auth.userId);
      const xeroIntegration = integrations.find((i) => i.provider === "xero");

      if (!xeroIntegration) {
        return res.status(404).json({ error: "No Xero integration found. Please connect Xero first." });
      }

      const metadata = xeroIntegration.metadata as any;
      const tenantId = metadata?.tenantId;

      if (!tenantId) {
        return res.status(400).json({ error: "Xero tenant ID not found" });
      }

      // Check if token needs refresh
      let accessToken = xeroIntegration.accessToken;
      const expiresAt = xeroIntegration.expiresAt || 0;
      const refreshToken = xeroIntegration.refreshToken;
      
      if (!refreshToken) {
        return res.status(400).json({ error: "No refresh token available. Please reconnect Xero." });
      }
      
      if (Date.now() >= expiresAt) {
        console.log("🔄 Refreshing expired Xero token...");
        
        const refreshResponse = await fetch(XERO_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });

        if (!refreshResponse.ok) {
          const errorText = await refreshResponse.text();
          console.error("Token refresh failed:", errorText);
          return res.status(401).json({ error: "Failed to refresh Xero token. Please reconnect." });
        }

        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;

        // Update stored tokens
        await storage.updateIntegration(xeroIntegration.id, {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in * 1000),
          updatedAt: Date.now(),
        });
      }

      // Get contact data from request body
      const { name, email, phone, address, city, country, website } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Business name is required" });
      }

      // Build contact object for Xero
      const contact: any = {
        Name: name,
      };

      if (email) {
        contact.EmailAddress = email;
      }

      if (phone) {
        contact.Phones = [
          {
            PhoneType: "DEFAULT",
            PhoneNumber: phone
          }
        ];
      }

      if (website) {
        contact.Website = website;
      }

      if (address || city || country) {
        contact.Addresses = [
          {
            AddressType: "STREET",
            AddressLine1: address || "",
            City: city || "",
            Country: country || "United Kingdom"
          }
        ];
      }

      const createResponse = await fetch(`https://api.xero.com/api.xro/2.0/Contacts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "xero-tenant-id": tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          Contacts: [contact]
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error("Xero API error:", errorText);
        
        // Try to parse error details
        let errorMessage = "Failed to create contact in Xero";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.Message || errorJson.message || errorMessage;
        } catch {
          // Use generic message if can't parse
        }
        
        return res.status(400).json({ error: errorMessage });
      }

      const result = await createResponse.json();
      console.log("✅ Contact added to Xero:", result.Contacts[0]);

      res.json({
        success: true,
        message: `Contact "${name}" added to Xero successfully!`,
        contact: result.Contacts[0],
      });
    } catch (error: any) {
      console.error("Error creating test contact:", error);
      res.status(500).json({ error: error.message || "Failed to create test contact" });
    }
  });

  // ============================================
  // XERO SYNC - CONNECTION STATUS
  // ============================================

  // Get Xero connection status for the workspace
  router.get("/status", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized - please log in" });
      }

      // First check our dedicated xero_connections table
      const connection = await storage.getXeroConnection(auth.userId);
      
      if (connection && connection.isConnected) {
        return res.json({
          connected: true,
          tenantName: connection.tenantName,
          lastImportAt: connection.lastImportAt,
        });
      }

      // Fallback to integrations table (legacy)
      const integrations = await storage.listIntegrations(auth.userId);
      const xeroIntegration = integrations.find((i) => i.provider === "xero");
      
      if (!xeroIntegration) {
        return res.json({ connected: false });
      }

      const metadata = xeroIntegration.metadata as any;
      res.json({
        connected: true,
        tenantName: metadata?.tenantName || "Unknown",
        lastImportAt: null,
      });
    } catch (error) {
      console.error("Error getting Xero status:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // ============================================
  // XERO SYNC - CUSTOMER IMPORT
  // ============================================

  // Helper to get valid access token with auto-refresh
  async function getValidAccessToken(workspaceId: string): Promise<{ accessToken: string; tenantId: string } | null> {
    // Check dedicated xero_connections first
    const connection = await storage.getXeroConnection(workspaceId);
    
    if (connection && connection.isConnected) {
      // Check if token expired
      if (connection.tokenExpiresAt && new Date() >= connection.tokenExpiresAt) {
        console.log("🔄 Refreshing expired Xero token (xero_connections)...");
        
        const refreshResponse = await fetch(XERO_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: connection.refreshToken,
          }),
        });

        if (!refreshResponse.ok) {
          console.error("Token refresh failed");
          return null;
        }

        const tokens = await refreshResponse.json();
        await storage.updateXeroTokens(
          workspaceId,
          tokens.access_token,
          tokens.refresh_token,
          new Date(Date.now() + (tokens.expires_in * 1000))
        );

        return { accessToken: tokens.access_token, tenantId: connection.tenantId };
      }

      return { accessToken: connection.accessToken, tenantId: connection.tenantId };
    }

    // Fallback to integrations table
    const integrations = await storage.listIntegrations(workspaceId);
    const xeroIntegration = integrations.find((i) => i.provider === "xero");
    
    if (!xeroIntegration) return null;

    const metadata = xeroIntegration.metadata as any;
    const tenantId = metadata?.tenantId;
    if (!tenantId) return null;

    let accessToken = xeroIntegration.accessToken;
    const expiresAt = xeroIntegration.expiresAt || 0;

    if (Date.now() >= expiresAt) {
      console.log("🔄 Refreshing expired Xero token (integrations)...");
      
      const refreshResponse = await fetch(XERO_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: xeroIntegration.refreshToken!,
        }),
      });

      if (!refreshResponse.ok) {
        console.error("Token refresh failed");
        return null;
      }

      const tokens = await refreshResponse.json();
      await storage.updateIntegration(xeroIntegration.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in * 1000),
        updatedAt: Date.now(),
      });

      accessToken = tokens.access_token;
    }

    return { accessToken, tenantId };
  }

  // Start customer import job
  router.post("/import/customers", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized - please log in" });
      }

      // Verify Xero connection
      const tokenData = await getValidAccessToken(auth.userId);
      if (!tokenData) {
        return res.status(400).json({ error: "Xero not connected. Please connect Xero first." });
      }

      // Create import job
      const job = await storage.createXeroImportJob({
        workspaceId: auth.userId,
        jobType: "customers",
        status: "pending",
      });

      // Start async import (don't wait for completion)
      importCustomersFromXero(auth.userId, job.id, tokenData.accessToken, tokenData.tenantId).catch(error => {
        console.error("Customer import failed:", error);
        storage.updateXeroImportJob(job.id, auth.userId, {
          status: "failed",
          errorMessage: error.message,
          completedAt: new Date(),
        });
      });

      res.status(202).json({ jobId: job.id, message: "Import started" });
    } catch (error: any) {
      console.error("Failed to start import:", error);
      res.status(500).json({ error: "Failed to start import" });
    }
  });

  // Background import function
  async function importCustomersFromXero(workspaceId: string, jobId: number, accessToken: string, tenantId: string) {
    // Update job status
    await storage.updateXeroImportJob(jobId, workspaceId, {
      status: "running",
      startedAt: new Date(),
    });

    try {
      // Fetch all contacts from Xero
      const contactsResponse = await fetch("https://api.xero.com/api.xro/2.0/Contacts", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "xero-tenant-id": tenantId,
          Accept: "application/json",
        },
      });

      if (!contactsResponse.ok) {
        throw new Error(`Failed to fetch contacts: ${contactsResponse.statusText}`);
      }

      const contactsData = await contactsResponse.json();
      const contacts = contactsData.Contacts || [];

      await storage.updateXeroImportJob(jobId, workspaceId, {
        totalRecords: contacts.length,
      });

      let processedCount = 0;
      let failedCount = 0;

      for (const contact of contacts) {
        try {
          // Check if already exists by Xero Contact ID
          const existing = await storage.getCustomerByXeroContactId(
            contact.ContactID,
            workspaceId
          );

          // Get primary phone and address
          const primaryPhone = contact.Phones?.find((p: any) => p.PhoneType === "DEFAULT" || p.PhoneType === "MOBILE")?.PhoneNumber 
            || contact.Phones?.[0]?.PhoneNumber;
          
          const primaryAddress = contact.Addresses?.find((a: any) => a.AddressType === "STREET") 
            || contact.Addresses?.[0];

          if (existing) {
            // Update existing customer
            await storage.updateCrmCustomer(existing.id, {
              name: contact.Name || existing.name,
              email: contact.EmailAddress || existing.email,
              phone: primaryPhone || existing.phone,
              addressLine1: primaryAddress?.AddressLine1 || existing.addressLine1,
              city: primaryAddress?.City || existing.city,
              postcode: primaryAddress?.PostalCode || existing.postcode,
              country: primaryAddress?.Country || existing.country,
              lastXeroSyncAt: new Date(),
              xeroSyncStatus: "synced",
            });
          } else {
            // Create new customer
            const customerId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
            await storage.createCrmCustomer({
              id: customerId,
              workspaceId,
              name: contact.Name || "Unknown",
              email: contact.EmailAddress,
              phone: primaryPhone,
              addressLine1: primaryAddress?.AddressLine1,
              city: primaryAddress?.City,
              postcode: primaryAddress?.PostalCode,
              country: primaryAddress?.Country || "United Kingdom",
              xeroContactId: contact.ContactID,
              lastXeroSyncAt: new Date(),
              xeroSyncStatus: "synced",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          processedCount++;

          // Update progress every 10 records
          if (processedCount % 10 === 0) {
            await storage.updateXeroImportJob(jobId, workspaceId, {
              processedRecords: processedCount,
            });
          }
        } catch (error) {
          console.error(`Failed to import contact ${contact.ContactID}:`, error);
          failedCount++;
        }
      }

      // Mark job complete
      await storage.updateXeroImportJob(jobId, workspaceId, {
        status: "completed",
        processedRecords: processedCount,
        failedRecords: failedCount,
        completedAt: new Date(),
      });

      // Update connection last import time
      await storage.updateXeroConnection(workspaceId, {
        lastImportAt: new Date(),
      });

      console.log(`✅ Xero customer import completed: ${processedCount} imported, ${failedCount} failed`);
    } catch (error) {
      console.error("Import failed:", error);
      await storage.updateXeroImportJob(jobId, workspaceId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      });
      throw error;
    }
  }

  // Get import job status (for progress polling)
  router.get("/import/jobs/:jobId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized - please log in" });
      }

      const jobId = parseInt(req.params.jobId);
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getXeroImportJob(jobId, auth.userId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error getting job status:", error);
      res.status(500).json({ error: "Failed to get job status" });
    }
  });

  // Get recent import jobs
  router.get("/import/jobs", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req, storage);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized - please log in" });
      }

      const jobs = await storage.getRecentXeroImportJobs(auth.userId);
      res.json(jobs);
    } catch (error) {
      console.error("Error getting jobs:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  return router;
}
