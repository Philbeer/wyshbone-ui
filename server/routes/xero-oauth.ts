import { Router } from "express";
import { randomBytes } from "crypto";
import type { IStorage } from "../storage";

const router = Router();

// Environment variables
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const BASE_URL = process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  : "http://localhost:5000";
const REDIRECT_URI = `${BASE_URL}/api/integrations/xero/callback`;

// Xero OAuth endpoints
const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";

// Temporary state storage (in production, use Redis or database)
const oauthStates = new Map<string, { userId: string; userEmail: string; timestamp: number }>();

// Clean up old states every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const entries = Array.from(oauthStates.entries());
  for (const [state, data] of entries) {
    if (data.timestamp < fiveMinutesAgo) {
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

export function createXeroOAuthRouter(storage: IStorage) {
  // Initiate Xero OAuth flow
  router.get("/authorize", (req, res) => {
    const userId = req.query.user_id as string;
    const userEmail = req.query.user_email as string;

    if (!userId || !userEmail) {
      return res.status(400).json({ error: "Missing user_id or user_email" });
    }

    if (!XERO_CLIENT_ID) {
      return res.status(500).json({ error: "Xero OAuth not configured" });
    }

    // Generate random state for CSRF protection
    const state = randomBytes(32).toString("hex");
    oauthStates.set(state, { userId, userEmail, timestamp: Date.now() });

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: "code",
      client_id: XERO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email accounting.transactions accounting.contacts offline_access",
      state,
    });

    const authUrl = `${XERO_AUTH_URL}?${params.toString()}`;
    res.redirect(authUrl);
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

    // Verify state
    const stateData = oauthStates.get(state);
    if (!stateData) {
      return res.redirect("/?error=invalid_state");
    }

    oauthStates.delete(state);

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
    const userId = req.query.user_id as string;

    if (!userId) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    try {
      const integrations = await storage.listIntegrations(userId);
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
    const userId = req.query.user_id as string;

    if (!userId) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    try {
      const integration = await storage.getIntegration(integrationId);
      
      if (!integration || integration.userId !== userId) {
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
