import { Router, type Request } from "express";
import { randomBytes, createHmac } from "crypto";
import type { IStorage } from "../storage";

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
const BASE_URL = process.env.REPLIT_DOMAINS 
  ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
  : (process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : "http://localhost:5000");

const REDIRECT_URI = `${BASE_URL}/api/integrations/xero/callback`;

// Log the redirect URI for debugging
console.log("🔗 Xero OAuth Configuration:");
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Base URL: ${BASE_URL}`);

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
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      console.error("Xero OAuth error:", error);
      return res.redirect(`/?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect("/?error=missing_code_or_state");
    }

    // Verify and decode signed state
    const stateData = verifyState(state);
    if (!stateData) {
      return res.redirect("/?error=invalid_state");
    }

    // Check for replay attacks
    if (usedStates.has(state)) {
      console.error("OAuth state replay detected!");
      return res.redirect("/?error=state_replay");
    }

    // Mark state as used
    usedStates.add(state);

    try {
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
        console.error("Xero token exchange failed:", errorText);
        return res.redirect("/?error=token_exchange_failed");
      }

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
        return res.redirect("/?error=connections_fetch_failed");
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

      console.log("✅ Xero integration created:", integration.id);

      // Redirect back to app
      res.redirect("/?integration=xero&status=connected");
    } catch (error) {
      console.error("Xero OAuth error:", error);
      res.redirect("/?error=oauth_failed");
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

  return router;
}
