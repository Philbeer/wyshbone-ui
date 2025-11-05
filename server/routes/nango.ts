import express from "express";

export const nangoRouter = express.Router();

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY!;
const NANGO_API_BASE = "https://api.nango.dev";

// Health check
nangoRouter.get("/api/nango/health", (_req, res) => {
  res.json({ ok: true });
});

// Create a short-lived Connect Session token
nangoRouter.post("/api/nango/create-session", express.json(), async (req, res) => {
  try {
    const { userId, userEmail, userDisplayName, allowedIntegrations } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const integrations = Array.isArray(allowedIntegrations) && allowedIntegrations.length
      ? allowedIntegrations
      : ["xero", "salesforce", "microsoft-business-central", "google-sheets"];

    const resp = await fetch(`${NANGO_API_BASE}/connect/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NANGO_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        end_user: {
          id: String(userId),
          email: userEmail || "demo@wyshbone.com",
          display_name: userDisplayName || "Wyshbone Demo"
        },
        allowed_integrations: integrations
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Nango create-session error:", data);
      return res.status(resp.status).json({ error: data?.message || "Failed to create session" });
    }

    const token = data?.data?.token;
    if (!token) return res.status(500).json({ error: "No token in Nango response" });
    return res.json({ token });
  } catch (err: any) {
    console.error("Nango session error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Unexpected error" });
  }
});

// Webhook for new connection notifications
nangoRouter.post("/api/integrations/nango-webhook", express.json(), async (req, res) => {
  try {
    console.log("📩 Nango Webhook:", JSON.stringify(req.body, null, 2));
    // TODO: persist connectionId/endUser to DB
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Webhook error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Unexpected error" });
  }
});
