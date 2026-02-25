import type { Express } from "express";
import { createServer, type Server } from "http";
import { openai } from "./openai"; // keep your existing OpenAI client
import {
  getConversation,
  appendMessage,
  resetConversation,
  maybeSummarize,
  getOrCreateConversation,
  saveMessage,
  saveStructuredResultMessage,
  loadConversationHistory,
  extractAndSaveFacts,
  buildContextWithFacts,
  updateConversationLabel,
  getOrCreateRunId,
  resetRunId,
} from "./memory";
import { extractJson } from "./lib/json-extract";
import { getDemoConfig, isDemoMode, DEMO_USER_ID, DEMO_USER_EMAIL, logDemoConfig } from "./demo-config";
import { analyzeDatabaseError, createAuthError, createApiError, type ApiError } from "./error-helpers";
import {
  chatRequestSchema,
  addNoteRequestSchema,
  searchRequestSchema,
  createSessionRequestSchema,
  createIntegrationRequestSchema,
  insertCrmSettingsSchema,
  insertCrmCustomerSchema,
  insertCrmDeliveryRunSchema,
  insertCrmOrderSchema,
  insertCrmOrderLineSchema,
  insertCrmProductSchema,
  insertCrmStockSchema,
  insertCrmCallDiarySchema,
  insertCrmProductSchema,
  insertBrewBatchSchema,
  insertBrewInventoryItemSchema,
  insertBrewContainerSchema,
  insertBrewDutyReportSchema,
  insertBrewSettingsSchema,
} from "@shared/schema";
import { storage } from "./storage";
import * as cheerio from "cheerio";
import { neon } from "@neondatabase/serverless";
import { createXeroOAuthRouter } from "./routes/xero-oauth";
import { createXeroSyncRouter } from "./routes/xero-sync";
import { createUntappdRouter } from "./routes/untappd";
import { createSleeperAgentRouter } from "./routes/sleeper-agent";
import { createThingsRouter } from "./routes/things";
import { createEntityReviewRouter } from "./routes/entity-review";
import { createDevToolsRouter } from "./routes/dev-tools";
import { createDatabaseMaintenanceRouter } from "./routes/admin/database-maintenance";
import { createMonitorsRouter } from "./routes/admin/monitors";
import { createSuppliersRouter } from "./routes/suppliers";
import { createActivityLogRouter } from "./routes/activity-log";
import { routePlannerRoutes } from "./routes/route-planner";
import { driverRoutes } from "./routes/driver";
import { adminRoutes } from "./routes/admin";
import { orgRoutes } from "./routes/org";
import { agentActivitiesRouter } from "./routes/agent-activities";
import { createAfrRouter } from "./routes/afr";
import { createTelemetryRouter } from "./routes/telemetry";
import { createProofRouter } from "./routes/proof";
import { createSupervisorRouter } from "./routes/supervisor";
import { hashPassword, verifyPassword, generateId, canCreateMonitor, canCreateDeepResearch, TIER_LIMITS } from "./auth";
import { signupRequestSchema, loginRequestSchema, updateProfileRequestSchema } from "@shared/schema";
import { buildSessionContext, generatePersonalizedOpening, type SessionContext } from "./lib/context";
import Stripe from "stripe";
import { detectSupervisorIntent } from './intent-detector';
import { createSupervisorTask, isSupabaseConfigured } from './supabase-client';
import { getSummary, getFileContent } from './lib/exporter';
import { randomBytes } from 'crypto';
import { startRunLog, completeRunLog, logToolCall, isTowerLoggingEnabled } from './lib/towerClient';
import { getUserGoal, setUserGoal, hasUserGoal } from './userGoalHelper';
import { logUserMessageReceived, logRouterDecision, logRunCompleted, logRunFailed, transitionRunToExecuting, transitionRunToFinalizing, type RouterDecision } from './lib/activity-logger';
import { guardRoute } from './lib/assertNoExecutionInUI.js';

// ============================================
// SSE HELPER FOR CHAT PROGRESS EVENTS
// ============================================
interface SseEvent {
  type: 'ack' | 'status' | 'content' | 'error' | 'run_id';
  stage?: 'classifying' | 'planning' | 'executing' | 'finalising' | 'completed' | 'failed';
  message?: string;
  ts?: number;
  elapsedMs?: number;
  clientRequestId?: string;
  conversationId?: string;
  toolName?: string;
  runId?: string;
}

function createSseEmitter(res: import("express").Response, startTime: number) {
  return function emitSse(event: SseEvent) {
    const ts = Date.now();
    const elapsedMs = ts - startTime;
    const payload = {
      ...event,
      ts,
      elapsedMs,
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    // @ts-ignore
    if (res.flush) res.flush();
    console.log(`📡 SSE [${event.type}${event.stage ? ':' + event.stage : ''}] ${event.message || ''} (+${elapsedMs}ms)`);
  };
}

// SINGLE SOURCE OF TRUTH: SUPABASE_DATABASE_URL (Replit auto-provides DATABASE_URL for its built-in Postgres)
const sql = neon(process.env.SUPABASE_DATABASE_URL!);

// ============================================
// STRIPE CONFIGURATION (optional for dev)
// ============================================
const isStripeEnabled = !!process.env.STRIPE_SECRET_KEY;
let stripe: Stripe | null = null;

if (isStripeEnabled) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-11-20.acacia",
  });
  console.log('✅ Stripe initialized');
} else {
  console.warn('⚠️  Stripe disabled: STRIPE_SECRET_KEY not set');
  console.warn('   Stripe-related endpoints will return 501 Not Configured');
}

/**
 * Middleware to check if Stripe is enabled
 * Returns 501 if Stripe is not configured
 */
function requireStripe(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (!isStripeEnabled || !stripe) {
    return res.status(501).json({
      error: 'Stripe not configured',
      message: 'This endpoint requires STRIPE_SECRET_KEY to be set. Stripe features are disabled in this environment.',
    });
  }
  next();
}

// Export API key generation/validation
const EXPORT_KEY = process.env.EXPORT_KEY || (() => {
  const generatedKey = randomBytes(16).toString('hex');
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  WARNING: Auto-generated EXPORT_KEY (DEVELOPMENT ONLY)');
  
  if (isDevelopment) {
    // Only show full key in development mode (not production)
    console.log('🔑 EXPORT_KEY for this app:', generatedKey);
  } else {
    // In production, mask the key
    const masked = generatedKey.slice(0, 4) + '***' + generatedKey.slice(-4);
    console.log('🔑 EXPORT_KEY generated (masked):', masked);
  }
  
  console.log('   Use this key in the X-EXPORT-KEY header to access /export endpoints');
  console.log('   ');
  console.log('   🔒 PRODUCTION: Set EXPORT_KEY environment variable to use a secure key');
  console.log('   🚨 SECURITY: Never commit this key to source control or share in logs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return generatedKey;
})();

// Initialize Stripe
// Stripe initialization moved above (see isStripeEnabled)

// Helper to identify each user's session (Bubble should send x-session-id)
function getSessionId(req: import("express").Request) {
  return (req.headers["x-session-id"] as string) || req.ip || "anon";
}

// SECURITY: Centralized authentication for all API routes
// 
// Authentication Priority:
// 1. Session header (x-session-id) - production auth
// 2. URL params (user_id + user_email) - demo/dev mode only
// 3. Demo-user fallback - demo/dev mode only, provides default identity
//
// In demo mode (DEMO_MODE=true or NODE_ENV=development):
// - All requests get a valid user identity
// - No per-route bypasses needed
// - Production auth is NOT weakened (session validation still works)
//
async function getAuthenticatedUserId(req: import("express").Request): Promise<{ userId: string; userEmail: string } | null> {
  const demoConfig = getDemoConfig();
  
  // 1. Try session-based auth first (works in all modes)
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (sessionId) {
    try {
      const session = await storage.getSession(sessionId);
      if (session) {
        console.log(`✅ Session valid for user: ${session.userEmail}`);
        return {
          userId: session.userId,
          userEmail: session.userEmail
        };
      }
      console.log(`❌ Session not found: ${sessionId}`);
    } catch (error) {
      console.error("Session validation error:", error);
    }
  }
  
  // 2. DEMO MODE: Allow URL parameters for testing
  if (demoConfig.enabled) {
    const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
    const urlUserEmail = req.query.user_email as string | undefined;
    
    if (urlUserId && urlUserEmail) {
      console.log(`✅ DEMO MODE: URL auth for ${urlUserEmail}`);
      return { userId: urlUserId, userEmail: urlUserEmail };
    }
    
    if (urlUserId) {
      console.log(`✅ DEMO MODE: URL userId ${urlUserId}`);
      return { userId: urlUserId, userEmail: `${urlUserId}@dev.local` };
    }
  }
  
  // 3. DEMO MODE FALLBACK: Provide demo-user identity when no other auth
  // This ensures all API routes work in demo mode without per-route bypasses
  if (demoConfig.enabled) {
    console.log(`✅ DEMO MODE: Fallback to ${demoConfig.user.email}`);
    return { userId: demoConfig.user.id, userEmail: demoConfig.user.email };
  }
  
  // Production: No valid auth found
  console.log('❌ No valid authentication');
  return null;
}

// Helper to validate export key for Tower testing
function validateExportKey(req: import("express").Request): boolean {
  const providedKey = req.headers['x-export-key'] as string | undefined;
  return !!providedKey && providedKey === EXPORT_KEY;
}

// Helper to detect URLs in text
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const matches = text.match(urlRegex);
  return matches || [];
}

// Helper to generate a conversation label from first user message
function generateConversationLabel(firstMessage: string): string {
  // Truncate to max 50 characters
  const truncated = firstMessage.slice(0, 50).trim();
  
  // If it ends mid-word, find the last complete word
  if (firstMessage.length > 50) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) {
      return truncated.slice(0, lastSpace) + '...';
    }
  }
  
  return truncated;
}

// Helper to fetch and extract text content from a URL
async function fetchUrlContent(url: string): Promise<string> {
  try {
    console.log(`🌐 Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, header, aside').remove();
    
    // Extract title
    const title = $('title').text().trim();
    
    // Extract main content (try article first, then main, then body)
    let mainContent = '';
    if ($('article').length > 0) {
      mainContent = $('article').text();
    } else if ($('main').length > 0) {
      mainContent = $('main').text();
    } else {
      mainContent = $('body').text();
    }
    
    // Clean up whitespace
    const cleanContent = mainContent
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 15000); // Limit to ~15k chars
    
    console.log(`✅ Extracted ${cleanContent.length} characters from ${url}`);
    return `Title: ${title}\n\nContent: ${cleanContent}`;
  } catch (error: any) {
    console.error(`❌ Failed to fetch ${url}:`, error.message);
    throw new Error(`Could not fetch URL: ${error.message}`);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // CORS is configured in index.ts - don't override here

  // ===========================
  // AUTH ROUTES
  // ===========================
  
  // POST /api/auth/signup - User registration
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validation = signupRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request", details: validation.error });
      }

      const { email, password, name, demoSessionId, organisationName, inviteToken } = validation.data;

      // Check if user already exists
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // If invite token provided, validate it first
      let invite: any = null;
      if (inviteToken) {
        invite = await storage.getOrgInviteByToken(inviteToken);
        if (!invite) {
          return res.status(400).json({ error: "Invalid invite token" });
        }
        if (invite.status !== "pending") {
          return res.status(400).json({ error: `Invite has already been ${invite.status}` });
        }
        if (invite.expiresAt < Date.now()) {
          await storage.updateOrgInvite(invite.id, { status: "expired" });
          return res.status(400).json({ error: "Invite has expired" });
        }
        if (invite.email.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({ error: "This invite was sent to a different email address" });
        }
      } else if (!organisationName || organisationName.trim().length < 2) {
        return res.status(400).json({ error: "Organisation name is required (min 2 characters)" });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const userId = generateId();
      const now = Date.now();
      
      const user = await storage.createUser({
        id: userId,
        email,
        passwordHash,
        name: name || null,
        subscriptionTier: "free",
        subscriptionStatus: "inactive",
        monitorCount: 0,
        deepResearchCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      // Handle org membership creation with compensating cleanup on failure
      let orgId: string;
      let orgName: string;
      let membershipRole: string;
      let createdOrgId: string | null = null; // Track for cleanup
      
      try {
        if (invite) {
          // Accept invite - join existing org
          orgId = invite.orgId;
          membershipRole = invite.role;
          
          // Verify org still exists
          const org = await storage.getOrganisation(invite.orgId);
          if (!org) {
            throw new Error("Organisation no longer exists");
          }
          orgName = org.name;
          
          // Create org member
          await storage.createOrgMember({
            id: generateId(),
            orgId: invite.orgId,
            userId: user.id,
            role: invite.role,
            createdAt: now,
            updatedAt: now,
          });
          
          // Update user's current org BEFORE marking invite as accepted
          // This ensures invite stays pending if this step fails
          await storage.updateUserCurrentOrg(user.id, orgId);
          
          // Mark invite as accepted LAST - only after all other steps succeed
          await storage.updateOrgInvite(invite.id, { 
            status: "accepted",
            acceptedAt: now,
          });
          
          console.log(`✅ User ${email} accepted invite and joined org ${orgName} as ${membershipRole}`);
        } else {
          // Create new organisation + admin membership
          orgId = generateId();
          orgName = organisationName!.trim();
          membershipRole = "admin";
          createdOrgId = orgId; // Track for potential cleanup
          
          await storage.createOrganisation({
            id: orgId,
            name: orgName,
            createdByUserId: user.id,
            createdAt: now,
            updatedAt: now,
          });
          
          await storage.createOrgMember({
            id: generateId(),
            orgId,
            userId: user.id,
            role: "admin",
            createdAt: now,
            updatedAt: now,
          });
          
          // Update user's current org (for create-org path)
          await storage.updateUserCurrentOrg(user.id, orgId);
          
          console.log(`✅ User ${email} created org "${orgName}" and is admin`);
        }
      } catch (orgError: any) {
        // Compensating cleanup: delete the user and any partial org data we created
        console.error(`❌ Failed to create org/membership for ${email}:`, orgError.message);
        console.log(`🔄 Rolling back signup for ${email}`);
        try {
          // First try to remove any org_member we might have created
          if (invite) {
            await storage.removeOrgMember(invite.orgId, user.id);
          } else if (createdOrgId) {
            await storage.removeOrgMember(createdOrgId, user.id);
          }
          
          // Delete the org if we created one (this happens before org_member in create flow)
          if (createdOrgId) {
            await storage.deleteOrganisation(createdOrgId);
          }
          
          // Delete the user
          await storage.deleteUser(user.id);
          
          console.log(`✅ Cleanup complete for ${email}`);
        } catch (cleanupError: any) {
          console.error(`❌ Cleanup failed:`, cleanupError.message);
          // Even if cleanup fails, we must return an error to the client
        }
        return res.status(500).json({ error: "Failed to complete signup. Please try again." });
      }

      // If demo session provided, transfer demo data to new account
      let transferredData = false;
      if (demoSessionId) {
        const demoSession = await storage.getSession(demoSessionId);
        if (demoSession) {
          const demoUser = await storage.getUserById(demoSession.userId);
          
          // Only transfer if it's actually a demo user
          if (demoUser && demoUser.isDemo === 1) {
            console.log(`🔄 Transferring demo data from ${demoUser.email} to ${email}`);
            
            // Transfer all user data (conversations, messages, facts, monitors, etc.)
            await storage.transferUserData(demoUser.id, user.id);
            
            // Update usage counts from demo user
            await storage.updateUser(user.id, {
              monitorCount: demoUser.monitorCount,
              deepResearchCount: demoUser.deepResearchCount,
            });
            
            // Delete demo session and user
            await storage.deleteSession(demoSessionId);
            await storage.deleteUser(demoUser.id);
            
            transferredData = true;
            console.log(`✅ Demo data transferred successfully`);
          }
        }
      }

      // Create session
      const sessionId = generateId();
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      
      await storage.createSession(sessionId, user.id, user.email, expiresAt);

      res.json({
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          orgId,
          orgName,
          membershipRole,
        },
        dataTransferred: transferredData
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // POST /api/auth/login - User login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request", details: validation.error });
      }

      const { email, password } = validation.data;

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Verify password
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Create session
      const sessionId = generateId();
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      
      await storage.createSession(sessionId, user.id, user.email, expiresAt);

      // Get org info if user has a current org
      let orgId: string | null = null;
      let orgName: string | null = null;
      let membershipRole: string | null = null;
      
      if (user.currentOrgId) {
        const org = await storage.getOrganisation(user.currentOrgId);
        const membership = await storage.getOrgMember(user.currentOrgId, user.id);
        if (org && membership) {
          orgId = org.id;
          orgName = org.name;
          membershipRole = membership.role;
        }
      }

      res.json({
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          monitorCount: user.monitorCount,
          deepResearchCount: user.deepResearchCount,
          orgId,
          orgName,
          membershipRole,
        }
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // POST /api/auth/demo - Create a demo user automatically
  app.post("/api/auth/demo", async (req, res) => {
    try {
      // Generate unique demo user credentials
      const userId = generateId();
      const demoEmail = `demo_${userId}@wyshbone.demo`;
      const demoPassword = generateId(); // Random password for demo user
      const passwordHash = await hashPassword(demoPassword);
      
      const user = await storage.createUser({
        id: userId,
        email: demoEmail,
        passwordHash,
        name: "Demo User",
        isDemo: 1, // Mark as demo user
        demoCreatedAt: Date.now(),
        subscriptionTier: "free",
        subscriptionStatus: "inactive",
        monitorCount: 0,
        deepResearchCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Create session
      const sessionId = generateId();
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days for demo

      await storage.createSession(sessionId, user.id, user.email, expiresAt);

      console.log(`✅ Created demo user: ${demoEmail} (ID: ${userId})`);

      res.json({
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          isDemo: true,
        }
      });
    } catch (error: any) {
      console.error("Demo user creation error:", error);
      res.status(500).json({ error: "Demo user creation failed" });
    }
  });

  // POST /api/auth/url-session - Create session for URL-authenticated users
  // SECURITY NOTE: This endpoint is development-only and mirrors the existing URL param
  // authentication in getAuthenticatedUserId(). In Replit's embedded preview, URL params
  // come from the hosting infrastructure, not from the user. This endpoint provides
  // session persistence so users can open the app in new tabs without losing auth context.
  app.post("/api/auth/url-session", async (req, res) => {
    try {
      const { user_id, user_email } = req.body;
      
      // Validate required fields
      if (!user_id || !user_email) {
        return res.status(400).json({ error: "Missing user_id or user_email" });
      }
      
      // PRODUCTION SAFETY: Strictly reject in production
      if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: "URL authentication only allowed in development mode" });
      }
      
      // Check if this user already has an account (registered user)
      let user = await storage.getUserById(user_id);
      
      // If no user exists with this ID, check by email
      if (!user) {
        const users = await storage.getAllUsers();
        user = users.find(u => u.email === user_email);
      }
      
      // Generate session for this user
      const sessionId = generateId();
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      
      await storage.createSession(sessionId, user_id, user_email, expiresAt);
      
      console.log(`✅ Created URL session for user: ${user_email} (ID: ${user_id})`);
      
      res.json({
        sessionId,
        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          subscriptionStatus: user.subscriptionStatus,
          isDemo: user.isDemo === 1,
        } : {
          id: user_id,
          email: user_email,
          name: user_email.split("@")[0],
          subscriptionTier: "free",
          subscriptionStatus: "inactive",
          isDemo: true,
        }
      });
    } catch (error: any) {
      console.error("URL session creation error:", error);
      res.status(500).json({ error: "Session creation failed" });
    }
  });

  // POST /api/auth/logout - User logout
  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.headers["x-session-id"] as string;
    if (sessionId) {
      await storage.deleteSession(sessionId);
    }
    res.json({ success: true });
  });

  // GET /api/auth/me - Get current user
  app.get("/api/auth/me", async (req, res) => {
    const auth = await getAuthenticatedUserId(req);
    if (!auth) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await storage.getUserById(auth.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      monitorCount: user.monitorCount,
      deepResearchCount: user.deepResearchCount,
      companyName: user.companyName,
      companyDomain: user.companyDomain,
      roleHint: user.roleHint,
      primaryObjective: user.primaryObjective,
      inferredIndustry: user.inferredIndustry,
      confidence: user.confidence,
      preferences: user.preferences,
    });
  });

  // PUT /api/auth/profile - Update user profile (company/domain/context)
  app.put("/api/auth/profile", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const validation = updateProfileRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request", details: validation.error });
      }

      const updates = validation.data;

      // Get current user for merging preferences and inferring industry
      const currentUser = await storage.getUserById(auth.userId);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Merge preferences instead of replacing
      let mergedPreferences = currentUser.preferences || {};
      if (updates.preferences) {
        mergedPreferences = {
          ...mergedPreferences,
          ...updates.preferences,
          // Deep merge onboardingChecklist if provided
          onboardingChecklist: updates.preferences.onboardingChecklist
            ? {
                ...(mergedPreferences.onboardingChecklist || {}),
                ...updates.preferences.onboardingChecklist,
              }
            : mergedPreferences.onboardingChecklist,
        };
      }

      // If company name or domain was provided, infer industry
      let inferredIndustry: string | null | undefined = undefined;
      let confidence: number | null | undefined = undefined;

      if (updates.companyName || updates.companyDomain) {
        // Merge current user data with updates to get fresh context
        const mergedUserData = {
          ...currentUser,
          companyName: updates.companyName ?? currentUser.companyName,
          companyDomain: updates.companyDomain ?? currentUser.companyDomain,
        };

        // Use context builder to infer industry from merged data
        const ctx = buildSessionContext(mergedUserData as any);

        inferredIndustry = ctx.inferredIndustry ?? null;
        confidence = ctx.confidence;
      }

      // Update user profile with merged preferences
      const updatedUser = await storage.updateUser(auth.userId, {
        ...updates,
        preferences: mergedPreferences,
        inferredIndustry,
        confidence,
        lastContextRefresh: Date.now(),
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        companyName: updatedUser.companyName,
        companyDomain: updatedUser.companyDomain,
        roleHint: updatedUser.roleHint,
        primaryObjective: updatedUser.primaryObjective,
        preferences: updatedUser.preferences,
        inferredIndustry: updatedUser.inferredIndustry,
        confidence: updatedUser.confidence,
      });
    } catch (error: any) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Profile update failed" });
    }
  });

  // GET /api/chat/greeting - Get personalized greeting for user
  app.get("/api/chat/greeting", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Build session context
      const sessionContext = buildSessionContext({
        companyName: user.companyName ?? null,
        companyDomain: user.companyDomain ?? null,
        roleHint: user.roleHint ?? null,
        primaryObjective: user.primaryObjective ?? null,
        secondaryObjectives: user.secondaryObjectives ?? null,
        targetMarkets: user.targetMarkets ?? null,
        productsOrServices: user.productsOrServices ?? null,
        preferences: user.preferences ?? null,
        inferredIndustry: user.inferredIndustry ?? null,
        confidence: user.confidence ?? null,
      } as any);

      // Generate personalized opening
      const greeting = generatePersonalizedOpening(sessionContext);

      res.json({ 
        greeting,
        hasProfile: sessionContext.hasProfile,
        industry: sessionContext.inferredIndustry,
        confidence: sessionContext.confidence
      });
    } catch (error: any) {
      console.error("Greeting generation error:", error);
      res.status(500).json({ error: "Failed to generate greeting" });
    }
  });

  // POST /agent/chat - MEGA Agent Kernel (Hybrid Mode)
  // This runs alongside the standard chat for testing/comparison
  app.post("/agent/chat", async (req, res) => {
    // DEV MODE: Check for missing OPENAI_API_KEY and return helpful error
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OPENAI_API_KEY not set - agent chat unavailable');
      return res.status(503).json({
        ok: false,
        error: 'Chat unavailable: OPENAI_API_KEY not configured',
        natural: '⚠️ **Chat unavailable**: OPENAI_API_KEY is not configured.\n\nTo fix this:\n1. Create a `.env.local` file in the repo root\n2. Add: `OPENAI_API_KEY=sk-your-key-here`\n3. Restart the dev server\n\n*Other features (CRM, products, orders) should still work.*',
        plan: null,
      });
    }
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { text, conversationId } = req.body;
      if (!text) {
        return res.status(400).json({ error: "text required" });
      }

      // Get user profile for context
      const user = await storage.getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Use the same conversationId as Standard mode (shared conversation)
      // If not provided, use user-specific default
      const sharedConversationId = conversationId || auth.userId;

      console.log("🚀 MEGA agent starting:", { 
        conversationId: sharedConversationId, 
        text: text.substring(0, 50) 
      });

      // Import agent kernel dynamically
      const { agentChat } = await import("./lib/agent-kernel");

      // Call MEGA kernel with timeout and pass storage for database persistence
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timed out after 30 seconds. Please try again.")), 30000)
      );
      
      const result = await Promise.race([
        agentChat(sharedConversationId, text, user as any, storage),
        timeoutPromise
      ]) as any;

      console.log("✅ MEGA agent completed");
      
      // Check if MEGA wants to delegate to Standard mode
      if (result.auto_action_result?.delegateToStandard) {
        console.log("🔄 MEGA delegating to Standard mode - switching to streaming chat");
        
        // Return a special response telling frontend to use Standard mode
        return res.json({
          ok: true,
          natural: result.natural + "\n\n_Switching to Standard mode for this request..._",
          plan: result.plan,
          delegateToStandard: true,
          originalRequest: text,
          conversationId: sharedConversationId // Share the same conversation
        });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("MEGA agent error:", error);
      res.status(500).json({ ok: false, error: error?.message || "unknown" });
    }
  });

  // ===========================
  // SUBSCRIPTION ROUTES
  // ===========================

  // POST /api/subscription/create - Create Stripe subscription
  app.post("/api/subscription/create", requireStripe, async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { tier } = req.body;
      if (!tier) {
        return res.status(400).json({ error: "Tier required" });
      }

      // Map tier names to Stripe price IDs from environment variables
      const STRIPE_PRICE_IDS: Record<string, string> = {
        basic: process.env.STRIPE_PRICE_BASIC || "price_basic_placeholder",
        pro: process.env.STRIPE_PRICE_PRO || "price_pro_placeholder",
        business: process.env.STRIPE_PRICE_BUSINESS || "price_business_placeholder",
        enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "price_enterprise_placeholder",
      };

      const priceId = STRIPE_PRICE_IDS[tier];
      if (!priceId) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      // Check if using placeholder price IDs
      if (priceId.includes("placeholder")) {
        return res.status(400).json({ 
          error: "Stripe price IDs not configured. Please set STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS, and STRIPE_PRICE_ENTERPRISE environment variables with your Stripe price IDs." 
        });
      }

      const user = await storage.getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe!.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      // Create Stripe Checkout Session
      const session = await stripe!.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/account?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing`,
        metadata: {
          userId: user.id,
          tier,
        },
      });

      res.json({
        checkoutUrl: session.url,
      });
    } catch (error: any) {
      console.error("Subscription creation error:", error);
      res.status(500).json({ error: error.message || "Failed to create subscription" });
    }
  });

  // GET /api/subscription/status - Get subscription status
  app.get("/api/subscription/status", requireStripe, async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.stripeSubscriptionId) {
        return res.json({
          tier: user.subscriptionTier,
          status: user.subscriptionStatus,
          limits: TIER_LIMITS[user.subscriptionTier as keyof typeof TIER_LIMITS],
          usage: {
            monitors: user.monitorCount,
            deepResearch: user.deepResearchCount,
          }
        });
      }

      // Fetch from Stripe
      const subscription = await stripe!.subscriptions.retrieve(user.stripeSubscriptionId);
      
      res.json({
        tier: user.subscriptionTier,
        status: subscription.status,
        limits: TIER_LIMITS[user.subscriptionTier as keyof typeof TIER_LIMITS],
        usage: {
          monitors: user.monitorCount,
          deepResearch: user.deepResearchCount,
        },
        currentPeriodEnd: subscription.current_period_end,
      });
    } catch (error: any) {
      console.error("Subscription status error:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // POST /api/subscription/cancel - Cancel subscription
  app.post("/api/subscription/cancel", requireStripe, async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(auth.userId);
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({ error: "No active subscription" });
      }

      await stripe!.subscriptions.cancel(user.stripeSubscriptionId);
      
      await storage.updateUser(user.id, {
        subscriptionStatus: "cancelled",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Subscription cancellation error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // ===========================
  // POST /api/create-session – Secure session creation for Bubble integration
  // ===========================
  app.post("/api/create-session", async (req, res) => {
    try {
      // Validate shared secret from Authorization header
      const authHeader = req.headers.authorization;
      const sharedSecret = process.env.BUBBLE_SHARED_SECRET;
      
      if (!sharedSecret) {
        console.error("❌ BUBBLE_SHARED_SECRET not configured");
        return res.status(500).json({ 
          error: "Server configuration error - shared secret not set" 
        });
      }
      
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ 
          error: "Missing or invalid Authorization header" 
        });
      }
      
      const providedSecret = authHeader.substring(7); // Remove "Bearer " prefix
      if (providedSecret !== sharedSecret) {
        console.warn("⚠️ Invalid shared secret attempt");
        return res.status(401).json({ 
          error: "Invalid credentials" 
        });
      }
      
      // Validate request body
      const validation = createSessionRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }
      
      const { userId, userEmail, default_country } = validation.data;
      
      // Normalize country code to uppercase (GB, US, FR, etc.)
      const normalizedCountry = default_country?.toUpperCase();
      
      console.log('📥 Session creation request:', { userId, userEmail, default_country: normalizedCountry });
      
      // Generate cryptographically secure session ID and expiry (30 minutes from now)
      const sessionId = crypto.randomUUID();
      const expiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes
      
      // Store session in database
      const session = await storage.createSession(sessionId, userId, userEmail, expiresAt, normalizedCountry);
      
      console.log(`✅ Created session for user ${userEmail} (${userId})${normalizedCountry ? `, country: ${normalizedCountry}` : ''}, expires at ${new Date(expiresAt).toISOString()}`);
      
      return res.json({
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        defaultCountry: session.defaultCountry,
      });
    } catch (error: any) {
      console.error("❌ Session creation error:", error);
      return res.status(500).json({ 
        error: "Failed to create session", 
        details: error.message 
      });
    }
  });

  // ===========================
  // GET /api/validate-session – Validate session and return user info
  // ===========================
  app.get("/api/validate-session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      const session = await storage.getSession(sessionId);
      
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      
      console.log(`✅ Validated session for user ${session.userEmail} (${session.userId})`);
      
      return res.json({
        userId: session.userId,
        userEmail: session.userEmail,
        defaultCountry: session.defaultCountry,
        expiresAt: session.expiresAt,
      });
    } catch (error: any) {
      console.error("❌ Session validation error:", error);
      return res.status(500).json({ 
        error: "Failed to validate session", 
        details: error.message 
      });
    }
  });

  // ===========================
  // POST /api/agent/chat – Claude AI with Tool Use
  // ===========================
  app.post("/api/agent/chat", async (req, res) => {
    console.log('🤖 POST /api/agent/chat received');
    
    // Check for Anthropic API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️ ANTHROPIC_API_KEY not set');
      return res.status(503).json({ 
        error: "Agent unavailable", 
        message: "ANTHROPIC_API_KEY is not configured. Please add it to your environment variables." 
      });
    }
    
    try {
      const { message, conversationHistory, userId } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Get authenticated user ID
      const auth = await getAuthenticatedUserId(req);
      const actualUserId = userId || auth?.userId;
      
      // Import and call the Claude agent
      const { chatWithClaude } = await import('./anthropic-agent');
      
      const response = await chatWithClaude(
        message,
        conversationHistory || [],
        actualUserId,
        storage
      );
      
      res.json(response);
    } catch (error: any) {
      console.error('❌ Claude agent error:', error);
      res.status(500).json({ 
        error: "Agent error", 
        message: error.message || "An error occurred while processing your request"
      });
    }
  });

  // ===========================
  // POST /api/chat – streaming + MEMORY
  // ===========================
  app.post("/api/chat", async (req, res) => {
    console.log('🎯 POST /api/chat received', { query: req.query, hasBody: !!req.body });
    
    // DEV MODE: Check for missing OPENAI_API_KEY and return helpful stub response
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️ OPENAI_API_KEY not set - returning stub response');
      console.log('[CHAT_ROUTE=NO_API_KEY] crid=pre-validation — Returning stub response, OPENAI_API_KEY missing');
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.write('⚠️ **Chat unavailable**: OPENAI_API_KEY is not configured.\n\n');
      res.write('To fix this:\n');
      res.write('1. Create a `.env.local` file in the repo root\n');
      res.write('2. Add: `OPENAI_API_KEY=sk-your-key-here`\n');
      res.write('3. Restart the dev server\n\n');
      res.write('*Other features (CRM, products, orders) should still work.*');
      res.end();
      return;
    }
    
    // 🏢 TOWER: Declare variables at top level for error handler access
    let runId = '';
    let conversationId = '';
    let latestUserText = '';
    let runStartTime = Date.now();
    let user: any = null;
    let clientRequestId: string | undefined;
    
    try {
      // Validate request body against your existing schema
      const validation = chatRequestSchema.safeParse(req.body);
      if (!validation.success) {
        console.log('❌ Validation failed:', validation.error);
        console.log('[CHAT_ROUTE=VALIDATION_FAIL] crid=pre-validation');
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const validatedData = validation.data;
      user = validatedData.user;
      const { messages, defaultCountry, conversationId: requestedConversationId, clientRequestId: _clientRequestId, metadata } = validatedData;
      clientRequestId = _clientRequestId;
      console.log('📝 Chat request from user:', user.id, user.email, clientRequestId ? `(crid:${clientRequestId.slice(0,8)})` : '', metadata ? `metadata=${JSON.stringify(metadata).slice(0,200)}` : '');
      
      // SECURITY: Validate authenticated user matches the user in request
      const auth = await getAuthenticatedUserId(req);
      console.log('🔐 Auth result:', auth);
      if (!auth) {
        console.log(`[CHAT_ROUTE=NO_AUTH] crid=${clientRequestId || 'pre-auth'}`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (user.id !== auth.userId) {
        console.log(`[CHAT_ROUTE=FORBIDDEN] crid=${clientRequestId || 'none'} — User mismatch`);
        return res.status(403).json({ error: "Forbidden: Cannot chat as another user" });
      }
      console.log('✅ Authentication passed for:', auth.userEmail);
      
      // Store clientRequestId on request for use in downstream handlers
      (req as any).clientRequestId = clientRequestId;
      
      const sessionId = getSessionId(req);

      // Grab the latest user message text (last item in the array)
      latestUserText =
        messages?.length ? String(messages[messages.length - 1].content) : "";
      
      // Store default country in session for use in tools
      if (defaultCountry) {
        (req as any).defaultCountry = defaultCountry;
      }

      // Get or create persistent conversation
      conversationId = await getOrCreateConversation(user.id, requestedConversationId);
      console.log(`💬 Using conversation ID: ${conversationId}`);

      // 🏢 TOWER: Create unified runId for this conversation (send to Tower when complete)
      runStartTime = Date.now();
      runId = getOrCreateRunId(conversationId);

      // Prepare streaming headers FIRST (before any writes)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Create SSE emitter for this request
      const emitSse = createSseEmitter(res, runStartTime);

      // IMMEDIATELY emit ACK event (before any processing)
      emitSse({
        type: 'ack',
        message: 'OK, working',
        clientRequestId: clientRequestId || undefined,
        conversationId,
      });

      // Send conversationId to frontend as first event
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);


      // 1) Save user's new message to database
      await saveMessage(conversationId, "user", latestUserText);
      console.log("💾 Saved user message to database");

      // AFR: Log user message received with correlation ID — captures the agent run ID
      let agentRunId: string | null = null;
      if (clientRequestId) {
        try {
          const afrResult = await logUserMessageReceived({
            userId: user.id,
            conversationId,
            clientRequestId,
            rawUserText: latestUserText,
          });
          agentRunId = afrResult.runId;
          console.log(`🔗 [RunBridge] agent_runs row created: runId=${agentRunId} crid=${clientRequestId.slice(0, 12)}...`);
          emitSse({
            type: 'run_id',
            runId: agentRunId,
            clientRequestId,
          });
        } catch (err: any) {
          console.error('AFR log error:', err.message);
        }
      }

      // ═══ FORENSIC ENTRY LOG ═══
      console.log(`[CHAT_ENTRY] crid=${clientRequestId || 'none'} run_id=${agentRunId || runId} conversation_id=${conversationId} user=${user.id} text="${latestUserText.slice(0, 80)}"`);

      // Update conversation label if this is the first user message
      await updateConversationLabel(conversationId, latestUserText);

      // Emit classifying status
      emitSse({
        type: 'status',
        stage: 'classifying',
        message: 'Classifying intent',
        clientRequestId: clientRequestId || undefined,
        conversationId,
      });

      // ═══════════════════════════════════════════════════════════════════════
      // CLARIFY SESSION CHECK: If active, route through session handler FIRST
      // ═══════════════════════════════════════════════════════════════════════
      const {
        getActiveClarifySession,
        handleClarifyResponse,
        isUserCancelling,
        createClarifySession,
        buildInitialQuestions,
        closeAllClarifySessions,
      } = await import('./lib/clarifySession.js');

      const activeClarifySession = await getActiveClarifySession(conversationId);

      if (activeClarifySession) {
        console.log(`🔄 [CLARIFY_SESSION] Active session ${activeClarifySession.id} for conv=${conversationId}, processing user reply: "${latestUserText.slice(0, 60)}"`);

        const clarifyHandlerResult = await handleClarifyResponse(activeClarifySession, latestUserText);

        if (clientRequestId) {
          await logRouterDecision({
            userId: user.id,
            conversationId,
            clientRequestId,
            decision: clarifyHandlerResult.action === 'run_supervisor' ? 'supervisor_plan' : 'clarify_for_run',
            reason: `ClarifySession handler → ${clarifyHandlerResult.action}`,
            signals: { sessionId: activeClarifySession.id, action: clarifyHandlerResult.action },
          }).catch(err => console.error('AFR router log error:', err.message));
        }

        if (clarifyHandlerResult.action === 'cancelled') {
          const cancelMsg = clarifyHandlerResult.message || 'Search cancelled. What else can I help with?';
          appendMessage(sessionId, { role: "assistant", content: cancelMsg });
          await saveMessage(conversationId, "assistant", cancelMsg);
          res.write(`data: ${JSON.stringify({ type: 'clarify_session_ended' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: cancelMsg })}\n\n`);
          emitSse({ type: 'status', stage: 'completed', message: 'Cancelled', clientRequestId: clientRequestId || undefined, conversationId });
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }

        if (clarifyHandlerResult.action === 'ask_more') {
          const askMsg = clarifyHandlerResult.message || 'Could you provide more detail?';
          appendMessage(sessionId, { role: "assistant", content: askMsg });
          await saveMessage(conversationId, "assistant", askMsg);
          res.write(`data: ${JSON.stringify({ type: 'clarify_for_run', mode: 'CLARIFY_FOR_RUN' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: askMsg })}\n\n`);
          emitSse({ type: 'status', stage: 'completed', message: 'Clarifying before run', clientRequestId: clientRequestId || undefined, conversationId });
          console.log(`[CHAT_ROUTE=CLARIFY_SESSION_ASK_MORE] crid=${clientRequestId || 'none'} session=${activeClarifySession.id}`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }

        if (clarifyHandlerResult.action === 'run_supervisor') {
          const clarifiedRequest = clarifyHandlerResult.clarifiedRequest || activeClarifySession.original_user_text;
          const entityType = clarifyHandlerResult.entityType || activeClarifySession.entity_type || undefined;
          const location = clarifyHandlerResult.location || activeClarifySession.location || undefined;

          console.log(`🚀 [CLARIFY→RUN] Session complete, auto-running supervisor. clarifiedRequest="${clarifiedRequest}" entity="${entityType}" location="${location}"`);

          try {
            const intentResult = detectSupervisorIntent(clarifiedRequest);
            const taskType = intentResult.taskType || 'find_prospects';
            const requestData: Record<string, any> = {
              user_message: clarifiedRequest,
              original_user_message: activeClarifySession.original_user_text,
              ...(intentResult.requestData || {}),
              search_query: {
                business_type: entityType || intentResult.requestData?.search_query?.business_type,
                location: location || intentResult.requestData?.search_query?.location,
              },
            };
            if (metadata) {
              if (metadata.scenario) requestData.scenario = metadata.scenario;
              if (metadata.constraints) requestData.constraints = metadata.constraints;
              requestData.metadata = metadata;
            }

            emitSse({ type: 'status', stage: 'planning', message: 'Creating supervisor plan', clientRequestId: clientRequestId || undefined, conversationId });

            const supervisorTask = await createSupervisorTask(
              conversationId,
              user.id,
              taskType,
              requestData,
              { runId: agentRunId || runId, clientRequestId: clientRequestId || undefined }
            );

            console.log(`[SUPERVISOR_TASK_CREATED] id=${supervisorTask.id} from clarify session=${activeClarifySession.id}`);

            if (clientRequestId) {
              await transitionRunToExecuting(clientRequestId);
            }

            const ackMsg = `Clarification complete — running search for: ${clarifiedRequest}`;
            appendMessage(sessionId, { role: "assistant", content: ackMsg });
            await saveMessage(conversationId, "assistant", ackMsg);

            res.write(`data: ${JSON.stringify({ type: 'clarify_session_ended' })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: ackMsg })}\n\n`);
            res.write(`data: ${JSON.stringify({ supervisorTaskId: supervisorTask.id, supervisorTaskType: taskType })}\n\n`);
            emitSse({ type: 'status', stage: 'completed', message: 'Delegated to Supervisor', clientRequestId: clientRequestId || undefined, conversationId });
            console.log(`[CHAT_ROUTE=CLARIFY→RUN_SUPERVISOR] crid=${clientRequestId || 'none'} run_id=${agentRunId || runId} taskId=${supervisorTask.id}`);
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          } catch (error: any) {
            console.error(`[CLARIFY→RUN_ERROR] ${error.message}`);
            const errMsg = `I gathered the details but encountered an error starting the search. Please try again.`;
            appendMessage(sessionId, { role: "assistant", content: errMsg });
            await saveMessage(conversationId, "assistant", errMsg);
            res.write(`data: ${JSON.stringify({ type: 'clarify_session_ended' })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: errMsg })}\n\n`);
            emitSse({ type: 'status', stage: 'failed', message: 'Run failed', clientRequestId: clientRequestId || undefined, conversationId });
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 3-WAY ROUTER: CHAT_INFO | CLARIFY_FOR_RUN | RUN_SUPERVISOR
      // ═══════════════════════════════════════════════════════════
      const { decideChatMode } = await import('./lib/decideChatMode.js');
      const modeDecision = decideChatMode({ userMessage: latestUserText });
      console.log(`🔀 [ROUTER] mode=${modeDecision.mode} reason="${modeDecision.reason}" entity="${modeDecision.entityType || 'N/A'}" location="${modeDecision.location || 'N/A'}" crid=${clientRequestId || 'none'}`);

      if (modeDecision.mode === 'RUN_SUPERVISOR') {
        // ─── RUN_SUPERVISOR LANE: close any stale clarify sessions, then enqueue ───
        await closeAllClarifySessions(conversationId);
        try {
          const intentResult = detectSupervisorIntent(latestUserText);
          const taskType = intentResult.taskType || 'find_prospects';
          const baseRequestData = {
            user_message: latestUserText,
            ...(intentResult.requestData || {}),
            search_query: {
              business_type: modeDecision.entityType || intentResult.requestData?.search_query?.business_type,
              location: modeDecision.location || intentResult.requestData?.search_query?.location,
            },
          };
          const requestData: Record<string, any> = { ...baseRequestData };
          if (metadata) {
            if (metadata.scenario) requestData.scenario = metadata.scenario;
            if (metadata.constraints) requestData.constraints = metadata.constraints;
            requestData.metadata = metadata;
          }

          emitSse({
            type: 'status',
            stage: 'planning',
            message: 'Creating supervisor plan',
            clientRequestId: clientRequestId || undefined,
            conversationId,
          });

          if (clientRequestId) {
            await logRouterDecision({
              userId: user.id,
              conversationId,
              clientRequestId,
              decision: 'supervisor_plan',
              reason: `decideChatMode → RUN_SUPERVISOR (${modeDecision.reason})`,
              signals: { taskType, modeReason: modeDecision.reason, entityType: modeDecision.entityType, location: modeDecision.location },
            }).catch(err => console.error('AFR router log error:', err.message));
          }

          const supervisorTask = await createSupervisorTask(
            conversationId,
            user.id,
            taskType,
            requestData,
            {
              runId: agentRunId || runId,
              clientRequestId: clientRequestId || undefined,
            }
          );

          console.log(`[SUPERVISOR_TASK_CREATED] id=${supervisorTask.id} status=${supervisorTask.status} task_type=${supervisorTask.task_type} run_id=${supervisorTask.run_id || 'N/A'} client_request_id=${supervisorTask.client_request_id || 'N/A'} has_scenario=${!!requestData.scenario} has_constraints=${!!requestData.constraints} max_scrap=${requestData.constraints?.max_scrap_percent ?? 'N/A'}`);

          res.write(`data: ${JSON.stringify({
            supervisorTaskId: supervisorTask.id,
            supervisorTaskType: taskType,
          })}\n\n`);

          if (clientRequestId) {
            await transitionRunToExecuting(clientRequestId);
          }

          if (metadata?.scenario && (agentRunId || runId)) {
            const configPayload = {
              title: 'Run Configuration',
              summary: `${metadata.demo || 'demo'} — ${Object.entries(metadata.scenario).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
              scenario: metadata.scenario,
              constraints: metadata.constraints || {},
            };
            try {
              const configRunId = agentRunId || runId;
              const ts = new Date().toISOString();
              await sql(
                `INSERT INTO artefacts (run_id, type, title, summary, payload_json, created_at)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
                [configRunId, 'run_configuration', configPayload.title, configPayload.summary, JSON.stringify(configPayload), ts]
              );
              console.log(`[AFR] Persisted run_configuration artefact for runId=${configRunId}`);
            } catch (err: any) {
              console.error(`[AFR] Failed to persist run_configuration artefact: ${err.message}`);
            }
          }

          const delegateMsg = `Task delegated to Supervisor for execution. The Supervisor will handle tool calls, Tower evaluation, and results delivery.`;
          appendMessage(sessionId, { role: "assistant", content: delegateMsg });
          await saveMessage(conversationId, "assistant", delegateMsg);

          res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: delegateMsg })}\n\n`);

          emitSse({
            type: 'status',
            stage: 'completed',
            message: 'Delegated to Supervisor',
            clientRequestId: clientRequestId || undefined,
            conversationId,
          });

          console.log(`[CHAT_ROUTE=RUN_SUPERVISOR] crid=${clientRequestId || 'none'} run_id=${agentRunId || runId} taskId=${supervisorTask.id}`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } catch (error: any) {
          console.error(`[CHAT_ROUTE=RUN_SUPERVISOR_ERROR] crid=${clientRequestId || 'none'} error=${error.message}`);
          console.error('RUN_SUPERVISOR lane failed, falling through to CLARIFY_FOR_RUN');
          modeDecision.mode = 'CLARIFY_FOR_RUN' as any;
          modeDecision.reason = `RUN_SUPERVISOR failed (${error.message}), falling back to clarification`;
        }
      }

      if (modeDecision.mode === 'CLARIFY_FOR_RUN') {
        // ─── CLARIFY_FOR_RUN LANE: create DB-persisted clarify session ───
        try {
          const semanticConstraintMatch = latestUserText.match(/\bthat\s+(work|deal|partner|provide|offer|support|help|serve|are|have|do|focus|engage|operate|specialise|specialize|collaborate)\b[^.!?]*/i);
          const semanticConstraint = semanticConstraintMatch ? semanticConstraintMatch[0].trim() : undefined;

          const questions = buildInitialQuestions(modeDecision.entityType, modeDecision.location, semanticConstraint);

          const newSession = await createClarifySession({
            conversationId,
            originalUserText: latestUserText,
            entityType: modeDecision.entityType,
            location: modeDecision.location,
            semanticConstraint,
            pendingQuestions: questions,
          });

          if (clientRequestId) {
            await logRouterDecision({
              userId: user.id,
              conversationId,
              clientRequestId,
              decision: 'clarify_for_run',
              reason: `decideChatMode → CLARIFY_FOR_RUN (${modeDecision.reason})`,
              signals: { entityType: modeDecision.entityType, location: modeDecision.location, sessionId: newSession.id },
            }).catch(err => console.error('AFR router log error:', err.message));
          }

          const clarifyMessage = `I'd like to make sure I find exactly what you need. A couple of quick questions:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

          appendMessage(sessionId, { role: "assistant", content: clarifyMessage });
          await saveMessage(conversationId, "assistant", clarifyMessage);

          res.write(`data: ${JSON.stringify({ type: 'clarify_for_run', mode: 'CLARIFY_FOR_RUN' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: clarifyMessage })}\n\n`);
          emitSse({ type: 'status', stage: 'completed', message: 'Clarifying before run', clientRequestId: clientRequestId || undefined, conversationId });

          console.log(`[CHAT_ROUTE=CLARIFY_FOR_RUN] crid=${clientRequestId || 'none'} sessionId=${newSession.id} questions=${questions.length}`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } catch (error: any) {
          console.error(`[CHAT_ROUTE=CLARIFY_ERROR] crid=${clientRequestId || 'none'} error=${error.message}`);
          const fallbackMsg = `I'd like to help you find what you're looking for. Could you tell me more about what type of entity and which location you have in mind?`;
          appendMessage(sessionId, { role: "assistant", content: fallbackMsg });
          await saveMessage(conversationId, "assistant", fallbackMsg);

          res.write(`data: ${JSON.stringify({ type: 'clarify_for_run', mode: 'CLARIFY_FOR_RUN' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'message', role: 'assistant', content: fallbackMsg })}\n\n`);
          emitSse({ type: 'status', stage: 'completed', message: 'Clarifying before run', clientRequestId: clientRequestId || undefined, conversationId });
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        }
      }

      // ─── CHAT_INFO LANE: normal GPT-5 streaming response ───
      console.log(`[CHAT_INFO] Starting GPT-5 streaming for crid=${clientRequestId || 'none'}`);

      const conversationHistory = await loadConversationHistory(conversationId);
      console.log(`📚 Loaded ${conversationHistory.length} messages from conversation history`);

      const currentUser = await storage.getUserById(user.id);
      let userSessionContext: SessionContext | undefined = undefined;

      if (currentUser) {
        userSessionContext = buildSessionContext({
          companyName: currentUser.companyName ?? null,
          companyDomain: currentUser.companyDomain ?? null,
          roleHint: currentUser.roleHint ?? null,
          primaryObjective: currentUser.primaryObjective ?? null,
          secondaryObjectives: currentUser.secondaryObjectives ?? null,
          targetMarkets: currentUser.targetMarkets ?? null,
          productsOrServices: currentUser.productsOrServices ?? null,
          preferences: currentUser.preferences ?? null,
          inferredIndustry: currentUser.inferredIndustry ?? null,
          confidence: currentUser.confidence ?? null,
        } as any);
        console.log(`🎯 User context loaded: company=${userSessionContext.companyName || 'N/A'}, industry=${userSessionContext.inferredIndustry || 'N/A'}`);
      }

      const memoryMessages = await buildContextWithFacts(user.id, conversationHistory, 20, userSessionContext);
      console.log(`🧠 Built context with facts for user ${user.id}`);

      appendMessage(sessionId, { role: "user", content: latestUserText });
      await maybeSummarize(sessionId, openai);

      let aiBuffer = "";

      const urls = extractUrls(latestUserText);
      const useDirectFetch = urls.length > 0;

      // Prepare messages array with CHAT_INFO system prompt (DON'T mutate memoryMessages)
      const { WyshboneChatConfig } = await import("../shared/conversationConfig");
      
      const systemPrompt = {
        role: "system" as const,
        content: WyshboneChatConfig.systemPrompts.CHAT_INFO
      };

      
      let chatMessages = [systemPrompt, ...memoryMessages];
      
      // Fetch existing ACTIVE monitors and inject as LATEST system message (after conversation history)
      // This ensures the AI sees current state, not historical conversation
      const existingMonitors = await storage.listScheduledMonitors(user.id);
      const activeMonitors = existingMonitors.filter(m => m.isActive === 1);
      
      let monitorStateMessage = '';
      if (activeMonitors.length > 0) {
        monitorStateMessage = `**CURRENT DATABASE STATE - ACTIVE MONITORS:**\n`;
        monitorStateMessage += `The user has ${activeMonitors.length} active monitor(s):\n`;
        activeMonitors.forEach(m => {
          monitorStateMessage += `- "${m.label}" (${m.schedule}) - ${m.description}\n`;
        });
        monitorStateMessage += `\n**CRITICAL:** These are the ONLY active monitors. Any monitors mentioned earlier in conversation that are NOT in this list have been DELETED and should NOT be considered duplicates.\n`;
      } else {
        monitorStateMessage = `**CURRENT DATABASE STATE - ACTIVE MONITORS:** ZERO\n\nThe user has NO active monitors. Any monitors mentioned in earlier conversation have been deleted. User can create ANY monitor without duplicate warnings.\n`;
      }
      
      // Inject monitor state as the LAST system message (freshest context)
      const monitorStateSystemMessage = {
        role: "system" as const,
        content: monitorStateMessage
      };
      chatMessages = [...chatMessages, monitorStateSystemMessage];
      
      // If URLs detected, fetch and inject content WITHOUT mutating stored conversation
      if (useDirectFetch) {
        console.log(`🚀 Fast URL mode: Detected ${urls.length} URL(s) - using direct fetch`);
        
        try {
          // Fetch content from all URLs
          const urlContents = await Promise.all(
            urls.map(url => fetchUrlContent(url).catch(err => {
              console.warn(`⚠️ Failed to fetch ${url}: ${err.message}`);
              return `[Could not fetch ${url}: ${err.message}]`;
            }))
          );
          
          // Create a NEW messages array with URL content (don't mutate stored memory)
          const urlContentMessage = {
            role: "system" as const,
            content: `URL Content Retrieved:\n${urlContents.join('\n\n---\n\n')}\n\nPlease provide a helpful response based on the above URL content.`
          };
          chatMessages = [systemPrompt, ...memoryMessages, urlContentMessage];
          
        } catch (err: any) {
          console.error("❌ URL fetch error:", err.message);
          // Continue anyway without URL content
        }
      }
      
      // ─── CHAT LANE: Pure GPT-5 streaming (no tool execution) ───
      console.log(`🌐 Calling Chat Completions API (pure streaming, no tools)...`);

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-5",
          messages: chatMessages as any,
          stream: true,
        });

        console.log("✅ Chat Completions API stream started (no tools)");

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta.content) {
            aiBuffer += delta.content;
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
            // @ts-ignore
            if (res.flush) res.flush();
          }
        }

        if (!aiBuffer) {
          aiBuffer = "I apologize, but I couldn't generate a response.";
          res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
        }

      } catch (err: any) {
        console.error("❌ Chat Completions API error:", err.message);
        aiBuffer = `Error: ${err.message}`;
        res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
      }

      // Save assistant reply to in-memory session (backwards compatibility)
      appendMessage(sessionId, { role: "assistant", content: aiBuffer });

      // Save assistant message to database
      await saveMessage(conversationId, "assistant", aiBuffer);
      console.log("💾 Saved assistant message to database");

      // Extract and save facts in background (don't await to avoid blocking response)
      extractAndSaveFacts(user.id, conversationId, latestUserText, aiBuffer, openai)
        .then(() => console.log("✅ Facts extracted and saved"))
        .catch((err) => console.error("❌ Fact extraction failed:", err.message));

      // Emit finalising status
      emitSse({
        type: 'status',
        stage: 'finalising',
        message: 'Finalising response',
        clientRequestId: clientRequestId || undefined,
        conversationId,
      });

      // AFR: Log router decision for direct response (no tool calls)
      if (clientRequestId) {
        await logRouterDecision({
          userId: user.id,
          conversationId,
          clientRequestId,
          decision: 'direct_response',
          reason: 'Standard chat response without tool calls',
          signals: { responseLength: aiBuffer.length },
        }).catch(err => console.error('AFR router log error:', err.message));
      }

      // 🏢 TOWER: Log successful completion
      await completeRunLog(
        runId,
        conversationId,
        user.id,
        user.email,
        latestUserText,
        aiBuffer,
        'success',
        runStartTime,
        undefined,
        undefined,
        'standard'
      );

      // AFR: Mark run as completed (sets terminal_state)
      if (clientRequestId) {
        await logRunCompleted({
          userId: user.id,
          conversationId,
          clientRequestId,
        }).catch(err => console.error('AFR run complete error:', err.message));
      }

      // Emit completed status
      emitSse({
        type: 'status',
        stage: 'completed',
        message: 'Done',
        clientRequestId: clientRequestId || undefined,
        conversationId,
      });

      // End stream
      res.write(`data: [DONE]\n\n`);
      console.log(`[CHAT_ROUTE=STANDARD_CHAT_COMPLETE] crid=${clientRequestId || "none"}`);
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      
      // Emit failed status
      try {
        const failedEvent = {
          type: 'status' as const,
          stage: 'failed' as const,
          message: error.message || 'Request failed',
          clientRequestId: clientRequestId || undefined,
          conversationId,
        };
        res.write(`data: ${JSON.stringify({ ...failedEvent, ts: Date.now(), elapsedMs: Date.now() - runStartTime })}\n\n`);
      } catch (e) {
        // Response might already be closed
      }
      
      // 🏢 TOWER: Log error completion
      try {
        await completeRunLog(
          runId,
          conversationId,
          user.id,
          user.email,
          latestUserText,
          '',
          'error',
          runStartTime,
          undefined,
          error.message,
          'standard'
        );
      } catch (logError: any) {
        console.error("❌ Tower logging error:", logError.message);
      }

      // AFR: Mark run as failed (sets terminal_state='failed')
      if (clientRequestId) {
        await logRunFailed({
          userId: user.id,
          conversationId,
          clientRequestId,
          error: error.message,
        }).catch(err => console.error('AFR run failed error:', err.message));
      }
      
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      console.log(`[CHAT_ROUTE=UNHANDLED_ERROR] crid=${clientRequestId || "none"}`);
      res.end();
    }
  });

  // Optional: clear memory for a given session (useful for "New chat")
  app.post("/api/chat/reset", (req, res) => {
    const sessionId = getSessionId(req);
    resetConversation(sessionId);
    res.json({ status: "ok", message: "Conversation reset." });
  });

  // ===========================
  // CONVERSATION MANAGEMENT API
  // ===========================
  
  // List conversations for a user
  app.get("/api/conversations/:userId", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Only allow users to access their own conversations
      const requestedUserId = req.params.userId;
      if (requestedUserId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access conversations for ${requestedUserId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' data" });
      }
      
      const conversations = await storage.listConversations(auth.userId);
      res.json(conversations);
    } catch (error: any) {
      console.error("Error listing conversations:", error);

      // Check if tables don't exist (graceful degradation for demo/new users)
      if (error.message?.includes('relation "conversations" does not exist') ||
          error.message?.includes('fetch failed')) {
        return res.status(200).json({
          conversations: [],
          message: "No conversations yet. Start chatting to create your first conversation!"
        });
      }

      res.status(500).json({ error: error.message });
    }
  });

  // Regenerate labels for all conversations with default labels
  app.post("/api/conversations/regenerate-labels", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const conversations = await storage.listConversations(auth.userId);
      let updated = 0;

      for (const conversation of conversations) {
        if (conversation.label === "Conversation" || conversation.label === "New Chat") {
          const messages = await storage.listMessages(conversation.id);
          const firstUserMessage = messages.find(m => m.role === "user");
          
          if (firstUserMessage) {
            await updateConversationLabel(conversation.id, firstUserMessage.content);
            updated++;
          }
        }
      }

      res.json({ success: true, updated });
    } catch (error: any) {
      console.error("Error regenerating labels:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new conversation
  app.post("/api/conversations", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { label } = req.body;
      const conversationId = await getOrCreateConversation(auth.userId);
      
      if (label) {
        const conversation = await storage.getConversation(conversationId);
        if (conversation) {
          await storage.createConversation({
            ...conversation,
            label,
          });
        }
      }
      
      res.json({ conversationId });
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a conversation
  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify the conversation belongs to the authenticated user
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete conversation ${id} owned by ${conversation.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other users' conversations" });
      }
      
      const success = await storage.deleteConversation(id);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Conversation not found" });
      }
    } catch (error: any) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversation messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify the conversation belongs to the authenticated user
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access messages for conversation ${id} owned by ${conversation.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' conversations" });
      }
      
      const messages = await storage.listMessages(id);
      res.json(messages);
    } catch (error: any) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/conversations/:id/result-message", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id: conversationId } = req.params;
      const { messageId, runId, deliverySummary, verificationSummary, constraintsExtracted, policySnapshot } = req.body;

      if (!messageId || !deliverySummary) {
        return res.status(400).json({ error: "messageId and deliverySummary are required" });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const metadata = {
        type: 'structured_result',
        runId: runId || null,
        deliverySummary,
        verificationSummary: verificationSummary || null,
        constraintsExtracted: constraintsExtracted || null,
        policySnapshot: policySnapshot || null,
      };

      await saveStructuredResultMessage(conversationId, messageId, metadata);
      res.json({ ok: true });
    } catch (error: any) {
      const isDupe = error?.code === '23505' 
        || error?.cause?.code === '23505' 
        || error?.message?.includes('duplicate key')
        || error?.message?.includes('unique constraint')
        || error?.cause?.message?.includes('duplicate key');
      if (isDupe) {
        return res.json({ ok: true, deduplicated: true });
      }
      console.error("Error saving structured result:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all monitor run conversations for a specific monitor
  app.get("/api/monitors/:monitorId/runs", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { monitorId } = req.params;
      
      // SECURITY: Verify the monitor belongs to the authenticated user
      const monitor = await storage.getScheduledMonitor(monitorId);
      if (!monitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      if (monitor.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access monitor runs for ${monitorId} owned by ${monitor.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' monitors" });
      }
      
      // Fetch all monitor run conversations for this monitor
      const runs = await storage.listMonitorRunConversations(monitorId);
      res.json(runs);
    } catch (error: any) {
      console.error("Error fetching monitor runs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get the conversation thread for a specific monitor
  app.get("/api/monitors/:monitorId/conversation", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { monitorId } = req.params;
      
      // SECURITY: Verify the monitor belongs to the authenticated user
      const monitor = await storage.getScheduledMonitor(monitorId);
      if (!monitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      if (monitor.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access monitor conversation for ${monitorId} owned by ${monitor.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' monitors" });
      }
      
      // Get the monitor's conversation thread (there should be only one)
      const runs = await storage.listMonitorRunConversations(monitorId);
      if (runs.length === 0) {
        return res.status(404).json({ error: "No conversation found for this monitor yet" });
      }
      
      // Return the first (and only) conversation for this monitor
      res.json({ conversationId: runs[0].id });
    } catch (error: any) {
      console.error("Error fetching monitor conversation:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user facts
  app.get("/api/facts/:userId", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Only allow users to access their own facts
      const requestedUserId = req.params.userId;
      if (requestedUserId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access facts for ${requestedUserId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' data" });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const facts = await storage.listTopFacts(auth.userId, limit);
      res.json(facts);
    } catch (error: any) {
      console.error("Error fetching facts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search user facts
  app.get("/api/facts/:userId/search", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Only allow users to search their own facts
      const requestedUserId = req.params.userId;
      if (requestedUserId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to search facts for ${requestedUserId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' data" });
      }
      
      const searchQuery = req.query.q as string;
      if (!searchQuery || searchQuery.trim() === "") {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      const facts = await storage.searchFacts(auth.userId, searchQuery.trim());
      res.json(facts);
    } catch (error: any) {
      console.error("Error searching facts:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================
  // GOAL MANAGEMENT API (UI-010)
  // ===========================
  
  // GET /api/plan-status - Get current plan/goal execution status (UI-020)
  // Now reads from DATABASE FIRST for crash-safety, falls back to in-memory
  app.get("/api/plan-status", async (req, res) => {
    console.log(`📥 [PLAN] GET /api/plan-status received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [PLAN] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get session ID
      const sessionId = getSessionId(req);
      
      // Get current goal
      const goal = await getUserGoal(sessionId);
      
      const planId = req.query.planId as string | undefined;
      const conversationId = req.query.conversationId as string | undefined;
      
      // CRASH-SAFE: Read from database first if planId is provided
      if (planId) {
        try {
          const { getPlanExecutionStatus } = await import('./leadgen-plan.js');
          const dbStatus = await getPlanExecutionStatus(planId);

          if (dbStatus) {
            // Build response from persisted step data
            const currentStep = dbStatus.steps.find(s => s.stepStatus === 'running') ||
                               dbStatus.steps.find(s => !s.stepStatus || s.stepStatus === 'pending');

            const steps = dbStatus.steps.map(step => ({
              id: step.id,
              type: step.type,
              label: step.label,
              status: step.stepStatus === 'running' ? 'executing' : (step.stepStatus || 'pending'),
              resultSummary: step.resultSummary,
              leadsCreated: step.leadsCreated,
            }));

            return res.json({
              goal: dbStatus.goal || goal || null,
              planId: planId,
              totalSteps: dbStatus.totalSteps,
              completedSteps: dbStatus.completedSteps,
              currentStep: currentStep ? {
                id: currentStep.id,
                type: currentStep.type,
                label: currentStep.label,
                status: currentStep.stepStatus === 'running' ? 'executing' : (currentStep.stepStatus || 'pending'),
                resultSummary: currentStep.resultSummary,
              } : null,
              status: dbStatus.status,
              steps,
              lastUpdatedAt: new Date().toISOString(),
              error: dbStatus.error,
            });
          }
        } catch (dbError: any) {
          // Log but don't fail - fall through to in-memory check
          console.warn(`⚠️ Database lookup failed for plan ${planId}:`, dbError.message);
        }
      }
      
      // Fallback: Check in-memory execution state (for backwards compatibility)
      const { getExecutionBySession, getExecutionByConversation, getPlanExecution } = await import('./leadgen-executor.js');
      
      let execution = planId 
        ? getPlanExecution(planId)
        : conversationId 
          ? getExecutionByConversation(conversationId) 
          : getExecutionBySession(sessionId);
      
      // If no execution found by conversation, try session
      if (!execution && conversationId && !planId) {
        execution = getExecutionBySession(sessionId);
      }
      
      if (!execution) {
        // No active execution - return empty state
        return res.json({
          goal: goal || null,
          planId: null,
          totalSteps: 0,
          completedSteps: 0,
          currentStep: null,
          status: 'idle',
          steps: [],
          lastUpdatedAt: new Date().toISOString()
        });
      }
      
      // Calculate completed steps
      const completedSteps = execution.stepProgress.filter(s => s.status === 'completed').length;
      
      // Find current step (first running or pending step)
      const currentStepProgress = execution.stepProgress.find(s => s.status === 'running') ||
                                  execution.stepProgress.find(s => s.status === 'pending');
      
      // Build enriched steps array with resultSummary
      const steps = execution.stepProgress.map((progress, index) => {
        const step = execution.steps[index];
        return {
          id: progress.stepId,
          type: step.type,
          label: step.label,
          status: progress.status === 'running' ? 'executing' : progress.status,
          resultSummary: progress.resultSummary
        };
      });
      
      // Build response based on execution data
      const response = {
        goal: goal || null,
        planId: execution.planId,
        totalSteps: execution.steps.length,
        completedSteps,
        currentStep: currentStepProgress ? {
          id: currentStepProgress.stepId,
          type: execution.steps[currentStepProgress.stepIndex].type,
          label: execution.steps[currentStepProgress.stepIndex].label,
          status: currentStepProgress.status === 'running' ? 'executing' : currentStepProgress.status,
          resultSummary: currentStepProgress.resultSummary
        } : null,
        status: execution.status,
        steps,
        lastUpdatedAt: execution.startedAt
      };
      
      res.json(response);
    } catch (error: any) {
      console.error("Error fetching plan status:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/goal - Get current user's goal
  app.get("/api/goal", async (req, res) => {
    console.log(`📥 [GOAL] GET /api/goal received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [GOAL] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get session ID (same as UI-001 and other routes)
      const sessionId = getSessionId(req);
      const goal = await getUserGoal(sessionId);
      
      res.json({
        goal: goal || null,
        hasGoal: !!goal
      });
    } catch (error: any) {
      console.error("Error fetching goal:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // PUT /api/goal - Update current user's goal
  app.put("/api/goal", async (req, res) => {
    console.log(`📥 [GOAL] PUT /api/goal received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [GOAL] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { goal } = req.body;
      
      if (typeof goal !== 'string') {
        return res.status(400).json({ error: "Goal must be a string" });
      }
      
      const trimmedGoal = goal.trim();
      
      if (trimmedGoal === '') {
        return res.status(400).json({ error: "Goal cannot be empty" });
      }
      
      // Get session ID (same as UI-001 and other routes)
      const sessionId = getSessionId(req);
      await setUserGoal(sessionId, trimmedGoal);
      
      console.log(`✅ Goal saved for session ${sessionId}: "${trimmedGoal.substring(0, 50)}${trimmedGoal.length > 50 ? '...' : ''}"`);
      console.log(`📋 Goal hasGoal=true after save`);
      
      // Return format matching GET /api/goal
      res.json({
        goal: trimmedGoal,
        hasGoal: true
      });
    } catch (error: any) {
      console.error("❌ Error updating goal:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/goal - Create/update current user's goal (mirrors PUT for frontend compatibility)
  app.post("/api/goal", async (req, res) => {
    console.log(`📥 [GOAL] POST /api/goal received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [GOAL] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { goal } = req.body;
      
      if (typeof goal !== 'string') {
        return res.status(400).json({ error: "Goal must be a string" });
      }
      
      const trimmedGoal = goal.trim();
      
      if (trimmedGoal === '') {
        return res.status(400).json({ error: "Goal cannot be empty" });
      }
      
      // Get session ID (same as UI-001 and other routes)
      const sessionId = getSessionId(req);
      await setUserGoal(sessionId, trimmedGoal);
      
      console.log(`✅ Goal saved for session ${sessionId}: "${trimmedGoal.substring(0, 50)}${trimmedGoal.length > 50 ? '...' : ''}"`);
      console.log(`📋 Goal hasGoal=true after save`);
      
      // Return format matching GET /api/goal
      res.json({
        goal: trimmedGoal,
        hasGoal: true
      });
    } catch (error: any) {
      console.error("❌ Error updating goal:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================
  // CAPABILITIES API
  // ===========================
  
  // GET /api/capabilities - Return available actions and feature flags
  app.get("/api/capabilities", async (req, res) => {
    try {
      // No auth required for capabilities - this is public config info
      
      // Check which services are configured
      const hasHunterApiKey = !!(process.env.HUNTER_API_KEY || process.env.HUNTER_IO_API_KEY);
      const hasGooglePlacesKey = !!process.env.GOOGLE_PLACES_API_KEY;
      const hasSalesHandy = !!(process.env.SALESHANDY_API_KEY && process.env.SALESHANDY_TEAM_EMAIL);
      const hasSupabase = isSupabaseConfigured();
      
      // Define available step types with labels
      const stepTypes = {
        places_search: {
          enabled: hasGooglePlacesKey,
          label: "Search Businesses",
          description: "Find businesses matching your criteria via Google Places"
        },
        deep_research: {
          enabled: true, // Always available (uses OpenAI)
          label: "Deep Research",
          description: "In-depth research on a topic or company"
        },
        email_enrich: {
          enabled: hasHunterApiKey,
          label: "Enrich Emails",
          description: "Find verified email addresses via Hunter.io"
        },
        draft_outreach: {
          enabled: true, // Always available (uses OpenAI)
          label: "Draft Outreach",
          description: "Generate personalized outreach messages"
        }
      };
      
      // Quick actions that users can trigger from UI
      const quickActions = [
        { id: "places_search", label: "Find Leads", enabled: stepTypes.places_search.enabled },
        { id: "deep_research", label: "Research", enabled: stepTypes.deep_research.enabled },
        { id: "email_enrich", label: "Find Emails", enabled: stepTypes.email_enrich.enabled },
        { id: "draft_outreach", label: "Draft Messages", enabled: stepTypes.draft_outreach.enabled }
      ].filter(a => a.enabled);
      
      // Feature flags
      const flags = {
        outreach_send_enabled: hasSalesHandy,
        realtime_leads_enabled: hasSupabase,
        monitor_enabled: hasSupabase,
        plan_approval_required: true // Always require plan approval for now
      };
      
      res.json({
        stepTypes,
        quickActions,
        flags
      });
    } catch (error: any) {
      console.error("Error fetching capabilities:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===========================
  // PLAN APPROVAL API (UI-030)
  // ===========================
  
  // GET /api/plan - Get current leadgen plan for approval
  app.get("/api/plan", async (req, res) => {
    console.log(`📥 [PLAN] GET /api/plan received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [PLAN] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      console.log(`📋 GET /api/plan for userId: ${auth.userId}`);

      // Get plan for this user (by userId, not sessionId)
      try {
        const { getPlanByUserId } = await import('./leadgen-plan.js');
        const plan = await getPlanByUserId(auth.userId);

        if (plan) {
          console.log(`✅ Returning plan: ${plan.id}, status: ${plan.status}, goal: "${plan.goal}"`);
        } else {
          console.log(`ℹ️ No active plan found for user ${auth.userId}`);
        }

        res.json(plan);
      } catch (dbError: any) {
        console.error("Database error fetching plan:", dbError);

        // Graceful degradation - return null plan instead of 500
        console.warn('[PLAN] Database lookup failed, returning null plan');
        return res.json(null);
      }
    } catch (error: any) {
      console.error("Error in /api/plan endpoint:", error);
      // This should rarely be reached now
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/plan/approve - Approve a plan and trigger execution
  app.post("/api/plan/approve", async (req, res) => {
    console.log(`📥 [APPROVE_API] POST /api/plan/approve received`);
    console.log(`📥 [APPROVE_API] Body:`, JSON.stringify(req.body || {}));
    
    try {
      const { planId, clientRequestId } = req.body || {};
      
      // Validate planId first (before auth, so we can give a clear error)
      if (!planId) {
        console.log(`❌ [APPROVE_API] Missing planId in request body`);
        return res.status(400).json({ error: "Plan ID is required", ok: false });
      }
      
      console.log(`📥 [APPROVE_API] clientRequestId: ${clientRequestId || '(none)'}`);

      
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        console.log(`❌ [APPROVE_API] Unauthorized request`);
        return res.status(401).json({ error: "Unauthorized", ok: false });
      }
      
      console.log(`[APPROVE_API] planId: ${planId}, userId: ${auth.userId}`);
      
      const { approvePlan, getPlanById, updatePlanStatus } = await import('./leadgen-plan.js');
      const { startPlanExecution, getPlanExecution } = await import('./leadgen-executor.js');
      
      // Get the plan first to validate it exists
      const plan = await getPlanById(planId);
      if (!plan) {
        console.error(`❌ [APPROVE_API] Plan not found: ${planId}`);
        return res.status(404).json({ error: "Plan not found", ok: false });
      }
      
      console.log(`✅ [APPROVE_API] Found plan: ${planId}`);
      console.log(`   Status: ${plan.status}`);
      console.log(`   Goal: ${plan.goal}`);
      console.log(`   Steps: ${plan.steps.map((s: any) => s.type).join(' → ')}`);
      
      // Guard against duplicate execution
      const existingExecution = getPlanExecution(planId);
      if (existingExecution) {
        console.log(`⚠️ [APPROVE_API] Execution already exists for plan ${planId}, status: ${existingExecution.status}`);
        return res.json({
          ok: true,
          success: true,  // For legacy UI compatibility
          planId: plan.id,
          status: existingExecution.status
        });
      }
      
      // Approve the plan FIRST (persist to DB)
      const approvedPlan = await approvePlan(planId);
      
      if (!approvedPlan) {
        console.error(`❌ [APPROVE_API] Failed to approve plan: ${planId}`);
        return res.status(404).json({ error: "Failed to approve plan", ok: false });
      }
      
      // Update debug state
      const { debugOnPlanApproval } = await import('./debugState.js');
      debugOnPlanApproval(planId);
      
      console.log(`✅ [APPROVE_API] Plan approved and persisted`);
      
      // Update plan status to executing
      await updatePlanStatus(planId, 'executing');
      
      // Return success IMMEDIATELY (decouple execution from HTTP response)
      console.log(`✅ [APPROVE_API] Returning 200 OK immediately, execution will run async`);
      res.json({
        ok: true,
        success: true,  // For legacy UI compatibility
        planId: approvedPlan.id,
        status: 'executing'
      });
      
      // Check if Supervisor execution is enabled via feature flag
      // SESSION 1 DEV WIRING: Hardcoded to enabled with DEV URL (keep repls awake, no deploy)
      const supervisorEnabled = true; // Hardcoded for Session 1 dev testing
      const supervisorUrl = 'https://0683d338-5922-4d4f-8d17-c6623926977d-00-10wqa1dusmk5n.janeway.replit.dev';
      
      console.log(`[SUPERVISOR] execution enabled = ${supervisorEnabled}`);
      console.log(`[SUPERVISOR] url = ${supervisorUrl}`);
      
      if (supervisorEnabled && supervisorUrl) {
        // Delegate execution to Supervisor
        console.log(`🔀 [APPROVE] Supervisor execution enabled, delegating to ${supervisorUrl}`);
        
        setImmediate(async () => {
          try {
            const supervisorPayload = {
              planId: approvedPlan.id,
              userId: approvedPlan.userId,
              sessionId: approvedPlan.sessionId,
              conversationId: approvedPlan.conversationId,
              goal: approvedPlan.goal,
              steps: approvedPlan.steps,
              toolMetadata: approvedPlan.toolMetadata,
            };
            
            console.log(`📤 [APPROVE] POSTing to Supervisor: ${supervisorUrl}/api/supervisor/execute-plan`);
            
            const supervisorResponse = await fetch(`${supervisorUrl}/api/supervisor/execute-plan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(supervisorPayload),
              signal: AbortSignal.timeout(10000), // 10 second timeout
            });
            
            const supervisorResult = await supervisorResponse.json();
            
            if (supervisorResponse.ok && supervisorResult.ok) {
              console.log(`✅ [APPROVE] Delegated execution to Supervisor (DEV URL) for plan ${planId}`);
              console.log(`   Supervisor response: ${JSON.stringify(supervisorResult)}`);
              // HARD RETURN - Do NOT run local execution - Supervisor is handling it
              return;
            } else {
              console.error(`❌ [APPROVE] Supervisor returned error: ${JSON.stringify(supervisorResult)}`);
              throw new Error(supervisorResult.error || 'Supervisor execution failed');
            }
          } catch (supervisorError: any) {
            console.error(`❌ [APPROVE] Supervisor delegation failed: ${supervisorError.message}`);
            console.log(`🔄 [APPROVE] Falling back to local execution for plan ${planId}`);
            
            // FALLBACK: Run local execution
            try {
              await startPlanExecution(approvedPlan, clientRequestId);
              console.log(`✅ [APPROVE] Fallback local execution completed for plan ${planId}`);
            } catch (executionError: any) {
              console.error(`❌ [APPROVE] Fallback execution also failed: ${executionError.message}`);
              try {
                await updatePlanStatus(planId, 'failed');
              } catch (updateError: any) {
                console.error(`❌ [APPROVE] Failed to update plan status:`, updateError.message);
              }
            }
          }
        });
      } else {
        // Feature flag OFF - use existing local execution
        // Kick off execution ASYNCHRONOUSLY (after response sent)
        // This ensures approval never fails due to execution errors
        setImmediate(async () => {
          console.log(`\n🏃 [APPROVE_API] Starting async execution for plan ${planId}...`);
          
          try {
            await startPlanExecution(approvedPlan, clientRequestId);
            console.log(`✅ [APPROVE_API] Async execution completed for plan ${planId}`);
          } catch (executionError: any) {
            console.error(`❌ [APPROVE_API] Async execution failed for plan ${planId}:`, executionError.message);
            
            // Update plan status to failed (don't crash server)
            try {
              await updatePlanStatus(planId, 'failed');
              console.log(`💾 [APPROVE_API] Plan ${planId} status updated to 'failed'`);
            } catch (updateError: any) {
              console.error(`❌ [APPROVE_API] Failed to update plan status:`, updateError.message);
            }
          }
        });
      }
      
    } catch (error: any) {
      console.error(`❌ [APPROVE_API] Error approving plan:`, error);
      console.error(`❌ [APPROVE_API] Stack:`, error.stack);
      
      // Return JSON error (never crash)
      const isDev = process.env.NODE_ENV === 'development';
      res.status(500).json({ 
        ok: false,
        error: isDev ? error.message : 'Failed to approve plan',
        ...(isDev && { stack: error.stack })
      });
    }
  });
  
  // POST /api/plan/regenerate - Regenerate a plan (calls SUP-001)
  app.post("/api/plan/regenerate", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { planId } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const { getPlanById, rejectPlan, createLeadGenPlan } = await import('./leadgen-plan.js');
      
      // Reject the old plan
      const oldPlan = await getPlanById(planId);
      if (!oldPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      await rejectPlan(planId);
      
      // Create a new plan with the same goal
      const sessionId = getSessionId(req);
      const newPlan = await createLeadGenPlan(auth.userId, sessionId, oldPlan.goal, oldPlan.conversationId);
      
      console.log(`🔄 Plan regenerated: ${planId} → ${newPlan.id}`);
      
      res.json({
        success: true,
        plan: newPlan
      });
    } catch (error: any) {
      console.error("Error regenerating plan:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/plan/stop - Stop an executing plan
  app.post("/api/plan/stop", async (req, res) => {
    console.log(`📥 [STOP_API] POST /api/plan/stop received`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { planId } = req.body;
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const { getPlanById, updatePlanStatus } = await import('./leadgen-plan.js');
      
      const plan = await getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      // Only allow stopping if currently executing
      if (plan.status !== 'executing' && plan.status !== 'approved') {
        return res.status(400).json({ error: `Cannot stop plan in ${plan.status} state` });
      }
      
      // Update status to failed (acts as stopped)
      await updatePlanStatus(planId, 'failed');
      
      console.log(`🛑 Plan stopped: ${planId}`);
      
      res.json({
        success: true,
        planId,
        status: 'failed'
      });
    } catch (error: any) {
      console.error("Error stopping plan:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/debug/demo-plan-run", guardRoute('debug_demo_plan_run'));

  // GET /api/debug/last-plan - DEV ONLY: Get debug info about the last plan execution
  app.get("/api/debug/last-plan", async (req, res) => {
    // DEV ONLY - only allow in development
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ error: "Debug endpoint only available in development" });
    }
    
    const { getDebugState } = await import('./debugState.js');
    const debugState = getDebugState();
    
    res.json(debugState);
  });
  
  // POST /api/plan/start - Create a new plan for the current goal (SUP-001)
  app.post("/api/plan/start", guardRoute('plan_start_execution'));
  
  // POST /api/plan/create-test - Create a test plan for demo purposes (DEV ONLY)
  app.post("/api/plan/create-test", guardRoute('plan_create_test'));

  // =========================================
  // LEGACY ROUTE ALIASES
  // UI calls /approve, /start, /plan, /plan-status
  // These redirect to the /api/plan/* handlers
  // =========================================
  
  // Legacy: POST /approve → /api/plan/approve
  // Handles: POST /approve?planId=xxx or POST /approve with body { planId }
  app.post("/approve", async (req, res) => {
    console.log(`🔀 [LEGACY] POST /approve → delegating to /api/plan/approve handler`);
    
    // Merge query params into body (UI may pass planId in query string)
    const planId = req.body?.planId || req.query?.planId;
    if (planId) {
      req.body = { ...req.body, planId };
    }
    console.log(`   planId: ${planId}`);
    
    // Forward to the same logic as /api/plan/approve
    // We inline the delegation here to avoid Express router issues
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const { approvePlan, getPlanById, updatePlanStatus } = await import('./leadgen-plan.js');
      const { startPlanExecution, getPlanExecution } = await import('./leadgen-executor.js');
      
      const plan = await getPlanById(planId as string);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      // Guard against duplicate execution
      const existingExecution = getPlanExecution(planId as string);
      if (existingExecution) {
        return res.json({
          ok: true,
          success: true,
          planId: plan.id,
          status: existingExecution.status
        });
      }
      
      // Approve and persist
      const approvedPlan = await approvePlan(planId as string);
      if (!approvedPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      await updatePlanStatus(planId as string, 'executing');
      
      // Return success IMMEDIATELY
      res.json({
        ok: true,
        success: true,
        planId: approvedPlan.id,
        status: 'executing'
      });
      
      // Kick off execution asynchronously
      setImmediate(async () => {
        try {
          await startPlanExecution(approvedPlan);
        } catch (err: any) {
          console.error(`❌ [LEGACY /approve] Async execution failed:`, err.message);
          try {
            await updatePlanStatus(planId as string, 'failed');
          } catch {}
        }
      });
      
    } catch (error: any) {
      console.error(`❌ [LEGACY /approve] Error:`, error.message);
      res.status(500).json({ 
        error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to approve plan'
      });
    }
  });
  
  // Legacy: GET /approve (some UIs use GET with query params)
  app.get("/approve", async (req, res) => {
    console.log(`🔀 [LEGACY] GET /approve → delegating to approve handler`);
    
    const planId = req.query?.planId as string;
    console.log(`   planId: ${planId}`);
    
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const { approvePlan, getPlanById, updatePlanStatus } = await import('./leadgen-plan.js');
      const { startPlanExecution, getPlanExecution } = await import('./leadgen-executor.js');
      
      const plan = await getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      // Guard against duplicate execution
      const existingExecution = getPlanExecution(planId);
      if (existingExecution) {
        return res.json({
          ok: true,
          success: true,
          planId: plan.id,
          status: existingExecution.status
        });
      }
      
      // Approve and persist
      const approvedPlan = await approvePlan(planId);
      if (!approvedPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      await updatePlanStatus(planId, 'executing');
      
      // Return success IMMEDIATELY
      res.json({
        ok: true,
        success: true,
        planId: approvedPlan.id,
        status: 'executing'
      });
      
      // Kick off execution asynchronously
      setImmediate(async () => {
        try {
          await startPlanExecution(approvedPlan);
        } catch (err: any) {
          console.error(`❌ [LEGACY GET /approve] Async execution failed:`, err.message);
          try {
            await updatePlanStatus(planId, 'failed');
          } catch {}
        }
      });
      
    } catch (error: any) {
      console.error(`❌ [LEGACY GET /approve] Error:`, error.message);
      res.status(500).json({ 
        error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to approve plan'
      });
    }
  });
  
  // Legacy: POST /start → /api/plan/start
  app.post("/start", (req, res, next) => {
    console.log(`🔀 [LEGACY] POST /start → /api/plan/start`);
    // Merge query params into body
    req.body = { ...req.query, ...req.body };
    req.url = '/api/plan/start';
    app._router.handle(req, res, next);
  });
  
  // Legacy: GET /start (some UIs use GET with query params)
  app.get("/start", (req, res, next) => {
    console.log(`🔀 [LEGACY] GET /start → POST /api/plan/start`);
    req.body = { ...req.query, ...req.body };
    req.method = 'POST';
    req.url = '/api/plan/start';
    app._router.handle(req, res, next);
  });
  
  // Legacy: GET /plan-status → /api/plan-status
  app.get("/plan-status", (req, res, next) => {
    console.log(`🔀 [LEGACY] GET /plan-status → /api/plan-status`);
    req.url = '/api/plan-status';
    app._router.handle(req, res, next);
  });
  
  // Legacy: GET /plan → /api/plan
  app.get("/plan", (req, res, next) => {
    console.log(`🔀 [LEGACY] GET /plan → /api/plan`);
    req.url = '/api/plan';
    app._router.handle(req, res, next);
  });
  
  // Legacy: POST /plan → /api/plan/start (create new plan)
  app.post("/plan", (req, res, next) => {
    console.log(`🔀 [LEGACY] POST /plan → /api/plan/start`);
    req.url = '/api/plan/start';
    app._router.handle(req, res, next);
  });
  
  // Legacy: GET /plans → /api/plan (list plans)
  app.get("/plans", (req, res, next) => {
    console.log(`🔀 [LEGACY] GET /plans → /api/plan`);
    req.url = '/api/plan';
    app._router.handle(req, res, next);
  });
  
  // Legacy: GET /status → /api/plan-status
  app.get("/status", (req, res, next) => {
    console.log(`🔀 [LEGACY] GET /status → /api/plan-status`);
    req.url = '/api/plan-status';
    app._router.handle(req, res, next);
  });

  // =========================================
  // POST /api/search – OpenAI Responses API
  // (kept as you provided; unchanged in logic)
  // =========================================
  app.post("/api/search", guardRoute('search_google_places'));

  // Reset search conversation memory
  app.post("/api/search/reset", (req, res) => {
    const sessionId = getSessionId(req);
    resetConversation(sessionId);
    res.json({ status: "ok", message: "Search conversation reset." });
  });

  // =========================================
  // POST /api/tool/add_note – Bubble stub
  // =========================================
  app.post("/api/tool/add_note", async (req, res) => {
    try {
      const validation = addNoteRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const { userToken, leadId, note } = validation.data;

      console.log("📝 Add Note Request (Stub):", {
        userToken,
        leadId,
        note,
        timestamp: new Date().toISOString(),
      });

      res.json({ ok: true });
    } catch (error: any) {
      console.error("Add note error:", error);
      res
        .status(500)
        .json({ error: "Failed to add note", message: error.message });
    }
  });

  // =========================================
  // POST /api/tool/bubble_run_batch – Trigger Bubble workflows in batch
  // =========================================
  app.post("/api/tool/bubble_run_batch", guardRoute('bubble_run_batch'));

  // POST /api/places/verify – cross-check a venue, return Place ID + status
  app.post("/api/places/verify", guardRoute('places_verify'));

  // =========================================
  // POST /api/places/search - Places v1 discovery
  // =========================================
  app.post("/api/places/search", guardRoute('places_search'));

  // =========================================
  // POST /api/prospects/enrich - GPT enrichment via Responses API
  // =========================================
  app.post("/api/prospects/enrich", guardRoute('prospects_enrich'));

  // =========================================
  // POST /api/prospects/enrich_contacts - Contacts-only enrichment
  // =========================================
  app.post("/api/prospects/enrich_contacts", guardRoute('prospects_enrich_contacts'));

  // =========================================
  // POST /api/prospects/search_and_enrich - Combined endpoint
  // =========================================
  app.post("/api/prospects/search_and_enrich", guardRoute('prospects_search_and_enrich'));
  // ===========================
  // Region API Endpoints
  // ===========================
  
  // GET /api/regions/list
  app.get("/api/regions/list", async (req, res) => {
    try {
      const country = req.query.country as string;
      const granularity = req.query.granularity as string;
      const region_filter = req.query.region_filter as string | undefined;

      if (!country || !granularity) {
        return res.status(400).json({ 
          error: "country and granularity are required query parameters" 
        });
      }

      const { getRegions } = await import('./regions');
      const result = await getRegions(country, granularity, region_filter);

      return res.json(result);
    } catch (e: any) {
      console.error("regions/list error:", e);
      return res.status(500).json({ error: e.message || "Failed to fetch regions" });
    }
  });

  // GET /api/regions/debug/supported
  app.get("/api/regions/debug/supported", async (req, res) => {
    try {
      const { getSupportedDatasets } = await import('./regions');
      const datasets = await getSupportedDatasets();

      return res.json({
        datasets,
        total_datasets: Object.keys(datasets).length,
        total_regions: Object.values(datasets).reduce((sum, count) => sum + count, 0)
      });
    } catch (e: any) {
      console.error("regions/debug/supported error:", e);
      return res.status(500).json({ error: e.message || "Failed to get supported datasets" });
    }
  });

  // POST /api/regions/clear-cache
  app.post("/api/regions/clear-cache", async (req, res) => {
    try {
      const { clearRegionCache } = await import('./regions');
      const count = await clearRegionCache();

      return res.json({
        success: true,
        cleared_files: count,
        message: `Cleared ${count} cached region file(s)`
      });
    } catch (e: any) {
      console.error("regions/clear-cache error:", e);
      return res.status(500).json({ error: e.message || "Failed to clear cache" });
    }
  });

  // ===========================
  // POST /api/jobs/create
  // ===========================
  app.post("/api/jobs/create", async (req, res) => {
    try {
      const { jobCreateRequestSchema } = await import('@shared/schema');
      const validation = jobCreateRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }

      const { business_type, country, granularity, region_filter, userEmail } = validation.data;

      // Get regions
      const { getRegions } = await import('./regions');
      const regionsResult = await getRegions(country, granularity, region_filter);

      if (regionsResult.regions.length === 0) {
        return res.status(400).json({ 
          error: "No regions found matching the criteria" 
        });
      }

      // Create job
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();
      
      const job = {
        id: jobId,
        business_type,
        country,
        granularity,
        region_ids: regionsResult.regions.map(r => r.id),
        cursor: 0,
        processed: [],
        failed: [],
        status: "pending" as const,
        created_by_email: userEmail,
        created_at: now,
        updated_at: now,
      };

      const { storage } = await import('./storage');
      await storage.createJob(job);

      return res.json({
        jobId,
        total_regions: regionsResult.regions.length
      });
    } catch (e: any) {
      console.error("jobs/create error:", e);
      return res.status(500).json({ error: e.message || "Failed to create job" });
    }
  });

  // ===========================
  // POST /api/jobs/start
  // ===========================
  app.post("/api/jobs/start", async (req, res) => {
    try {
      const { jobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status === "done") {
        return res.status(400).json({ error: "Job is already completed" });
      }

      // THIN CLIENT: Delegate to Supervisor service
      const { supervisorClient } = await import('./lib/supervisorClient');
      
      try {
        const result = await supervisorClient.startJob('region_job', {
          jobId,
          businessType: job.business_type,
          country: job.country,
          regionIds: job.region_ids,
        }, {
          userId: 'system',
          clientRequestId: jobId,
        });
        
        if (result.delegatedToSupervisor) {
          // Successfully delegated to Supervisor
          await storage.updateJob(jobId, { status: "running" });
          return res.json({ 
            ok: true, 
            jobId, 
            supervisorJobId: result.jobId,
            status: "running",
            delegatedToSupervisor: true,
          });
        }
        
        // Fallback: Local execution enabled
        console.warn(`[JOBS] ⚠️ FALLBACK: Running job ${jobId} locally`);
        await storage.updateJob(jobId, { status: "running" });
        
        const { startJobWorker } = await import('./jobWorker');
        startJobWorker(jobId, {
          isFallback: true,
          userId: 'system',
          clientRequestId: jobId,
        });
        
        // Mark fallback completion when done (handled by jobWorker)
        return res.json({ 
          ok: true, 
          jobId, 
          status: "running",
          delegatedToSupervisor: false,
          fallback: true,
        });
        
      } catch (supervisorError: any) {
        // Check if fallback is enabled
        if (supervisorClient.isLocalFallbackEnabled()) {
          console.warn(`[JOBS] ⚠️ FALLBACK: Supervisor failed, running job ${jobId} locally: ${supervisorError.message}`);
          
          await storage.updateJob(jobId, { status: "running" });
          
          const { startJobWorker } = await import('./jobWorker');
          startJobWorker(jobId, {
            isFallback: true,
            userId: 'system',
            clientRequestId: jobId,
          });
          
          return res.json({ 
            ok: true, 
            jobId, 
            status: "running",
            delegatedToSupervisor: false,
            fallback: true,
            fallbackReason: supervisorError.message,
          });
        }
        
        // No fallback - return error
        console.error(`[JOBS] ❌ Supervisor delegation failed and fallback disabled: ${supervisorError.message}`);
        return res.status(503).json({ 
          error: "Supervisor unavailable and local fallback is disabled",
          details: supervisorError.message,
        });
      }
    } catch (e: any) {
      console.error("jobs/start error:", e);
      return res.status(500).json({ error: e.message || "Failed to start job" });
    }
  });

  // ===========================
  // POST /api/jobs/stop
  // ===========================
  app.post("/api/jobs/stop", async (req, res) => {
    try {
      const { jobId, supervisorJobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Try to cancel via Supervisor if we have a supervisor job ID
      const { supervisorClient } = await import('./lib/supervisorClient');
      
      if (supervisorJobId && supervisorClient.isSupervisorConfigured()) {
        try {
          await supervisorClient.cancelJob(supervisorJobId);
          console.log(`[JOBS] Cancelled supervisor job ${supervisorJobId}`);
        } catch (cancelError: any) {
          console.warn(`[JOBS] Failed to cancel supervisor job ${supervisorJobId}: ${cancelError.message}`);
        }
      }

      // Update job status to paused
      await storage.updateJob(jobId, { status: "paused" });

      // Stop the local worker if running (it will check status and pause)
      const { stopJobWorker } = await import('./jobWorker');
      stopJobWorker(jobId);
      
      // Log AFR event for job stop (in case worker wasn't actively running)
      if (supervisorClient.isLocalFallbackEnabled() && !supervisorJobId) {
        await supervisorClient.markFallbackPaused('region_job', jobId, 'Job stopped via API', {
          userId: 'system',
          clientRequestId: jobId,
        });
      }

      return res.json({ ok: true, jobId, status: "paused" });
    } catch (e: any) {
      console.error("jobs/stop error:", e);
      return res.status(500).json({ error: e.message || "Failed to stop job" });
    }
  });

  // ===========================
  // GET /api/jobs/status
  // ===========================
  app.get("/api/jobs/status", async (req, res) => {
    try {
      const { jobId } = req.query;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(String(jobId));
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Get region name for the most recent processed region
      let recent_region: string | undefined;
      if (job.processed.length > 0) {
        const { getRegions } = await import('./regions');
        const regionsResult = await getRegions(job.country, job.granularity);
        const lastProcessed = job.processed[job.processed.length - 1];
        const region = regionsResult.regions.find(r => r.id === lastProcessed);
        recent_region = region?.name;
      }

      const percent = job.region_ids.length > 0 
        ? Math.round((job.processed.length / job.region_ids.length) * 100)
        : 0;

      return res.json({
        jobId: job.id,
        business_type: job.business_type,
        status: job.status,
        processed_count: job.processed.length,
        total: job.region_ids.length,
        percent,
        recent_region,
        failed: job.failed || [],
        created_at: job.created_at,
        updated_at: job.updated_at,
      });
    } catch (e: any) {
      console.error("jobs/status error:", e);
      return res.status(500).json({ error: e.message || "Failed to get job status" });
    }
  });

  // NOTE: /api/regions/list is already registered above at line ~5240
  // Duplicate removed - see that route for region listing

  // ===========================
  // GET /api/location-hints/search
  // ===========================
  app.get("/api/location-hints/search", async (req, res) => {
    try {
      const { query, country, limit = '20', offset = '0' } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Missing required parameter: query" });
      }
      
      if (query.length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters long" });
      }
      
      const limitNum = Math.min(parseInt(limit as string) || 20, 100); // Cap at 100
      const offsetNum = parseInt(offset as string) || 0;
      const searchQuery = query.toLowerCase();
      const prefixPattern = `${searchQuery}%`;
      const containsPattern = `%${searchQuery}%`;
      
      let results;
      if (country && typeof country === 'string') {
        // Search within specific country - prefer prefix matches
        results = await sql`
          SELECT country, geonameid, subcountry, town_city 
          FROM location_hints 
          WHERE country = ${country}
            AND (
              lower(town_city) LIKE ${prefixPattern}
              OR lower(subcountry) LIKE ${prefixPattern}
              OR lower(town_city) LIKE ${containsPattern}
              OR lower(subcountry) LIKE ${containsPattern}
            )
          ORDER BY 
            CASE 
              WHEN lower(town_city) = ${searchQuery} THEN 1
              WHEN lower(town_city) LIKE ${prefixPattern} THEN 2
              WHEN lower(subcountry) = ${searchQuery} THEN 3
              WHEN lower(subcountry) LIKE ${prefixPattern} THEN 4
              ELSE 5
            END,
            town_city
          LIMIT ${limitNum} OFFSET ${offsetNum}
        `;
      } else {
        // Global search - use trigram similarity for better performance
        results = await sql`
          SELECT country, geonameid, subcountry, town_city,
            CASE 
              WHEN lower(town_city) = ${searchQuery} THEN 1
              WHEN lower(town_city) LIKE ${prefixPattern} THEN 2
              WHEN lower(subcountry) = ${searchQuery} THEN 3
              WHEN lower(subcountry) LIKE ${prefixPattern} THEN 4
              WHEN lower(country) = ${searchQuery} THEN 5
              WHEN lower(country) LIKE ${prefixPattern} THEN 6
              ELSE 7
            END as rank
          FROM location_hints 
          WHERE lower(town_city) LIKE ${containsPattern}
            OR lower(subcountry) LIKE ${containsPattern}
            OR lower(country) LIKE ${containsPattern}
          ORDER BY rank, town_city
          LIMIT ${limitNum} OFFSET ${offsetNum}
        `;
      }
      
      return res.json({ 
        results,
        limit: limitNum,
        offset: offsetNum,
        hasMore: results.length === limitNum
      });
    } catch (e: any) {
      console.error("location-hints/search error:", e);

      // Check if table doesn't exist
      if (e.message?.includes('relation "location_hints" does not exist') ||
          e.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Location hints feature not available",
          message: "The location_hints table has not been created yet. This feature requires additional setup.",
          available: false
        });
      }

      return res.status(500).json({ error: e.message || "Failed to search location hints" });
    }
  });

  // ===========================
  // GET /api/location-hints/countries
  // ===========================
  app.get("/api/location-hints/countries", async (req, res) => {
    try {
      const results = await sql`
        SELECT country, COUNT(*) as city_count
        FROM location_hints
        GROUP BY country
        ORDER BY country
      `;
      
      return res.json({ countries: results });
    } catch (e: any) {
      console.error("location-hints/countries error:", e);

      // Check if table doesn't exist
      if (e.message?.includes('relation "location_hints" does not exist') ||
          e.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Location hints feature not available",
          message: "The location_hints table has not been created yet. This feature requires additional setup.",
          available: false
        });
      }

      return res.status(500).json({ error: e.message || "Failed to get countries" });
    }
  });

  // ===========================
  // GET /api/location-hints/by-country
  // ===========================
  app.get("/api/location-hints/by-country", async (req, res) => {
    try {
      const { country, limit = '100' } = req.query;
      
      if (!country || typeof country !== 'string') {
        return res.status(400).json({ error: "Missing required parameter: country" });
      }
      
      const limitNum = parseInt(limit as string) || 100;
      
      const results = await sql`
        SELECT country, geonameid, subcountry, town_city 
        FROM location_hints 
        WHERE country = ${country}
        ORDER BY town_city
        LIMIT ${limitNum}
      `;
      
      return res.json({ results });
    } catch (e: any) {
      console.error("location-hints/by-country error:", e);

      // Check if table doesn't exist
      if (e.message?.includes('relation "location_hints" does not exist') ||
          e.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Location hints feature not available",
          message: "The location_hints table has not been created yet. This feature requires additional setup.",
          available: false
        });
      }

      return res.status(500).json({ error: e.message || "Failed to get location hints by country" });
    }
  });

  // ===========================
  // Deep Research API Routes
  // ===========================
  const {
    startBackgroundResponsesJob,
    getAllRuns,
    getRun,
    stopRun,
    duplicateRun,
    stripLargeOutput,
    enhancePromptWithContext,
    startVeryDeepProgram,
    getProgram,
    getAllPrograms,
  } = await import("./deepResearch");
  
  const { deepResearchCreateRequestSchema } = await import("@shared/schema");

  app.post("/api/deep-research", guardRoute('deep_research_create'));

  app.get("/api/deep-research", async (req, res) => {
    try {
      // Disable caching and ETags to ensure frontend gets real-time status updates
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.removeHeader('ETag');
      
      // DEV MODE: Auth is optional for Deep Research during development
      const auth = await getAuthenticatedUserId(req);
      // Use authenticated userId if available, otherwise fall back to query param or show all
      const userId = auth?.userId || (req.query.userId as string) || undefined;
      
      const runs = await getAllRuns(userId);
      res.json({ runs: runs.map(stripLargeOutput) });
    } catch (error: any) {
      console.error("Deep research list error:", error);

      // Graceful degradation for demo/new users or when database is unavailable
      if (error.message?.includes('relation "deep_research_runs" does not exist') ||
          error.message?.includes('fetch failed') ||
          (isDemoMode() && (error.cause?.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND')))) {
        console.warn('[DeepResearch] Database or tables unavailable, returning empty runs');
        return res.json({ runs: [] });
      }

      const apiError = analyzeDatabaseError(error, 'list deep research');
      res.status(500).json(apiError);
    }
  });

  app.get("/api/deep-research/:id", async (req, res) => {
    try {
      // DEV MODE: Auth is optional for Deep Research during development
      const run = await getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }

      // DEBUG: Log what we're returning
      console.log(`📊 GET /api/deep-research/${req.params.id}:`);
      console.log(`   Status: ${run.status}`);
      console.log(`   OutputText length: ${run.outputText?.length || 0}`);
      console.log(`   OutputText preview: ${run.outputText?.substring(0, 100) || '(none)'}...`);

      res.json({ run });
    } catch (error: any) {
      console.error("Deep research get error:", error);
      res.status(500).json({ error: error.message || "Failed to get research run" });
    }
  });

  app.post("/api/deep-research/:id/stop", async (req, res) => {
    try {
      // DEV MODE: Auth is optional for Deep Research during development
      const run = await stopRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }
      res.json({ run: stripLargeOutput(run) });
    } catch (error: any) {
      console.error("Deep research stop error:", error);
      res.status(500).json({ error: error.message || "Failed to stop research run" });
    }
  });

  app.post("/api/deep-research/:id/duplicate", async (req, res) => {
    try {
      // DEV MODE: Auth is optional for Deep Research during development
      const run = await duplicateRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }
      res.json({ run: stripLargeOutput(run) });
    } catch (error: any) {
      console.error("Deep research duplicate error:", error);
      res.status(500).json({ error: error.message || "Failed to duplicate research run" });
    }
  });

  // Record when a user views a deep research report (for tracking last viewed)
  app.post("/api/deep-research/:id/view", async (req, res) => {
    try {
      const runId = req.params.id;
      const sessionId = getSessionId(req);
      
      // Verify the run exists
      const run = await getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }
      
      // DEV MODE: Demo signup requirement removed for development
      // All users can view deep research reports
      
      // Track this as the last viewed run for this session
      await storage.setLastViewedRun(sessionId, runId);
      console.log(`📊 Tracked last viewed run for session ${sessionId}: ${runId}`);
      
      res.json({ ok: true, runId });
    } catch (error: any) {
      console.error("Track view error:", error);
      res.status(500).json({ error: error.message || "Failed to track view" });
    }
  });

  // Very Deep Program (multi-iteration research)
  app.post("/api/very-deep-program", async (req, res) => {
    try {
      const validation = deepResearchCreateRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }

      const sessionId = getSessionId(req);
      
      // Log what we're starting
      console.log(`🚀 Starting Very Deep Program for: "${validation.data.prompt}"`);
      
      // ENHANCE VAGUE PROMPTS using conversation context
      const { conversationId, userId } = validation.data;
      const enhancement = await enhancePromptWithContext(
        validation.data.prompt,
        conversationId,
        userId
      );
      
      const finalPrompt = enhancement.enhancedPrompt;
      
      if (!finalPrompt || finalPrompt.trim().length === 0) {
        return res.status(400).json({ 
          error: "Please specify a research topic." 
        });
      }
      
      const finalCounties = validation.data.counties || enhancement.context.regions;
      const finalWindowMonths = validation.data.windowMonths ?? enhancement.context.windowMonths;
      
      console.log(`📝 Very Deep Program - Original: "${validation.data.prompt}", Final: "${finalPrompt}"`);
      
      const program = await startVeryDeepProgram({
        prompt: finalPrompt,
        label: validation.data.label,
        mode: validation.data.mode,
        counties: finalCounties,
        windowMonths: finalWindowMonths,
      }, sessionId, userId);
      
      res.json({ program });
    } catch (error: any) {
      console.error("Very Deep Program creation error:", error);
      res.status(500).json({ error: error.message || "Failed to start very deep program" });
    }
  });

  // Get program status
  app.get("/api/very-deep-program/:id", async (req, res) => {
    try {
      const program = getProgram(req.params.id);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      res.json({ program });
    } catch (error: any) {
      console.error("Get program error:", error);
      res.status(500).json({ error: error.message || "Failed to get program" });
    }
  });

  // Summarize the last viewed deep research report
  app.post("/api/deep-research/summarize-last-viewed", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      
      // Get the last viewed run for this session
      const lastViewedRunId = await storage.getLastViewedRun(sessionId);
      
      if (!lastViewedRunId) {
        return res.status(404).json({ 
          error: "No viewed reports found. Please click on a deep research report in the sidebar first." 
        });
      }
      
      // Fetch the run
      const run = await getRun(lastViewedRunId);
      if (!run) {
        return res.status(404).json({ error: "Last viewed report no longer exists" });
      }
      
      if (run.status !== "completed") {
        return res.status(400).json({ 
          error: `Cannot summarize: report is ${run.status}. Please wait for it to complete.` 
        });
      }
      
      if (!run.outputText) {
        return res.status(400).json({ error: "Report has no content to summarize" });
      }
      
      console.log(`📝 Summarizing last viewed report: ${run.label} (${lastViewedRunId})`);
      
      // Call OpenAI to summarize the report
      const summaryPrompt = `Create a concise, executive summary of this deep-research report. Focus on the most important and actionable information.

Structure your summary as follows:

1. **Overview** (2-3 sentences): What was researched and what's the overall landscape?

2. **Key Findings** (bullet points): Highlight 3-5 most important discoveries, trends, or insights from the report.

3. **Notable Examples** (if applicable): Mention 2-3 specific businesses/organizations that stand out, with brief details (name, location, what makes them notable).

Keep it practical and UK-focused where relevant. Use clear, professional language. Avoid listing sources or URLs.

REPORT TO SUMMARIZE:
${run.outputText}`;

      const summaryResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert research analyst who creates clear, actionable summaries. Focus on practical insights and key information that business professionals need." },
          { role: "user", content: summaryPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.4,
      });
      
      const summary = summaryResponse.choices[0]?.message?.content || "No summary generated.";
      
      res.json({ 
        summary,
        reportLabel: run.label,
        reportId: lastViewedRunId,
      });
    } catch (error: any) {
      console.error("Summarize error:", error);
      res.status(500).json({ error: error.message || "Failed to summarize report" });
    }
  });

  // ===========================
  // SCHEDULED MONITORS API
  // ===========================
  
  // Create a new scheduled monitor
  app.post("/api/scheduled-monitors", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Check subscription limits
      const user = await storage.getUserById(auth.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const tier = user.subscriptionTier as keyof typeof TIER_LIMITS;
      if (!canCreateMonitor(tier, user.monitorCount)) {
        return res.status(403).json({ 
          error: "Monitor limit reached", 
          limit: TIER_LIMITS[tier].monitors,
          current: user.monitorCount,
          tier: TIER_LIMITS[tier].displayName,
        });
      }
      
      const { label, description, schedule, scheduleDay, scheduleTime, monitorType, config, emailAddress } = req.body;
      
      if (!label || !description || !schedule || !monitorType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const now = Date.now();
      const monitor = await storage.createScheduledMonitor({
        id: `monitor_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: auth.userId,
        conversationId: null,
        label,
        description,
        schedule,
        scheduleDay: scheduleDay || null,
        scheduleTime: scheduleTime || null,
        monitorType,
        config: config || null,
        isActive: 1,
        status: 'active', // User-created monitors are active by default
        suggestedBy: 'user', // Created by user action
        suggestedReason: null,
        suggestionMetadata: null,
        emailNotifications: 1, // Default to enabled
        emailAddress: emailAddress || null,
        nextRunAt: now + (schedule === 'daily' ? 86400000 : 604800000), // Basic calculation
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
      });
      
      // Increment monitor count
      await storage.incrementMonitorCount(auth.userId);
      
      res.json(monitor);
    } catch (error: any) {
      console.error("Error creating scheduled monitor:", error);
      res.status(500).json({ error: error.message || "Failed to create scheduled monitor" });
    }
  });
  
  // List scheduled monitors for a user
  app.get("/api/scheduled-monitors/:userId", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Only allow users to access their own monitors
      const requestedUserId = req.params.userId;
      if (requestedUserId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access monitors for ${requestedUserId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' data" });
      }
      
      const monitors = await storage.listScheduledMonitors(auth.userId);
      
      // Transform to camelCase for frontend compatibility
      const transformedMonitors = monitors.map((m: any) => ({
        ...m,
        conversationId: m.conversation_id || m.conversationId,
      }));
      
      res.json(transformedMonitors);
    } catch (error: any) {
      console.error("Error listing scheduled monitors:", error);
      res.status(500).json({ error: error.message || "Failed to list scheduled monitors" });
    }
  });
  
  // Get a single scheduled monitor
  app.get("/api/scheduled-monitors/detail/:id", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const monitor = await storage.getScheduledMonitor(id);
      if (!monitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      
      // SECURITY: Verify the monitor belongs to the authenticated user
      if (monitor.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access monitor ${id} owned by ${monitor.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' monitors" });
      }
      
      res.json(monitor);
    } catch (error: any) {
      console.error("Error getting scheduled monitor:", error);
      res.status(500).json({ error: error.message || "Failed to get scheduled monitor" });
    }
  });
  
  // Update a scheduled monitor
  app.patch("/api/scheduled-monitors/:id", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const updates = req.body;
      
      // SECURITY: Verify the monitor belongs to the authenticated user
      const existingMonitor = await storage.getScheduledMonitor(id);
      if (!existingMonitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      if (existingMonitor.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update monitor ${id} owned by ${existingMonitor.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other users' monitors" });
      }
      
      // Use provided emailAddress, or fallback to user's login email
      if (updates.emailNotifications === 1 && !updates.emailAddress) {
        updates.emailAddress = auth.userEmail;
      }
      
      // If schedule is being updated, recalculate nextRunAt and reactivate
      if (updates.schedule || updates.scheduleTime !== undefined || updates.scheduleDay !== undefined) {
        // Get current monitor to access all fields
        const currentMonitor = await storage.getScheduledMonitor(id);
        if (!currentMonitor) {
          return res.status(404).json({ error: "Monitor not found" });
        }
        
        const now = new Date();
        const schedule = updates.schedule || currentMonitor.schedule;
        const scheduleTime = updates.scheduleTime !== undefined ? updates.scheduleTime : currentMonitor.scheduleTime;
        const scheduleDay = updates.scheduleDay !== undefined ? updates.scheduleDay : currentMonitor.scheduleDay;
        
        let nextRun = new Date(now);
        
        // Handle "once" schedule - runs once at specified time today
        if (schedule === 'once') {
          // Reactivate the monitor when editing a "once" schedule
          updates.isActive = 1;
          
          if (scheduleTime) {
            const [hours, minutes] = scheduleTime.split(':').map(Number);
            nextRun.setHours(hours, minutes, 0, 0);
            
            // If time has already passed today, it won't run (user can change the time)
            if (nextRun <= now) {
              console.warn(`⚠️ "Once" schedule time ${scheduleTime} has already passed today`);
            }
          } else {
            // If no time specified for "once", run in 5 minutes
            nextRun = new Date(now.getTime() + 5 * 60 * 1000);
          }
        }
        // Parse time if provided for recurring schedules
        else if (scheduleTime) {
          const [hours, minutes] = scheduleTime.split(':').map(Number);
          nextRun.setHours(hours, minutes, 0, 0);
          
          // If time has passed today, move to next occurrence
          if (nextRun <= now) {
            if (schedule === 'daily') {
              nextRun.setDate(nextRun.getDate() + 1);
            } else if (schedule === 'weekly') {
              nextRun.setDate(nextRun.getDate() + 7);
            } else if (schedule === 'biweekly') {
              nextRun.setDate(nextRun.getDate() + 14);
            } else if (schedule === 'monthly') {
              nextRun.setMonth(nextRun.getMonth() + 1);
            }
          }
        } else {
          // No specific time, use interval from now
          if (schedule === 'daily') {
            nextRun.setDate(nextRun.getDate() + 1);
          } else if (schedule === 'weekly') {
            nextRun.setDate(nextRun.getDate() + 7);
          } else if (schedule === 'biweekly') {
            nextRun.setDate(nextRun.getDate() + 14);
          } else if (schedule === 'monthly') {
            nextRun.setMonth(nextRun.getMonth() + 1);
          }
        }
        
        updates.nextRunAt = nextRun.getTime();
        updates.updatedAt = Date.now();
      }
      
      const monitor = await storage.updateScheduledMonitor(id, updates);
      if (!monitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      
      res.json(monitor);
    } catch (error: any) {
      console.error("Error updating scheduled monitor:", error);
      res.status(500).json({ error: error.message || "Failed to update scheduled monitor" });
    }
  });
  
  // Delete a scheduled monitor
  app.delete("/api/scheduled-monitors/:id", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify the monitor belongs to the authenticated user
      const existingMonitor = await storage.getScheduledMonitor(id);
      if (!existingMonitor) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      if (existingMonitor.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete monitor ${id} owned by ${existingMonitor.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other users' monitors" });
      }
      
      const success = await storage.deleteScheduledMonitor(id);
      
      if (!success) {
        return res.status(404).json({ error: "Monitor not found" });
      }
      
      // Decrement monitor count
      await storage.decrementMonitorCount(auth.userId);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting scheduled monitor:", error);
      res.status(500).json({ error: "Failed to delete scheduled monitor" });
    }
  });

  // ============= SUGGESTED MONITORS (Agentic Proactive Suggestions) =============
  
  // List suggested monitors for a user
  app.get("/api/suggested-monitors/:userId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const requestedUserId = req.params.userId;
      if (requestedUserId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const suggestions = await storage.listSuggestedMonitors(auth.userId);
      res.json({ suggestions });
    } catch (error: any) {
      console.error("Error listing suggested monitors:", error);
      res.status(500).json({ error: error.message || "Failed to list suggested monitors" });
    }
  });
  
  // Approve a suggested monitor (convert to active)
  app.post("/api/suggested-monitors/:id/approve", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Verify ownership
      const suggestion = await storage.getScheduledMonitor(id);
      if (!suggestion || suggestion.userId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const approved = await storage.approveSuggestedMonitor(id);
      if (!approved) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      
      console.log(`✅ User ${auth.userEmail} approved suggested monitor: ${approved.label}`);
      res.json({ monitor: approved });
    } catch (error: any) {
      console.error("Error approving suggested monitor:", error);
      res.status(500).json({ error: error.message || "Failed to approve suggestion" });
    }
  });
  
  // Reject a suggested monitor (delete it)
  app.post("/api/suggested-monitors/:id/reject", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Verify ownership
      const suggestion = await storage.getScheduledMonitor(id);
      if (!suggestion || suggestion.userId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const rejected = await storage.rejectSuggestedMonitor(id);
      console.log(`❌ User ${auth.userEmail} rejected suggested monitor: ${suggestion.label}`);
      res.json({ success: rejected });
    } catch (error: any) {
      console.error("Error rejecting suggested monitor:", error);
      res.status(500).json({ error: error.message || "Failed to reject suggestion" });
    }
  });

  // Debug endpoints for viewing persistent memory
  // GET /api/debug/supabase - Debug Supabase configuration
  app.get("/api/debug/supabase", async (_req, res) => {
    try {
      const { isSupabaseConfigured, getSupabaseUrlForLogging } = await import('./supabase-client.js');
      
      const supabaseUrl = process.env.SUPABASE_URL || '(not set)';
      const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
      const isConfigured = isSupabaseConfigured();
      const urlForLogging = getSupabaseUrlForLogging();
      
      console.log(`[DEBUG] /api/debug/supabase called`);
      console.log(`   SUPABASE_URL: ${urlForLogging}`);
      console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${hasServiceRoleKey ? 'set (masked)' : 'NOT SET'}`);
      console.log(`   isConfigured: ${isConfigured}`);
      
      res.json({
        supabaseUrl: urlForLogging,
        hasServiceRoleKey,
        isConfigured,
        // Also include the raw URL (first 50 chars) for debugging
        rawUrlPrefix: supabaseUrl.substring(0, 50) + (supabaseUrl.length > 50 ? '...' : ''),
      });
    } catch (error: any) {
      console.error("Debug supabase error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug/supervisor", async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    try {
      const supervisorUrl = (process.env.SUPERVISOR_BASE_URL || '').replace(/\/+$/, '');
      console.log(`[DEBUG] /api/debug/supervisor called`);
      console.log(`   [SUPERVISOR_URL] ${supervisorUrl || '(not set)'}`);

      if (!supervisorUrl) {
        return res.json({
          configured: false,
          supervisorUrl: '(not set)',
          remoteEnv: null,
          error: 'SUPERVISOR_BASE_URL not configured',
        });
      }

      const envUrl = `${supervisorUrl}/api/debug/env`;
      console.log(`   Fetching: ${envUrl}`);
      const upstream = await fetch(envUrl, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) {
        const errText = await upstream.text();
        console.log(`   ❌ Supervisor /api/debug/env returned ${upstream.status}: ${errText}`);
        return res.json({
          configured: true,
          supervisorUrl,
          remoteEnv: null,
          error: `Supervisor returned ${upstream.status}: ${errText}`,
        });
      }
      const remoteEnv = await upstream.json();
      console.log(`   ✅ Supervisor /api/debug/env response:`, JSON.stringify(remoteEnv));
      return res.json({
        configured: true,
        supervisorUrl,
        remoteEnv,
      });
    } catch (error: any) {
      console.error("[DEBUG] supervisor probe error:", error.message);
      return res.status(500).json({
        configured: !!process.env.SUPERVISOR_BASE_URL,
        supervisorUrl: process.env.SUPERVISOR_BASE_URL || '(not set)',
        remoteEnv: null,
        error: error.message,
      });
    }
  });

  app.get("/api/debug/conversations", async (_req, res) => {
    try {
      const conversations = await storage.listAllConversations();
      res.json({ conversations });
    } catch (error: any) {
      console.error("Debug conversations error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch conversations" });
    }
  });

  app.get("/api/debug/conversations/:id/messages", async (req, res) => {
    try {
      const messages = await storage.getConversationMessages(req.params.id);
      res.json({ messages });
    } catch (error: any) {
      console.error("Debug messages error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch messages" });
    }
  });

  app.get("/api/debug/facts", async (_req, res) => {
    try {
      const facts = await storage.getAllFacts();
      res.json({ facts });
    } catch (error: any) {
      console.error("Debug facts error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch facts" });
    }
  });

  // ===========================
  // INTEGRATIONS - DIRECT OAUTH (XERO)
  // ===========================
  
  // Register Xero OAuth routes
  app.use("/api/integrations/xero", createXeroOAuthRouter(storage));
  
  // Register Xero Sync routes (webhooks and two-way sync)
  const xeroSyncRouter = createXeroSyncRouter(storage);
  app.use("/api/xero", xeroSyncRouter);

  // Register Untappd routes (beer data import)
  app.use("/api/untappd", createUntappdRouter(storage));

  // Register Sleeper Agent routes (AI-powered pub and event discovery)
  app.use("/api/sleeper-agent", createSleeperAgentRouter(storage));
  
  // Register Things (Events) routes
  app.use("/api/things", createThingsRouter(storage));
  
  // Register Entity Review routes (manual review queue)
  app.use("/api/entity-review", createEntityReviewRouter(storage));
  
  // Register Dev Tools routes (sleeper agent monitoring)
  app.use("/api/dev", createDevToolsRouter(storage));
  
  // Register Database Maintenance routes (admin only)
  app.use("/api/admin/maintenance", createDatabaseMaintenanceRouter(storage));
  
  // Register Monitors routes (admin only - manual monitor-worker trigger)
  app.use("/api/admin/monitors", createMonitorsRouter(storage));

  // Register Suppliers routes
  app.use("/api/suppliers", createSuppliersRouter(storage));

  // Register Activity Log routes (local system activity tracking)
  app.use("/api/activity-log", createActivityLogRouter(storage));

  // Register Agent Activities routes (autonomous agent activity feed)
  app.use(agentActivitiesRouter(storage));

  // Register AFR (Agent Flight Recorder) routes - dev inspector API
  app.use("/api/afr", createAfrRouter(storage));

  app.use("/api/telemetry", createTelemetryRouter());

  // Register Proof routes - Tower loop proof endpoint
  app.use("/api/proof", createProofRouter(storage));

  // Register Supervisor routes - Tower judgement request
  app.use("/api/supervisor", createSupervisorRouter());
  console.log('✅ Supervisor routes mounted at /api/supervisor');
  console.log(`[ROUTES] Supervisor execution enabled: ${process.env.SUPERVISOR_EXECUTION_ENABLED === 'true'}`);

  // Register Route Planner routes
  app.use("/api", routePlannerRoutes);

  // Register Driver routes (mobile driver interface)
  app.use("/api/driver", driverRoutes);
  console.log('✅ Driver routes mounted at /api/driver');

  // Register Admin routes (user management, role admin)
  app.use("/api/admin", adminRoutes);
  console.log('✅ Admin routes mounted at /api/admin');

  // Register Organisation routes (multi-tenant org management)
  app.use("/api/org", orgRoutes);
  console.log('✅ Organisation routes mounted at /api/org');

  // ===========================
  // INTEGRATIONS (NANGO.DEV CRM/ACCOUNTING CONNECTIONS)
  // ===========================
  
  // Get Nango authorization URL (uses Nango API for correct URL)
  app.post("/api/integrations/authorization-url", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validation = createIntegrationRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }
      
      const { provider } = validation.data;
      
      const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY;
      const NANGO_HOST = process.env.NANGO_HOST || "https://api.nango.dev";
      
      if (!NANGO_SECRET_KEY) {
        return res.status(500).json({ error: "Nango integration not configured" });
      }
      
      console.log(`🔗 Requesting authorization URL from Nango for ${auth.userEmail} - ${provider}`);
      
      // Get authorization URL from Nango API
      const nangoUrl = `${NANGO_HOST}/connection/${auth.userId}/authorization-url?provider_config_key=${provider}`;
      const nangoResponse = await fetch(nangoUrl, {
        headers: {
          'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
        },
      });
      
      if (!nangoResponse.ok) {
        const errorData = await nangoResponse.json();
        console.error('❌ Nango authorization URL error:', errorData);
        return res.status(500).json({ 
          error: "Failed to get authorization URL from Nango",
          details: errorData 
        });
      }
      
      const data = await nangoResponse.json();
      const authorizationUrl = data.url;
      
      console.log(`✅ Got authorization URL: ${authorizationUrl}`);
      
      res.json({ 
        authorizationUrl,
        provider 
      });
    } catch (error: any) {
      console.error("Authorization URL error:", error);
      res.status(500).json({ 
        error: "Failed to generate authorization URL",
        details: error.message 
      });
    }
  });
  
  // OAuth callback (handles redirect from Nango after OAuth)
  app.get("/api/integrations/oauth-callback", async (req, res) => {
    try {
      const { connection_id, provider_config_key } = req.query;
      
      console.log(`🔄 OAuth callback received for connection: ${connection_id}, provider: ${provider_config_key}`);
      
      // Close the popup and signal success
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connection Successful</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 1rem;
                backdrop-filter: blur(10px);
              }
              .checkmark {
                font-size: 4rem;
                margin-bottom: 1rem;
              }
              h1 { margin: 0 0 0.5rem 0; }
              p { margin: 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="checkmark">✓</div>
              <h1>Connected Successfully!</h1>
              <p>You can close this window</p>
            </div>
            <script>
              // Signal parent window and auto-close after 2 seconds
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-success', provider: '${provider_config_key}' }, '*');
              }
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Connection Failed</title></head>
          <body>
            <h1>Connection Failed</h1>
            <p>${error.message}</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    }
  });
  
  // DEPRECATED: Old Nango webhook routes - replaced with direct OAuth
  // Commented out after migrating to direct Xero OAuth integration
  /*
  app.post("/api/integrations/nango-webhook", async (req, res) => {
    // ... Nango webhook handling code removed ...
  });
  
  app.get("/api/integrations/verify/:provider", async (req, res) => {
    // ... Nango verify code removed ...
  });
  */
  
  // List user's integrations
  app.get("/api/integrations", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const integrations = await storage.listIntegrations(auth.userId);
      res.json({ integrations });
    } catch (error: any) {
      console.error("List integrations error:", error);
      res.status(500).json({ error: error.message || "Failed to list integrations" });
    }
  });
  
  // Delete integration
  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // Verify ownership
      const integration = await storage.getIntegration(id);
      if (!integration || integration.userId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const deleted = await storage.deleteIntegration(id);
      console.log(`🗑️ User ${auth.userEmail} deleted integration: ${integration.provider}`);
      res.json({ success: deleted });
    } catch (error: any) {
      console.error("Delete integration error:", error);
      res.status(500).json({ error: error.message || "Failed to delete integration" });
    }
  });

  // ============= BATCH JOB ROUTES =============
  // Create batch job (Google Places + Hunter.io + SalesHandy pipeline)
  app.post("/api/batch/create", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { createBatchJobRequestSchema } = await import("@shared/schema");
      const validatedData = createBatchJobRequestSchema.parse(req.body);

      // Check required API keys
      const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
      const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
      const SALESHANDY_TOKEN = process.env.SALES_HANDY_API_TOKEN;
      const SALESHANDY_CAMPAIGN_ID = process.env.SALES_HANDY_CAMPAIGN_ID;

      if (!GOOGLE_API_KEY) {
        return res.status(400).json({ error: "GOOGLE_PLACES_API_KEY not configured" });
      }
      if (!HUNTER_API_KEY) {
        return res.status(400).json({ error: "HUNTER_API_KEY not configured" });
      }
      if (!SALESHANDY_TOKEN || !SALESHANDY_CAMPAIGN_ID) {
        return res.status(400).json({ error: "SalesHandy not configured (SALES_HANDY_API_TOKEN, SALES_HANDY_CAMPAIGN_ID)" });
      }

      const crypto = await import("crypto");
      const batchId = crypto
        .createHash("sha256")
        .update(`${validatedData.query}|${validatedData.location}|${Date.now()}`)
        .digest("hex")
        .slice(0, 12);

      // Create batch job record
      await storage.createBatchJob({
        id: batchId,
        userId: auth.userId,
        status: "running",
        query: validatedData.query,
        location: validatedData.location,
        country: validatedData.country,
        targetRole: validatedData.targetRole || "Head of Sales",
        limit: validatedData.limit || 60,
        personalize: validatedData.personalize ? 1 : 0,
        campaignId: validatedData.campaignId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      console.log(`📦 Batch job ${batchId} created for ${auth.userEmail}`);

      // Execute batch job asynchronously
      (async () => {
        try {
          const { executeBatchJob } = await import("./batchService");
          
          const result = await executeBatchJob({
            query: validatedData.query,
            location: validatedData.location,
            country: validatedData.country,
            targetRole: validatedData.targetRole || "Head of Sales",
            limit: validatedData.limit || 60,
            personalize: validatedData.personalize !== false,
            campaignId: validatedData.campaignId,
            googleApiKey: GOOGLE_API_KEY,
            hunterApiKey: HUNTER_API_KEY,
            salesHandyToken: SALESHANDY_TOKEN,
            salesHandyCampaignId: SALESHANDY_CAMPAIGN_ID,
            salesHandySenderId: process.env.SALES_HANDY_SENDER_ID,
            openaiKey: process.env.OPENAI_API_KEY,
          });

          // Update batch job with results
          await storage.updateBatchJob(batchId, {
            status: "completed",
            items: result.items as any,
            totalFound: result.items.length,
            totalSent: result.created.length,
            totalSkipped: result.skipped.length,
            completedAt: Date.now(),
          });

          console.log(`✅ Batch job ${batchId} completed: ${result.created.length}/${result.items.length} sent`);
        } catch (error: any) {
          console.error(`❌ Batch job ${batchId} failed:`, error);
          await storage.updateBatchJob(batchId, {
            status: "failed",
            error: error.message || String(error),
            completedAt: Date.now(),
          });
        }
      })();

      // Return immediate response
      res.json({ batchId, status: "running" });
    } catch (error: any) {
      console.error("Create batch job error:", error);
      res.status(500).json({ error: error.message || "Failed to create batch job" });
    }
  });

  // Get batch job status
  app.get("/api/batch/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const job = await storage.getBatchJob(id);

      if (!job) {
        return res.status(404).json({ error: "Batch job not found" });
      }

      // Verify ownership
      if (job.userId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      res.json(job);
    } catch (error: any) {
      console.error("Get batch job error:", error);
      res.status(500).json({ error: error.message || "Failed to get batch job" });
    }
  });

  // List batch jobs for user
  app.get("/api/batch", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const jobs = await storage.listBatchJobs(auth.userId);
      res.json({ jobs });
    } catch (error: any) {
      console.error("List batch jobs error:", error);
      res.status(500).json({ error: error.message || "Failed to list batch jobs" });
    }
  });

  // Serve logo for email templates
  app.get("/assets/logo.png", async (_req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const logoPath = path.resolve('attached_assets/wyshbone-logo_1761839337577.png');
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      const logoBuffer = fs.readFileSync(logoPath);
      res.send(logoBuffer);
    } catch (error: any) {
      console.error("Error serving logo:", error);
      res.status(404).send('Logo not found');
    }
  });

  // Export API endpoints - for external status monitoring and AI analysis
  app.get("/export/status.json", async (req, res) => {
    console.log('🔍 Export status.json endpoint hit');
    try {
      const providedKey = req.headers['x-export-key'] as string | undefined;
      console.log('🔑 Checking key:', providedKey ? 'provided' : 'missing');
      
      if (!providedKey || providedKey !== EXPORT_KEY) {
        console.log('❌ Invalid or missing export key');
        return res.status(403).json({ error: 'Invalid or missing X-EXPORT-KEY header' });
      }

      console.log('✅ Export key valid, generating summary...');
      const summary = await getSummary();
      console.log(`📊 Summary generated: ${summary.totals.files} files, ${summary.totals.loc} LOC`);
      res.json(summary);
    } catch (error: any) {
      console.error("❌ Export status error:", error);
      res.status(500).json({ error: error.message || 'Failed to generate status summary' });
    }
  });

  app.get("/export/file", async (req, res) => {
    console.log('🔍 Export file endpoint hit, path:', req.query.path);
    try {
      const providedKey = req.headers['x-export-key'] as string | undefined;
      
      if (!providedKey || providedKey !== EXPORT_KEY) {
        console.log('❌ Invalid or missing export key');
        return res.status(403).json({ error: 'Invalid or missing X-EXPORT-KEY header' });
      }

      const requestedPath = req.query.path as string | undefined;
      
      if (!requestedPath) {
        console.log('❌ Missing path parameter');
        return res.status(400).json({ error: 'Missing required query parameter: path' });
      }

      console.log('✅ Reading file:', requestedPath);
      const fileData = await getFileContent(requestedPath);
      console.log(`📄 File read successfully: ${fileData.path}`);
      res.json(fileData);
    } catch (error: any) {
      console.error("❌ Export file error:", error.message);
      
      if (error.message.includes('not in whitelist')) {
        return res.status(404).json({ error: 'File not found or not accessible' });
      }
      
      res.status(500).json({ error: error.message || 'Failed to read file' });
    }
  });

  // ===========================
  // POST /api/tower/chat-test – Tower testing endpoint with export-key auth
  // ===========================
  app.post("/api/tower/chat-test", async (req, res) => {
    console.log('🏢 POST /api/tower/chat-test received from Tower');
    
    try {
      // AUTHENTICATION: Validate export key
      if (!validateExportKey(req)) {
        console.log('❌ Invalid or missing X-EXPORT-KEY header');
        return res.status(401).json({ error: "Unauthorized" });
      }
      console.log('✅ Export key validated for Tower');

      // Validate request body against chat schema
      const validation = chatRequestSchema.safeParse(req.body);
      if (!validation.success) {
        console.log('❌ Validation failed:', validation.error);
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }

      const { messages, user, defaultCountry, conversationId: requestedConversationId } = validation.data;
      console.log('📝 Tower chat request for user:', user.id, user.email);

      // Get or create persistent conversation
      const conversationId = await getOrCreateConversation(user.id, requestedConversationId);
      console.log(`💬 Using conversation ID: ${conversationId}`);

      // Prepare streaming headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send conversationId to client as first event
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);

      // Extract latest user message
      const latestUserText = messages?.length ? String(messages[messages.length - 1].content) : "";
      
      // Save user message to database
      await saveMessage(conversationId, "user", latestUserText);
      console.log("💾 Saved user message to database");

      // Update conversation label if this is the first message
      await updateConversationLabel(conversationId, latestUserText);

      // Load conversation history from database
      const conversationHistory = await loadConversationHistory(conversationId);
      console.log(`📚 Loaded ${conversationHistory.length} messages from history`);

      // Get user context for personalization (optional for test users)
      // Tower may send synthetic test users that don't exist in storage
      let userSessionContext: SessionContext | undefined = undefined;
      
      try {
        const currentUser = await storage.getUserById(user.id);
        if (currentUser) {
          userSessionContext = buildSessionContext({
            companyName: currentUser.companyName ?? null,
            companyDomain: currentUser.companyDomain ?? null,
            roleHint: currentUser.roleHint ?? null,
            primaryObjective: currentUser.primaryObjective ?? null,
            secondaryObjectives: currentUser.secondaryObjectives ?? null,
            targetMarkets: currentUser.targetMarkets ?? null,
            productsOrServices: currentUser.productsOrServices ?? null,
            preferences: currentUser.preferences ?? null,
            inferredIndustry: currentUser.inferredIndustry ?? null,
            confidence: currentUser.confidence ?? null,
          } as any);
          
          console.log(`🎯 User context loaded for Tower test`);
        } else {
          console.log(`ℹ️ Test user ${user.id} not in storage - using default context`);
        }
      } catch (userError: any) {
        // Gracefully handle missing user for Tower test users
        console.log(`ℹ️ Could not load user context for ${user.id} - using default context`);
      }

      // Build context with facts (personalized system prompt if context available)
      const memoryMessages = await buildContextWithFacts(user.id, conversationHistory, 20, userSessionContext);
      console.log(`🧠 Built context with facts for user ${user.id}`);

      // Call OpenAI Chat Completions API with streaming
      console.log(`🌐 Calling Chat Completions API for Tower test...`);
      
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: memoryMessages as any,
        stream: true,
      });

      console.log("✅ Chat stream started for Tower");
      
      let aiBuffer = "";

      const isNewSearch = /\b(find|search|get|show|list|lookup|discover|run|trigger|execute)\b.*\b(in|for|at|across)\b/i.test(latestUserText);

      // Stream response chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta.content) {
          aiBuffer += delta.content;
          res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          // @ts-ignore
          if (res.flush) res.flush();
        }
      }

      // Save assistant response to database
      await saveMessage(conversationId, "assistant", aiBuffer);
      console.log("💾 Saved assistant message to database");

      // Send completion signal
      res.write(`data: [DONE]\n\n`);
      res.end();
      
      console.log('✅ Tower chat test completed successfully');

    } catch (error: any) {
      console.error("❌ Tower chat test error:", error);
      
      // If headers not sent yet, send error as JSON
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: "Chat processing failed", 
          details: error.message 
        });
      }
      
      // If streaming already started, send error as SSE and end
      res.write(`data: ${JSON.stringify({ 
        error: error.message || "Unknown error" 
      })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  });

  // ============================================================
  // CRM ROUTES (Core Multi-Vertical CRM)
  // ============================================================
  
  // GET /api/crm/settings/:workspaceId - Get CRM settings (auto-creates if not exists)
  app.get("/api/crm/settings/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { workspaceId } = req.params;

      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access settings for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }

      // Get existing settings or create defaults if not exists
      let settings = await storage.getCrmSettings(workspaceId);

      if (!settings) {
        // Auto-create default settings for new workspace
        console.log(`📝 Creating default CRM settings for workspace ${workspaceId}`);
        const defaultSettings = {
          id: `crm-settings-${workspaceId}-${Date.now()}`,
          workspaceId,
          industryVertical: 'generic',
          defaultCountry: 'United Kingdom',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        settings = await storage.createCrmSettings(defaultSettings);
      }

      res.json(settings);
    } catch (error: any) {
      // Demo mode fallback: return default settings
      if (error.cause?.code === 'ENOTFOUND' && req.params.workspaceId === 'demo-user') {
        console.warn('[CRM] Database DNS failed for demo-user settings, returning defaults');
        return res.json({
          id: 'demo-settings',
          workspaceId: 'demo-user',
          industryVertical: 'breweries',
          defaultCountry: 'GB',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      console.error("Error getting CRM settings:", error);
      res.status(500).json({ error: error.message || "Failed to get settings" });
    }
  });
  
  // POST /api/crm/settings - Create CRM settings
  app.post("/api/crm/settings", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertCrmSettingsSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const settings = await storage.createCrmSettings({
        id: `crm_settings_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        industryVertical: data.industryVertical || 'generic',
        defaultCountry: data.defaultCountry || 'United Kingdom',
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error creating CRM settings:", error);
      res.status(500).json({ error: error.message || "Failed to create settings" });
    }
  });
  
  // PATCH /api/crm/settings/:id - Update CRM settings
  app.patch("/api/crm/settings/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify settings exist and belong to authenticated user's workspace
      const existing = await storage.getCrmSettingsById(id);
      if (!existing) {
        return res.status(404).json({ error: "Settings not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update settings ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertCrmSettingsSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const settings = await storage.updateCrmSettings(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error updating CRM settings:", error);
      res.status(500).json({ error: error.message || "Failed to update settings" });
    }
  });

  // DELETE /api/crm/sample-data/:workspaceId - Clear all sample data for onboarding
  app.delete("/api/crm/sample-data/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { workspaceId } = req.params;

      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Delete sample customers, products, and orders
      const deletedCustomers = await storage.deleteSampleCustomers(workspaceId);
      const deletedProducts = await storage.deleteSampleProducts(workspaceId);
      const deletedOrders = await storage.deleteSampleOrders(workspaceId);

      res.json({
        success: true,
        deleted: {
          customers: deletedCustomers,
          products: deletedProducts,
          orders: deletedOrders,
        },
      });
    } catch (error: any) {
      console.error("Error deleting sample data:", error);
      res.status(500).json({ error: error.message || "Failed to delete sample data" });
    }
  });

  // GET /api/crm/customers/:workspaceId - List customers
  app.get("/api/crm/customers/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access customers for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const customers = await storage.listCrmCustomers(workspaceId);
      
      res.json(customers);
    } catch (error: any) {
      // Demo mode fallback: return empty array
      if (error.cause?.code === 'ENOTFOUND' && req.params.workspaceId === 'demo-user') {
        console.warn('[CRM] Database DNS failed for demo-user customers, returning empty array');
        return res.json([]);
      }
      console.error("Error listing customers:", error);
      res.status(500).json({ error: error.message || "Failed to list customers" });
    }
  });
  
  // GET /api/crm/customers/search/:workspaceId - Search customers
  app.get("/api/crm/customers/search/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      const { q } = req.query;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to search customers for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: "Search query required" });
      }
      
      const customers = await storage.searchCrmCustomers(workspaceId, q);
      
      res.json(customers);
    } catch (error: any) {
      console.error("Error searching customers:", error);
      res.status(500).json({ error: error.message || "Failed to search customers" });
    }
  });
  
  // GET /api/crm/customers/detail/:id - Get single customer
  app.get("/api/crm/customers/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const customer = await storage.getCrmCustomer(id);
      
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // SECURITY: Verify customer belongs to authenticated user's workspace
      if (customer.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access customer ${id} owned by workspace ${customer.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(customer);
    } catch (error: any) {
      console.error("Error getting customer:", error);
      res.status(500).json({ error: error.message || "Failed to get customer" });
    }
  });
  
  // POST /api/crm/customers - Create customer
  app.post("/api/crm/customers", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema (omit workspaceId - set from auth)
      const validationResult = insertCrmCustomerSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID (1:1 mapping)
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const customer = await storage.createCrmCustomer({
        id: `customer_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        name: data.name,
        primaryContactName: data.primaryContactName || null,
        email: data.email || null,
        phone: data.phone || null,
        addressLine1: data.addressLine1 || null,
        addressLine2: data.addressLine2 || null,
        city: data.city || null,
        postcode: data.postcode || null,
        country: data.country || 'United Kingdom',
        notes: data.notes || null,
        xeroSyncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      
      // Auto-sync to Xero if connected (async, don't block response)
      if ((xeroSyncRouter as any).syncCustomerToXero) {
        (xeroSyncRouter as any).syncCustomerToXero(customer.id, workspaceId).catch((error: any) => {
          console.error(`Auto-sync customer ${customer.id} to Xero failed:`, error.message);
        });
      }
      
      res.json(customer);
    } catch (error: any) {
      console.error("Error creating customer:", error);
      res.status(500).json({ error: error.message || "Failed to create customer" });
    }
  });
  
  // PATCH /api/crm/customers/:id - Update customer
  app.patch("/api/crm/customers/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify customer exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmCustomer(id);
      if (!existing) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update customer ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertCrmCustomerSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const customer = await storage.updateCrmCustomer(id, {
        ...validationResult.data,
        xeroSyncStatus: 'pending',
        updatedAt: Date.now(),
      });
      
      // Auto-sync update to Xero if connected (async, don't block response)
      if ((xeroSyncRouter as any).updateCustomerInXero) {
        (xeroSyncRouter as any).updateCustomerInXero(id, existing.workspaceId).catch((error: any) => {
          console.error(`Auto-sync customer update ${id} to Xero failed:`, error.message);
        });
      }
      
      res.json(customer);
    } catch (error: any) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: error.message || "Failed to update customer" });
    }
  });
  
  // DELETE /api/crm/customers/:id - Delete customer
  app.delete("/api/crm/customers/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify customer exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmCustomer(id);
      if (!existing) {
        return res.status(404).json({ error: "Customer not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete customer ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteCrmCustomer(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      res.status(500).json({ error: error.message || "Failed to delete customer" });
    }
  });
  
  // GET /api/crm/delivery-runs/:workspaceId - List delivery runs
  app.get("/api/crm/delivery-runs/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      const { status } = req.query;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access delivery runs for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      let runs;
      if (status && typeof status === 'string') {
        runs = await storage.listCrmDeliveryRunsByStatus(workspaceId, status);
      } else {
        runs = await storage.listCrmDeliveryRuns(workspaceId);
      }
      
      res.json(runs);
    } catch (error: any) {
      console.error("Error listing delivery runs:", error);
      res.status(500).json({ error: error.message || "Failed to list delivery runs" });
    }
  });
  
  // GET /api/crm/delivery-runs/detail/:id - Get single delivery run
  app.get("/api/crm/delivery-runs/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const run = await storage.getCrmDeliveryRun(id);
      
      if (!run) {
        return res.status(404).json({ error: "Delivery run not found" });
      }
      
      // SECURITY: Verify delivery run belongs to authenticated user's workspace
      if (run.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access delivery run ${id} owned by workspace ${run.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(run);
    } catch (error: any) {
      console.error("Error getting delivery run:", error);
      res.status(500).json({ error: error.message || "Failed to get delivery run" });
    }
  });
  
  // POST /api/crm/delivery-runs - Create delivery run
  app.post("/api/crm/delivery-runs", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertCrmDeliveryRunSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const run = await storage.createCrmDeliveryRun({
        id: `delivery_run_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        name: data.name,
        driverName: data.driverName || null,
        vehicle: data.vehicle || null,
        scheduledDate: data.scheduledDate,
        status: data.status || 'planned',
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(run);
    } catch (error: any) {
      console.error("Error creating delivery run:", error);
      res.status(500).json({ error: error.message || "Failed to create delivery run" });
    }
  });
  
  // PATCH /api/crm/delivery-runs/:id - Update delivery run
  app.patch("/api/crm/delivery-runs/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify delivery run exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmDeliveryRun(id);
      if (!existing) {
        return res.status(404).json({ error: "Delivery run not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update delivery run ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertCrmDeliveryRunSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const run = await storage.updateCrmDeliveryRun(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(run);
    } catch (error: any) {
      console.error("Error updating delivery run:", error);
      res.status(500).json({ error: error.message || "Failed to update delivery run" });
    }
  });
  
  // DELETE /api/crm/delivery-runs/:id - Delete delivery run
  app.delete("/api/crm/delivery-runs/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify delivery run exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmDeliveryRun(id);
      if (!existing) {
        return res.status(404).json({ error: "Delivery run not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete delivery run ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      const success = await storage.deleteCrmDeliveryRun(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting delivery run:", error);
      res.status(500).json({ error: error.message || "Failed to delete delivery run" });
    }
  });
  
  // ============================================================
  // GENERIC CRM PRODUCTS ROUTES
  // ============================================================
  
  // GET /api/crm/products/:workspaceId - List products
  app.get("/api/crm/products/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { workspaceId } = req.params;

      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access products for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }

      const products = await storage.listCrmProducts(workspaceId);

      res.json(products);
    } catch (error: any) {
      // Demo mode fallback: return empty array if database is unavailable
      const errorMsg = error.message || '';
      const causeMsg = error.cause?.message || '';
      const isDbUnavailable = 
        error.cause?.code === 'ENOTFOUND' ||
        errorMsg.includes('does not exist') ||
        causeMsg.includes('does not exist') ||
        errorMsg.includes('ECONNREFUSED') ||
        causeMsg.includes('ECONNREFUSED');
      
      if (isDbUnavailable && isDemoMode()) {
        console.warn('[CRM] Database unavailable in demo mode, returning empty products array');
        return res.json([]);
      }
      
      console.error("[CRM Products] Error listing products:", error);
      const apiError = analyzeDatabaseError(error, 'list products');
      res.status(500).json({ 
        error: apiError.message,
        code: apiError.code,
        message: apiError.message,
        hint: apiError.hint
      });
    }
  });
  
  // GET /api/crm/products/detail/:id - Get single product
  app.get("/api/crm/products/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const product = await storage.getCrmProduct(id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // SECURITY: Verify product belongs to authenticated user's workspace
      if (product.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access product ${id} owned by workspace ${product.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(product);
    } catch (error: any) {
      console.error("Error getting product:", error);
      res.status(500).json({ error: error.message || "Failed to get product" });
    }
  });
  
  // POST /api/crm/products - Create product
  app.post("/api/crm/products", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ 
          error: "Unauthorized",
          code: "AUTH_REQUIRED",
          message: "Authentication required to create products"
        });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertCrmProductSchema.omit({ 
        id: true, 
        workspaceId: true,
        createdAt: true, 
        updatedAt: true 
      }).safeParse(req.body);
      
      if (!validationResult.success) {
        console.warn('[CRM Products] Validation failed:', validationResult.error.errors);
        return res.status(422).json({ 
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const productData = {
        id: `crm_product_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        name: data.name,
        sku: data.sku || null,
        description: data.description || null,
        category: data.category || null,
        unitType: data.unitType || 'each',
        defaultUnitPriceExVat: data.defaultUnitPriceExVat ?? 0,
        defaultVatRate: data.defaultVatRate ?? 2000,
        isActive: data.isActive ?? 1,
        trackStock: data.trackStock ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      
      // Helper to return mock product in demo mode when DB is unavailable
      const returnMockProduct = () => {
        console.warn('[CRM] Database unavailable in demo mode, returning mock product');
        const mockProduct = {
          ...productData,
          id: `crm_product_demo_${now}`,
          workspaceId: isDemoMode() ? 'demo-user' : workspaceId,
        };
        return res.json(mockProduct);
      };
      
      // In demo mode, use a timeout to fail fast if DB is unreachable
      if (isDemoMode()) {
        const DB_TIMEOUT_MS = 8000; // 8 second timeout for demo mode
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('DB_TIMEOUT')), DB_TIMEOUT_MS)
        );
        
        try {
          const product = await Promise.race([
            storage.createCrmProduct(productData),
            timeoutPromise
          ]);
          return res.json(product);
        } catch (error: any) {
          // In demo mode, gracefully handle all database errors with mock data
          const errorMsg = error.message || '';
          const causeMsg = error.cause?.message || '';
          const isDbError = 
            errorMsg === 'DB_TIMEOUT' || 
            error.cause?.code === 'ENOTFOUND' ||
            errorMsg.includes('does not exist') ||
            causeMsg.includes('does not exist') ||
            errorMsg.includes('ECONNREFUSED') ||
            causeMsg.includes('ECONNREFUSED');
          
          if (isDbError) {
            return returnMockProduct();
          }
          throw error; // Re-throw non-database errors
        }
      }
      
      // Normal mode - full error handling
      const product = await storage.createCrmProduct(productData);
      res.json(product);
      
    } catch (error: any) {
      // Full stack trace for server logs
      console.error("[CRM Products] Error creating product:", error);
      
      // Use structured error analysis for user-facing message
      const apiError = analyzeDatabaseError(error, 'create product');
      
      // Determine appropriate status code
      let statusCode = 500;
      if (apiError.code === 'DB_TABLE_MISSING' || apiError.code === 'DB_COLUMN_MISSING') {
        statusCode = 503; // Service unavailable - need migration
      } else if (apiError.code === 'DB_DUPLICATE_KEY') {
        statusCode = 409; // Conflict
      } else if (apiError.code === 'DB_NULL_VIOLATION' || apiError.code === 'DB_TYPE_ERROR') {
        statusCode = 422; // Unprocessable entity
      }
      
      res.status(statusCode).json({ 
        error: apiError.message,
        code: apiError.code,
        message: apiError.message,
        hint: apiError.hint
      });
    }
  });
  
  // PATCH /api/crm/products/:id - Update product
  app.patch("/api/crm/products/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      console.log('[Routes] PATCH /api/crm/products/:id called with id:', id);
      console.log('[Routes] Request body:', JSON.stringify(req.body, null, 2));

      // VALIDATION: Validate partial update using Zod schema
      const validationResult = insertCrmProductSchema.partial().omit({ 
        id: true, 
        workspaceId: true, 
        createdAt: true 
      }).safeParse(req.body);
      
      if (!validationResult.success) {
        console.warn('[CRM Products] Validation failed:', validationResult.error.errors);
        return res.status(422).json({ 
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          message: validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          details: validationResult.error.errors 
        });
      }
      
      // SECURITY: Verify product exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmProduct(id);
      if (!existing) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update product ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      const data = validationResult.data;
      console.log('[Routes] Validated data:', JSON.stringify(data, null, 2));

      const product = await storage.updateCrmProduct(id, {
        ...data,
        updatedAt: Date.now(),
      });

      console.log('[Routes] Product after update:', JSON.stringify(product, null, 2));
      res.json(product);
    } catch (error: any) {
      // Demo mode fallback: return mock updated product
      const errorMsg = error.message || '';
      const causeMsg = error.cause?.message || '';
      const isDbUnavailable = 
        error.cause?.code === 'ENOTFOUND' ||
        errorMsg.includes('does not exist') ||
        causeMsg.includes('does not exist') ||
        errorMsg.includes('ECONNREFUSED') ||
        causeMsg.includes('ECONNREFUSED');
      
      if (isDbUnavailable && isDemoMode()) {
        console.warn('[CRM] Database unavailable in demo mode, returning mock updated product');
        return res.json({ id: req.params.id, ...req.body, updatedAt: Date.now() });
      }
      
      console.error("[CRM Products] Error updating product:", error);
      const apiError = analyzeDatabaseError(error, 'update product');
      res.status(500).json({ 
        error: apiError.message,
        code: apiError.code,
        message: apiError.message,
        hint: apiError.hint
      });
    }
  });
  
  // DELETE /api/crm/products/:id - Delete product
  app.delete("/api/crm/products/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      console.log('[Routes] DELETE /api/crm/products/:id called with id:', id);

      // SECURITY: Verify product exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmProduct(id);
      if (!existing) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete product ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }

      const success = await storage.deleteCrmProduct(id);
      console.log('[Routes] Delete success:', success);

      res.json({ success });
    } catch (error: any) {
      // Demo mode fallback: return success
      const errorMsg = error.message || '';
      const causeMsg = error.cause?.message || '';
      const isDbUnavailable = 
        error.cause?.code === 'ENOTFOUND' ||
        errorMsg.includes('does not exist') ||
        causeMsg.includes('does not exist') ||
        errorMsg.includes('ECONNREFUSED') ||
        causeMsg.includes('ECONNREFUSED');
      
      if (isDbUnavailable && isDemoMode()) {
        console.warn('[CRM] Database unavailable in demo mode, returning mock delete success');
        return res.json({ success: true });
      }
      
      console.error("[CRM Products] Error deleting product:", error);
      const apiError = analyzeDatabaseError(error, 'delete product');
      res.status(500).json({ 
        error: apiError.message,
        code: apiError.code,
        message: apiError.message,
        hint: apiError.hint
      });
    }
  });
  
  // ============================================================
  // GENERIC CRM STOCK ROUTES
  // ============================================================
  
  // GET /api/crm/stock/:workspaceId - List stock
  app.get("/api/crm/stock/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access stock for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const stock = await storage.listCrmStock(workspaceId);
      
      res.json(stock);
    } catch (error: any) {
      console.error("Error listing stock:", error);
      res.status(500).json({ error: error.message || "Failed to list stock" });
    }
  });
  
  // GET /api/crm/stock/detail/:id - Get single stock record
  app.get("/api/crm/stock/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const stock = await storage.getCrmStock(id);
      
      if (!stock) {
        return res.status(404).json({ error: "Stock record not found" });
      }
      
      // SECURITY: Verify stock belongs to authenticated user's workspace
      if (stock.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access stock ${id} owned by workspace ${stock.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(stock);
    } catch (error: any) {
      console.error("Error getting stock:", error);
      res.status(500).json({ error: error.message || "Failed to get stock" });
    }
  });
  
  // POST /api/crm/stock - Create stock record
  app.post("/api/crm/stock", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const data = req.body;
      
      // SECURITY: Verify product belongs to authenticated user's workspace
      if (data.productId) {
        const product = await storage.getCrmProduct(data.productId);
        if (!product || product.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
        }
      }
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const stock = await storage.createCrmStock({
        id: `crm_stock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        productId: data.productId,
        location: data.location || 'Main Warehouse',
        quantityOnHand: data.quantityOnHand || 0,
        quantityReserved: data.quantityReserved || 0,
        reorderLevel: data.reorderLevel || 0,
        reorderQuantity: data.reorderQuantity || 0,
        costPricePerUnit: data.costPricePerUnit || 0,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(stock);
    } catch (error: any) {
      console.error("Error creating stock:", error);
      res.status(500).json({ error: error.message || "Failed to create stock" });
    }
  });
  
  // PATCH /api/crm/stock/:id - Update stock record
  app.patch("/api/crm/stock/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify stock exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmStock(id);
      if (!existing) {
        return res.status(404).json({ error: "Stock record not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update stock ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      const data = req.body;
      
      const stock = await storage.updateCrmStock(id, {
        ...data,
        updatedAt: Date.now(),
      });
      
      res.json(stock);
    } catch (error: any) {
      console.error("Error updating stock:", error);
      res.status(500).json({ error: error.message || "Failed to update stock" });
    }
  });
  
  // DELETE /api/crm/stock/:id - Delete stock record
  app.delete("/api/crm/stock/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify stock exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmStock(id);
      if (!existing) {
        return res.status(404).json({ error: "Stock record not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete stock ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteCrmStock(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting stock:", error);
      res.status(500).json({ error: error.message || "Failed to delete stock" });
    }
  });
  
  // ============================================================
  // CRM CALL DIARY (SALES DIARY) ROUTES
  // ============================================================
  
  // GET /api/crm/call-diary/:workspaceId - List all call diary entries
  app.get("/api/crm/call-diary/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access call diary for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      // Parse query filters
      const filters: any = {};
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.completed === 'true') filters.completed = true;
      if (req.query.completed === 'false') filters.completed = false;
      if (req.query.startDate) filters.startDate = parseInt(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = parseInt(req.query.endDate as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string);
      
      const entries = await storage.listCallDiaryEntries(workspaceId, filters);
      
      res.json(entries);
    } catch (error: any) {
      console.error("[Call Diary] Error listing entries:", error);
      res.status(500).json({ error: error.message || "Failed to list call diary entries" });
    }
  });
  
  // GET /api/crm/call-diary/:workspaceId/upcoming - Get upcoming calls (today + future)
  app.get("/api/crm/call-diary/:workspaceId/upcoming", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      // Parse query filters
      const filters: any = {};
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      
      const entries = await storage.listUpcomingCalls(workspaceId, filters);
      
      res.json(entries);
    } catch (error: any) {
      console.error("[Call Diary] Error listing upcoming calls:", error);
      res.status(500).json({ error: error.message || "Failed to list upcoming calls" });
    }
  });
  
  // GET /api/crm/call-diary/:workspaceId/overdue - Get overdue calls (past, not completed)
  app.get("/api/crm/call-diary/:workspaceId/overdue", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      // Parse query filters
      const filters: any = {};
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      
      const entries = await storage.listOverdueCalls(workspaceId, filters);
      
      res.json(entries);
    } catch (error: any) {
      console.error("[Call Diary] Error listing overdue calls:", error);
      res.status(500).json({ error: error.message || "Failed to list overdue calls" });
    }
  });
  
  // GET /api/crm/call-diary/:workspaceId/history - Get call history (completed calls)
  app.get("/api/crm/call-diary/:workspaceId/history", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      // Parse query filters
      const filters: any = {};
      if (req.query.entityType) filters.entityType = req.query.entityType as string;
      if (req.query.startDate) filters.startDate = parseInt(req.query.startDate as string);
      if (req.query.endDate) filters.endDate = parseInt(req.query.endDate as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);
      if (req.query.offset) filters.offset = parseInt(req.query.offset as string);
      
      const entries = await storage.listCallHistory(workspaceId, filters);
      
      res.json(entries);
    } catch (error: any) {
      console.error("[Call Diary] Error listing call history:", error);
      res.status(500).json({ error: error.message || "Failed to list call history" });
    }
  });
  
  // GET /api/crm/call-diary/detail/:id - Get single call diary entry
  app.get("/api/crm/call-diary/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const entry = await storage.getCallDiaryEntry(parseInt(id), auth.userId);
      
      if (!entry) {
        return res.status(404).json({ error: "Call diary entry not found" });
      }
      
      res.json(entry);
    } catch (error: any) {
      console.error("[Call Diary] Error getting entry:", error);
      res.status(500).json({ error: error.message || "Failed to get call diary entry" });
    }
  });
  
  // GET /api/crm/call-diary/entity/:entityType/:entityId - Get calls for a specific customer/lead
  app.get("/api/crm/call-diary/entity/:entityType/:entityId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { entityType, entityId } = req.params;
      
      if (!['customer', 'lead'].includes(entityType)) {
        return res.status(400).json({ error: "entityType must be 'customer' or 'lead'" });
      }
      
      const entries = await storage.getCallsForEntity(entityType, entityId, auth.userId);
      
      res.json(entries);
    } catch (error: any) {
      console.error("[Call Diary] Error getting calls for entity:", error);
      res.status(500).json({ error: error.message || "Failed to get calls for entity" });
    }
  });
  
  // POST /api/crm/call-diary - Create call diary entry
  app.post("/api/crm/call-diary", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body
      const validationResult = insertCrmCallDiarySchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // Validate entityType
      if (!['customer', 'lead'].includes(data.entityType)) {
        return res.status(400).json({ error: "entityType must be 'customer' or 'lead'" });
      }
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      const now = Date.now();
      
      const entry = await storage.createCallDiaryEntry({
        workspaceId,
        entityType: data.entityType,
        entityId: data.entityId,
        scheduledDate: data.scheduledDate,
        completed: data.completed ?? 0,
        completedDate: data.completedDate || null,
        notes: data.notes || null,
        outcome: data.outcome || null,
        createdAt: now,
        createdBy: auth.userId,
        updatedAt: now,
      });
      
      res.json(entry);
    } catch (error: any) {
      console.error("[Call Diary] Error creating entry:", error);
      res.status(500).json({ error: error.message || "Failed to create call diary entry" });
    }
  });
  
  // PATCH /api/crm/call-diary/:id - Update call diary entry
  app.patch("/api/crm/call-diary/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify entry exists and belongs to authenticated user's workspace
      const existing = await storage.getCallDiaryEntry(parseInt(id), auth.userId);
      if (!existing) {
        return res.status(404).json({ error: "Call diary entry not found" });
      }
      
      // VALIDATION: Validate partial update
      const validationResult = insertCrmCallDiarySchema.partial().omit({ id: true, workspaceId: true, createdAt: true, createdBy: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const entry = await storage.updateCallDiaryEntry(parseInt(id), auth.userId, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(entry);
    } catch (error: any) {
      console.error("[Call Diary] Error updating entry:", error);
      res.status(500).json({ error: error.message || "Failed to update call diary entry" });
    }
  });
  
  // PATCH /api/crm/call-diary/:id/complete - Mark call as complete
  app.patch("/api/crm/call-diary/:id/complete", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { outcome, notes } = req.body;
      
      // SECURITY: Verify entry exists and belongs to authenticated user's workspace
      const existing = await storage.getCallDiaryEntry(parseInt(id), auth.userId);
      if (!existing) {
        return res.status(404).json({ error: "Call diary entry not found" });
      }
      
      const now = Date.now();
      const entry = await storage.updateCallDiaryEntry(parseInt(id), auth.userId, {
        completed: 1,
        completedDate: now,
        outcome: outcome || existing.outcome,
        notes: notes || existing.notes,
        updatedAt: now,
      });
      
      res.json(entry);
    } catch (error: any) {
      console.error("[Call Diary] Error completing call:", error);
      res.status(500).json({ error: error.message || "Failed to mark call as complete" });
    }
  });
  
  // PATCH /api/crm/call-diary/:id/reschedule - Reschedule call
  app.patch("/api/crm/call-diary/:id/reschedule", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const { scheduledDate } = req.body;
      
      if (!scheduledDate) {
        return res.status(400).json({ error: "scheduledDate is required" });
      }
      
      // SECURITY: Verify entry exists and belongs to authenticated user's workspace
      const existing = await storage.getCallDiaryEntry(parseInt(id), auth.userId);
      if (!existing) {
        return res.status(404).json({ error: "Call diary entry not found" });
      }
      
      const entry = await storage.updateCallDiaryEntry(parseInt(id), auth.userId, {
        scheduledDate,
        outcome: 'rescheduled',
        updatedAt: Date.now(),
      });
      
      res.json(entry);
    } catch (error: any) {
      console.error("[Call Diary] Error rescheduling call:", error);
      res.status(500).json({ error: error.message || "Failed to reschedule call" });
    }
  });
  
  // DELETE /api/crm/call-diary/:id - Delete call diary entry
  app.delete("/api/crm/call-diary/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify entry exists and belongs to authenticated user's workspace
      const existing = await storage.getCallDiaryEntry(parseInt(id), auth.userId);
      if (!existing) {
        return res.status(404).json({ error: "Call diary entry not found" });
      }
      
      const success = await storage.deleteCallDiaryEntry(parseInt(id), auth.userId);
      
      res.json({ success });
    } catch (error: any) {
      console.error("[Call Diary] Error deleting entry:", error);
      res.status(500).json({ error: error.message || "Failed to delete call diary entry" });
    }
  });
  
  // ============= HELPER: Recalculate Order Totals from Line Items =============
  /**
   * Recalculates order totals (subtotal, VAT, total) from all line items.
   * Call this after any line item create/update/delete operation.
   */
  async function recalculateOrderTotals(orderId: string): Promise<void> {
    // Get all line items for this order
    const lines = await storage.listCrmOrderLinesByOrder(orderId);
    
    // Calculate totals from line items
    let subtotalExVat = 0;
    let vatTotal = 0;
    let totalIncVat = 0;
    
    for (const line of lines) {
      if (line.lineSubtotalExVat !== null && line.lineSubtotalExVat !== undefined) {
        subtotalExVat += line.lineSubtotalExVat;
      }
      if (line.lineVatAmount !== null && line.lineVatAmount !== undefined) {
        vatTotal += line.lineVatAmount;
      }
      if (line.lineTotalIncVat !== null && line.lineTotalIncVat !== undefined) {
        totalIncVat += line.lineTotalIncVat;
      }
    }
    
    // Update the order with calculated totals
    await storage.updateCrmOrder(orderId, {
      subtotalExVat,
      vatTotal,
      totalIncVat,
      totalAmount: totalIncVat, // Keep legacy field in sync
    });
  }
  
  // GET /api/crm/orders/:workspaceId - List orders
  app.get("/api/crm/orders/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      const { customerId, deliveryRunId } = req.query;
      
      console.log(`📦 [ORDERS API] GET /api/crm/orders/${workspaceId}`);
      console.log(`   Auth userId: ${auth.userId}`);
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access orders for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      let orders;
      if (customerId && typeof customerId === 'string') {
        // SECURITY: Verify customer belongs to authenticated user's workspace before filtering
        const customer = await storage.getCrmCustomer(customerId);
        if (!customer || customer.workspaceId !== auth.userId) {
          console.warn(`🚫 User ${auth.userEmail} attempted to access orders for customer ${customerId} not in their workspace`);
          return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' customers" });
        }
        orders = await storage.listCrmOrdersByCustomer(customerId);
      } else if (deliveryRunId && typeof deliveryRunId === 'string') {
        // SECURITY: Verify delivery run belongs to authenticated user's workspace before filtering
        const deliveryRun = await storage.getCrmDeliveryRun(deliveryRunId);
        if (!deliveryRun || deliveryRun.workspaceId !== auth.userId) {
          console.warn(`🚫 User ${auth.userEmail} attempted to access orders for delivery run ${deliveryRunId} not in their workspace`);
          return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' delivery runs" });
        }
        orders = await storage.listCrmOrdersByDeliveryRun(deliveryRunId);
      } else {
        orders = await storage.listCrmOrders(workspaceId);
      }
      
      console.log(`   Orders found: ${orders.length}`);
      res.json(orders);
    } catch (error: any) {
      // Demo mode fallback: return empty array
      if (error.cause?.code === 'ENOTFOUND' && req.params.workspaceId === 'demo-user') {
        console.warn('[CRM] Database DNS failed for demo-user orders, returning empty array');
        return res.json([]);
      }
      console.error("Error listing orders:", error);
      res.status(500).json({ error: error.message || "Failed to list orders" });
    }
  });
  
  // GET /api/crm/orders/detail/:id - Get single order
  app.get("/api/crm/orders/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const order = await storage.getCrmOrder(id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // SECURITY: Verify order belongs to authenticated user's workspace
      if (order.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access order ${id} owned by workspace ${order.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(order);
    } catch (error: any) {
      console.error("Error getting order:", error);
      res.status(500).json({ error: error.message || "Failed to get order" });
    }
  });

  // GET /api/crm/orders/customer/:customerId - Get orders for a specific customer
  app.get("/api/crm/orders/customer/:customerId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { customerId } = req.params;
      
      // Verify the customer exists and belongs to this workspace
      const customer = await storage.getCrmCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      if (customer.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access customer ${customerId} owned by workspace ${customer.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      // Get orders for this customer
      const orders = await storage.listCrmOrdersByCustomer(customerId);
      
      res.json(orders);
    } catch (error: any) {
      console.error("Error getting customer orders:", error);
      res.status(500).json({ error: error.message || "Failed to get customer orders" });
    }
  });
  
  // POST /api/crm/orders - Create order
  app.post("/api/crm/orders", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertCrmOrderSchema.omit({ id: true, workspaceId: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      // SECURITY: Verify customer belongs to authenticated user's workspace
      const customer = await storage.getCrmCustomer(data.customerId);
      if (!customer || customer.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Customer does not belong to your workspace" });
      }
      
      // SECURITY: If deliveryRunId provided, verify it belongs to authenticated user's workspace
      if (data.deliveryRunId) {
        const deliveryRun = await storage.getCrmDeliveryRun(data.deliveryRunId);
        if (!deliveryRun || deliveryRun.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Delivery run does not belong to your workspace" });
        }
      }
      
      const now = Date.now();
      const order = await storage.createCrmOrder({
        id: `order_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        customerId: data.customerId,
        orderNumber: data.orderNumber,
        orderDate: data.orderDate,
        status: data.status || 'draft',
        deliveryDate: data.deliveryDate || null,
        deliveryRunId: data.deliveryRunId || null,
        currency: data.currency || 'GBP',
        totalAmount: data.totalAmount || null,
        notes: data.notes || null,
        syncStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      });
      
      // Auto-sync to Xero if connected (async, don't block response)
      if ((xeroSyncRouter as any).syncOrderToXero) {
        (xeroSyncRouter as any).syncOrderToXero(order.id, workspaceId).catch((error: any) => {
          console.error(`Auto-sync order ${order.id} to Xero failed:`, error.message);
        });
      }
      
      res.json(order);
    } catch (error: any) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: error.message || "Failed to create order" });
    }
  });
  
  // PATCH /api/crm/orders/:id - Update order
  app.patch("/api/crm/orders/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify order exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmOrder(id);
      if (!existing) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update order ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // V1 CONTRACT: Lock edits when order is approved/paid in Xero
      if (existing.xeroStatus && existing.xeroStatus !== 'DRAFT') {
        console.warn(`🔒 User ${auth.userEmail} attempted to edit locked order ${id} (Xero status: ${existing.xeroStatus})`);
        return res.status(423).json({ 
          error: "Order is locked",
          message: `This order has been ${existing.xeroStatus.toLowerCase()} in Xero and cannot be edited in Wyshbone. Make changes directly in Xero.`,
          xeroStatus: existing.xeroStatus
        });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      console.log('[DEBUG] Order PATCH request body:', JSON.stringify(req.body, null, 2));
      const validationResult = insertCrmOrderSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.errors
        });
      }

      const data = validationResult.data;
      console.log('[DEBUG] Validated order data:', JSON.stringify(data, null, 2));
      console.log('[DEBUG] Status field in data:', data.status);
      
      // SECURITY: If customerId is being updated, verify it belongs to authenticated user's workspace
      if (data.customerId) {
        const customer = await storage.getCrmCustomer(data.customerId);
        if (!customer || customer.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Customer does not belong to your workspace" });
        }
      }
      
      // SECURITY: If deliveryRunId is being updated, verify it belongs to authenticated user's workspace
      if (data.deliveryRunId) {
        const deliveryRun = await storage.getCrmDeliveryRun(data.deliveryRunId);
        if (!deliveryRun || deliveryRun.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Delivery run does not belong to your workspace" });
        }
      }
      
      const updatePayload = {
        ...data,
        syncStatus: 'pending',
        updatedAt: Date.now(),
      };
      console.log('[DEBUG] Sending to updateCrmOrder:', JSON.stringify(updatePayload, null, 2));
      const order = await storage.updateCrmOrder(id, updatePayload);
      console.log('[DEBUG] Updated order returned:', JSON.stringify(order, null, 2));
      console.log('[DEBUG] Status field in returned order:', order?.status);

      // Auto-sync update to Xero if connected (async, don't block response)
      // NOTE: Use auth.userId (UUID string) for Xero connection lookup, not existing.workspaceId
      if ((xeroSyncRouter as any).updateOrderInXero) {
        (xeroSyncRouter as any).updateOrderInXero(id, auth.userId).catch((error: any) => {
          console.error(`Auto-sync order update ${id} to Xero failed:`, error.message);
        });
      }
      
      res.json(order);
    } catch (error: any) {
      console.error("Error updating order:", error);
      res.status(500).json({ error: error.message || "Failed to update order" });
    }
  });
  
  // DELETE /api/crm/orders/:id - Delete order
  app.delete("/api/crm/orders/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify order exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmOrder(id);
      if (!existing) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete order ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      // V1 CONTRACT: Lock deletes when order is approved/paid in Xero
      if (existing.xeroStatus && existing.xeroStatus !== 'DRAFT') {
        console.warn(`🔒 User ${auth.userEmail} attempted to delete locked order ${id} (Xero status: ${existing.xeroStatus})`);
        return res.status(423).json({ 
          error: "Order is locked",
          message: `This order has been ${existing.xeroStatus.toLowerCase()} in Xero and cannot be deleted in Wyshbone. Void it directly in Xero.`,
          xeroStatus: existing.xeroStatus
        });
      }
      
      // Void in Xero first (async, don't block response)
      if ((xeroSyncRouter as any).voidOrderInXero) {
        (xeroSyncRouter as any).voidOrderInXero(id, existing.workspaceId).catch((error: any) => {
          console.error(`Auto-void order ${id} in Xero failed:`, error.message);
        });
      }
      
      const success = await storage.deleteCrmOrder(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting order:", error);
      res.status(500).json({ error: error.message || "Failed to delete order" });
    }
  });
  
  // POST /api/crm/orders/:id/export-xero - Export order to Xero as invoice
  app.post("/api/crm/orders/:id/export-xero", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify order exists and belongs to authenticated user's workspace
      const order = await storage.getCrmOrder(id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to export order ${id} owned by workspace ${order.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot export other workspaces' data" });
      }
      
      // Check if order already has a Xero invoice
      if (order.xeroInvoiceId) {
        return res.json({ 
          success: true, 
          message: "Order already exported to Xero",
          invoiceId: order.xeroInvoiceId,
          invoiceNumber: order.xeroInvoiceNumber
        });
      }
      
      // Check if Xero sync function is available
      if (!(xeroSyncRouter as any).syncOrderToXero) {
        return res.status(503).json({ error: "Xero sync not available" });
      }
      
      // Export to Xero
      // NOTE: Use auth.userId (UUID string) for Xero connection lookup, not order.workspaceId (integer)
      console.log(`📤 Exporting order ${id} to Xero (user: ${auth.userId})...`);
      await (xeroSyncRouter as any).syncOrderToXero(id, auth.userId);
      
      // Refetch order to get the new Xero invoice details
      const updatedOrder = await storage.getCrmOrder(id);
      
      res.json({ 
        success: true, 
        message: "Order exported to Xero",
        invoiceId: updatedOrder?.xeroInvoiceId,
        invoiceNumber: updatedOrder?.xeroInvoiceNumber
      });
    } catch (error: any) {
      console.error("Error exporting order to Xero:", error);
      
      // Handle specific Xero connection errors with appropriate status codes
      if (error.message?.includes("Xero not connected") || error.message?.includes("token expired")) {
        return res.status(400).json({ 
          error: "Xero not connected", 
          message: "Please connect your Xero account first in Integrations settings.",
          requiresConnection: true
        });
      }
      
      res.status(500).json({ error: error.message || "Failed to export order to Xero" });
    }
  });

  // GET /api/crm/order-lines/:orderId - List order lines for an order
  app.get("/api/crm/order-lines/:orderId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { orderId } = req.params;
      
      // SECURITY: Verify order belongs to authenticated user's workspace
      const order = await storage.getCrmOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access order lines for order ${orderId} not in their workspace`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const lines = await storage.listCrmOrderLinesByOrder(orderId);
      
      res.json(lines);
    } catch (error: any) {
      console.error("Error listing order lines:", error);
      res.status(500).json({ error: error.message || "Failed to list order lines" });
    }
  });
  
  // POST /api/crm/order-lines - Create order line
  app.post("/api/crm/order-lines", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      // Omit calculated fields - backend will compute lineSubtotalExVat, lineVatAmount, lineTotalIncVat
      const validationResult = insertCrmOrderLineSchema.omit({ 
        id: true, 
        createdAt: true, 
        updatedAt: true,
        lineSubtotalExVat: true,
        lineVatAmount: true,
        lineTotalIncVat: true,
      }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Verify order belongs to authenticated user's workspace
      const order = await storage.getCrmOrder(data.orderId);
      if (!order || order.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Order does not belong to your workspace" });
      }
      
      // V1 CONTRACT: Lock edits when order is approved/paid in Xero
      if (order.xeroStatus && order.xeroStatus !== 'DRAFT') {
        console.warn(`🔒 User ${auth.userEmail} attempted to add line to locked order ${order.id} (Xero status: ${order.xeroStatus})`);
        return res.status(423).json({ 
          error: "Order is locked",
          message: `This order has been ${order.xeroStatus.toLowerCase()} in Xero and cannot be edited in Wyshbone. Make changes directly in Xero.`,
          xeroStatus: order.xeroStatus
        });
      }
      
      // SECURITY: If productId is provided, verify it belongs to the workspace
      // First check CRM products, then fall back to Brew products for brewery vertical
      if (data.productId) {
        let productValid = false;
        const crmProduct = await storage.getCrmProduct(data.productId);
        if (crmProduct && crmProduct.workspaceId === auth.userId) {
          productValid = true;
        } else {
          const brewProduct = await storage.getCrmProduct(data.productId);
          if (brewProduct && brewProduct.workspaceId === auth.userId) {
            productValid = true;
          }
        }
        if (!productValid) {
          return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
        }
      }
      
      // Calculate line totals from provided values
      const quantity = data.quantity || 1;
      const unitPriceExVat = data.unitPriceExVat || 0;
      const vatRate = data.vatRate || 0;
      
      const lineSubtotalExVat = quantity * unitPriceExVat;
      const lineVatAmount = Math.round(lineSubtotalExVat * (vatRate / 10000)); // vatRate is in basis points
      const lineTotalIncVat = lineSubtotalExVat + lineVatAmount;
      
      const now = Date.now();
      const line = await storage.createCrmOrderLine({
        id: `order_line_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        orderId: data.orderId,
        productId: data.productId || null,
        quantity,
        unitPriceExVat,
        vatRate,
        lineSubtotalExVat,
        lineVatAmount,
        lineTotalIncVat,
        // Legacy fields (optional)
        genericItemName: data.genericItemName || null,
        genericItemCode: data.genericItemCode || null,
        quantityUnits: data.quantityUnits || null,
        unitPrice: data.unitPrice || null,
        lineTotal: data.lineTotal || null,
        verticalType: data.verticalType || null,
        verticalRefId: data.verticalRefId || null,
        createdAt: now,
        updatedAt: now,
      });
      
      // Recalculate order totals after creating line
      await recalculateOrderTotals(data.orderId);
      
      res.json(line);
    } catch (error: any) {
      console.error("Error creating order line:", error);
      res.status(500).json({ error: error.message || "Failed to create order line" });
    }
  });
  
  // PATCH /api/crm/order-lines/:id - Update order line
  app.patch("/api/crm/order-lines/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify order line exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmOrderLine(id);
      if (!existing) {
        return res.status(404).json({ error: "Order line not found" });
      }
      
      // Verify the parent order belongs to the workspace
      const order = await storage.getCrmOrder(existing.orderId);
      if (!order || order.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update order line ${id} belonging to order not in their workspace`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // V1 CONTRACT: Lock edits when order is approved/paid in Xero
      if (order.xeroStatus && order.xeroStatus !== 'DRAFT') {
        console.warn(`🔒 User ${auth.userEmail} attempted to edit line on locked order ${order.id} (Xero status: ${order.xeroStatus})`);
        return res.status(423).json({ 
          error: "Order is locked",
          message: `This order has been ${order.xeroStatus.toLowerCase()} in Xero and cannot be edited in Wyshbone. Make changes directly in Xero.`,
          xeroStatus: order.xeroStatus
        });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertCrmOrderLineSchema.partial().omit({ id: true, orderId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: If productId is being updated, verify it belongs to the workspace
      // First check CRM products, then fall back to Brew products for brewery vertical
      if (data.productId) {
        let productValid = false;
        const crmProduct = await storage.getCrmProduct(data.productId);
        if (crmProduct && crmProduct.workspaceId === auth.userId) {
          productValid = true;
        } else {
          const brewProduct = await storage.getCrmProduct(data.productId);
          if (brewProduct && brewProduct.workspaceId === auth.userId) {
            productValid = true;
          }
        }
        if (!productValid) {
          return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
        }
      }
      
      // Recalculate line totals if any pricing fields are updated
      let updateData = { ...data };
      if (data.quantity !== undefined || data.unitPriceExVat !== undefined || data.vatRate !== undefined) {
        const quantity = data.quantity !== undefined ? data.quantity : (existing.quantity || 1);
        const unitPriceExVat = data.unitPriceExVat !== undefined ? data.unitPriceExVat : (existing.unitPriceExVat || 0);
        const vatRate = data.vatRate !== undefined ? data.vatRate : (existing.vatRate || 0);
        
        const lineSubtotalExVat = quantity * unitPriceExVat;
        const lineVatAmount = Math.round(lineSubtotalExVat * (vatRate / 10000));
        const lineTotalIncVat = lineSubtotalExVat + lineVatAmount;
        
        updateData = {
          ...updateData,
          lineSubtotalExVat,
          lineVatAmount,
          lineTotalIncVat,
        };
      }
      
      const line = await storage.updateCrmOrderLine(id, {
        ...updateData,
        updatedAt: Date.now(),
      });
      
      // Recalculate order totals after updating line
      await recalculateOrderTotals(existing.orderId);
      
      res.json(line);
    } catch (error: any) {
      console.error("Error updating order line:", error);
      res.status(500).json({ error: error.message || "Failed to update order line" });
    }
  });
  
  // DELETE /api/crm/order-lines/:id - Delete order line
  app.delete("/api/crm/order-lines/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify order line exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmOrderLine(id);
      if (!existing) {
        return res.status(404).json({ error: "Order line not found" });
      }
      
      // Verify the parent order belongs to the workspace
      const order = await storage.getCrmOrder(existing.orderId);
      if (!order || order.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete order line ${id} belonging to order not in their workspace`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // V1 CONTRACT: Lock edits when order is approved/paid in Xero
      if (order.xeroStatus && order.xeroStatus !== 'DRAFT') {
        console.warn(`🔒 User ${auth.userEmail} attempted to delete line on locked order ${order.id} (Xero status: ${order.xeroStatus})`);
        return res.status(423).json({ 
          error: "Order is locked",
          message: `This order has been ${order.xeroStatus.toLowerCase()} in Xero and cannot be edited in Wyshbone. Make changes directly in Xero.`,
          xeroStatus: order.xeroStatus
        });
      }
      
      const orderId = existing.orderId; // Save before deletion
      const success = await storage.deleteCrmOrderLine(id);
      
      // Recalculate order totals after deleting line
      if (success) {
        await recalculateOrderTotals(orderId);
      }
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting order line:", error);
      res.status(500).json({ error: "Failed to delete order line" });
    }
  });
  
  // ============================================================
  // BREWERY CRM ROUTES (Brewery Vertical Extensions)
  // ============================================================
  
  // GET /api/brewcrm/settings/:workspaceId - Get brewery settings
  app.get("/api/brewcrm/settings/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access brewery settings for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const settings = await storage.getBrewSettings(workspaceId);
      
      if (!settings) {
        return res.status(404).json({ error: "Brewery settings not found" });
      }
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error getting brewery settings:", error);
      res.status(500).json({ error: error.message || "Failed to get brewery settings" });
    }
  });
  
  // POST /api/brewcrm/settings - Create brewery settings
  app.post("/api/brewcrm/settings", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertBrewSettingsSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const settings = await storage.createBrewSettings({
        id: `brew_settings_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        breweryLicense: data.breweryLicense || null,
        taxOffice: data.taxOffice || null,
        dutyReportingFrequency: data.dutyReportingFrequency || 'monthly',
        defaultYeastType: data.defaultYeastType || null,
        defaultMaltType: data.defaultMaltType || null,
        defaultHopsType: data.defaultHopsType || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error creating brewery settings:", error);
      res.status(500).json({ error: error.message || "Failed to create brewery settings" });
    }
  });
  
  // PATCH /api/brewcrm/settings/:id - Update brewery settings
  app.patch("/api/brewcrm/settings/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify settings exist and belong to authenticated user's workspace
      const existing = await storage.getBrewSettingsById(id);
      if (!existing) {
        return res.status(404).json({ error: "Brewery settings not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update brewery settings ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertBrewSettingsSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const settings = await storage.updateBrewSettings(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(settings);
    } catch (error: any) {
      console.error("Error updating brewery settings:", error);
      res.status(500).json({ error: error.message || "Failed to update brewery settings" });
    }
  });
  
  // GET /api/brewcrm/products/:workspaceId - List products
  app.get("/api/brewcrm/products/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access products for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const products = await storage.listCrmProducts(workspaceId);
      
      res.json(products);
    } catch (error: any) {
      console.error("Error listing products:", error);
      res.status(500).json({ error: error.message || "Failed to list products" });
    }
  });
  
  // GET /api/brewcrm/products/detail/:id - Get single product
  app.get("/api/brewcrm/products/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const product = await storage.getCrmProduct(id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // SECURITY: Verify product belongs to authenticated user's workspace
      if (product.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access product ${id} owned by workspace ${product.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(product);
    } catch (error: any) {
      console.error("Error getting product:", error);
      res.status(500).json({ error: error.message || "Failed to get product" });
    }
  });
  
  // POST /api/brewcrm/products - Create product
  app.post("/api/brewcrm/products", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertCrmProductSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const product = await storage.createCrmProduct({
        id: `product_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        sku: data.sku,
        name: data.name,
        beerStyle: data.beerStyle || null,
        abv: data.abv || null,
        ibu: data.ibu || null,
        description: data.description || null,
        packageType: data.packageType || null,
        packageSizeLiters: data.packageSizeLiters || null,
        costPerUnit: data.costPerUnit || null,
        sellingPricePerUnit: data.sellingPricePerUnit || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(product);
    } catch (error: any) {
      console.error("Error creating product:", error);
      res.status(500).json({ error: error.message || "Failed to create product" });
    }
  });
  
  // PATCH /api/brewcrm/products/:id - Update product
  app.patch("/api/brewcrm/products/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify product exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmProduct(id);
      if (!existing) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update product ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertCrmProductSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const product = await storage.updateCrmProduct(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(product);
    } catch (error: any) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: error.message || "Failed to update product" });
    }
  });
  
  // DELETE /api/brewcrm/products/:id - Delete product
  app.delete("/api/brewcrm/products/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify product exists and belongs to authenticated user's workspace
      const existing = await storage.getCrmProduct(id);
      if (!existing) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete product ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteCrmProduct(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: error.message || "Failed to delete product" });
    }
  });
  
  // GET /api/brewcrm/batches/:workspaceId - List batches
  app.get("/api/brewcrm/batches/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access batches for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const batches = await storage.listBrewBatches(workspaceId);
      
      res.json(batches);
    } catch (error: any) {
      console.error("Error listing batches:", error);
      res.status(500).json({ error: error.message || "Failed to list batches" });
    }
  });
  
  // GET /api/brewcrm/batches/detail/:id - Get single batch
  app.get("/api/brewcrm/batches/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const batch = await storage.getBrewBatch(id);
      
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      
      // SECURITY: Verify batch belongs to authenticated user's workspace
      if (batch.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access batch ${id} owned by workspace ${batch.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(batch);
    } catch (error: any) {
      console.error("Error getting batch:", error);
      res.status(500).json({ error: error.message || "Failed to get batch" });
    }
  });
  
  // POST /api/brewcrm/batches - Create batch
  app.post("/api/brewcrm/batches", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertBrewBatchSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      // SECURITY: Verify productId belongs to authenticated user's workspace
      const product = await storage.getCrmProduct(data.productId);
      if (!product || product.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
      }
      
      const now = Date.now();
      const batch = await storage.createBrewBatch({
        id: `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        batchNumber: data.batchNumber,
        productId: data.productId,
        brewDate: data.brewDate,
        volumeLiters: data.volumeLiters,
        status: data.status || 'brewing',
        yeastType: data.yeastType || null,
        maltType: data.maltType || null,
        hopsType: data.hopsType || null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(batch);
    } catch (error: any) {
      console.error("Error creating batch:", error);
      res.status(500).json({ error: error.message || "Failed to create batch" });
    }
  });
  
  // PATCH /api/brewcrm/batches/:id - Update batch
  app.patch("/api/brewcrm/batches/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify batch exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewBatch(id);
      if (!existing) {
        return res.status(404).json({ error: "Batch not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update batch ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertBrewBatchSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: If productId is being updated, verify it belongs to authenticated user's workspace
      if (data.productId) {
        const product = await storage.getCrmProduct(data.productId);
        if (!product || product.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
        }
      }
      
      const batch = await storage.updateBrewBatch(id, {
        ...data,
        updatedAt: Date.now(),
      });
      
      res.json(batch);
    } catch (error: any) {
      console.error("Error updating batch:", error);
      res.status(500).json({ error: error.message || "Failed to update batch" });
    }
  });
  
  // DELETE /api/brewcrm/batches/:id - Delete batch
  app.delete("/api/brewcrm/batches/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify batch exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewBatch(id);
      if (!existing) {
        return res.status(404).json({ error: "Batch not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete batch ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteBrewBatch(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: error.message || "Failed to delete batch" });
    }
  });
  
  // GET /api/brewcrm/inventory/:workspaceId - List inventory
  app.get("/api/brewcrm/inventory/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access inventory for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const inventory = await storage.listBrewInventory(workspaceId);
      
      res.json(inventory);
    } catch (error: any) {
      console.error("Error listing inventory:", error);
      res.status(500).json({ error: error.message || "Failed to list inventory" });
    }
  });
  
  // GET /api/brewcrm/inventory/product/:productId - Get inventory by product
  app.get("/api/brewcrm/inventory/product/:productId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { productId } = req.params;
      
      // SECURITY: Verify productId belongs to authenticated user's workspace
      const product = await storage.getCrmProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (product.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access inventory for product ${productId} owned by workspace ${product.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const inventory = await storage.getBrewInventoryByProduct(productId);
      
      if (!inventory) {
        return res.status(404).json({ error: "Inventory not found" });
      }
      
      res.json(inventory);
    } catch (error: any) {
      console.error("Error getting inventory:", error);
      res.status(500).json({ error: error.message || "Failed to get inventory" });
    }
  });
  
  // POST /api/brewcrm/inventory - Create or update inventory
  app.post("/api/brewcrm/inventory", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertBrewInventorySchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      // SECURITY: Verify productId belongs to authenticated user's workspace
      const product = await storage.getCrmProduct(data.productId);
      if (!product || product.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
      }
      
      const now = Date.now();
      const inventory = await storage.createBrewInventory({
        id: `inventory_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        productId: data.productId,
        quantityOnHand: data.quantityOnHand || 0,
        quantityAllocated: data.quantityAllocated || 0,
        reorderLevel: data.reorderLevel || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(inventory);
    } catch (error: any) {
      console.error("Error creating inventory:", error);
      res.status(500).json({ error: error.message || "Failed to create inventory" });
    }
  });
  
  // PATCH /api/brewcrm/inventory/:id - Update inventory
  app.patch("/api/brewcrm/inventory/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify inventory exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewInventoryById(id);
      if (!existing) {
        return res.status(404).json({ error: "Inventory not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update inventory ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertBrewInventorySchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: If productId is being updated, verify it belongs to authenticated user's workspace
      if (data.productId) {
        const product = await storage.getCrmProduct(data.productId);
        if (!product || product.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
        }
      }
      
      const inventory = await storage.updateBrewInventory(id, {
        ...data,
        updatedAt: Date.now(),
      });
      
      res.json(inventory);
    } catch (error: any) {
      console.error("Error updating inventory:", error);
      res.status(500).json({ error: error.message || "Failed to update inventory" });
    }
  });
  
  // GET /api/brewcrm/containers/:workspaceId - List containers
  app.get("/api/brewcrm/containers/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access containers for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const containers = await storage.listBrewContainers(workspaceId);
      
      res.json(containers);
    } catch (error: any) {
      console.error("Error listing containers:", error);
      res.status(500).json({ error: error.message || "Failed to list containers" });
    }
  });
  
  // GET /api/brewcrm/containers/detail/:id - Get single container
  app.get("/api/brewcrm/containers/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const container = await storage.getBrewContainer(id);
      
      if (!container) {
        return res.status(404).json({ error: "Container not found" });
      }
      
      // SECURITY: Verify container belongs to authenticated user's workspace
      if (container.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access container ${id} owned by workspace ${container.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(container);
    } catch (error: any) {
      console.error("Error getting container:", error);
      res.status(500).json({ error: error.message || "Failed to get container" });
    }
  });
  
  // POST /api/brewcrm/containers - Create container
  app.post("/api/brewcrm/containers", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertBrewContainerSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const container = await storage.createBrewContainer({
        id: `container_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        barcode: data.barcode,
        containerType: data.containerType,
        sizeLiters: data.sizeLiters,
        batchId: data.batchId || null,
        status: data.status || 'empty',
        location: data.location || null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(container);
    } catch (error: any) {
      console.error("Error creating container:", error);
      res.status(500).json({ error: error.message || "Failed to create container" });
    }
  });
  
  // PATCH /api/brewcrm/containers/:id - Update container
  app.patch("/api/brewcrm/containers/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify container exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewContainer(id);
      if (!existing) {
        return res.status(404).json({ error: "Container not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update container ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertBrewContainerSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const container = await storage.updateBrewContainer(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(container);
    } catch (error: any) {
      console.error("Error updating container:", error);
      res.status(500).json({ error: error.message || "Failed to update container" });
    }
  });
  
  // DELETE /api/brewcrm/containers/:id - Delete container
  app.delete("/api/brewcrm/containers/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify container exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewContainer(id);
      if (!existing) {
        return res.status(404).json({ error: "Container not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete container ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteBrewContainer(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting container:", error);
      res.status(500).json({ error: error.message || "Failed to delete container" });
    }
  });
  
  // GET /api/brewcrm/duty-reports/:workspaceId - List duty reports
  app.get("/api/brewcrm/duty-reports/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access duty reports for workspace ${workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const reports = await storage.listBrewDutyReports(workspaceId);
      
      res.json(reports);
    } catch (error: any) {
      console.error("Error listing duty reports:", error);
      res.status(500).json({ error: error.message || "Failed to list duty reports" });
    }
  });
  
  // GET /api/brewcrm/duty-reports/detail/:id - Get single duty report
  app.get("/api/brewcrm/duty-reports/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      const report = await storage.getBrewDutyReport(id);
      
      if (!report) {
        return res.status(404).json({ error: "Duty report not found" });
      }
      
      // SECURITY: Verify duty report belongs to authenticated user's workspace
      if (report.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access duty report ${id} owned by workspace ${report.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      res.json(report);
    } catch (error: any) {
      console.error("Error getting duty report:", error);
      res.status(500).json({ error: error.message || "Failed to get duty report" });
    }
  });
  
  // POST /api/brewcrm/duty-reports - Create duty report
  app.post("/api/brewcrm/duty-reports", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // VALIDATION: Validate request body using Zod schema
      const validationResult = insertBrewDutyReportSchema.omit({ id: true, createdAt: true, updatedAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const data = validationResult.data;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const report = await storage.createBrewDutyReport({
        id: `duty_report_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        reportPeriod: data.reportPeriod,
        volumeProducedLiters: data.volumeProducedLiters || 0,
        volumeSoldLiters: data.volumeSoldLiters || 0,
        dutyPaid: data.dutyPaid || 0,
        status: data.status || 'draft',
        submittedDate: data.submittedDate || null,
        notes: data.notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json(report);
    } catch (error: any) {
      console.error("Error creating duty report:", error);
      res.status(500).json({ error: error.message || "Failed to create duty report" });
    }
  });
  
  // PATCH /api/brewcrm/duty-reports/:id - Update duty report
  app.patch("/api/brewcrm/duty-reports/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify duty report exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewDutyReport(id);
      if (!existing) {
        return res.status(404).json({ error: "Duty report not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to update duty report ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot modify other workspaces' data" });
      }
      
      // VALIDATION: Validate partial update using Zod schema (omit immutable fields)
      const validationResult = insertBrewDutyReportSchema.partial().omit({ id: true, workspaceId: true, createdAt: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.errors 
        });
      }
      
      const report = await storage.updateBrewDutyReport(id, {
        ...validationResult.data,
        updatedAt: Date.now(),
      });
      
      res.json(report);
    } catch (error: any) {
      console.error("Error updating duty report:", error);
      res.status(500).json({ error: error.message || "Failed to update duty report" });
    }
  });
  
  // DELETE /api/brewcrm/duty-reports/:id - Delete duty report
  app.delete("/api/brewcrm/duty-reports/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { id } = req.params;
      
      // SECURITY: Verify duty report exists and belongs to authenticated user's workspace
      const existing = await storage.getBrewDutyReport(id);
      if (!existing) {
        return res.status(404).json({ error: "Duty report not found" });
      }
      if (existing.workspaceId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to delete duty report ${id} owned by workspace ${existing.workspaceId}`);
        return res.status(403).json({ error: "Forbidden: Cannot delete other workspaces' data" });
      }
      
      const success = await storage.deleteBrewDutyReport(id);
      
      res.json({ success });
    } catch (error: any) {
      console.error("Error deleting duty report:", error);
      res.status(500).json({ error: error.message || "Failed to delete duty report" });
    }
  });
  
  // GET /api/brewcrm/duty-lookup-bands - List active duty lookup bands
  // NOTE: Duty bands are public reference data (UK alcohol duty legislation).
  // Auth is handled centrally via getAuthenticatedUserId (supports dev/demo mode).
  app.get("/api/brewcrm/duty-lookup-bands", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const regime = (req.query.regime as string) || 'UK';
      console.log(`[API] Fetching duty lookup bands for regime=${regime}, user=${auth.userEmail}`);
      
      const bands = await storage.listActiveDutyLookupBands(regime);
      console.log(`[API] Returning ${bands.length} duty lookup bands`);
      
      res.json(bands);
    } catch (error: any) {
      console.error("Error fetching duty lookup bands:", error);
      console.error("Error stack:", error.stack);
      // Check if it's a "relation does not exist" error (table not created yet)
      if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
        return res.status(500).json({ 
          error: "Duty lookup bands table not found. Please run the SQL migration: drizzle/brew_duty_lookup_bands.sql" 
        });
      }
      res.status(500).json({ error: error.message || "Failed to fetch duty lookup bands" });
    }
  });
  
  // ============================================================
  // PRICE BOOKS ENDPOINTS
  // ============================================================
  
  // GET /api/brewcrm/price-books/:workspaceId - List all price books
  app.get("/api/brewcrm/price-books/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      // SECURITY: Verify workspace belongs to authenticated user
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const priceBooks = await storage.listBrewPriceBooks(workspaceId);
      res.json(priceBooks);
    } catch (error: any) {
      console.error("Error listing price books:", error);
      res.status(500).json({ error: error.message || "Failed to list price books" });
    }
  });
  
  // GET /api/brewcrm/price-books/:workspaceId/active - List active price books
  app.get("/api/brewcrm/price-books/:workspaceId/active", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Cannot access other workspaces' data" });
      }
      
      const priceBooks = await storage.listActiveBrewPriceBooks(workspaceId);
      res.json(priceBooks);
    } catch (error: any) {
      console.error("Error listing active price books:", error);
      res.status(500).json({ error: error.message || "Failed to list active price books" });
    }
  });
  
  // GET /api/brewcrm/price-books/detail/:id - Get single price book with product prices
  app.get("/api/brewcrm/price-books/detail/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const priceBookId = parseInt(req.params.id);
      if (isNaN(priceBookId)) {
        return res.status(400).json({ error: "Invalid price book ID" });
      }
      
      const workspaceId = auth.userId;
      const priceBook = await storage.getBrewPriceBook(priceBookId, workspaceId);
      
      if (!priceBook) {
        return res.status(404).json({ error: "Price book not found" });
      }
      
      // Also get product prices for this price book
      const productPrices = await storage.getProductPricesByPriceBook(priceBookId, workspaceId);
      const priceBands = await storage.getPriceBandsByPriceBook(priceBookId, workspaceId);
      
      res.json({
        ...priceBook,
        productPrices,
        priceBands,
      });
    } catch (error: any) {
      console.error("Error getting price book:", error);
      res.status(500).json({ error: error.message || "Failed to get price book" });
    }
  });
  
  // POST /api/brewcrm/price-books - Create price book
  app.post("/api/brewcrm/price-books", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const workspaceId = auth.userId;
      const { name, description, isDefault, parentPriceBookId, discountType, discountValue, isActive } = req.body;
      
      if (!name || typeof name !== 'string' || name.length > 100) {
        return res.status(400).json({ error: "Name is required and must be less than 100 characters" });
      }
      
      // If this is set as default, unset other defaults first
      if (isDefault) {
        await storage.unsetDefaultPriceBook(workspaceId);
      }
      
      const now = Date.now();
      const priceBook = await storage.createBrewPriceBook({
        workspaceId,
        name,
        description: description || null,
        isDefault: isDefault ? 1 : 0,
        parentPriceBookId: parentPriceBookId || null,
        discountType: discountType || null,
        discountValue: discountValue || null,
        isActive: isActive !== false ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(priceBook);
    } catch (error: any) {
      console.error("Error creating price book:", error);
      // Check for unique constraint violation
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return res.status(400).json({ error: "A price book with this name already exists" });
      }
      res.status(500).json({ error: error.message || "Failed to create price book" });
    }
  });
  
  // PATCH /api/brewcrm/price-books/:id - Update price book
  app.patch("/api/brewcrm/price-books/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const priceBookId = parseInt(req.params.id);
      if (isNaN(priceBookId)) {
        return res.status(400).json({ error: "Invalid price book ID" });
      }
      
      const workspaceId = auth.userId;
      const { name, description, isDefault, parentPriceBookId, discountType, discountValue, isActive } = req.body;
      
      // Check if price book exists
      const existing = await storage.getBrewPriceBook(priceBookId, workspaceId);
      if (!existing) {
        return res.status(404).json({ error: "Price book not found" });
      }
      
      // If this is set as default, unset other defaults first
      if (isDefault) {
        await storage.unsetDefaultPriceBook(workspaceId);
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isDefault !== undefined) updates.isDefault = isDefault ? 1 : 0;
      if (parentPriceBookId !== undefined) updates.parentPriceBookId = parentPriceBookId;
      if (discountType !== undefined) updates.discountType = discountType;
      if (discountValue !== undefined) updates.discountValue = discountValue;
      if (isActive !== undefined) updates.isActive = isActive ? 1 : 0;
      
      const updated = await storage.updateBrewPriceBook(priceBookId, workspaceId, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating price book:", error);
      if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
        return res.status(400).json({ error: "A price book with this name already exists" });
      }
      res.status(500).json({ error: error.message || "Failed to update price book" });
    }
  });
  
  // DELETE /api/brewcrm/price-books/:id - Delete price book
  app.delete("/api/brewcrm/price-books/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const priceBookId = parseInt(req.params.id);
      if (isNaN(priceBookId)) {
        return res.status(400).json({ error: "Invalid price book ID" });
      }
      
      const workspaceId = auth.userId;
      
      // Check if any customers are using this price book
      const customersUsingBook = await storage.getCustomersByPriceBook(priceBookId, workspaceId);
      if (customersUsingBook.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete price book",
          message: `${customersUsingBook.length} customer(s) are assigned to this price book. Please reassign them first.`
        });
      }
      
      // Delete product prices first
      await storage.deleteProductPricesByPriceBook(priceBookId, workspaceId);
      
      const deleted = await storage.deleteBrewPriceBook(priceBookId, workspaceId);
      if (!deleted) {
        return res.status(404).json({ error: "Price book not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting price book:", error);
      res.status(500).json({ error: error.message || "Failed to delete price book" });
    }
  });
  
  // ============================================================
  // PRODUCT PRICES IN PRICE BOOKS
  // ============================================================
  
  // GET /api/brewcrm/price-books/:id/prices - Get product prices for a price book
  app.get("/api/brewcrm/price-books/:id/prices", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const priceBookId = parseInt(req.params.id);
      if (isNaN(priceBookId)) {
        return res.status(400).json({ error: "Invalid price book ID" });
      }
      
      const workspaceId = auth.userId;
      const productPrices = await storage.getProductPricesByPriceBook(priceBookId, workspaceId);
      res.json(productPrices);
    } catch (error: any) {
      console.error("Error getting product prices:", error);
      res.status(500).json({ error: error.message || "Failed to get product prices" });
    }
  });
  
  // POST /api/brewcrm/price-books/:id/prices - Bulk update product prices for a price book
  app.post("/api/brewcrm/price-books/:id/prices", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const priceBookId = parseInt(req.params.id);
      if (isNaN(priceBookId)) {
        return res.status(400).json({ error: "Invalid price book ID" });
      }
      
      const workspaceId = auth.userId;
      const { productPrices } = req.body;
      
      if (!Array.isArray(productPrices)) {
        return res.status(400).json({ error: "productPrices must be an array" });
      }
      
      // Validate each price entry
      for (const pp of productPrices) {
        if (!pp.productId || typeof pp.price !== 'number' || pp.price < 0) {
          return res.status(400).json({ error: "Each price entry must have productId and a non-negative price" });
        }
      }
      
      await storage.bulkUpsertProductPrices(priceBookId, workspaceId, productPrices);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating product prices:", error);
      res.status(500).json({ error: error.message || "Failed to update product prices" });
    }
  });
  
  // POST /api/brewcrm/price-books/:id/copy-prices - Copy prices from another price book
  app.post("/api/brewcrm/price-books/:id/copy-prices", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const targetPriceBookId = parseInt(req.params.id);
      if (isNaN(targetPriceBookId)) {
        return res.status(400).json({ error: "Invalid target price book ID" });
      }
      
      const { sourcePriceBookId } = req.body;
      if (!sourcePriceBookId || isNaN(parseInt(sourcePriceBookId))) {
        return res.status(400).json({ error: "sourcePriceBookId is required" });
      }
      
      const workspaceId = auth.userId;
      await storage.copyPriceBookPrices(parseInt(sourcePriceBookId), targetPriceBookId, workspaceId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error copying prices:", error);
      res.status(500).json({ error: error.message || "Failed to copy prices" });
    }
  });
  
  // ============================================================
  // EFFECTIVE PRICING ENDPOINT
  // ============================================================
  
  // GET /api/brewcrm/products/:productId/effective-price - Get effective price for a product
  app.get("/api/brewcrm/products/:productId/effective-price", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { productId } = req.params;
      const customerId = req.query.customerId as string | undefined;
      const quantity = req.query.quantity ? parseInt(req.query.quantity as string) : 1;
      
      const workspaceId = auth.userId;
      const effectivePrice = await storage.getEffectiveProductPrice(productId, workspaceId, customerId, quantity);
      
      res.json(effectivePrice);
    } catch (error: any) {
      console.error("Error getting effective product price:", error);
      res.status(500).json({ error: error.message || "Failed to get effective product price" });
    }
  });
  
  // ============================================================
  // CUSTOMER PRICE BOOK ASSIGNMENT
  // ============================================================
  
  // PATCH /api/crm/customers/:id/price-book - Update customer's price book assignment
  app.patch("/api/crm/customers/:id/price-book", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const customerId = req.params.id;
      const { priceBookId } = req.body;
      
      // priceBookId can be null (to unassign) or a number
      if (priceBookId !== null && (typeof priceBookId !== 'number' || isNaN(priceBookId))) {
        return res.status(400).json({ error: "priceBookId must be a number or null" });
      }
      
      const workspaceId = auth.userId;
      
      // Verify customer exists
      const customer = await storage.getCrmCustomer(customerId);
      if (!customer || customer.workspaceId !== workspaceId) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // If assigning a price book, verify it exists
      if (priceBookId !== null) {
        const priceBook = await storage.getBrewPriceBook(priceBookId, workspaceId);
        if (!priceBook) {
          return res.status(404).json({ error: "Price book not found" });
        }
      }
      
      await storage.updateCustomerPriceBook(customerId, workspaceId, priceBookId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating customer price book:", error);
      res.status(500).json({ error: error.message || "Failed to update customer price book" });
    }
  });
  
  // ============================================================
  // TRADE STORE ENDPOINTS
  // ============================================================
  
  // GET /api/brewcrm/trade-store/settings - Get trade store settings
  app.get("/api/brewcrm/trade-store/settings", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const settings = await storage.getTradeStoreSettings(auth.userId);
      res.json(settings || {});
    } catch (error: any) {
      console.error("Error getting trade store settings:", error);
      res.status(500).json({ error: error.message || "Failed to get trade store settings" });
    }
  });
  
  // POST /api/brewcrm/trade-store/settings - Update trade store settings
  app.post("/api/brewcrm/trade-store/settings", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const settings = await storage.createOrUpdateTradeStoreSettings({
        ...req.body,
        workspaceId: auth.userId,
      });
      res.json(settings);
    } catch (error: any) {
      console.error("Error updating trade store settings:", error);
      res.status(500).json({ error: error.message || "Failed to update trade store settings" });
    }
  });
  
  // GET /api/brewcrm/trade-store/access - List customer access
  app.get("/api/brewcrm/trade-store/access", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const list = await storage.getTradeStoreAccessList(auth.userId);
      res.json(list);
    } catch (error: any) {
      console.error("Error listing trade store access:", error);
      res.status(500).json({ error: error.message || "Failed to list trade store access" });
    }
  });
  
  // POST /api/brewcrm/trade-store/access - Grant customer access
  app.post("/api/brewcrm/trade-store/access", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { customerId } = req.body;
      if (!customerId) {
        return res.status(400).json({ error: "customerId is required" });
      }
      
      const accessCode = `TS-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
      const now = Date.now();
      
      const access = await storage.createTradeStoreAccess({
        workspaceId: auth.userId,
        customerId,
        accessCode,
        isActive: 1,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(access);
    } catch (error: any) {
      console.error("Error granting trade store access:", error);
      res.status(500).json({ error: error.message || "Failed to grant trade store access" });
    }
  });
  
  // POST /api/trade-store/login - Customer login (public endpoint)
  app.post("/api/trade-store/login", async (req, res) => {
    try {
      const { accessCode } = req.body;
      if (!accessCode) {
        return res.status(400).json({ error: "accessCode is required" });
      }
      
      const access = await storage.getTradeStoreAccessByCode(accessCode);
      if (!access || !access.isActive) {
        return res.status(401).json({ error: "Invalid or inactive access code" });
      }
      
      const crypto = await import('crypto');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
      
      await storage.createTradeStoreSession({
        workspaceId: access.workspaceId,
        customerId: access.customerId,
        sessionToken,
        expiresAt,
        createdAt: Date.now(),
      });
      
      // Update last login
      await storage.updateTradeStoreAccess(access.id, access.workspaceId, {
        lastLoginAt: Date.now(),
      });
      
      res.json({ sessionToken, expiresAt, customerId: access.customerId });
    } catch (error: any) {
      console.error("Error logging into trade store:", error);
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });
  
  // ============================================================
  // CRM TAGS ENDPOINTS
  // ============================================================
  
  // GET /api/crm/tags/:workspaceId - List customer tags
  app.get("/api/crm/tags/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const tags = await storage.getCustomerTags(workspaceId);
      res.json(tags);
    } catch (error: any) {
      console.error("Error listing tags:", error);
      res.status(500).json({ error: error.message || "Failed to list tags" });
    }
  });
  
  // POST /api/crm/tags - Create tag
  app.post("/api/crm/tags", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { name, color } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      
      const tag = await storage.createCustomerTag({
        workspaceId: auth.userId,
        name,
        color: color || '#6b7280',
        createdAt: Date.now(),
      });
      
      res.status(201).json(tag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      res.status(500).json({ error: error.message || "Failed to create tag" });
    }
  });
  
  // DELETE /api/crm/tags/:id - Delete tag
  app.delete("/api/crm/tags/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const deleted = await storage.deleteCustomerTag(parseInt(req.params.id), auth.userId);
      if (!deleted) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: error.message || "Failed to delete tag" });
    }
  });
  
  // GET /api/crm/customers/:id/tags - Get customer's tags
  app.get("/api/crm/customers/:id/tags", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const tags = await storage.getCustomerTagsForCustomer(req.params.id, auth.userId);
      res.json(tags);
    } catch (error: any) {
      console.error("Error getting customer tags:", error);
      res.status(500).json({ error: error.message || "Failed to get customer tags" });
    }
  });
  
  // POST /api/crm/customers/:id/tags - Assign tag to customer
  app.post("/api/crm/customers/:id/tags", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { tagId } = req.body;
      if (!tagId) {
        return res.status(400).json({ error: "tagId is required" });
      }
      
      await storage.assignTagToCustomer(req.params.id, tagId, auth.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error assigning tag:", error);
      res.status(500).json({ error: error.message || "Failed to assign tag" });
    }
  });
  
  // DELETE /api/crm/customers/:id/tags/:tagId - Remove tag from customer
  app.delete("/api/crm/customers/:id/tags/:tagId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.removeTagFromCustomer(req.params.id, parseInt(req.params.tagId), auth.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing tag:", error);
      res.status(500).json({ error: error.message || "Failed to remove tag" });
    }
  });
  
  // ============================================================
  // CRM GROUPS ENDPOINTS
  // ============================================================
  
  // GET /api/crm/groups/:workspaceId - List customer groups
  app.get("/api/crm/groups/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const groups = await storage.getCustomerGroups(workspaceId);
      res.json(groups);
    } catch (error: any) {
      console.error("Error listing groups:", error);
      res.status(500).json({ error: error.message || "Failed to list groups" });
    }
  });
  
  // POST /api/crm/groups - Create group
  app.post("/api/crm/groups", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }
      
      const now = Date.now();
      const group = await storage.createCustomerGroup({
        workspaceId: auth.userId,
        name,
        description: description || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(group);
    } catch (error: any) {
      console.error("Error creating group:", error);
      res.status(500).json({ error: error.message || "Failed to create group" });
    }
  });
  
  // DELETE /api/crm/groups/:id - Delete group
  app.delete("/api/crm/groups/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const deleted = await storage.deleteCustomerGroup(parseInt(req.params.id), auth.userId);
      if (!deleted) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting group:", error);
      res.status(500).json({ error: error.message || "Failed to delete group" });
    }
  });
  
  // ============================================================
  // CRM SAVED FILTERS ENDPOINTS
  // ============================================================
  
  // GET /api/crm/saved-filters/:workspaceId - List saved filters
  app.get("/api/crm/saved-filters/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const filters = await storage.getSavedFilters(workspaceId);
      res.json(filters);
    } catch (error: any) {
      console.error("Error listing saved filters:", error);
      res.status(500).json({ error: error.message || "Failed to list saved filters" });
    }
  });
  
  // POST /api/crm/saved-filters - Create saved filter
  app.post("/api/crm/saved-filters", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { name, description, filterConfig } = req.body;
      if (!name || !filterConfig) {
        return res.status(400).json({ error: "name and filterConfig are required" });
      }
      
      const now = Date.now();
      const filter = await storage.createSavedFilter({
        workspaceId: auth.userId,
        name,
        description: description || null,
        filterConfig,
        isDynamic: 1,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(filter);
    } catch (error: any) {
      console.error("Error creating saved filter:", error);
      res.status(500).json({ error: error.message || "Failed to create saved filter" });
    }
  });
  
  // DELETE /api/crm/saved-filters/:id - Delete saved filter
  app.delete("/api/crm/saved-filters/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const deleted = await storage.deleteSavedFilter(parseInt(req.params.id), auth.userId);
      if (!deleted) {
        return res.status(404).json({ error: "Filter not found" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting saved filter:", error);
      res.status(500).json({ error: error.message || "Failed to delete saved filter" });
    }
  });
  
  // ============================================================
  // CRM ACTIVITIES ENDPOINTS
  // ============================================================
  
  // GET /api/crm/activities/:workspaceId - List activities
  app.get("/api/crm/activities/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const activities = await storage.getActivities(workspaceId);
      res.json(activities);
    } catch (error: any) {
      console.error("Error listing activities:", error);
      res.status(500).json({ error: error.message || "Failed to list activities" });
    }
  });
  
  // GET /api/crm/customers/:id/activities - Get customer's activities
  app.get("/api/crm/customers/:id/activities", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const activities = await storage.getActivitiesForCustomer(req.params.id, auth.userId);
      res.json(activities);
    } catch (error: any) {
      console.error("Error getting customer activities:", error);
      res.status(500).json({ error: error.message || "Failed to get customer activities" });
    }
  });
  
  // POST /api/crm/activities - Create activity
  app.post("/api/crm/activities", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { customerId, leadId, activityType, subject, notes, outcome, durationMinutes } = req.body;
      if (!activityType) {
        return res.status(400).json({ error: "activityType is required" });
      }
      
      const now = Date.now();
      const activity = await storage.createActivity({
        workspaceId: auth.userId,
        customerId: customerId || null,
        leadId: leadId || null,
        activityType,
        subject: subject || null,
        notes: notes || null,
        outcome: outcome || null,
        durationMinutes: durationMinutes || null,
        completedAt: now,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(activity);
    } catch (error: any) {
      console.error("Error creating activity:", error);
      res.status(500).json({ error: error.message || "Failed to create activity" });
    }
  });
  
  // ============================================================
  // CRM TASKS ENDPOINTS
  // ============================================================
  
  // GET /api/crm/tasks/:workspaceId - List tasks
  app.get("/api/crm/tasks/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const tasks = await storage.getTasks(workspaceId, req.query);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error listing tasks:", error);
      res.status(500).json({ error: error.message || "Failed to list tasks" });
    }
  });
  
  // GET /api/crm/tasks/:workspaceId/upcoming - List upcoming tasks
  app.get("/api/crm/tasks/:workspaceId/upcoming", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const tasks = await storage.getUpcomingTasks(workspaceId);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error listing upcoming tasks:", error);
      res.status(500).json({ error: error.message || "Failed to list upcoming tasks" });
    }
  });
  
  // GET /api/crm/tasks/:workspaceId/overdue - List overdue tasks
  app.get("/api/crm/tasks/:workspaceId/overdue", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const tasks = await storage.getOverdueTasks(workspaceId);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error listing overdue tasks:", error);
      res.status(500).json({ error: error.message || "Failed to list overdue tasks" });
    }
  });
  
  // POST /api/crm/tasks - Create task
  app.post("/api/crm/tasks", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { customerId, leadId, title, description, dueDate, priority } = req.body;
      if (!title || !dueDate) {
        return res.status(400).json({ error: "title and dueDate are required" });
      }
      
      const now = Date.now();
      const task = await storage.createTask({
        workspaceId: auth.userId,
        customerId: customerId || null,
        leadId: leadId || null,
        title,
        description: description || null,
        dueDate,
        priority: priority || 'normal',
        status: 'pending',
        assignedTo: auth.userId,
        createdBy: auth.userId,
        createdAt: now,
        updatedAt: now,
      });
      
      res.status(201).json(task);
    } catch (error: any) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: error.message || "Failed to create task" });
    }
  });
  
  // PATCH /api/crm/tasks/:id - Update task
  app.patch("/api/crm/tasks/:id", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const task = await storage.updateTask(parseInt(req.params.id), auth.userId, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: error.message || "Failed to update task" });
    }
  });
  
  // POST /api/crm/tasks/:id/complete - Complete task
  app.post("/api/crm/tasks/:id/complete", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const task = await storage.completeTask(parseInt(req.params.id), auth.userId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.json(task);
    } catch (error: any) {
      console.error("Error completing task:", error);
      res.status(500).json({ error: error.message || "Failed to complete task" });
    }
  });
  
  // ============================================================
  // CONTAINER QR TRACKING ENDPOINTS
  // ============================================================
  
  // POST /api/brewcrm/containers/:id/generate-qr - Generate QR code for container
  app.post("/api/brewcrm/containers/:id/generate-qr", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const container = await storage.generateContainerQRCode(req.params.id, auth.userId);
      if (!container) {
        return res.status(404).json({ error: "Container not found" });
      }
      
      res.json(container);
    } catch (error: any) {
      console.error("Error generating QR code:", error);
      res.status(500).json({ error: error.message || "Failed to generate QR code" });
    }
  });
  
  // GET /api/brewcrm/containers/scan/:qrCode - Scan QR code to get container
  app.get("/api/brewcrm/containers/scan/:qrCode", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const container = await storage.getContainerByQRCode(req.params.qrCode);
      if (!container) {
        return res.status(404).json({ error: "Container not found" });
      }
      
      res.json(container);
    } catch (error: any) {
      console.error("Error scanning QR code:", error);
      res.status(500).json({ error: error.message || "Failed to scan QR code" });
    }
  });
  
  // POST /api/brewcrm/containers/:id/movements - Log container movement
  app.post("/api/brewcrm/containers/:id/movements", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { movementType, fromLocation, toLocation, customerId, orderId, batchId, notes } = req.body;
      if (!movementType) {
        return res.status(400).json({ error: "movementType is required" });
      }
      
      const now = Date.now();
      const movement = await storage.logContainerMovement({
        workspaceId: auth.userId,
        containerId: req.params.id,
        movementType,
        fromLocation: fromLocation || null,
        toLocation: toLocation || null,
        customerId: customerId || null,
        orderId: orderId || null,
        batchId: batchId || null,
        notes: notes || null,
        scannedBy: auth.userId,
        scannedAt: now,
        createdAt: now,
      });
      
      res.status(201).json(movement);
    } catch (error: any) {
      console.error("Error logging container movement:", error);
      res.status(500).json({ error: error.message || "Failed to log container movement" });
    }
  });
  
  // GET /api/brewcrm/containers/:id/movements - Get container movements
  app.get("/api/brewcrm/containers/:id/movements", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const movements = await storage.getContainerMovements(req.params.id, auth.userId);
      res.json(movements);
    } catch (error: any) {
      console.error("Error getting container movements:", error);
      res.status(500).json({ error: error.message || "Failed to get container movements" });
    }
  });
  
  // GET /api/crm/customers/:id/containers - Get containers with customer
  app.get("/api/crm/customers/:id/containers", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const containers = await storage.getContainersWithCustomer(req.params.id, auth.userId);
      res.json(containers);
    } catch (error: any) {
      console.error("Error getting customer containers:", error);
      res.status(500).json({ error: error.message || "Failed to get customer containers" });
    }
  });
  
  // ============================================================
  // DASHBOARD & REPORTING ENDPOINTS
  // ============================================================
  
  // GET /api/crm/dashboard/kpis/:workspaceId - Get dashboard KPIs
  app.get("/api/crm/dashboard/kpis/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const kpis = await storage.getDashboardKPIs(workspaceId);
      res.json(kpis);
    } catch (error: any) {
      console.error("Error getting dashboard KPIs:", error);

      // Check if tables don't exist (graceful degradation for demo/new users)
      if (error.message?.includes('relation "crm_customers" does not exist') ||
          error.message?.includes('relation "crm_orders" does not exist') ||
          error.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Dashboard KPIs not available",
          message: "Customer and order data has not been imported yet. Connect to Xero to enable dashboard analytics.",
          available: false,
          kpis: {
            totalCustomers: 0,
            totalRevenue: 0,
            totalOrders: 0,
            averageOrderValue: 0
          }
        });
      }

      res.status(500).json({ error: error.message || "Failed to get dashboard KPIs" });
    }
  });
  
  // GET /api/crm/dashboard/revenue-by-month/:workspaceId - Get revenue by month
  app.get("/api/crm/dashboard/revenue-by-month/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const months = req.query.months ? parseInt(req.query.months as string) : 12;
      const data = await storage.getRevenueByMonth(workspaceId, months);
      res.json(data);
    } catch (error: any) {
      console.error("Error getting revenue by month:", error);

      // Check if tables don't exist (graceful degradation for demo/new users)
      if (error.message?.includes('relation "crm_orders" does not exist') ||
          error.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Revenue analytics not available",
          message: "Order data has not been imported yet. Connect to Xero to enable revenue analytics.",
          available: false,
          data: []
        });
      }

      res.status(500).json({ error: error.message || "Failed to get revenue by month" });
    }
  });
  
  // GET /api/crm/dashboard/top-customers/:workspaceId - Get top customers
  app.get("/api/crm/dashboard/top-customers/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const customers = await storage.getTopCustomersByRevenue(workspaceId, limit);
      res.json(customers);
    } catch (error: any) {
      console.error("Error getting top customers:", error);

      // Check if tables don't exist (graceful degradation for demo/new users)
      if (error.message?.includes('relation "crm_customers" does not exist') ||
          error.message?.includes('relation "crm_orders" does not exist') ||
          error.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Customer analytics not available",
          message: "Customer and order data has not been imported yet. Connect to Xero to enable customer analytics.",
          available: false,
          customers: []
        });
      }

      res.status(500).json({ error: error.message || "Failed to get top customers" });
    }
  });

  // GET /api/crm/dashboard/top-products/:workspaceId - Get top products
  app.get("/api/crm/dashboard/top-products/:workspaceId", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId } = req.params;
      if (workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const products = await storage.getTopProductsBySales(workspaceId, limit);
      res.json(products);
    } catch (error: any) {
      console.error("Error getting top products:", error);

      // Check if tables don't exist (graceful degradation for demo/new users)
      if (error.message?.includes('relation "crm_order_lines" does not exist') ||
          error.message?.includes('relation "brew_products" does not exist') ||
          error.message?.includes('fetch failed')) {
        return res.status(503).json({
          error: "Product analytics not available",
          message: "Product and order data has not been imported yet. Connect to Xero to enable product analytics.",
          available: false,
          products: []
        });
      }

      res.status(500).json({ error: error.message || "Failed to get top products" });
    }
  });
  
  // ============================================================
  // AGENT ACTION ENDPOINTS (Natural Language Wrappers)
  // ============================================================
  
  // POST /api/crm/actions/create-customer - Agent-friendly customer creation
  app.post("/api/crm/actions/create-customer", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { name, contactName, email, phone, address, city, postcode, country, notes } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Customer name is required" });
      }
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const customer = await storage.createCrmCustomer({
        id: `customer_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        name,
        primaryContactName: contactName || null,
        email: email || null,
        phone: phone || null,
        addressLine1: address || null,
        addressLine2: null,
        city: city || null,
        postcode: postcode || null,
        country: country || 'United Kingdom',
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json({
        success: true,
        message: `Successfully created customer: ${name}`,
        customer,
      });
    } catch (error: any) {
      console.error("Error in create-customer action:", error);
      res.status(500).json({ error: error.message || "Failed to create customer" });
    }
  });
  
  // POST /api/crm/actions/create-order - Agent-friendly order creation
  app.post("/api/crm/actions/create-order", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { customerId, customerName, orderNumber, orderDate, deliveryDate, items, notes } = req.body;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      if (!customerId && !customerName) {
        return res.status(400).json({ error: "Customer info is required" });
      }
      
      let finalCustomerId = customerId;
      if (!finalCustomerId && customerName) {
        const customers = await storage.searchCrmCustomers(workspaceId, customerName);
        if (customers.length > 0) {
          finalCustomerId = customers[0].id;
        } else {
          return res.status(404).json({ error: `Customer "${customerName}" not found` });
        }
      }
      
      // SECURITY: Verify customerId belongs to authenticated user's workspace
      if (finalCustomerId) {
        const customer = await storage.getCrmCustomer(finalCustomerId);
        if (!customer || customer.workspaceId !== auth.userId) {
          return res.status(403).json({ error: "Forbidden: Customer does not belong to your workspace" });
        }
      }
      
      const now = Date.now();
      const autoOrderNumber = orderNumber || `ORD-${Date.now()}`;
      
      const order = await storage.createCrmOrder({
        id: `order_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        customerId: finalCustomerId,
        orderNumber: autoOrderNumber,
        orderDate: orderDate || now,
        status: 'draft',
        deliveryDate: deliveryDate || null,
        deliveryRunId: null,
        currency: 'GBP',
        totalAmount: null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      if (items && Array.isArray(items)) {
        for (const item of items) {
          await storage.createCrmOrderLine({
            id: `order_line_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            orderId: order.id,
            genericItemName: item.name || item.productName,
            genericItemCode: item.code || item.sku || null,
            quantityUnits: item.quantity || 1,
            unitPrice: item.price || 0,
            lineTotal: (item.quantity || 1) * (item.price || 0),
            verticalType: item.verticalType || null,
            verticalRefId: item.productId || null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      
      res.json({
        success: true,
        message: `Successfully created order ${autoOrderNumber}`,
        order,
      });
    } catch (error: any) {
      console.error("Error in create-order action:", error);
      res.status(500).json({ error: error.message || "Failed to create order" });
    }
  });
  
  // POST /api/crm/actions/create-delivery-run - Agent-friendly delivery run creation
  app.post("/api/crm/actions/create-delivery-run", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { workspaceId, name, driverName, vehicle, scheduledDate, notes } = req.body;
      
      if (!workspaceId || !name || !scheduledDate) {
        return res.status(400).json({ error: "Workspace ID, name, and scheduled date are required" });
      }
      
      const now = Date.now();
      const run = await storage.createCrmDeliveryRun({
        id: `delivery_run_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        name,
        driverName: driverName || null,
        vehicle: vehicle || null,
        scheduledDate,
        status: 'planned',
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json({
        success: true,
        message: `Successfully created delivery run: ${name}`,
        deliveryRun: run,
      });
    } catch (error: any) {
      console.error("Error in create-delivery-run action:", error);
      res.status(500).json({ error: error.message || "Failed to create delivery run" });
    }
  });
  
  // POST /api/brewcrm/actions/create-product - Agent-friendly product creation
  app.post("/api/brewcrm/actions/create-product", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { sku, name, beerStyle, abv, ibu, description, packageType, packageSize, cost, price } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Product name is required" });
      }
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      const now = Date.now();
      const product = await storage.createCrmProduct({
        id: `product_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        sku: sku || `SKU-${Date.now()}`,
        name,
        beerStyle: beerStyle || null,
        abv: abv || null,
        ibu: ibu || null,
        description: description || null,
        packageType: packageType || null,
        packageSizeLiters: packageSize || null,
        costPerUnit: cost || null,
        sellingPricePerUnit: price || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json({
        success: true,
        message: `Successfully created product: ${name}`,
        product,
      });
    } catch (error: any) {
      console.error("Error in create-product action:", error);
      res.status(500).json({ error: error.message || "Failed to create product" });
    }
  });
  
  // POST /api/brewcrm/actions/create-batch - Agent-friendly batch creation
  app.post("/api/brewcrm/actions/create-batch", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { batchNumber, productId, productName, brewDate, volumeLiters, yeastType, maltType, hopsType, notes } = req.body;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      if (!batchNumber) {
        return res.status(400).json({ error: "Batch number is required" });
      }
      
      let finalProductId = productId;
      if (!finalProductId && productName) {
        const products = await storage.listCrmProducts(workspaceId);
        const matchedProduct = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
        if (matchedProduct) {
          finalProductId = matchedProduct.id;
        }
      }
      
      if (!finalProductId) {
        return res.status(400).json({ error: "Product ID or product name is required" });
      }
      
      // SECURITY: Verify productId belongs to authenticated user's workspace
      const product = await storage.getCrmProduct(finalProductId);
      if (!product || product.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
      }
      
      const now = Date.now();
      const batch = await storage.createBrewBatch({
        id: `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        workspaceId,
        batchNumber,
        productId: finalProductId,
        brewDate: brewDate || now,
        volumeLiters: volumeLiters || 0,
        status: 'brewing',
        yeastType: yeastType || null,
        maltType: maltType || null,
        hopsType: hopsType || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      });
      
      res.json({
        success: true,
        message: `Successfully created batch: ${batchNumber}`,
        batch,
      });
    } catch (error: any) {
      console.error("Error in create-batch action:", error);
      res.status(500).json({ error: error.message || "Failed to create batch" });
    }
  });
  
  // POST /api/brewcrm/actions/update-inventory - Agent-friendly inventory update
  app.post("/api/brewcrm/actions/update-inventory", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { productId, productName, quantityChange, operation } = req.body;
      
      // SECURITY: Force workspaceId to be the authenticated user's ID
      const workspaceId = auth.userId;
      
      if ((!productId && !productName) || quantityChange === undefined) {
        return res.status(400).json({ error: "Product info and quantity change are required" });
      }
      
      let finalProductId = productId;
      if (!finalProductId && productName) {
        const products = await storage.listCrmProducts(workspaceId);
        const matchedProduct = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
        if (matchedProduct) {
          finalProductId = matchedProduct.id;
        }
      }
      
      if (!finalProductId) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      // SECURITY: Verify productId belongs to authenticated user's workspace
      const product = await storage.getCrmProduct(finalProductId);
      if (!product || product.workspaceId !== auth.userId) {
        return res.status(403).json({ error: "Forbidden: Product does not belong to your workspace" });
      }
      
      let inventory = await storage.getBrewInventoryByProduct(finalProductId);
      const now = Date.now();
      
      if (!inventory) {
        inventory = await storage.createBrewInventory({
          id: `inventory_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          workspaceId,
          productId: finalProductId,
          quantityOnHand: 0,
          quantityAllocated: 0,
          reorderLevel: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      
      const currentQty = inventory.quantityOnHand || 0;
      const newQty = operation === 'set' ? quantityChange : currentQty + quantityChange;
      
      const updated = await storage.updateBrewInventory(inventory.id, {
        quantityOnHand: Math.max(0, newQty),
        updatedAt: now,
      });
      
      res.json({
        success: true,
        message: `Successfully updated inventory. New quantity: ${updated?.quantityOnHand || 0}`,
        inventory: updated,
      });
    } catch (error: any) {
      console.error("Error in update-inventory action:", error);
      res.status(500).json({ error: error.message || "Failed to update inventory" });
    }
  });
  
  // GET /api/crm/actions/search - Agent-friendly unified search
  app.get("/api/crm/actions/search", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { query, type } = req.query;
      
      // SECURITY: Use authenticated user's workspace ID
      const workspaceId = auth.userId;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      const results: any = {
        customers: [],
        orders: [],
        products: [],
      };
      
      if (!type || type === 'customers') {
        results.customers = await storage.searchCrmCustomers(workspaceId, query);
      }
      
      if (!type || type === 'products') {
        const allProducts = await storage.listCrmProducts(workspaceId);
        results.products = allProducts.filter(p => 
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(query.toLowerCase()))
        );
      }
      
      res.json({
        success: true,
        query,
        results,
      });
    } catch (error: any) {
      console.error("Error in search action:", error);
      res.status(500).json({ error: error.message || "Failed to search" });
    }
  });

  // ===========================
  // Tower Webhook Endpoints
  // ===========================
  
  /**
   * POST /api/tower/webhook/evaluation
   * Receives evaluation results from Tower after it analyzes a run
   * This allows Tower to push feedback back to the UI
   */
  app.post("/api/tower/webhook/evaluation", async (req, res) => {
    try {
      // Verify the request is from Tower using API key
      const authHeader = req.headers['x-tower-api-key'] || req.headers['authorization'];
      const expectedKey = process.env.TOWER_API_KEY || process.env.EXPORT_KEY;
      
      if (!expectedKey) {
        console.warn('⚠️ Tower webhook received but no TOWER_API_KEY configured');
        return res.status(500).json({ error: "Tower integration not configured" });
      }
      
      const providedKey = typeof authHeader === 'string' 
        ? authHeader.replace('Bearer ', '') 
        : '';
        
      if (providedKey !== expectedKey) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      
      const { runId, planId, conversationId, evaluation } = req.body;
      
      console.log(`📥 Tower evaluation received for ${runId || planId || conversationId}`);
      console.log(`   Evaluation type: ${evaluation?.type || 'unknown'}`);
      console.log(`   Score: ${evaluation?.score || 'N/A'}`);
      
      // Store the evaluation for display in UI (future enhancement)
      // For now, just log it
      if (evaluation) {
        console.log(`   Summary: ${evaluation.summary || 'No summary'}`);
        if (evaluation.issues?.length > 0) {
          console.log(`   Issues: ${evaluation.issues.length}`);
        }
      }
      
      res.json({ 
        success: true, 
        message: "Evaluation received",
        runId: runId || planId || conversationId 
      });
    } catch (error: any) {
      console.error("Error processing Tower webhook:", error);
      res.status(500).json({ error: error.message || "Failed to process evaluation" });
    }
  });
  
  /**
   * POST /api/tower/webhook/alert
   * Receives alert notifications from Tower (e.g., anomalies, failures)
   */
  app.post("/api/tower/webhook/alert", async (req, res) => {
    try {
      const authHeader = req.headers['x-tower-api-key'] || req.headers['authorization'];
      const expectedKey = process.env.TOWER_API_KEY || process.env.EXPORT_KEY;
      
      if (!expectedKey || (typeof authHeader === 'string' && authHeader.replace('Bearer ', '') !== expectedKey)) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      
      const { alertType, severity, message, runId, userId, timestamp } = req.body;
      
      console.log(`🚨 Tower alert received: ${alertType}`);
      console.log(`   Severity: ${severity || 'info'}`);
      console.log(`   Message: ${message}`);
      if (runId) console.log(`   Run: ${runId}`);
      if (userId) console.log(`   User: ${userId}`);
      
      // Future: Store alerts and/or send notifications
      // For now, just acknowledge receipt
      
      res.json({ 
        success: true, 
        message: "Alert received",
        alertType 
      });
    } catch (error: any) {
      console.error("Error processing Tower alert:", error);
      res.status(500).json({ error: error.message || "Failed to process alert" });
    }
  });

  // ===========================
  // UI-18: Tower proxy endpoints for "What just happened?" viewer
  // ===========================
  
  const TOWER_URL = process.env.TOWER_URL || '';
  const TOWER_API_KEY = process.env.TOWER_API_KEY || process.env.EXPORT_KEY || '';

  /**
   * GET /api/tower/runs
   * Proxy to Tower's /tower/runs endpoint for fetching recent runs
   */
  app.get("/api/tower/runs", async (req, res) => {
    if (!TOWER_URL) {
      return res.status(503).json({ error: "Tower not configured" });
    }

    try {
      const limit = req.query.limit || '10';
      const conversationId = req.query.conversationId as string | undefined;
      
      let url = `${TOWER_URL}/tower/runs?limit=${limit}`;
      
      // Note: Tower may not support conversationId filtering directly
      // If needed, we filter client-side
      
      console.log(`📡 [TowerProxy] Fetching runs from ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TOWER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [TowerProxy] Tower returned ${response.status}: ${errorText}`);
        return res.status(response.status).json({ error: `Tower error: ${response.status}` });
      }

      let runs = await response.json();
      
      // Filter by conversationId if provided (client-side filtering)
      if (conversationId && Array.isArray(runs)) {
        runs = runs.filter((run: any) => 
          run.meta?.conversationId === conversationId
        );
      }

      res.json(runs);
    } catch (error: any) {
      console.error("❌ [TowerProxy] Error fetching runs:", error.message);
      res.status(503).json({ error: "Failed to connect to Tower" });
    }
  });

  /**
   * GET /api/tower/runs/live
   * Proxy to Tower's /tower/runs/live endpoint for live_user runs only
   */
  app.get("/api/tower/runs/live", async (req, res) => {
    if (!TOWER_URL) {
      return res.status(503).json({ error: "Tower not configured" });
    }

    try {
      const limit = req.query.limit || '10';
      const url = `${TOWER_URL}/tower/runs/live?limit=${limit}`;
      
      console.log(`📡 [TowerProxy] Fetching live runs from ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TOWER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [TowerProxy] Tower returned ${response.status}: ${errorText}`);
        return res.status(response.status).json({ error: `Tower error: ${response.status}` });
      }

      const runs = await response.json();
      res.json(runs);
    } catch (error: any) {
      console.error("❌ [TowerProxy] Error fetching live runs:", error.message);
      res.status(503).json({ error: "Failed to connect to Tower" });
    }
  });

  /**
   * GET /api/tower/dashboard
   * Redirect to Tower dashboard (for "Open in Tower" links)
   */
  app.get("/api/tower/dashboard", (req, res) => {
    if (!TOWER_URL) {
      return res.status(503).json({ error: "Tower not configured" });
    }

    const runId = req.query.runId as string | undefined;
    
    // Redirect to Tower's dashboard
    // Tower dashboard is typically at /dashboard
    const dashboardUrl = runId 
      ? `${TOWER_URL}/dashboard?runId=${encodeURIComponent(runId)}`
      : `${TOWER_URL}/dashboard`;
    
    res.redirect(dashboardUrl);
  });

  /**
   * GET /api/workflow/ledger
   * Serve the canonical workflow ledger
   */
  app.get("/api/workflow/ledger", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Ledger is in parent directory: GitHub/thoughts/ledgers/WORKFLOW-wyshbone.md
      const ledgerPath = path.join(process.cwd(), '..', 'thoughts', 'ledgers', 'WORKFLOW-wyshbone.md');

      // Check if file exists
      if (!fs.existsSync(ledgerPath)) {
        return res.status(404).json({ error: 'Workflow ledger not found' });
      }

      // Read and return the ledger as text
      const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8');
      res.setHeader('Content-Type', 'text/markdown');
      res.send(ledgerContent);
    } catch (error: any) {
      console.error("❌ Error reading workflow ledger:", error.message);
      res.status(500).json({ error: "Failed to read workflow ledger", details: error.message });
    }
  });

  /**
   * POST /api/workflow/continue
   * DEV-ONLY: Find next incomplete microtask in phase or epic
   * Body: { scope: "phase" | "epic", id: "1" | "1.1" }
   * Response: { phaseId, epicId, taskId, taskDescription, microtaskIndex, microtaskText }
   */
  app.post("/api/workflow/continue", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const { scope, id } = req.body;

      if (!scope || !id) {
        return res.status(400).json({ error: 'Missing scope or id in request body' });
      }

      if (scope !== 'phase' && scope !== 'epic') {
        return res.status(400).json({ error: 'Scope must be "phase" or "epic"' });
      }

      const ledgerPath = path.join(process.cwd(), '..', 'thoughts', 'ledgers', 'WORKFLOW-wyshbone.md');
      if (!fs.existsSync(ledgerPath)) {
        return res.status(404).json({ error: 'Workflow ledger not found' });
      }

      const ledgerContent = fs.readFileSync(ledgerPath, 'utf-8').replace(/\r\n/g, '\n');  // Normalize Windows line endings
      const lines = ledgerContent.split('\n');

      let currentPhase: string | null = null;
      let currentPhaseId: string | null = null;
      let currentEpic: string | null = null;
      let currentEpicId: string | null = null;
      let currentTask: string | null = null;
      let currentTaskId: string | null = null;
      let currentTaskDescription: string | null = null;
      let inMicrotasks = false;
      let microtaskIndex = 0;

      let inTargetScope = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Phase header (## Phase X:)
        if (line.match(/^## Phase (\d+):/)) {
          const match = line.match(/^## Phase (\d+): (.+)$/);
          if (match) {
            currentPhaseId = match[1];
            currentPhase = match[2];
            currentEpic = null;
            currentEpicId = null;
            currentTask = null;
            currentTaskId = null;
            currentTaskDescription = null;
            inMicrotasks = false;

            // When searching by phase, set scope for the whole phase
            if (scope === 'phase') {
              inTargetScope = currentPhaseId === id;
            }
            // When searching by epic, we're now out of any previous epic
            else if (scope === 'epic') {
              inTargetScope = false;
            }
          }
        }

        // Epic header (### Epic X.Y:)
        else if (line.match(/^### Epic (\d+\.\d+):/)) {
          const match = line.match(/^### Epic (\d+\.\d+): (.+)$/);
          if (match) {
            currentEpicId = match[1];
            currentEpic = match[2];
            currentTask = null;
            currentTaskId = null;
            currentTaskDescription = null;
            inMicrotasks = false;

            // When searching by epic, only set scope for the target epic
            if (scope === 'epic') {
              inTargetScope = currentEpicId === id;
            }
            // When searching by phase, stay in scope (don't change it)
          }
        }

        // Task (- [ ] Task X:)
        else if (line.match(/^- \[([ →x!])\] Task (\d+): (.+)$/)) {
          const match = line.match(/^- \[([ →x!])\] Task (\d+): (.+)$/);
          if (match) {
            const status = match[1];
            currentTaskId = match[2];
            currentTaskDescription = match[3];
            inMicrotasks = false;
            microtaskIndex = 0;

            // Skip completed or blocked tasks
            if (status === 'x' || status === '!') {
              currentTask = null;
              currentTaskId = null;
              currentTaskDescription = null;
            } else {
              currentTask = `${currentTaskId}: ${currentTaskDescription}`;
            }
          }
        }

        // Microtasks header
        else if (line.match(/^\s+- Microtasks:/)) {
          inMicrotasks = true;
          microtaskIndex = 0;
        }

        // Individual microtask (4+ spaces, checkbox)
        else if (line.match(/^\s{4,}- \[([ x])\] (.+)$/)) {
          if (inTargetScope && inMicrotasks && currentTask) {
            const match = line.match(/^\s{4,}- \[([ x])\] (.+)$/);
            if (match) {
              const completed = match[1] === 'x';
              const microtaskText = match[2];

              console.log(`[DEBUG] Found microtask: "${microtaskText}", completed=${completed}, inTargetScope=${inTargetScope}, currentEpicId=${currentEpicId}, currentTaskId=${currentTaskId}`);

              // Found incomplete microtask!
              if (!completed) {
                return res.json({
                  phaseId: currentPhaseId,
                  phaseName: currentPhase,
                  epicId: currentEpicId,
                  epicName: currentEpic,
                  taskId: currentTaskId,
                  taskDescription: currentTaskDescription,
                  microtaskIndex,
                  microtaskText,
                  textBlock: `Phase ${currentPhaseId}: ${currentPhase}\nEpic ${currentEpicId}: ${currentEpic}\n\nTask ${currentTaskId}: ${currentTaskDescription}\n\nMicrotask ${microtaskIndex + 1}: ${microtaskText}`
                });
              }

              microtaskIndex++;
            }
          }
        }
      }

      // No incomplete microtask found
      return res.status(404).json({
        error: 'No incomplete microtasks found in the specified scope',
        scope,
        id
      });

    } catch (error: any) {
      console.error("❌ Error in /api/workflow/continue:", error.message);
      res.status(500).json({ error: "Failed to process continue request", details: error.message });
    }
  });

  /**
   * POST /api/workflow/mark
   * DEV-ONLY: Mark a microtask as done/in-progress/blocked and update ledger
   * Body: { epicId: "1.1", taskId: "1", microtaskIndex: 0, status: "done" | "in-progress" | "blocked", evidence?: string }
   */
  app.post("/api/workflow/mark", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const { epicId, taskId, microtaskIndex, status, evidence } = req.body;

      if (!epicId || !taskId || microtaskIndex === undefined || !status) {
        return res.status(400).json({ error: 'Missing required fields: epicId, taskId, microtaskIndex, status' });
      }

      if (!['done', 'in-progress', 'blocked'].includes(status)) {
        return res.status(400).json({ error: 'Status must be "done", "in-progress", or "blocked"' });
      }

      const ledgerPath = path.join(process.cwd(), '..', 'thoughts', 'ledgers', 'WORKFLOW-wyshbone.md');
      if (!fs.existsSync(ledgerPath)) {
        return res.status(404).json({ error: 'Workflow ledger not found' });
      }

      let ledgerContent = fs.readFileSync(ledgerPath, 'utf-8').replace(/\r\n/g, '\n');  // Normalize Windows line endings
      const lines = ledgerContent.split('\n');

      let currentEpicId: string | null = null;
      let currentTaskId: string | null = null;
      let inMicrotasks = false;
      let currentMicrotaskIndex = 0;
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Epic header
        if (line.match(/^### Epic (\d+\.\d+):/)) {
          const match = line.match(/^### Epic (\d+\.\d+):/);
          if (match) {
            currentEpicId = match[1];
            inMicrotasks = false;
            currentMicrotaskIndex = 0;
          }
        }

        // Task
        else if (line.match(/^- \[([ →x!])\] Task (\d+):/)) {
          const match = line.match(/^- \[([ →x!])\] Task (\d+):/);
          if (match) {
            currentTaskId = match[2];
            inMicrotasks = false;
            currentMicrotaskIndex = 0;
          }
        }

        // Microtasks header
        else if (line.match(/^\s+- Microtasks:/)) {
          inMicrotasks = true;
          currentMicrotaskIndex = 0;
        }

        // Individual microtask
        else if (inMicrotasks && line.match(/^\s{4,}- \[([ x])\] (.+)$/)) {
          if (currentEpicId === epicId && currentTaskId === taskId && currentMicrotaskIndex === microtaskIndex) {
            // Update this microtask
            const checkbox = status === 'done' ? 'x' : ' ';
            const microtaskText = line.replace(/^\s{4,}- \[[ x]\] /, '');
            const indent = line.match(/^(\s{4,})/)?.[1] || '    ';
            lines[i] = `${indent}- [${checkbox}] ${microtaskText}`;
            updated = true;

            // If evidence is provided, update the Evidence field of the parent task
            if (evidence) {
              // Find the Evidence line for the current task
              for (let j = i - 1; j >= 0; j--) {
                if (lines[j].match(/^- \[/)) {
                  // Found the task line, now find Evidence
                  for (let k = j + 1; k < i; k++) {
                    if (lines[k].match(/^\s+- Evidence:/)) {
                      lines[k] = `  - Evidence: ${evidence}`;
                      break;
                    }
                  }
                  break;
                }
              }
            }

            break;
          }

          currentMicrotaskIndex++;
        }
      }

      if (!updated) {
        return res.status(404).json({
          error: 'Microtask not found',
          epicId,
          taskId,
          microtaskIndex
        });
      }

      // Write back to file
      const updatedContent = lines.join('\n');
      fs.writeFileSync(ledgerPath, updatedContent, 'utf-8');

      console.log(`✅ Updated microtask: Epic ${epicId}, Task ${taskId}, Microtask ${microtaskIndex} -> ${status}`);

      return res.json({
        success: true,
        epicId,
        taskId,
        microtaskIndex,
        status,
        evidence: evidence || null
      });

    } catch (error: any) {
      console.error("❌ Error in /api/workflow/mark:", error.message);
      res.status(500).json({ error: "Failed to update workflow ledger", details: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
