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
  loadConversationHistory,
  extractAndSaveFacts,
  buildContextWithFacts,
  updateConversationLabel,
  getOrCreateRunId,
  resetRunId,
} from "./memory";
import {
  chatRequestSchema,
  addNoteRequestSchema,
  searchRequestSchema,
  createSessionRequestSchema,
  createIntegrationRequestSchema,
} from "@shared/schema";
import { storage } from "./storage";
import cors from "cors";
import * as cheerio from "cheerio";
import { neon } from "@neondatabase/serverless";
import { createXeroOAuthRouter } from "./routes/xero-oauth";
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

const sql = neon(process.env.DATABASE_URL!);

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
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia",
});

// Helper to identify each user's session (Bubble should send x-session-id)
function getSessionId(req: import("express").Request) {
  return (req.headers["x-session-id"] as string) || req.ip || "anon";
}

// SECURITY: Authentication middleware to validate session and extract userId
async function getAuthenticatedUserId(req: import("express").Request): Promise<{ userId: string; userEmail: string } | null> {
  // Development fallback: allow URL parameters for testing ONLY
  const urlUserId = (req.params.userId || req.query.userId || req.query.user_id) as string | undefined;
  const urlUserEmail = req.query.user_email as string | undefined;
  
  // Debug logging
  console.log('🔍 Auth check:', {
    env: process.env.NODE_ENV,
    urlUserId,
    urlUserEmail,
    query: req.query,
    hasSessionHeader: !!req.headers["x-session-id"]
  });
  
  // If development mode and URL params present, allow (but warn)
  if (process.env.NODE_ENV === 'development' && urlUserId && urlUserEmail) {
    console.warn(`⚠️ DEV MODE: Using URL auth for ${urlUserEmail} - DISABLE IN PRODUCTION`);
    return { userId: urlUserId, userEmail: urlUserEmail };
  }
  
  // Production path: validate session
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    console.log('❌ No session ID and no valid dev auth params');
    return null;
  }
  
  try {
    // Validate session and get user info
    console.log(`🔍 Validating session: ${sessionId}`);
    const session = await storage.getSession(sessionId);
    if (!session) {
      console.log(`❌ Session not found in database: ${sessionId}`);
      return null;
    }
    
    console.log(`✅ Session valid for user: ${session.userEmail}`);
    return {
      userId: session.userId,
      userEmail: session.userEmail
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
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
  // Enable CORS for all routes
  app.use(cors());

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

      const { email, password, name, demoSessionId } = validation.data;

      // Check if user already exists
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const userId = generateId();
      
      const user = await storage.createUser({
        id: userId,
        email,
        passwordHash,
        name: name || null,
        subscriptionTier: "free",
        subscriptionStatus: "inactive",
        monitorCount: 0,
        deepResearchCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

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
      
      // If company name or domain was provided, infer industry
      let inferredIndustry: string | null | undefined = undefined;
      let confidence: number | null | undefined = undefined;
      
      if (updates.companyName || updates.companyDomain) {
        const tempUser = await storage.getUserById(auth.userId);
        if (tempUser) {
          // Merge current user data with updates to get fresh context
          const mergedUserData = {
            ...tempUser,
            companyName: updates.companyName ?? tempUser.companyName,
            companyDomain: updates.companyDomain ?? tempUser.companyDomain,
          };
          
          // Use context builder to infer industry from merged data
          const ctx = buildSessionContext(mergedUserData as any);
          
          inferredIndustry = ctx.inferredIndustry ?? null;
          confidence = ctx.confidence;
        }
      }

      // Update user profile
      const updatedUser = await storage.updateUser(auth.userId, {
        ...updates,
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
  app.post("/api/subscription/create", async (req, res) => {
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
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/account?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/pricing`,
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
  app.get("/api/subscription/status", async (req, res) => {
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
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      
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
  app.post("/api/subscription/cancel", async (req, res) => {
    try {
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(auth.userId);
      if (!user || !user.stripeSubscriptionId) {
        return res.status(404).json({ error: "No active subscription" });
      }

      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      
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
  // POST /api/chat – streaming + MEMORY
  // ===========================
  app.post("/api/chat", async (req, res) => {
    console.log('🎯 POST /api/chat received', { query: req.query, hasBody: !!req.body });
    
    // 🏢 TOWER: Declare variables at top level for error handler access
    let runId = '';
    let conversationId = '';
    let latestUserText = '';
    let runStartTime = Date.now();
    const toolCallsLog: Array<{ name: string; args: any; result?: any; error?: string }> = [];
    let user: any = null;
    
    try {
      // Validate request body against your existing schema
      const validation = chatRequestSchema.safeParse(req.body);
      if (!validation.success) {
        console.log('❌ Validation failed:', validation.error);
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const validatedData = validation.data;
      user = validatedData.user;
      const { messages, defaultCountry, conversationId: requestedConversationId } = validatedData;
      console.log('📝 Chat request from user:', user.id, user.email);
      
      // SECURITY: Validate authenticated user matches the user in request
      const auth = await getAuthenticatedUserId(req);
      console.log('🔐 Auth result:', auth);
      if (!auth) {
        console.log('❌ No auth - returning 401');
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (user.id !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to chat as ${user.id}`);
        return res.status(403).json({ error: "Forbidden: Cannot chat as another user" });
      }
      console.log('✅ Authentication passed for:', auth.userEmail);
      
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

      // Send conversationId to frontend as first event
      res.write(`data: ${JSON.stringify({ conversationId })}\n\n`);

      // DETECT NEW SEARCH FIRST (before contaminating memory with old context)
      const newSearchPatterns = /\b(find|search|get|show|list|lookup|discover|run|trigger|execute)\b.*\b(in|for|at|across)\b/i;
      const isNewSearch = newSearchPatterns.test(latestUserText);
      
      if (isNewSearch) {
        console.log("🆕 Detected new search - clearing session context");
        await storage.clearPendingConfirmation(sessionId);
        await storage.clearPartialWorkflow(sessionId);
        resetConversation(sessionId); // Clear in-memory session cache
      }

      // 1) Save user's new message to database
      await saveMessage(conversationId, "user", latestUserText);
      console.log("💾 Saved user message to database");

      // Update conversation label if this is the first user message
      await updateConversationLabel(conversationId, latestUserText);

      // SUPERVISOR INTEGRATION: Detect if this message requires Supervisor assistance
      if (isSupabaseConfigured()) {
        try {
          const intentResult = detectSupervisorIntent(latestUserText);
          
          if (intentResult.requiresSupervisor && intentResult.taskType && intentResult.requestData) {
            console.log(`🤖 Supervisor intent detected: ${intentResult.taskType}`);
            
            // Create Supervisor task in Supabase
            const supervisorTask = await createSupervisorTask(
              conversationId,
              user.id,
              intentResult.taskType,
              intentResult.requestData
            );
            
            console.log(`✅ Created Supervisor task ${supervisorTask.id} for ${intentResult.taskType}`);
            
            // Notify frontend that Supervisor is working
            res.write(`data: ${JSON.stringify({ 
              supervisorTaskId: supervisorTask.id,
              supervisorTaskType: intentResult.taskType 
            })}\n\n`);
          }
        } catch (error: any) {
          console.error('❌ Supervisor integration error:', error);
          // Don't fail the whole request - continue with standard chat
        }
      }

      // 2) Load conversation history from database
      const conversationHistory = await loadConversationHistory(conversationId);
      console.log(`📚 Loaded ${conversationHistory.length} messages from conversation history`);

      // 3) Get user context for personalization
      const currentUser = await storage.getUserById(user.id);
      let userSessionContext: SessionContext | undefined = undefined;
      
      if (currentUser) {
        // Explicitly map database user fields to avoid type casting issues
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
      } else {
        console.log(`⚠️ User ${user.id} not found in database, using default prompt`);
      }

      // 4) Build context with facts (personalized system prompt if context available)
      const memoryMessages = await buildContextWithFacts(user.id, conversationHistory, 20, userSessionContext);
      console.log(`🧠 Built context with facts for user ${user.id}`);
      
      // Also keep in-memory conversation for backwards compatibility with existing features
      appendMessage(sessionId, { role: "user", content: latestUserText });
      await maybeSummarize(sessionId, openai);

      // Stream from OpenAI using Responses API with GPT-5
      let aiBuffer = "";

      // ===========================
      // USER GOAL CAPTURE
      // Check if we're awaiting the user's goal, or if we need to ask for it
      // Skip goal capture for commands, searches, or procedural requests
      // ===========================
      const isCommand = /^(status|pause|stop|resume|cancel)\s+job/i.test(latestUserText) || 
                        /^\//.test(latestUserText) ||
                        /^(help|hi|hello)$/i.test(latestUserText.trim());
      const isAwaitingGoal = await storage.isAwaitingGoal(sessionId);
      const hasGoal = await storage.hasUserGoal(sessionId);

      if (isAwaitingGoal && !isCommand) {
        // User is providing their goal - capture it
        console.log("🎯 Capturing user goal:", latestUserText.substring(0, 100));
        await storage.setUserGoal(sessionId, latestUserText);
        await storage.setAwaitingGoal(sessionId, false);
        
        const confirmationMsg = `Got it! I'll use "${latestUserText}" as your goal for this session. How can I help you achieve it?`;
        appendMessage(sessionId, { role: "assistant", content: confirmationMsg });
        await saveMessage(conversationId, "assistant", confirmationMsg);
        console.log("💾 Saved goal confirmation message to database");
        
        // 🏢 TOWER: Log goal capture
        await completeRunLog(
          runId,
          conversationId,
          user.id,
          user.email,
          latestUserText,
          confirmationMsg,
          'success',
          runStartTime,
          undefined,
          undefined,
          'standard'
        );
        
        res.write(`data: ${JSON.stringify({ content: confirmationMsg })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      if (!hasGoal && !isNewSearch && !isCommand && conversationHistory.length <= 1) {
        // No goal set yet and this is early in the conversation - ask for it once
        console.log("❓ No goal set for session - asking user (first interaction)");
        await storage.setAwaitingGoal(sessionId, true);
        
        const goalRequestMsg = `Before we get started, what's your high-level sales or lead goal for this session?\n\nFor example:\n• "Find 50 new pubs in Yorkshire that might stock craft IPA"\n• "Identify dental practices in Manchester for our equipment"\n• "Discover coffee shops in London that opened in 2024"`;
        appendMessage(sessionId, { role: "assistant", content: goalRequestMsg });
        await saveMessage(conversationId, "assistant", goalRequestMsg);
        console.log("💾 Saved goal request message to database");
        
        // 🏢 TOWER: Log goal request
        await completeRunLog(
          runId,
          conversationId,
          user.id,
          user.email,
          latestUserText,
          goalRequestMsg,
          'success',
          runStartTime,
          undefined,
          undefined,
          'standard'
        );
        
        res.write(`data: ${JSON.stringify({ content: goalRequestMsg })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      // If user declined to provide goal or we're past the first interaction, auto-infer from context
      if (!hasGoal && !isCommand) {
        const inferredGoal = latestUserText.length > 10 ? latestUserText : "General business lead generation";
        console.log("🔍 Auto-inferring user goal from message:", inferredGoal.substring(0, 100));
        await storage.setUserGoal(sessionId, inferredGoal);
      }

      // Check if the latest message contains URLs
      const urls = extractUrls(latestUserText);
      const useDirectFetch = urls.length > 0;

      // Check if user wants to control an existing job
      const jobCommandPattern = /\b(status|pause|stop|resume|cancel)\s+job\s+(\S+)/i;
      const jobCommandMatch = latestUserText.match(jobCommandPattern);
      
      if (jobCommandMatch) {
        const [, command, jobId] = jobCommandMatch;
        console.log(`🎯 Detected job command: ${command} for job ${jobId}`);
        
        try {
          if (command.toLowerCase() === 'status') {
            const statusResp = await fetch(`http://localhost:5000/api/jobs/status?jobId=${jobId}`);
            const statusData = await statusResp.json();
            
            if (statusResp.ok) {
              const responseText = `📊 Job ${jobId} Status:\n\n` +
                `Business Type: ${statusData.business_type}\n` +
                `Status: ${statusData.status}\n` +
                `Progress: ${statusData.processed_count}/${statusData.total} (${statusData.percent}%)\n` +
                `Recent Region: ${statusData.recent_region || 'N/A'}\n` +
                `Failed: ${statusData.failed.length}`;
              
              appendMessage(sessionId, { role: "assistant", content: responseText });
              await saveMessage(conversationId, "assistant", responseText);
              console.log("💾 Saved job status message to database");
              res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            } else {
              const errorMsg = `❌ Failed to get job status: ${statusData.error || 'Unknown error'}`;
              appendMessage(sessionId, { role: "assistant", content: errorMsg });
              await saveMessage(conversationId, "assistant", errorMsg);
              console.log("💾 Saved job status error message to database");
              res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            }
          } else if (command.toLowerCase() === 'pause' || command.toLowerCase() === 'stop') {
            const stopResp = await fetch(`http://localhost:5000/api/jobs/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const stopData = await stopResp.json();
            
            const responseText = stopResp.ok 
              ? `⏸️ Job ${jobId} has been paused` 
              : `❌ Failed to pause job: ${stopData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved job pause message to database");
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          } else if (command.toLowerCase() === 'resume') {
            const startResp = await fetch(`http://localhost:5000/api/jobs/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const startData = await startResp.json();
            
            const responseText = startResp.ok 
              ? `▶️ Job ${jobId} has been resumed` 
              : `❌ Failed to resume job: ${startData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved job resume message to database");
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          } else if (command.toLowerCase() === 'cancel') {
            const stopResp = await fetch(`http://localhost:5000/api/jobs/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobId })
            });
            const stopData = await stopResp.json();
            
            const responseText = stopResp.ok 
              ? `🛑 Job ${jobId} has been cancelled` 
              : `❌ Failed to cancel job: ${stopData.error}`;
            
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved job cancel message to database");
            res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            return res.end();
          }
        } catch (error: any) {
          console.error("❌ Job command error:", error.message);
          const errorMsg = `Sorry, I couldn't execute that command: ${error.message}`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          await saveMessage(conversationId, "assistant", errorMsg);
          console.log("💾 Saved job command error message to database");
          res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }
      }

      // Check if user wants to create a region-powered job (ONLY for "across all" patterns)
      // Regular "find/search" is now handled by Chat Completions API tool calling
      const jobCreationPattern = /\b(run|search|find)\b.*(across|in all|every)\b.*(counties|boroughs|states)/i;
      const isJobCreationRequest = jobCreationPattern.test(latestUserText);
      
      if (isJobCreationRequest) {
        console.log("🔵 Detected region job request - extracting parameters...");
        
        try {
          const extractionPrompt = [
            {
              role: "system" as const,
              content: `Extract job parameters from user request. Return JSON with: business_type (string), country ("UK" or "US"), granularity ("county", "borough", or "state"), region_filter (optional string like "London" or "Texas"). 
              
Examples:
- "Run dentists across all London boroughs" → {"business_type":"dentists","country":"UK","granularity":"borough","region_filter":"London"}
- "Search for pubs in every English county" → {"business_type":"pubs","country":"UK","granularity":"county"}
- "Find breweries in all Texas counties" → {"business_type":"breweries","country":"US","granularity":"county","region_filter":"Texas"}`
            },
            {
              role: "user" as const,
              content: `Extract from: "${latestUserText}"`
            }
          ];

          const extractionResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: extractionPrompt,
            response_format: { type: "json_object" },
          });

          const params = JSON.parse(extractionResp.choices[0]?.message?.content || "{}");
          console.log("📋 Extracted job params:", params);

          if (params.business_type && params.country && params.granularity) {
            // Create the job
            const createResp = await fetch(`http://localhost:5000/api/jobs/create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                business_type: params.business_type,
                country: params.country,
                granularity: params.granularity,
                region_filter: params.region_filter,
                userEmail: user.email
              })
            });

            const createData = await createResp.json();
            
            if (createResp.ok) {
              const { jobId, total_regions } = createData;
              
              // Start the job in background
              fetch(`http://localhost:5000/api/jobs/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
              }).catch(err => console.error("Failed to start job:", err));

              const responseText = `✅ Started job #${jobId} with ${total_regions} regions!\n\n` +
                `I'm now running searches for "${params.business_type}" across all regions.\n\n` +
                `Use "status job ${jobId}" to check progress.`;
              
              appendMessage(sessionId, { role: "assistant", content: responseText });
              await saveMessage(conversationId, "assistant", responseText);
              console.log("💾 Saved job creation message to database");
              res.write(`data: ${JSON.stringify({ done: false, text: responseText })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            } else {
              const errorMsg = `❌ Failed to create job: ${createData.error}`;
              appendMessage(sessionId, { role: "assistant", content: errorMsg });
              await saveMessage(conversationId, "assistant", errorMsg);
              console.log("💾 Saved job creation error message to database");
              res.write(`data: ${JSON.stringify({ done: false, text: errorMsg })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              return res.end();
            }
          } else {
            console.log("⚠️ Could not extract valid job parameters");
          }
        } catch (error: any) {
          console.error("❌ Job creation error:", error.message);
        }
      }

      // Check if user is confirming a pending batch workflow
      const pendingConfirmation = await storage.getPendingConfirmation(sessionId);
      const confirmationPattern = /^(yes|ok|confirm|proceed|go ahead|execute|send|do it)/i;
      const cancellationPattern = /^(no|cancel|stop|abort|nevermind|don't)/i;
      const correctionPattern = /^(actually|no,?\s+|i meant|change|correct|fix|instead|it should be)/i;

      if (pendingConfirmation) {
        // Check if user wants to make a correction/modification
        if (correctionPattern.test(latestUserText.trim()) || 
            /change.*to|make it|switch to|update.*to|do it for|apply.*to|use.*instead/i.test(latestUserText.trim()) ||
            /can you.*for (all|both|the|these)/i.test(latestUserText.trim())) {
          console.log("🔄 User wants to modify the workflow");
          
          // Use GPT to extract what they want to change, with conversation history for context
          const modificationPrompt = [
            {
              role: "system" as const,
              content: `You are updating a workflow. Extract what the user wants to change from their message. Return a JSON object with ONLY the fields they want to modify.

Possible fields:
- business_types: array of business types
- roles: array of job roles  
- delay_ms: number (convert "4s" to 4000, "500ms" to 500)
- counties: array of specific locations
- country: country code or name

IMPORTANT: Look at the conversation history to understand references like "all three locations", "those cities", etc.

Examples:
- "change to coffee shops" → {"business_types": ["coffee shops"]}
- "change location to Dublin" → {"counties": ["Dublin"]}
- "can you do it for all three locations" + history mentions Bath, Kendal, London → {"counties": ["Bath", "Kendal", "London"]}`
            },
            {
              role: "user" as const,
              content: `Recent conversation:\n${memoryMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}\n\nCurrent workflow: ${JSON.stringify(pendingConfirmation)}\n\nUser modification request: "${latestUserText}"\n\nExtract the modifications:`
            }
          ];

          try {
            const modResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: modificationPrompt,
              response_format: { type: "json_object" },
            });

            const modifications = JSON.parse(modResp.choices[0]?.message?.content || "{}");
            console.log("📝 Extracted modifications:", modifications);
            
            // LOCATION AMBIGUITY GUARD FOR MODIFICATIONS
            // Check if modifications include location changes
            const defaultCountry = (req as any).defaultCountry || 'United Kingdom';
            
            if (modifications.counties && Array.isArray(modifications.counties) && modifications.counties.length > 0) {
              console.log(`🔍 Checking modified counties/cities for ambiguity: ${modifications.counties.join(', ')}`);
              
              const { guardLocation } = await import("./locationGuard");
              const userId = ((req as any).session)?.userId || (req as any).user?.id || "anonymous";
              
              // Check each modified city
              for (const cityName of modifications.counties) {
                const guard = await guardLocation({
                  userId,
                  location: cityName,
                  country: defaultCountry
                });
                
                // If we have a message (warning or disambiguation), send it
                if (guard.message) {
                  res.write(`data: ${JSON.stringify({ content: guard.message })}\n\n`);
                  
                  // If we can't proceed (disambiguation needed), stop here
                  if (!guard.proceed) {
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                    appendMessage(sessionId, { role: "assistant", content: guard.message });
                    await saveMessage(conversationId, "assistant", guard.message);
                    console.log("💾 Saved assistant message to database");
                    return;
                  }
                  
                  // If we can proceed with a warning, the message was already sent
                  // Continue with the modification but user saw the warning
                  break; // Only warn once if multiple cities
                }
              }
            }
            
            // Update pending confirmation with modifications
            const updatedConfirmation = {
              ...pendingConfirmation,
              ...modifications,
              timestamp: new Date().toISOString()
            };
            
            await storage.setPendingConfirmation(sessionId, updatedConfirmation);
            
            // Show updated preview
            let previewText = `📋 **Updated Workflow Preview**\n\n`;
            const counties = updatedConfirmation.counties || [];
            const country = updatedConfirmation.country || 'GB';
            
            previewText += `I'll make **${counties.length} API call(s)** to the autogen endpoint:\n\n`;
            
            for (const county of counties) {
              for (const businessType of updatedConfirmation.business_types) {
                for (const role of updatedConfirmation.roles) {
                  previewText += `• ${role} @ ${businessType} in **${county}, ${country}**\n`;
                }
              }
            }
            
            previewText += `\n**Parameters:**\n`;
            previewText += `- Delay: ${updatedConfirmation.delay_ms}ms\n`;
            previewText += `- Smarlead ID: ${updatedConfirmation.smarlead_id}\n`;
            previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;
            
            appendMessage(sessionId, { role: "assistant", content: previewText });
            await saveMessage(conversationId, "assistant", previewText);
            console.log("💾 Saved workflow preview message to database");
            res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          } catch (err: any) {
            console.error("❌ Modification extraction error:", err.message);
            // Fall back to clearing if extraction fails
            await storage.clearPendingConfirmation(sessionId);
            const responseText = "I couldn't understand the change. Please tell me what you'd like to search for.";
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved workflow modification error message to database");
            res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            res.end();
            return;
          }
        }
        
        if (confirmationPattern.test(latestUserText.trim())) {
          console.log("✅ User confirmed batch execution");
          await storage.clearPendingConfirmation(sessionId);

          try {
            const { bubbleRunBatch } = await import("./bubble");
            const result = await bubbleRunBatch({
              business_types: pendingConfirmation.business_types,
              roles: pendingConfirmation.roles,
              delay_ms: pendingConfirmation.delay_ms,
              number_countiestosearch: pendingConfirmation.number_countiestosearch,
              smarlead_id: pendingConfirmation.smarlead_id,
              counties: pendingConfirmation.counties,  // Pass exact counties from preview
              country: pendingConfirmation.country,  // Pass country/state
              userEmail: auth.userEmail  // Pass current user's email
            });

            const successCount = result.results.filter(r => r.ok).length;
            const totalCount = result.results.length;
            const country = pendingConfirmation.country || 'UK';
            
            // Use standardized batch success message
            const { WyshboneChatConfig } = await import("../shared/conversationConfig");
            let responseText = WyshboneChatConfig.batchSuccessMessage(successCount);
            
            responseText += `\n\nResults:\n`;
            for (const r of result.results) {
              const countyInfo = r.county ? ` [${r.county}, ${country}]` : '';
              responseText += `- ${r.role} @ ${r.business_type}${countyInfo}: ${r.ok ? '✅' : '❌'} (${r.status})\n`;
            }

            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved batch execution result message to database");
            
            res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } catch (error: any) {
            console.error("❌ Bubble batch execution error:", error.message);
            const errorMsg = `Sorry, I couldn't trigger the Bubble workflow: ${error.message}`;
            appendMessage(sessionId, { role: "assistant", content: errorMsg });
            await saveMessage(conversationId, "assistant", errorMsg);
            console.log("💾 Saved batch execution error message to database");
            res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          }
        } else if (cancellationPattern.test(latestUserText.trim())) {
          console.log("❌ User cancelled batch execution");
          await storage.clearPendingConfirmation(sessionId);
          
          const responseText = "❌ Batch workflow cancelled.";
          appendMessage(sessionId, { role: "assistant", content: responseText });
          await saveMessage(conversationId, "assistant", responseText);
          console.log("💾 Saved workflow cancellation message to database");
          res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // Check if we have a partial workflow waiting for completion
      const partialWorkflow = await storage.getPartialWorkflow(sessionId);
      if (partialWorkflow && partialWorkflow.missing_fields.length > 0) {
          console.log("🔄 Completing partial workflow with user response");
          
          // Extract the missing fields from the user's response
          const extractionPrompt = [
            {
              role: "system" as const,
              content: `Extract ${partialWorkflow.missing_fields.join(', ')} from the user's message. Return a JSON object.
            
Examples:
- If missing 'roles' and user says "CEO" → {"roles": ["CEO"]}
- If missing 'roles' and user says "Head of Sales and Directors" → {"roles": ["Head of Sales", "Directors"]}
- If missing 'business_types' and user says "pubs" → {"business_types": ["pubs"]}

Only extract fields that are in the missing list: ${partialWorkflow.missing_fields.join(', ')}`
            },
            {
              role: "user" as const,
              content: `Partial workflow: ${JSON.stringify(partialWorkflow)}\n\nUser said: "${latestUserText}"\n\nExtract missing fields:`
            }
          ];

        try {
          const extractResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: extractionPrompt,
            response_format: { type: "json_object" },
          });

          const extracted = JSON.parse(extractResp.choices[0]?.message?.content || "{}");
          console.log("📝 Extracted missing fields:", extracted);

          // Merge with partial workflow
          const completeWorkflow = {
            ...partialWorkflow,
            ...extracted,
            missing_fields: [] // No longer missing
          };

          // Clear partial workflow
          await storage.clearPartialWorkflow(sessionId);

          // DIRECTLY create the batch confirmation instead of relying on AI
          // This prevents AI from looking at conversation history and getting confused
          const { getRegionCode } = await import("./regions");
          const countryCode = getRegionCode(completeWorkflow.country || 'GB');
          
          await storage.setPendingConfirmation(sessionId, {
            business_types: completeWorkflow.business_types || [],
            roles: completeWorkflow.roles || [],
            delay_ms: 4000,
            number_countiestosearch: completeWorkflow.counties?.length || 1,
            smarlead_id: '2354720',
            counties: completeWorkflow.counties || [],
            country: countryCode,
            timestamp: new Date().toISOString()
          });

          // Build preview showing exactly what will run
          let previewText = `📋 **Batch Workflow Preview**\n\n`;
          const counties = completeWorkflow.counties || [];
          previewText += `I'll make **${counties.length} API call(s)** to the autogen endpoint:\n\n`;
          
          for (const county of counties) {
            for (const businessType of completeWorkflow.business_types || []) {
              for (const role of completeWorkflow.roles || []) {
                previewText += `• ${role} @ ${businessType} in **${county}, ${countryCode}**\n`;
              }
            }
          }
          
          previewText += `\n**Parameters:**\n`;
          previewText += `- Delay: 4000ms\n`;
          previewText += `- Smarlead ID: 2354720\n`;
          previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;
          
          appendMessage(sessionId, { role: "assistant", content: previewText });
          await saveMessage(conversationId, "assistant", previewText);
          console.log("💾 Saved partial workflow preview message to database");
          
          // 🏢 TOWER: Log workflow preview confirmation
          await completeRunLog(
            runId,
            conversationId,
            user.id,
            user.email,
            latestUserText,
            previewText,
            'success',
            runStartTime,
            undefined,
            undefined,
            'standard'
          );
          
          res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
          return;
        } catch (err: any) {
          console.error("❌ Failed to complete partial workflow:", err.message);
          await storage.clearPartialWorkflow(sessionId);
        }
      }

      // DETECT SUMMARIZE REQUESTS: Check if user wants to summarize the last viewed report
      // More lenient pattern to handle typos: summ?ari[sz]e (allows "sumarise" typo)  
      const summarizePatterns = /\bsumm?ari[sz]e(\s+(it|this|that|the(\s+report)?|the\s+deep\s+(dive|research)))?|tl;?dr\b/i;
      const wantsSummary = summarizePatterns.test(latestUserText);
      console.log(`🔍 DEBUG Summarize detection: text="${latestUserText}", pattern test result=${wantsSummary}`);
      
      if (wantsSummary) {
        console.log("📊 Summarize request detected - calling summarizer");
        
        try {
          // Get the last viewed run for this session
          const lastViewedRunId = await storage.getLastViewedRun(sessionId);
          
          if (!lastViewedRunId) {
            throw new Error("No viewed reports found. Please click on a deep research report in the sidebar first.");
          }
          
          // Fetch the run
          const run = await getRun(lastViewedRunId);
          if (!run) {
            throw new Error("Last viewed report no longer exists");
          }
          
          if (run.status !== "completed") {
            throw new Error(`Cannot summarize: report is ${run.status}. Please wait for it to complete.`);
          }
          
          if (!run.outputText) {
            throw new Error("Report has no content to summarize");
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
          const summaryMsg = `## Summary: ${run.label}\n\n${summary}`;
          
          aiBuffer = summaryMsg;
          appendMessage(sessionId, { role: "assistant", content: summaryMsg });
          await saveMessage(conversationId, "assistant", summaryMsg);
          
          // 🏢 TOWER: Log summarize success
          await completeRunLog(
            runId,
            conversationId,
            user.id,
            user.email,
            latestUserText,
            summaryMsg,
            'success',
            runStartTime,
            undefined,
            undefined,
            'standard'
          );
          
          res.write(`data: ${JSON.stringify({ content: summaryMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        } catch (err: any) {
          console.error("❌ Summarize error:", err.message);
          const errorMsg = err.message || "Failed to generate summary";
          aiBuffer = errorMsg;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          await saveMessage(conversationId, "assistant", errorMsg);
          
          // 🏢 TOWER: Log summarize error
          await completeRunLog(
            runId,
            conversationId,
            user.id,
            user.email,
            latestUserText,
            errorMsg,
            'error',
            runStartTime,
            undefined,
            err.message,
            'standard'
          );
          
          res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // ===========================
      // INTENT CLASSIFICATION
      // Determine if user wants deep research, bubble workflow, or if unclear
      // ===========================
      const intentClassificationPrompt = [
        {
          role: "system" as const,
          content: `You are an intent classifier. Analyze the user's message and determine what they want to do.

Options:
1. "deep_research" - User wants comprehensive research/investigation on a topic (e.g., "research coffee shops that opened", "deep dive into dental practices", "investigate new bakeries", "find detailed information about")
2. "bubble_workflow" - User wants to trigger a workflow/batch process to find specific business contacts (e.g., "find head of sales for dentists", "get contacts for veterinary suppliers", "run workflow for farm shops")
3. "both_possible" - Could be either deep research OR workflow, not clearly one or the other
4. "general_chat" - Just asking questions, having a conversation, or unclear what they want

Return ONLY a JSON object with:
{
  "intent": "deep_research" | "bubble_workflow" | "both_possible" | "general_chat",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation"
}

Examples:
- "research coffee shops in London" → {"intent": "deep_research", "confidence": "high", "reasoning": "keyword 'research' indicates deep investigation"}
- "find head of sales for dentists in Bath" → {"intent": "bubble_workflow", "confidence": "high", "reasoning": "looking for specific contacts/roles"}
- "find new bakeries in Manchester" → {"intent": "both_possible", "confidence": "medium", "reasoning": "could want research OR contacts"}
- "what can you do?" → {"intent": "general_chat", "confidence": "high", "reasoning": "asking about capabilities"}
- "run a deep research dive to find new butchers" → {"intent": "deep_research", "confidence": "high", "reasoning": "explicit 'deep research dive' request"}`
        },
        {
          role: "user" as const,
          content: latestUserText
        }
      ];

      let userIntent: { intent: string; confidence: string; reasoning: string } | null = null;
      
      try {
        const intentResp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: intentClassificationPrompt,
          response_format: { type: "json_object" },
        });

        userIntent = JSON.parse(intentResp.choices[0]?.message?.content || "{}");
        console.log("🎯 Intent classification:", userIntent);
      } catch (err: any) {
        console.error("❌ Intent classification error:", err.message);
        // Continue with normal flow if classification fails
      }

      // Handle "both_possible" - ask user to clarify
      if (userIntent?.intent === "both_possible") {
        const clarificationMsg = `I can help with that in four ways:\n\n` +
          `📊 **Deep Research** - I'll perform comprehensive research and provide a detailed report with findings, sources, and analysis\n\n` +
          `🔍 **Wyshbone Global Database** - I'll search our global database and return a quick list of businesses with Place IDs, phone numbers, addresses, and websites\n\n` +
          `📧 **Wyshbone Global Database and Email Finder** - I'll find businesses with verified contact emails using Hunter.io, then add them to your SalesHandy campaign with AI-generated personal lines\n\n` +
          `⏰ **Scheduled Monitoring** - I'll set up recurring automated monitoring to check regularly (e.g., every Monday) and build reports over time\n\n` +
          `Which would you prefer?`;
        
        appendMessage(sessionId, { role: "assistant", content: clarificationMsg });
        await saveMessage(conversationId, "assistant", clarificationMsg);
        console.log("💾 Saved assistant clarification message to database");
        res.write(`data: ${JSON.stringify({ content: clarificationMsg })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        return res.end();
      }

      // Handle clear deep_research intent
      if (userIntent?.intent === "deep_research" && userIntent.confidence === "high") {
        console.log("🔬 Deep research intent detected - validating if we have enough info");
        
        // VALIDATE: Check if the prompt contains enough information for meaningful research
        const validationPrompt = [
          {
            role: "system" as const,
            content: `Analyze if the user's message contains enough information to perform meaningful research. 
CRITICAL: Distinguish between EXPLICIT topics (stated in current message) vs INFERRED topics (extracted from context).

Return JSON with:
{
  "has_topic": true/false,
  "research_topic": "extracted topic" or null,
  "topic_source": "explicit" | "inferred_from_context" | "no_topic",
  "needs_clarification": true/false,
  "suggested_question": "question to ask user" or null
}

Examples:
- Current: "can you do a deep dive" + Context: (empty) → {"has_topic": false, "research_topic": null, "topic_source": "no_topic", "needs_clarification": true, "suggested_question": "What would you like me to research?"}
- Current: "deep dive" + Context: "user: pubs in texas" → {"has_topic": true, "research_topic": "pubs in texas", "topic_source": "inferred_from_context", "needs_clarification": true, "suggested_question": "Would you like me to research pubs in Texas?"}
- Current: "I'm looking for pubs" + Context: "earlier: texas" → {"has_topic": true, "research_topic": "pubs in Texas", "topic_source": "inferred_from_context", "needs_clarification": true, "suggested_question": "I see you mentioned pubs, and earlier you were interested in Texas. Would you like me to research pubs in Texas?"}
- Current: "research new coffee shops in London" + Context: (any) → {"has_topic": true, "research_topic": "new coffee shops in London", "topic_source": "explicit", "needs_clarification": false, "suggested_question": null}
- Current: "yes" + Context: "assistant: Would you like me to research pubs in Texas?" → {"has_topic": true, "research_topic": "pubs in Texas", "topic_source": "explicit", "needs_clarification": false, "suggested_question": null}

CRITICAL RULES:
1. topic_source = "explicit" ONLY when the current message contains BOTH business type AND location clearly stated
2. topic_source = "inferred_from_context" when combining current message with earlier context (like "pubs" from current + "Texas" from earlier)
3. topic_source = "no_topic" when there's not enough information anywhere
4. When topic_source = "inferred_from_context", ALWAYS set needs_clarification = true and provide a confirmation question
5. Only auto-start research (needs_clarification = false) when topic_source = "explicit"`
          },
          {
            role: "user" as const,
            content: `User message: "${latestUserText}"\n\nConversation context (most recent first):\n${memoryMessages.slice(-10).reverse().filter(m => m.role !== 'system').map((m, i) => `[${i}] ${m.role}: ${m.content.substring(0, 200)}`).join('\n')}\n\nExtract the research topic:`
          }
        ];

        try {
          const validationResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: validationPrompt,
            response_format: { type: "json_object" },
          });

          const validation = JSON.parse(validationResp.choices[0]?.message?.content || "{}");
          console.log("✅ Research validation:", validation);

          // If we don't have a clear topic, ask the user
          if (!validation.has_topic || validation.needs_clarification) {
            const askMsg = validation.suggested_question || 
              "I'd be happy to perform a deep research dive! Could you please specify the topic or area you'd like me to investigate?\n\nFor example:\n• \"Research new coffee shops that opened in London in 2024\"\n• \"Investigate dental practices in Manchester\"\n• \"Find information about bakeries that opened recently\"";
            
            appendMessage(sessionId, { role: "assistant", content: askMsg });
            await saveMessage(conversationId, "assistant", askMsg);
            console.log("💾 Saved research clarification message to database");
            
            // 🏢 TOWER: Log clarification response
            await completeRunLog(
              runId,
              conversationId,
              user.id,
              user.email,
              latestUserText,
              askMsg,
              'success',
              runStartTime,
              undefined,
              undefined,
              'standard'
            );
            
            res.write(`data: ${JSON.stringify({ content: askMsg })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          }

          // We have a valid topic - start the research
          const researchTopic = validation.research_topic || latestUserText;
          
          // Add auth params for development mode
          const authParams = new URLSearchParams({
            user_id: user.id,
            user_email: user.email
          });
          
          const response = await fetch(`http://localhost:5000/api/deep-research?${authParams}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              prompt: researchTopic,
              conversationId,
              userId: user.id
            }),
          });

          const data = await response.json();
          
          if (response.ok) {
            const confirmMsg = `🔬 Deep research started!\n\nI'm investigating: "${researchTopic}"\n\nYou can view the progress in the sidebar. I'll notify you when it's complete.`;
            appendMessage(sessionId, { role: "assistant", content: confirmMsg });
            await saveMessage(conversationId, "assistant", confirmMsg);
            console.log("💾 Saved research start message to database");
            
            // 🏢 TOWER: Log research start confirmation
            await completeRunLog(
              runId,
              conversationId,
              user.id,
              user.email,
              latestUserText,
              confirmMsg,
              'success',
              runStartTime,
              undefined,
              undefined,
              'standard'
            );
            
            res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } else {
            throw new Error(data.error || "Failed to start deep research");
          }
        } catch (err: any) {
          console.error("❌ Deep research error:", err.message);
          const errorMsg = `Sorry, I couldn't start the deep research: ${err.message}`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          await saveMessage(conversationId, "assistant", errorMsg);
          console.log("💾 Saved research error message to database");
          
          // 🏢 TOWER: Log research error
          await completeRunLog(
            runId,
            conversationId,
            user.id,
            user.email,
            latestUserText,
            errorMsg,
            'error',
            runStartTime,
            undefined,
            err.message,
            'standard'
          );
          
          res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // DISABLED: Old bubble batch detection - now handled by Chat Completions API tool calling
      // This prevents duplicate execution without confirmation
      const isBubbleBatchRequest = false; // Always false - tool calling handles this now

      if (isBubbleBatchRequest) {
        console.log("🔵 Detected Bubble batch request - extracting parameters...");
        
        try {
          // Use GPT to extract parameters from natural language
          const extractionPrompt = [
            {
              role: "system" as const,
              content: "Extract business_types, roles, delay_ms, number_countiestosearch, location, and smarlead_id from the user's request. Return a JSON object with these fields. business_types is required (array of strings). roles is optional (array, default ['Head of Sales']). delay_ms is optional (number, default 4000). number_countiestosearch is optional (number, default 1). location is optional (string, can be 'UK', 'Texas', or other US states). smarlead_id is optional (string). Parse time units: 's' or 'sec' = multiply by 1000, 'ms' = use as-is. Extract county/region numbers from phrases like '5 counties', '10 regions', etc. Extract location from phrases like 'in Texas', 'in UK', 'in California', etc."
            },
            {
              role: "user" as const,
              content: `Extract parameters from: "${latestUserText}"\n\nExamples:\n- "Run Head of Sales for dentistry supplies, vet supplies; 4s delay" → {"business_types":["dentistry supplies","vet supplies"],"roles":["Head of Sales"],"delay_ms":4000}\n- "Trigger Director for farm shops, cheese makers; 3000ms delay, 5 counties, smarlead 12345" → {"business_types":["farm shops","cheese makers"],"roles":["Director"],"delay_ms":3000,"number_countiestosearch":5,"smarlead_id":"12345"}\n- "Run for dentist supplies in 2 counties in Texas, smarlead abc123" → {"business_types":["dentist supplies"],"number_countiestosearch":2,"location":"Texas","smarlead_id":"abc123"}\n- "Run for dental supplies in 3 counties in California" → {"business_types":["dental supplies"],"number_countiestosearch":3,"location":"California"}\n\nExtract now:`
            }
          ];

          const extractionResp = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: extractionPrompt,
            response_format: { type: "json_object" },
          });

          const params = JSON.parse(extractionResp.choices[0]?.message?.content || "{}");
          console.log("📋 Extracted params:", params);

          if (params.business_types && Array.isArray(params.business_types) && params.business_types.length > 0) {
            // Determine location and load appropriate region data
            const location = params.location || 'UK';
            let selectedCounties: string[] = [];
            
            const numCounties = params.number_countiestosearch || 1;
            
            // Normalize country code using ISO mapping (Texas → US, UK → GB, etc.)
            const { getRegionCode } = await import("./regions");
            const countryCode = getRegionCode(location);
            
            if (location.toLowerCase() === 'texas') {
              const { getRegions } = await import("./regions");
              const texasCountiesResult = await getRegions('US', 'county', 'Texas');
              selectedCounties = texasCountiesResult.regions.slice(0, numCounties).map(r => r.name);
            } else {
              // Default to UK
              const ukCountiesData = await import("./data/uk_counties.json");
              const ukCounties = ukCountiesData.default;
              selectedCounties = ukCounties.slice(0, numCounties).map((c: any) => c.name);
            }

            console.log(`🗺️ Auto-selected ${numCounties} ${countryCode} counties:`, selectedCounties);

            // Apply defaults now - what user sees is what gets executed
            const roles = params.roles || ['Head of Sales'];
            const delayMs = params.delay_ms || 4000;
            const smarleadId = params.smarlead_id || '2354720';

            // Store pending confirmation WITH COMPUTED DEFAULTS
            await storage.setPendingConfirmation(sessionId, {
              business_types: params.business_types,
              roles: roles,  // Store computed default
              delay_ms: delayMs,  // Store computed default
              number_countiestosearch: numCounties,  // Store computed value
              smarlead_id: smarleadId,  // Store computed default
              counties: selectedCounties,  // Store auto-selected counties
              country: countryCode,  // Store country/state
              timestamp: new Date().toISOString()
            });

            // Build preview message showing EXACTLY what will be executed
            let previewText = `📋 **Batch Workflow Preview**\n\n`;
            previewText += `I'll make **${selectedCounties.length} API call(s)** to the autogen endpoint:\n\n`;
            
            for (const county of selectedCounties) {
              for (const businessType of params.business_types) {
                for (const role of roles) {
                  previewText += `• ${role} @ ${businessType} in **${county}, ${countryCode}**\n`;
                }
              }
            }
            
            previewText += `\n**Parameters:**\n`;
            previewText += `- Delay: ${delayMs}ms\n`;
            previewText += `- Smarlead ID: ${smarleadId}\n`;
            previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;

            appendMessage(sessionId, { role: "assistant", content: previewText });
            await saveMessage(conversationId, "assistant", previewText);
            console.log("💾 Saved batch workflow preview message to database");
            res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          } else {
            console.log("⚠️ Could not extract valid business_types, falling back to regular chat");
          }
        } catch (error: any) {
          console.error("❌ Bubble batch extraction error:", error.message);
          const errorMsg = `Sorry, I couldn't parse your request: ${error.message}`;
          appendMessage(sessionId, { role: "assistant", content: errorMsg });
          res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
          res.write(`data: [DONE]\n\n`);
          return res.end();
        }
      }

      // Prepare messages array with system prompt (DON'T mutate memoryMessages)
      const { WyshboneChatConfig } = await import("../shared/conversationConfig");
      
      const systemPrompt = {
        role: "system" as const,
        content: WyshboneChatConfig.systemPrompt
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
      
      // Define tools: bubble_run_batch function + web_search
      const bubbleTool = {
        type: "function" as const,
        function: {
          name: "bubble_run_batch",
          description: "DEPRECATED: Legacy Bubble workflow for batch contact discovery. DO NOT USE - this is outdated. Use saleshandy_batch_call instead for all contact finding tasks.",
          parameters: {
            type: "object",
            properties: {
              business_types: {
                type: "array",
                items: { type: "string" },
                description: "List of business types to search for (e.g., ['dentistry supplies', 'veterinary supplies'])"
              },
              roles: {
                type: "array",
                items: { type: "string" },
                description: "Roles to target (default: ['Head of Sales'])"
              },
              delay_ms: {
                type: "number",
                description: "Delay between workflow runs in milliseconds (default: 4000)"
              },
              number_countiestosearch: {
                type: "number",
                description: "Number of counties/regions to search (default: 1)"
              },
              smarlead_id: {
                type: "string",
                description: "Smarlead campaign ID (default: '2354720')"
              },
              counties: {
                type: "array",
                items: { type: "string" },
                description: "CRITICAL: Put ALL cities and regions in this ONE array. Examples: ['Bath', 'Kendal', 'London'], ['Wales', 'Scotland'], ['Cork', 'Dublin'], ['Texas']. If user says 'all three locations' or similar, include ALL locations they mentioned in conversation. NEVER make multiple tool calls - use ONE call with ALL cities in this array. Note: Wales, Scotland, England, Northern Ireland are REGIONS and go here, not in country."
              },
              country: {
                type: "string",
                description: "ONLY provide this if user explicitly mentions a standalone COUNTRY. Do NOT include: cities (London, Kendal, Manchester), UK regions (Wales, Scotland, England, Northern Ireland), or US states (Texas, California) - these ALL go in counties array. Leave empty to use default country. Valid examples for this field: 'UK', 'Ireland', 'India', 'Brazil', 'Australia'"
              }
            },
            required: ["business_types"]
          }
        }
      };

      const deepResearchTool = {
        type: "function" as const,
        function: {
          name: "deep_research",
          description: "Perform comprehensive deep research on a topic using web search and AI analysis. Use this when the user wants detailed investigation, research reports, or in-depth information about businesses, industries, or topics.",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "CRITICAL: Extract the FULL research topic from conversation context. If user says vague phrases like 'deep dive', 'yes', 'do it', 'go ahead', you MUST extract the specific topic from the CURRENT CONVERSATION messages (last 5-10 messages). Examples: User says 'I'm looking for pubs in Kendal' then 'deep dive' → prompt should be 'pubs in Kendal', NOT just 'deep dive'. User says 'research coffee shops in London' → prompt should be 'coffee shops in London'. NEVER use vague prompts like 'deep dive' alone - always include the actual business type and location from context."
              }
            },
            required: ["prompt"]
          }
        }
      };

      const googlePlacesSearchTool = {
        type: "function" as const,
        function: {
          name: "search_wyshbone_database",
          description: "Search for businesses using Wyshbone Global Database. Returns structured results with Place IDs, names, addresses, phone numbers, websites, ratings, and coordinates. Use this when user wants to find specific businesses, get business listings, or needs Place IDs. Returns up to 60 results with pagination.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query combining business type and location (e.g., 'pubs in Texas', 'coffee shops Austin', 'dentists Manchester UK')"
              },
              locationText: {
                type: "string",
                description: "Optional: Specific location to bias the search (e.g., 'Austin, Texas', 'Manchester, UK'). If not provided, location is inferred from query."
              },
              maxResults: {
                type: "number",
                description: "Maximum number of results to return (default: 30, max: 60)"
              }
            },
            required: ["query"]
          }
        }
      };

      const createScheduledMonitorTool = {
        type: "function" as const,
        function: {
          name: "create_scheduled_monitor",
          description: "Create a recurring scheduled monitoring task that runs automatically. Use this when user wants to automate regular monitoring, checks, or searches (e.g., 'check for new dental practices every Monday', 'monitor coffee shops weekly', 'schedule weekly report on gyms'). IMPORTANT: Always use 'deep_research' as the monitorType unless explicitly told otherwise.",
          parameters: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "A short, descriptive name for the monitor (e.g., 'Weekly dental practices check', 'Monthly coffee shop report')"
              },
              description: {
                type: "string",
                description: "Full description of what to monitor, including business type and location (e.g., 'Check for new dental practices in Manchester', 'Monitor coffee shops in Brooklyn')"
              },
              schedule: {
                type: "string",
                enum: ["daily", "weekly", "biweekly", "monthly"],
                description: "How often to run the monitor"
              },
              scheduleDay: {
                type: "string",
                enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                description: "Optional: For weekly/biweekly schedules, which day to run (e.g., 'monday')"
              },
              scheduleTime: {
                type: "string",
                description: "Optional: Time to run in HH:MM format (e.g., '09:00', '14:30')"
              },
              monitorType: {
                type: "string",
                enum: ["deep_research"],
                description: "MUST be 'deep_research' - this performs comprehensive AI research and sends results via email. Do not use any other value."
              },
              config: {
                type: "object",
                description: "Configuration specific to the monitor type (e.g., for business_search: {business_types: ['dentists'], location: 'Manchester', roles: ['owner']})"
              }
            },
            required: ["label", "description", "schedule", "monitorType"]
          }
        }
      };

      const saleshandyBatchTool = {
        type: "function" as const,
        function: {
          name: "saleshandy_batch_call",
          description: "CRITICAL: SALESHANDY CONTACT DISCOVERY - Use this tool IMMEDIATELY when the user's message starts with 'saleshandy' or mentions finding contacts/emails/leads. Format: 'saleshandy [business type] [location] [role]' (e.g., 'saleshandy pubs west sussex owner'). This tool: (1) Searches Google Places for up to 60 businesses, (2) Finds domains & verified emails via Hunter.io, (3) Auto-adds prospects to SalesHandy campaign with AI-generated personal lines. ALWAYS use this for ANY saleshandy request - never just respond with text.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Business type to search for (e.g., 'pubs', 'restaurants', 'coffee shops', 'dentists', 'gyms', 'hotels'). This will be used in Google Places search."
              },
              location: {
                type: "string",
                description: "Location for the search (e.g., 'London', 'Manchester', 'New York', 'Texas')"
              },
              country: {
                type: "string",
                description: "Country code or name (e.g., 'UK', 'US', 'GB', 'United Kingdom')"
              },
              targetRole: {
                type: "string",
                description: "Target job role/position (e.g., 'owner', 'CEO', 'Head of Sales', 'manager')"
              }
            },
            required: ["query", "location", "country", "targetRole"]
          }
        }
      };

      const tools: any[] = [bubbleTool, deepResearchTool, googlePlacesSearchTool, createScheduledMonitorTool, saleshandyBatchTool];

      // ===========================
      // LEAD CLARIFICATION CHECK (UI-002)
      // Before calling tools, check if we need to ask clarifying questions
      // ===========================
      const { handleLeadClarification, clearLeadContext } = await import("./leadClarification");
      
      // Clear lead context on new searches, BUT NOT if we're currently awaiting clarification
      // (otherwise we'd wipe context in the middle of a clarification flow)
      const isAwaitingClarification = await storage.isAwaitingLeadClarification(sessionId);
      if (isNewSearch && !isAwaitingClarification) {
        await clearLeadContext(sessionId);
      }
      
      // Let handleLeadClarification own the entire clarification flow
      // It handles: awaiting detection, answer parsing, context merging, and flag clearing
      const clarificationResult = await handleLeadClarification({
        sessionId,
        userMessage: latestUserText,
        conversationHistory: memoryMessages.map(m => String(m.content || ''))
      });
      
      if (clarificationResult.type === 'clarify') {
        // Missing fields - ask clarifying questions and return early
        console.log("❓ Lead clarification needed - asking questions");
        
        appendMessage(sessionId, { role: "assistant", content: clarificationResult.formattedMessage });
        await saveMessage(conversationId, "assistant", clarificationResult.formattedMessage);
        console.log("💾 Saved clarification questions to database");
        
        // 🏢 TOWER: Log lead clarification
        await completeRunLog(
          runId,
          conversationId,
          user.id,
          user.email,
          latestUserText,
          clarificationResult.formattedMessage,
          'success',
          runStartTime,
          undefined,
          undefined,
          'standard'
        );
        
        res.write(`data: ${JSON.stringify({ content: clarificationResult.formattedMessage })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        return res.end();
      } else if (clarificationResult.type === 'proceed') {
        // All fields present - inject enriched context into chat messages
        console.log("✅ Lead context complete - proceeding with tools");
        
        const enrichedContextMessage = {
          role: "system" as const,
          content: clarificationResult.enrichedSystemMessage
        };
        chatMessages = [...chatMessages, enrichedContextMessage];
      }
      // type === 'skip': Continue normally (not a lead request)

      console.log(`🌐 Calling Chat Completions API with function calling and GPT-5...`);
      
      try {
        // Call OpenAI Chat Completions API with streaming - GPT-5 for current knowledge (Aug 2025 cutoff)
        const stream = await openai.chat.completions.create({
          model: "gpt-5",
          messages: chatMessages as any,
          tools,
          stream: true,
        });

        console.log("✅ Chat Completions API stream started");
        
        let toolCallBuffer = { name: "", arguments: "" };
        let isToolCall = false;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          
          // Handle tool calls
          if (delta.tool_calls) {
            isToolCall = true;
            const toolCall = delta.tool_calls[0];
            if (toolCall.function?.name) {
              toolCallBuffer.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCallBuffer.arguments += toolCall.function.arguments;
            }
          }
          // Handle content streaming
          else if (delta.content) {
            aiBuffer += delta.content;
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
            // @ts-ignore
            if (res.flush) res.flush();
          }
        }

        // Process tool call if detected
        if (isToolCall && toolCallBuffer.name === "deep_research") {
          console.log("🔬 Deep research tool call detected");
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            const params = JSON.parse(toolCallBuffer.arguments);
            
            if (!params.prompt) {
              throw new Error("Missing prompt parameter");
            }
            
            // ENHANCE VAGUE PROMPTS: If prompt is vague, extract actual topic from conversation
            const vaguePhrases = ['deep dive', 'yes', 'do it', 'go ahead', 'sure', 'okay', 'please', 'start', 'begin'];
            const isVaguePrompt = vaguePhrases.some(phrase => 
              params.prompt.toLowerCase().trim() === phrase || 
              params.prompt.toLowerCase().includes(phrase) && params.prompt.split(' ').length <= 3
            );
            
            if (isVaguePrompt) {
              console.log(`🔍 Vague prompt detected: "${params.prompt}" - extracting topic from conversation...`);
              
              // Extract actual topic from conversation history
              const extractionPrompt = [
                {
                  role: "system" as const,
                  content: `Extract the research topic from the conversation. The user said a vague phrase like "${params.prompt}", but there should be a clear topic/business type and location mentioned in recent messages.

Return JSON with ONLY the extracted topic:
{
  "extracted_topic": "business type in location" or null
}

Examples:
- Recent messages show "pubs in Kendal" → {"extracted_topic": "pubs in Kendal"}
- Recent messages show "coffee shops" and "London" → {"extracted_topic": "coffee shops in London"}
- Recent messages show "dentists" and "Manchester" → {"extracted_topic": "dentists in Manchester"}
- No clear topic found → {"extracted_topic": null}

RULES:
1. Extract BOTH business type AND location from recent messages
2. Combine them naturally: "[business] in [location]"
3. Return null only if you genuinely cannot find a topic`
                },
                {
                  role: "user" as const,
                  content: `User said: "${latestUserText}"\n\nRecent conversation (most recent first):\n${memoryMessages.slice(-8).reverse().filter(m => m.role !== 'system').map((m, i) => `[${i}] ${m.role}: ${m.content.substring(0, 300)}`).join('\n')}\n\nExtract the research topic:`
                }
              ];
              
              const extractionResp = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: extractionPrompt,
                response_format: { type: "json_object" },
              });
              
              const extraction = JSON.parse(extractionResp.choices[0]?.message?.content || "{}");
              console.log("📍 Topic extraction result:", extraction);
              
              if (extraction.extracted_topic) {
                console.log(`✅ Enhanced prompt: "${params.prompt}" → "${extraction.extracted_topic}"`);
                params.prompt = extraction.extracted_topic;
              } else {
                console.log("⚠️ Could not extract topic from conversation");
              }
            }
            
            // VALIDATE: Check if the prompt was inferred from context vs. explicitly stated
            const validationPrompt = [
              {
                role: "system" as const,
                content: `Analyze if the user's current message clearly indicates what they want to research. Only ask for confirmation if genuinely ambiguous.

Return JSON with:
{
  "topic_source": "explicit" | "inferred_from_context",
  "confirmation_needed": true/false,
  "confirmation_question": "question to ask" or null
}

Examples:
- User: "I'm interested in Texas" → Prompt: "pubs in Texas" → {"topic_source": "inferred_from_context", "confirmation_needed": true, "confirmation_question": "Would you like me to research pubs in Texas?"}
- User: "I want deep research for pubs in Texas" → Prompt: "pubs in Texas" → {"topic_source": "explicit", "confirmation_needed": false, "confirmation_question": null}
- User: "research pubs in Texas" → Prompt: "pubs in Texas" → {"topic_source": "explicit", "confirmation_needed": false, "confirmation_question": null}
- User: "pubs in Texas" (in context of research) → Prompt: "pubs in Texas" → {"topic_source": "explicit", "confirmation_needed": false, "confirmation_question": null}
- User: "deep dive" (after discussing pubs in Texas) → Prompt: "pubs in Texas" → {"topic_source": "explicit", "confirmation_needed": false, "confirmation_question": null}
- User: "yes" after confirmation question → {"topic_source": "explicit", "confirmation_needed": false, "confirmation_question": null}

CRITICAL RULES:
1. topic_source = "explicit" if the user's current message (or recent 2-3 messages) clearly mentions BOTH business type AND location
2. topic_source = "explicit" if user said "yes", "go ahead", "do it" in response to a confirmation question
3. topic_source = "explicit" if the research prompt matches what was recently discussed (last 2-3 messages)
4. confirmation_needed = true ONLY when genuinely ambiguous or missing key information
5. Don't ask for confirmation just because context was used - if the intent is clear, proceed`
              },
              {
                role: "user" as const,
                content: `User's current message: "${latestUserText}"\n\nResearch prompt AI wants to use: "${params.prompt}"\n\nConversation context (recent messages):\n${memoryMessages.slice(-10).reverse().filter(m => m.role !== 'system').map((m, i) => `[${i}] ${m.role}: ${m.content.substring(0, 200)}`).join('\n')}\n\nDetermine if confirmation is needed:`
              }
            ];

            const validationResp = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: validationPrompt,
              response_format: { type: "json_object" },
            });

            const validation = JSON.parse(validationResp.choices[0]?.message?.content || "{}");
            console.log("✅ Deep research validation:", validation);

            // If confirmation needed, ask the user instead of auto-starting
            if (validation.confirmation_needed && validation.confirmation_question) {
              const askMsg = validation.confirmation_question;
              aiBuffer = askMsg;
              appendMessage(sessionId, { role: "assistant", content: askMsg });
              await saveMessage(conversationId, "assistant", askMsg);
              console.log("💾 Saved confirmation question to database");
              
              res.write(`data: ${JSON.stringify({ content: askMsg })}\n\n`);
              res.write(`data: [DONE]\n\n`);
              return res.end();
            }
            
            // Confirmed or explicit - check subscription limits before starting
            const currentUser = await storage.getUserById(user.id);
            if (currentUser) {
              const tier = currentUser.subscriptionTier as keyof typeof TIER_LIMITS;
              if (!canCreateDeepResearch(tier, currentUser.deepResearchCount)) {
                const limitMsg = `You've reached your deep research limit (${TIER_LIMITS[tier].deepResearch} for ${TIER_LIMITS[tier].displayName}). Please upgrade your subscription to continue.`;
                aiBuffer = limitMsg;
                appendMessage(sessionId, { role: "assistant", content: limitMsg });
                await saveMessage(conversationId, "assistant", limitMsg);
                
                res.write(`data: ${JSON.stringify({ content: limitMsg })}\n\n`);
                res.write(`data: [DONE]\n\n`);
                return res.end();
              }
            }
            
            // Confirmed or explicit - start deep research
            // Add auth params for development mode
            const authParams = new URLSearchParams({
              user_id: user.id,
              user_email: user.email
            });
            
            const response = await fetch(`http://localhost:5000/api/deep-research?${authParams}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                prompt: params.prompt,
                conversationId,
                userId: user.id
              }),
            });

            const data = await response.json();
            
            if (response.ok) {
              // Increment deep research count
              await storage.incrementDeepResearchCount(user.id);
              
              const confirmMsg = `🔬 Deep research started!\n\nI'm investigating: "${params.prompt}"\n\nYou can view the progress in the sidebar. I'll notify you when it's complete.`;
              aiBuffer = confirmMsg;
              appendMessage(sessionId, { role: "assistant", content: confirmMsg });
              
              // Save assistant message to database before returning
              await saveMessage(conversationId, "assistant", confirmMsg);
              console.log("💾 Saved assistant message to database");
              
              res.write(`data: ${JSON.stringify({ content: confirmMsg })}\n\n`);
              res.write(`data: [DONE]\n\n`);
              return res.end();
            } else {
              throw new Error(data.error || "Failed to start deep research");
            }
          } catch (err: any) {
            console.error("❌ Deep research tool error:", err.message);
            const errorMsg = `Sorry, I couldn't start the deep research: ${err.message}`;
            aiBuffer = errorMsg;
            appendMessage(sessionId, { role: "assistant", content: errorMsg });
            
            // Save error message to database before returning
            await saveMessage(conversationId, "assistant", errorMsg);
            console.log("💾 Saved assistant error message to database");
            
            res.write(`data: ${JSON.stringify({ content: errorMsg })}\n\n`);
            res.write(`data: [DONE]\n\n`);
            return res.end();
          }
        } else if (isToolCall && toolCallBuffer.name === "bubble_run_batch") {
          console.log("🔧 Tool call detected:", toolCallBuffer.name);
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            // Handle cases where AI sends multiple JSON objects concatenated
            // Extract only the first valid JSON object
            let jsonToParse = toolCallBuffer.arguments.trim();
            
            // Find the first complete JSON object
            let braceCount = 0;
            let firstJsonEnd = -1;
            for (let i = 0; i < jsonToParse.length; i++) {
              if (jsonToParse[i] === '{') braceCount++;
              if (jsonToParse[i] === '}') braceCount--;
              if (braceCount === 0 && jsonToParse[i] === '}') {
                firstJsonEnd = i + 1;
                break;
              }
            }
            
            if (firstJsonEnd > 0 && firstJsonEnd < jsonToParse.length) {
              console.log("⚠️  Multiple JSON objects detected, using only the first one");
              jsonToParse = jsonToParse.substring(0, firstJsonEnd);
            }
            
            const params = JSON.parse(jsonToParse);
            
            // TODO: Spell check feature temporarily disabled - will re-implement after fixing try-catch structure
            
            // LOCATION AMBIGUITY GUARD
            const defaultCountry = (req as any).defaultCountry || 'United Kingdom';
            const { getRegionCode } = await import("./regions");
            const defaultCountryCode = getRegionCode(defaultCountry);
            
            // NEW: Use locationGuard to check for ambiguous locations
            // Check both params.country and params.counties array
            const { guardLocation } = await import("./locationGuard");
            const userId = ((req as any).session)?.userId || (req as any).user?.id || "anonymous";
            
            // Check params.country if provided
            if (params.country) {
              const guard = await guardLocation({
                userId,
                location: params.country,
                country: defaultCountry
              });
              
              // If we have a message (warning or disambiguation), send it
              if (guard.message) {
                aiBuffer = guard.message;
                res.write(`data: ${JSON.stringify({ content: guard.message })}\n\n`);
                
                // If we can't proceed (disambiguation needed), stop here
                if (!guard.proceed) {
                  res.write(`data: [DONE]\n\n`);
                  res.end();
                  appendMessage(sessionId, { role: "assistant", content: guard.message });
                  await saveMessage(conversationId, "assistant", guard.message);
                  console.log("💾 Saved assistant message to database");
                  return;
                }
                
                // If we can proceed with a warning, the message was sent
                // Continue with the default country (DO NOT change params.country)
              }
            }
            
            // Also check params.counties array (where AI often puts city names)
            if (params.counties && Array.isArray(params.counties) && params.counties.length > 0) {
              console.log(`🔍 Checking counties/cities for ambiguity: ${params.counties.join(', ')}`);
              
              // Check each city in the counties array
              for (const cityName of params.counties) {
                const guard = await guardLocation({
                  userId,
                  location: cityName,
                  country: defaultCountry
                });
                
                // If we have a message (auto-switch or disambiguation), send it
                if (guard.message) {
                  aiBuffer = guard.message;
                  res.write(`data: ${JSON.stringify({ content: guard.message })}\n\n`);
                  
                  // If we can't proceed (disambiguation needed), stop here
                  if (!guard.proceed) {
                    res.write(`data: [DONE]\n\n`);
                    res.end();
                    appendMessage(sessionId, { role: "assistant", content: guard.message });
                    await saveMessage(conversationId, "assistant", guard.message);
                    console.log("💾 Saved assistant message to database");
                    return;
                  }
                  
                  // If we can proceed with a warning, continue (message already sent)
                  // The warning was sent but we'll continue with the default country
                  break; // Only warn once if multiple cities
                }
              }
            }
            
            // ORIGINAL COUNTRY MISMATCH DETECTION (for legacy location-resolver flow)
            // Detect the country from the location in params
            if (params.location) {
              const { resolveLocation } = await import("./location-resolver");
              const resolved = await resolveLocation(params.location);
              
              // Check if detected country differs from default
              if (resolved.country_code !== defaultCountryCode && resolved.country_code !== 'UNKNOWN') {
                const detectedCountryName = resolved.country || resolved.country_code;
                console.log(`⚠️ Country mismatch: User requested ${detectedCountryName} but default is ${defaultCountry}`);
                
                const mismatchMsg = `⚠️ **Country Mismatch Detected**\n\n` +
                  `You're asking for locations in **${detectedCountryName}**, but your default country is set to **${defaultCountry}**.\n\n` +
                  `Please either:\n` +
                  `1. **Change your default country** to ${detectedCountryName} using the dropdown at the top of the sidebar, OR\n` +
                  `2. **Confirm** that "${params.location}" is actually in ${defaultCountry}\n\n` +
                  `Which would you like to do?`;
                
                aiBuffer = mismatchMsg;
                res.write(`data: ${JSON.stringify({ content: mismatchMsg })}\n\n`);
                res.write(`data: [DONE]\n\n`);
                res.end();
                
                // Save message to memory and database
                appendMessage(sessionId, { role: "assistant", content: mismatchMsg });
                await saveMessage(conversationId, "assistant", mismatchMsg);
                console.log("💾 Saved assistant message to database");
                return;
              }
            }
            
            // VALIDATION: Check for required fields before proceeding
            const missingFields: string[] = [];
            
            if (!params.business_types || params.business_types.length === 0) {
              missingFields.push("business type");
            }
            if (!params.roles || params.roles.length === 0) {
              missingFields.push("target job role/position");
            }
            
            // Use default country if no location specified
            const defaultCountryFromReq = (req as any).defaultCountry;
            console.log(`🌍 Default country from sidebar: ${defaultCountryFromReq || 'none'}`);
            console.log(`📍 Country from AI: ${params.country || 'none'}`);
            
            // Import city detection function
            const { isCityName } = await import("./location-resolver");
            
            // Store city name(s) BEFORE clearing, so we can use them as search locations
            let cityNames: string[] = [];
            
            // Check if AI extracted cities in counties array (for multi-city requests)
            if (params.counties && Array.isArray(params.counties) && params.counties.length > 0) {
              console.log(`📍 Multiple cities provided: ${params.counties.join(', ')}`);
              cityNames = params.counties;
              // Don't clear params.counties - we'll use it directly
            }
            // Check if AI extracted a city in country parameter instead
            else if (params.country && isCityName(params.country)) {
              console.log(`⚠️  "${params.country}" is a city, not a country - using sidebar default instead`);
              cityNames = [params.country]; // Save the city name
              params.country = ''; // Clear it so we use the sidebar default
            }
            
            if (!params.country && !defaultCountryFromReq && cityNames.length === 0) {
              missingFields.push("location");
            }
            
            // If missing required fields, ask conversationally
            if (missingFields.length > 0) {
              // Store partial workflow with what we have so far
              const partialData: any = {
                missing_fields: missingFields,
                timestamp: new Date().toISOString()
              };
              
              if (params.business_types && params.business_types.length > 0) {
                partialData.business_types = params.business_types;
              }
              if (params.roles && params.roles.length > 0) {
                partialData.roles = params.roles;
              }
              if (cityNames.length > 0) {
                partialData.counties = cityNames;
              }
              if (params.country) {
                partialData.country = params.country;
              } else if (defaultCountryFromReq) {
                partialData.country = defaultCountryFromReq;
              }
              
              await storage.setPartialWorkflow(sessionId, partialData);
              console.log("💾 Stored partial workflow:", partialData);
              
              let clarificationMsg = "";
              
              if (missingFields.includes("target job role/position")) {
                const locationStr = partialData.counties ? `for ${partialData.counties.join(', ')}` : '';
                clarificationMsg = `What job role are you targeting ${locationStr}? (e.g., CEO, Head of Sales, Director, Manager)`;
              } else if (missingFields.includes("location")) {
                clarificationMsg = "Which location would you like to search in?";
              } else if (missingFields.includes("business type")) {
                clarificationMsg = "What type of businesses are you looking for?";
              }
              
              console.log(`❓ Missing required fields: ${missingFields.join(', ')}`);
              appendMessage(sessionId, { role: "assistant", content: clarificationMsg });
              await saveMessage(conversationId, "assistant", clarificationMsg);
              console.log("💾 Saved assistant message to database");
              res.write(`data: ${JSON.stringify({ content: clarificationMsg, done: true })}\n\n`);
              res.write(`data: [DONE]\n\n`);
              return res.end();
            }
            
            const { bubbleRunBatch } = await import("./bubble");
            
            // Use provided values (no defaults for required fields)
            const roles = params.roles;
            const delayMs = params.delay_ms || 4000;
            const smarleadId = params.smarlead_id || '2354720';
            const rawCountry = params.country || defaultCountryFromReq;
            const numCounties = params.number_countiestosearch || 1;
            
            // If we detected cities, use the first one as the location to resolve country
            const locationToResolve = cityNames.length > 0 ? cityNames[0] : rawCountry;
            
            console.log(`✅ Using country: ${rawCountry} ${params.country ? '(from user message)' : '(from sidebar default)'}`);
            if (cityNames.length > 0) {
              console.log(`📍 Using cities as locations: ${cityNames.join(', ')}`);
            }
            
            // Normalize country code to ISO alpha-2 (US, GB, IE, AU, CA)
            const countryCode = getRegionCode(rawCountry);
            
            // Load regions if not provided based on country
            let selectedCounties = params.counties;
            let granularity = 'county'; // Default granularity
            let resolvedCountryCode = countryCode; // Use the resolved code
            let confidenceNote = ''; // For confidence-based prompting
            
            if (!selectedCounties) {
              const { getRegions } = await import("./regions");
              const { resolveLocation } = await import("./location-resolver");
              
              // Use intelligent location resolver (local hints + geocoding fallback)
              // For cities: resolve using the sidebar country code
              const resolved = cityNames.length > 0
                ? { 
                    country: (() => {
                      const codeToName: Record<string, string> = {
                        'GB': 'United Kingdom',
                        'IE': 'Ireland',
                        'US': 'United States',
                        'AU': 'Australia',
                        'CA': 'Canada',
                        'IN': 'India',
                        'NZ': 'New Zealand',
                        'DE': 'Germany',
                        'FR': 'France',
                        'ES': 'Spain',
                        'IT': 'Italy',
                        'JP': 'Japan',
                        'BR': 'Brazil'
                      };
                      return codeToName[countryCode] || rawCountry;
                    })(),
                    country_code: countryCode,
                    region_filter: cityNames[0], // Use first city for resolved object
                    granularity: 'city',
                    confidence: 0.95,
                    source: 'city_hints' as const
                  }
                : await resolveLocation(rawCountry);
              
              console.log(`📍 Resolved location: ${locationToResolve} → ${resolved.country_code}${resolved.region_filter ? `, ${resolved.region_filter}` : ''} (confidence: ${resolved.confidence}${resolved.source ? `, source: ${resolved.source}` : ''})`);
              
              // Update country code and granularity based on resolution
              resolvedCountryCode = resolved.country_code;
              granularity = resolved.granularity;
              
              // Add note based on confidence level (per spec)
              if (resolved.confidence >= 0.7) {
                // High confidence: proceed silently
                confidenceNote = '';
              } else if (resolved.confidence >= 0.4) {
                // Medium confidence: add assumption note
                const locationDesc = resolved.region_filter 
                  ? `${resolved.region_filter}, ${resolved.country}` 
                  : resolved.country;
                confidenceNote = `\n\n*Note: assuming ${locationDesc}*`;
              } else {
                // Low confidence: would ask clarifying question, but we'll proceed with note
                const locationDesc = resolved.region_filter 
                  ? `${resolved.region_filter}, ${resolved.country}` 
                  : resolved.country;
                confidenceNote = `\n\n*Note: interpreting as ${locationDesc}. Please specify if different.*`;
              }
              
              // IMPORTANT: Determine if user specified specific locations or just a country
              
              if (cityNames.length > 0) {
                // Multiple cities or single city specified → capitalize and use all of them
                selectedCounties = cityNames.map(city => 
                  city.split(' ').map((word: string) => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ')
                );
                console.log(`✅ Using ${selectedCounties.length} user-specified location(s): ${selectedCounties.join(', ')} in ${resolvedCountryCode}`);
              } else {
                // No specific cities, check if it's a country-wide search
                const isCountryOnly = resolved.country_code === resolved.country || 
                                     !resolved.region_filter ||
                                     resolved.region_filter.toLowerCase() === resolved.country.toLowerCase();
                
                if (isCountryOnly) {
                  // Just a country specified (e.g., "India") → use country name
                  selectedCounties = [resolved.country];
                  console.log(`✅ Country-only search: using "${resolved.country}" for whole country ${resolvedCountryCode}`);
                } else {
                  // Single location from resolved data
                  const capitalizedLocation = locationToResolve.split(' ').map((word: string) => 
                    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                  ).join(' ');
                  selectedCounties = [capitalizedLocation];
                  console.log(`✅ Using user's exact location: "${capitalizedLocation}" in ${resolvedCountryCode}`);
                }
              }
            }

            // Build preview and store pending confirmation (use ISO country code)
            await storage.setPendingConfirmation(sessionId, {
              business_types: params.business_types,
              roles,
              delay_ms: delayMs,
              number_countiestosearch: selectedCounties.length,
              smarlead_id: smarleadId,
              counties: selectedCounties,
              country: resolvedCountryCode,  // Use resolved ISO alpha-2 code
              timestamp: new Date().toISOString()
            });

            let previewText = `📋 **Batch Workflow Preview**\n\n`;
            previewText += `I'll make **${selectedCounties.length} API call(s)** to the autogen endpoint:\n\n`;
            
            for (const county of selectedCounties) {
              for (const businessType of params.business_types) {
                for (const role of roles) {
                  previewText += `• ${role} @ ${businessType} in **${county}, ${resolvedCountryCode}**\n`;  // Use resolved ISO code
                }
              }
            }
            
            previewText += `\n**Parameters:**\n`;
            previewText += `- Delay: ${delayMs}ms\n`;
            previewText += `- Smarlead ID: ${smarleadId}\n`;
            previewText += `\n✅ Type **"yes"** to confirm or **"no"** to cancel`;
            
            // Append confidence note if present
            if (confidenceNote) {
              previewText += confidenceNote;
            }

            aiBuffer = previewText;
            res.write(`data: ${JSON.stringify({ content: previewText })}\n\n`);
            
          } catch (toolErr: any) {
            console.error("❌ Tool execution error:", toolErr.message);
            aiBuffer = `Error processing workflow: ${toolErr.message}`;
            res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
          }
        } else if (isToolCall && toolCallBuffer.name === "search_wyshbone_database") {
          console.log("🔍 Wyshbone Global Database search tool call detected");
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            // Handle cases where AI sends multiple JSON objects concatenated
            // Extract only the first valid JSON object
            let jsonToParse = toolCallBuffer.arguments.trim();
            
            // Find the first complete JSON object
            let braceCount = 0;
            let firstJsonEnd = -1;
            for (let i = 0; i < jsonToParse.length; i++) {
              if (jsonToParse[i] === '{') braceCount++;
              if (jsonToParse[i] === '}') braceCount--;
              if (braceCount === 0 && jsonToParse[i] === '}') {
                firstJsonEnd = i + 1;
                break;
              }
            }
            
            if (firstJsonEnd > 0 && firstJsonEnd < jsonToParse.length) {
              console.log("⚠️  Multiple JSON objects detected, using only the first one");
              jsonToParse = jsonToParse.substring(0, firstJsonEnd);
            }
            
            const params = JSON.parse(jsonToParse);
            
            if (!params.query) {
              throw new Error("Missing query parameter");
            }
            
            // Call the searchPlaces function
            const { searchPlaces } = await import("./googlePlaces");
            const results = await searchPlaces({
              query: params.query,
              locationText: params.locationText,
              maxResults: params.maxResults || 30,
            });
            
            // Format results as a nice markdown response
            let responseText = `🔍 **Wyshbone Global Database Results**\n\n`;
            responseText += `Found **${results.length} businesses** for "${params.query}"\n\n`;
            
            if (results.length === 0) {
              responseText += `No results found. Try a different search query or location.`;
            } else {
              responseText += `---\n\n`;
              
              // Show first 10 results in detail, then summarize the rest
              const detailedResults = results.slice(0, 10);
              const remainingCount = results.length - 10;
              
              for (let i = 0; i < detailedResults.length; i++) {
                const place = detailedResults[i];
                responseText += `**${i + 1}. ${place.name}**\n`;
                responseText += `📍 ${place.address}\n`;
                responseText += `🆔 Place ID: \`${place.placeId}\`\n`;
                
                if (place.phone) {
                  responseText += `📞 ${place.phone}\n`;
                }
                if (place.website) {
                  responseText += `🌐 ${place.website}\n`;
                }
                if (place.rating) {
                  responseText += `⭐ ${place.rating} (${place.userRatingCount} reviews)\n`;
                }
                
                responseText += `\n`;
              }
              
              if (remainingCount > 0) {
                responseText += `\n*...and ${remainingCount} more results*\n\n`;
                responseText += `**All ${results.length} Place IDs:**\n`;
                responseText += results.map(r => r.placeId).join(', ');
              }
            }
            
            aiBuffer = responseText;
            res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
            
            // Save the results to conversation
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved Wyshbone Global Database results to database");
            
          } catch (toolErr: any) {
            console.error("❌ Wyshbone Global Database search error:", toolErr.message);
            aiBuffer = `Error searching Wyshbone Global Database: ${toolErr.message}`;
            res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
            
            appendMessage(sessionId, { role: "assistant", content: aiBuffer });
            await saveMessage(conversationId, "assistant", aiBuffer);
            console.log("💾 Saved error message to database");
          }
        } else if (isToolCall && toolCallBuffer.name === "create_scheduled_monitor") {
          console.log("⏰ Scheduled monitor tool call detected");
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            const params = JSON.parse(toolCallBuffer.arguments);
            
            if (!params.label || !params.description || !params.schedule || !params.monitorType) {
              throw new Error("Missing required parameters for scheduled monitor");
            }
            
            // Calculate next run time
            const now = Date.now();
            let nextRunAt = now;
            
            // Calculate next run based on schedule
            if (params.schedule === 'daily') {
              nextRunAt = now + (24 * 60 * 60 * 1000); // 24 hours
            } else if (params.schedule === 'weekly') {
              nextRunAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days
            } else if (params.schedule === 'biweekly') {
              nextRunAt = now + (14 * 24 * 60 * 60 * 1000); // 14 days
            } else if (params.schedule === 'monthly') {
              nextRunAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days
            }
            
            // Create the scheduled monitor
            const monitor = await storage.createScheduledMonitor({
              id: `monitor_${Date.now()}_${Math.random().toString(36).substring(7)}`,
              userId: user.id,
              conversationId: conversationId, // Link to current conversation
              label: params.label,
              description: params.description,
              schedule: params.schedule,
              scheduleDay: params.scheduleDay || null,
              scheduleTime: params.scheduleTime || null,
              monitorType: params.monitorType,
              config: params.config || null,
              isActive: 1,
              status: 'active', // User-created monitors are active by default
              suggestedBy: 'user', // Created by user action
              suggestedReason: null,
              suggestionMetadata: null,
              emailNotifications: 1, // Default to enabled
              emailAddress: null,
              nextRunAt,
              lastRunAt: null,
              createdAt: now,
              updatedAt: now,
            });
            
            // Format response
            let responseText = `⏰ **Scheduled Monitor Created**\n\n`;
            responseText += `✅ **${params.label}**\n\n`;
            responseText += `📋 ${params.description}\n\n`;
            responseText += `🔄 **Schedule:** ${params.schedule.charAt(0).toUpperCase() + params.schedule.slice(1)}`;
            
            if (params.scheduleDay) {
              responseText += ` on ${params.scheduleDay.charAt(0).toUpperCase() + params.scheduleDay.slice(1)}s`;
            }
            if (params.scheduleTime) {
              responseText += ` at ${params.scheduleTime}`;
            }
            responseText += `\n\n`;
            
            responseText += `📊 **Type:** ${params.monitorType === 'deep_research' ? 'Deep Research' : params.monitorType === 'business_search' ? 'Business Search' : 'Wyshbone Global Database'}\n\n`;
            responseText += `🎯 Your monitor will run automatically according to the schedule. You can view and manage it in the sidebar under "Scheduled Monitors".\n\n`;
            
            const nextRunDate = new Date(nextRunAt);
            responseText += `⏭️ **Next run:** ${nextRunDate.toLocaleDateString('en-GB')} at ${nextRunDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
            
            aiBuffer = responseText;
            res.write(`data: ${JSON.stringify({ content: responseText })}\n\n`);
            
            // Save to conversation
            appendMessage(sessionId, { role: "assistant", content: responseText });
            await saveMessage(conversationId, "assistant", responseText);
            console.log("💾 Saved scheduled monitor creation to database");
            
          } catch (toolErr: any) {
            console.error("❌ Scheduled monitor creation error:", toolErr.message);
            aiBuffer = `Error creating scheduled monitor: ${toolErr.message}`;
            res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
            
            appendMessage(sessionId, { role: "assistant", content: aiBuffer });
            await saveMessage(conversationId, "assistant", aiBuffer);
            console.log("💾 Saved error message to database");
          }
        } else if (isToolCall && toolCallBuffer.name === "saleshandy_batch_call") {
          console.log("📧 SalesHandy batch contact finder tool call detected");
          console.log("📦 Arguments:", toolCallBuffer.arguments);
          
          try {
            const params = JSON.parse(toolCallBuffer.arguments);
            
            // Validate required parameters
            if (!params.query) {
              throw new Error("Please provide a business type to search for (e.g., 'restaurants', 'coffee shops')");
            }
            
            if (!params.location) {
              throw new Error("Please provide a location for the search");
            }
            
            if (!params.country) {
              throw new Error("Please provide a country");
            }
            
            if (!params.targetRole) {
              throw new Error("Please provide a target job role (e.g., 'owner', 'CEO', 'Head of Sales')");
            }
            
            // Add auth params for development mode
            const authParams = new URLSearchParams({
              user_id: user.id,
              user_email: user.email
            });
            
            // Call batch create endpoint with correct parameters
            const response = await fetch(`http://localhost:5000/api/batch/create?${authParams}`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "x-session-id": user.id
              },
              body: JSON.stringify({ 
                query: params.query,
                location: params.location,
                country: params.country,
                targetRole: params.targetRole
              }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              const batchId = data.batchId;
              const responseText = `📧 **SalesHandy Batch Started!**\n\n` +
                `🔍 **Search:** ${params.query} in ${params.location}, ${params.country}\n` +
                `🎯 **Target Role:** ${params.targetRole}\n` +
                `🔗 **[View Pipeline Progress →](/batch/${batchId})** ⏳\n\n` +
                `**Pipeline Processing:**\n` +
                `1. ✅ Searching Google Places (up to 60 results with page tokens)\n` +
                `2. 🌐 Finding website domains for each business\n` +
                `3. 📧 Discovering verified emails via Hunter.io\n` +
                `4. 🎯 Ranking contacts by position (${params.targetRole} prioritized)\n` +
                `5. ✍️ Generating AI-powered personalized outreach\n` +
                `6. 📤 Adding prospects to SalesHandy campaign\n\n` +
                `This will take several minutes. Click the link above to watch the pipeline in real-time!`;
              
              aiBuffer = responseText;
              appendMessage(sessionId, { role: "assistant", content: responseText });
              await saveMessage(conversationId, "assistant", responseText);
              console.log("💾 Saved SalesHandy batch message to database");
              
              // Send batch ID metadata along with the message
              res.write(`data: ${JSON.stringify({ content: responseText, batchId })}\n\n`);
            } else {
              throw new Error(data.error || "Failed to start SalesHandy batch");
            }
            
          } catch (toolErr: any) {
            console.error("❌ SalesHandy batch error:", toolErr.message);
            aiBuffer = `Sorry, I couldn't start the SalesHandy batch: ${toolErr.message}`;
            res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
            
            appendMessage(sessionId, { role: "assistant", content: aiBuffer });
            await saveMessage(conversationId, "assistant", aiBuffer);
            console.log("💾 Saved error message to database");
          }
        }
        
        if (!aiBuffer) {
          aiBuffer = "I apologize, but I couldn't generate a response.";
          res.write(`data: ${JSON.stringify({ content: aiBuffer })}\n\n`);
        }
        
      } catch (err: any) {
        console.error("❌ Chat Completions API error:", err.message);
        console.error("Error details:", JSON.stringify(err, null, 2));
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
        toolCallsLog.length > 0 ? toolCallsLog : undefined,
        undefined,
        'standard'
      );

      // End stream
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Chat error:", error);
      
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
          toolCallsLog.length > 0 ? toolCallsLog : undefined,
          error.message,
          'standard'
        );
      } catch (logError: any) {
        console.error("❌ Tower logging error:", logError.message);
      }
      
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
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
  app.get("/api/plan-status", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get session ID
      const sessionId = getSessionId(req);
      
      // Get current goal
      const goal = await getUserGoal(sessionId);
      
      // Check for active plan execution using the leadgen-executor
      const { getExecutionBySession, getExecutionByConversation, getPlanExecution } = await import('./leadgen-executor.js');
      
      // Try to get execution by planId first (if provided), then conversation ID, then session
      const planId = req.query.planId as string | undefined;
      const conversationId = req.query.conversationId as string | undefined;
      
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
          lastUpdatedAt: new Date().toISOString()
        });
      }
      
      // Calculate completed steps
      const completedSteps = execution.stepProgress.filter(s => s.status === 'completed').length;
      
      // Find current step (first running or pending step)
      const currentStepProgress = execution.stepProgress.find(s => s.status === 'running') ||
                                  execution.stepProgress.find(s => s.status === 'pending');
      
      // Build response based on execution data
      const response = {
        goal: goal || null,
        planId: execution.planId,
        totalSteps: execution.steps.length,
        completedSteps,
        currentStep: currentStepProgress ? {
          id: currentStepProgress.stepId,
          label: execution.steps[currentStepProgress.stepIndex].label,
          status: currentStepProgress.status
        } : null,
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
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
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
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
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
  // PLAN APPROVAL API (UI-030)
  // ===========================
  
  // GET /api/plan - Get current leadgen plan for approval
  app.get("/api/plan", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get session ID
      const sessionId = getSessionId(req);
      
      // Get plan for this session
      const { getPlanBySession } = await import('./leadgen-plan.js');
      const plan = getPlanBySession(sessionId);
      
      res.json(plan);
    } catch (error: any) {
      console.error("Error fetching plan:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/plan/approve - Approve a plan and trigger execution
  app.post("/api/plan/approve", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { planId } = req.body;
      
      console.log(`📋 /api/plan/approve called for planId: ${planId}`);
      
      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }
      
      const { approvePlan, getPlanById, updatePlanStatus } = await import('./leadgen-plan.js');
      
      // Get the plan first to validate it exists
      const plan = getPlanById(planId);
      if (!plan) {
        console.error(`❌ Plan not found: ${planId}`);
        return res.status(404).json({ error: "Plan not found" });
      }
      
      console.log(`✅ Found plan: ${planId}, status: ${plan.status}`);
      
      // Approve the plan
      const approvedPlan = approvePlan(planId);
      
      if (!approvedPlan) {
        console.error(`❌ Failed to approve plan: ${planId}`);
        return res.status(404).json({ error: "Plan not found" });
      }
      
      console.log(`✅ Plan approved: ${planId}`);
      
      // Trigger SUP-002 execution using the leadgen-executor
      try {
        const { startPlanExecution, getPlanExecution } = await import('./leadgen-executor.js');
        
        // Guard against duplicate execution
        const existingExecution = getPlanExecution(planId);
        if (existingExecution) {
          console.log(`⚠️ Execution already exists for plan ${planId}, status: ${existingExecution.status}`);
          
          // If execution is still running, return current state
          if (existingExecution.status === 'executing') {
            return res.json({
              planId: approvedPlan.id,
              status: 'executing'
            });
          }
          
          // If execution completed or failed, allow viewing the result
          return res.json({
            planId: approvedPlan.id,
            status: existingExecution.status
          });
        }
        
        // Start background execution
        const execution = await startPlanExecution(approvedPlan);
        
        // Update plan status to executing
        updatePlanStatus(planId, 'executing');
        
        console.log(`✅ Plan ${planId} approved and SUP-002 execution started`);
        console.log(`  📊 Execution has ${execution.steps.length} steps to complete`);
        
        // Return success response
        res.json({
          planId: approvedPlan.id,
          status: 'executing'
        });
      } catch (executionError: any) {
        console.error(`❌ Failed to start execution for plan ${planId}:`, executionError);
        
        // Plan is approved but execution failed to start
        return res.status(500).json({ 
          error: `Plan approved but failed to start execution: ${executionError.message}` 
        });
      }
    } catch (error: any) {
      console.error("❌ Error approving plan:", error);
      res.status(500).json({ error: error.message });
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
      const oldPlan = getPlanById(planId);
      if (!oldPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      
      rejectPlan(planId);
      
      // Create a new plan with the same goal
      const sessionId = getSessionId(req);
      const newPlan = createLeadGenPlan(sessionId, oldPlan.goal, oldPlan.conversationId);
      
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
  
  // POST /api/plan/start - Create a new plan for the current goal (SUP-001)
  app.post("/api/plan/start", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { goal, conversationId } = req.body;
      
      if (!goal) {
        return res.status(400).json({ error: "Goal is required" });
      }
      
      const { createLeadGenPlan } = await import('./leadgen-plan.js');
      
      const sessionId = getSessionId(req);
      const newPlan = createLeadGenPlan(sessionId, goal, conversationId);
      
      console.log(`🚀 Plan started: ${newPlan.id} for session ${sessionId}`);
      
      res.json({
        success: true,
        plan: newPlan
      });
    } catch (error: any) {
      console.error("Error starting plan:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/plan/create-test - Create a test plan for demo purposes (DEV ONLY)
  app.post("/api/plan/create-test", async (req, res) => {
    try {
      // DEV ONLY - only allow in development
      if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: "Test endpoint only available in development" });
      }
      
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { goal, conversationId } = req.body;
      
      if (!goal) {
        return res.status(400).json({ error: "Goal is required" });
      }
      
      const { createLeadGenPlan } = await import('./leadgen-plan.js');
      
      const sessionId = getSessionId(req);
      const newPlan = createLeadGenPlan(sessionId, goal, conversationId);
      
      console.log(`🧪 Test plan created: ${newPlan.id} for session ${sessionId}`);
      
      res.json({
        success: true,
        plan: newPlan
      });
    } catch (error: any) {
      console.error("Error creating test plan:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // =========================================
  // POST /api/search – OpenAI Responses API
  // (kept as you provided; unchanged in logic)
  // =========================================
  app.post("/api/search", async (req, res) => {
    try {
      // Get session ID for memory tracking
      const sessionId = getSessionId(req);
      
      // Accept either query string or messages array for conversation history
      const { query, messages } = req.body;

      if (!query && (!messages || messages.length === 0)) {
        return res
          .status(400)
          .json({ error: "Either query or messages must be provided" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res
          .status(500)
          .json({ error: "OPENAI_API_KEY is not configured" });
      }
      
      // Get the latest user message
      const latestUserMessage = messages && messages.length > 0 
        ? messages[messages.length - 1].content 
        : query;
      
      // Store user message in memory
      appendMessage(sessionId, { role: "user", content: latestUserMessage });
      
      // Get full conversation from memory
      const memoryConversation = getConversation(sessionId);
      const { getVenueCacheContext, addVenuesToCache, markVenuesAsServed, getVenueCache } = await import("./memory");
      
      // STEP 1: GPT Planner - Decide intent: search, use cache, or conversational response
      const plannerMessages = [
        {
          role: "system" as const,
          content: `You are a venue search intent classifier. Your job is to distinguish between:
- Requests for SPECIFIC VENUE LISTINGS (use "search" or "use_cache")
- CONVERSATIONAL questions, estimates, or general discussion (use "respond")

KEY DISTINCTION:
- "find X" / "show me X" / "I need X" = SEARCH for venue listings
- "how many X?" / "what is X?" / "tell me about X" = CONVERSATIONAL response

DO NOT search when user asks "how many" or similar analytical questions. Just answer conversationally.

Reply with a json object matching the action schema specified below.`
        },
        ...memoryConversation.map((msg) => ({ role: msg.role as "system" | "user" | "assistant", content: msg.content })),
        {
          role: "user" as const,
          content: `User query: "${latestUserMessage}"

${getVenueCacheContext(sessionId)}

Choose ONE action:

1. "search" - User wants a LIST of specific venues
   ✓ "find 5 pubs in London"
   ✓ "show me restaurants"
   ✗ "how many pubs are in London?" (this is NOT a search!)
   ✗ "what's a good pub?" (this is NOT a search!)

2. "use_cache" - User wants MORE from existing results
   ✓ "show 5 more"
   ✓ "next results"

3. "respond" - User wants CONVERSATION/INFORMATION (NOT venue listings)
   ✓ "how many pubs do you think there are in london?" 
   ✓ "what makes a good pub?"
   ✓ "thanks"
   ✓ "tell me about pubs"

Response format:
- If "respond": {"action": "respond", "answer": "your conversational answer here", "reasoning": "..."}
- If "search": {"action": "search", "query": "...", "count": N, "reasoning": "..."}
- If "use_cache": {"action": "use_cache", "count": N, "reasoning": "..."}`
        }
      ];

      const plannerResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: plannerMessages,
        response_format: { type: "json_object" },
      });

      const plannerText = plannerResponse.choices[0]?.message?.content || "{}";
      const plan = JSON.parse(plannerText);
      
      console.log("🎯 Planner decision:", plan);

      // STEP 2: Handle conversational responses
      if (plan.action === "respond") {
        const conversationalResponse = {
          query: latestUserMessage,
          conversational: true,
          answer: plan.answer || "I'd be happy to discuss that with you.",
          generated_at: new Date().toISOString()
        };
        
        // Store assistant's response in memory
        appendMessage(sessionId, { role: "assistant", content: plan.answer || conversationalResponse.answer });
        
        return res.json(conversationalResponse);
      }

      let newVenues: any[] = [];

      // STEP 3: If planner says "search", call Wyshbone Global Database FIRST as primary source
      if (plan.action === "search") {
        const { searchPlaces } = await import("./googlePlaces");
        
        // Extract location from query (simple parsing)
        const queryLower = (plan.query || latestUserMessage).toLowerCase();
        let locationText = "";
        
        // Common patterns: "in [location]", "near [location]", "at [location]"
        const locationMatch = queryLower.match(/(?:in|near|at)\s+([a-z\s,]+?)(?:\s|$)/);
        if (locationMatch) {
          locationText = locationMatch[1].trim();
        }

        // Call Wyshbone Global Database directly as primary source
        // Always fetch 60 results (3 pages of 20) to build a large cache
        const placesResults = await searchPlaces({
          query: plan.query || latestUserMessage,
          locationText: locationText || undefined,
          maxResults: 60, // Fetch up to 60 results across 3 pages
        });

        console.log(`📍 Wyshbone Global Database found ${placesResults.length} venues`);

        // Add Wyshbone Global Database results to cache with all fields
        if (placesResults.length > 0) {
          addVenuesToCache(
            sessionId,
            placesResults.map((v) => ({
              placeId: v.placeId,
              name: v.name,
              address: v.address,
              businessStatus: v.businessStatus,
              phone: v.phone,
              website: v.website,
            }))
          );
          newVenues = placesResults;
        }
      }

      // STEP 4: Use GPT formatter to create final response from cache
      const cache = getVenueCache(sessionId);
      const availableVenues = cache.filter((v) => !v.served);
      
      const formatterMessages = [
        ...memoryConversation.map((msg) => ({ role: msg.role as "system" | "user" | "assistant", content: msg.content })),
        {
          role: "system" as const,
          content: `Available venues to show (not yet served): ${JSON.stringify(availableVenues)}\n\nCreate a response using these venues. Format as json: {"query": "...", "verified": true, "results": [{placeId, name, address, businessStatus, phone, website}], "generated_at": "ISO timestamp"}\n\nIMPORTANT: Include ALL available fields (placeId, name, address, businessStatus, phone, website) for each venue in the results array. Do not omit any fields.`
        }
      ];

      const formatterResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: formatterMessages,
        response_format: { type: "json_object" },
      });

      const formatterText = formatterResponse.choices[0]?.message?.content || "{}";
      const finalResponse = JSON.parse(formatterText);

      // Mark venues as served
      if (finalResponse.results && Array.isArray(finalResponse.results)) {
        const servedPlaceIds = finalResponse.results.map((v: any) => v.placeId).filter(Boolean);
        markVenuesAsServed(sessionId, servedPlaceIds);
      }

      // Store assistant's formatted response in memory
      appendMessage(sessionId, { role: "assistant", content: formatterText });

      return res.json(finalResponse);

    } catch (error: any) {
      console.error("Search error:", error);
      return res
        .status(500)
        .json({ error: "Search request failed", message: error.message });
    }
  });

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
  app.post("/api/tool/bubble_run_batch", async (req, res) => {
    try {
      const { bubbleRunBatchRequestSchema } = await import("@shared/schema");
      const validation = bubbleRunBatchRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: "Invalid request format", details: validation.error });
      }

      const { bubbleRunBatch } = await import("./bubble");
      const result = await bubbleRunBatch(validation.data);

      res.json(result);
    } catch (error: any) {
      console.error("Bubble batch error:", error);
      res
        .status(500)
        .json({ error: "Failed to run Bubble batch", message: error.message });
    }
  });

  // POST /api/places/verify – cross-check a venue, return Place ID + status
  app.post("/api/places/verify", async (req, res) => {
    try {
      const { name, address, lat, lng, radiusMeters } = req.body || {};

      if (!name) {
        return res.status(400).json({ error: "Missing `name`" });
      }

      const locationBias =
        lat && lng && radiusMeters
          ? { lat: Number(lat), lng: Number(lng), radiusMeters: Number(radiusMeters) }
          : undefined;

      const { verifyVenue } = await import("./googlePlaces");

      const result = await verifyVenue({
        name,
        address,
        locationBias,
      });

      return res.json(result);
    } catch (e: any) {
      console.error("verify error:", e);
      return res.status(500).json({ error: e.message || "Verify failed" });
    }
  });

  // =========================================
  // POST /api/places/search - Places v1 discovery
  // =========================================
  app.post("/api/places/search", async (req, res) => {
    try {
      const { query, locationText, lat, lng, radiusMeters, typesFilter, maxResults } = req.body || {};

      if (!query) {
        return res.status(400).json({ error: "Missing `query`" });
      }

      const { searchPlaces } = await import("./googlePlaces");

      const results = await searchPlaces({
        query,
        locationText,
        lat: lat !== undefined ? Number(lat) : undefined,
        lng: lng !== undefined ? Number(lng) : undefined,
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        maxResults: maxResults !== undefined ? Number(maxResults) : 30,
        typesFilter,
      });

      return res.json({
        results,
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("places/search error:", e);
      return res.status(500).json({ error: e.message || "Search failed" });
    }
  });

  // =========================================
  // POST /api/prospects/enrich - GPT enrichment via Responses API
  // =========================================
  app.post("/api/prospects/enrich", async (req, res) => {
    try {
      const { items, concurrency = 3, contacts } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty `items` array" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      // Parse contacts configuration
      const contactsConfig = contacts?.enabled ? {
        enabled: true,
        roles: contacts.roles || ["general manager", "bar manager", "taproom manager", "head brewer", "owner", "landlord"],
        maxPerPlace: contacts.maxPerPlace || 3,
        minConfidence: contacts.minConfidence || 0.6,
      } : { enabled: false };

      // JSON schema for enrichment output (without contacts)
      const enrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          domain: { type: "string", nullable: true },
          contact_email: { type: "string", nullable: true },
          socials: {
            type: "object",
            properties: {
              website: { type: "string", nullable: true },
              linkedin: { type: "string", nullable: true },
              twitter: { type: "string", nullable: true },
              instagram: { type: "string", nullable: true },
              facebook: { type: "string", nullable: true },
            },
            required: ["website", "linkedin", "twitter", "instagram", "facebook"],
            additionalProperties: false,
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "domain", "contact_email", "socials", "category", "summary", "suggested_intro", "lead_score"],
        additionalProperties: false,
      };

      // JSON schema for contact enrichment
      const contactEnrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                role_normalized: { 
                  type: "string", 
                  description: "one of: general_manager, bar_manager, taproom_manager, head_brewer, owner, landlord, other" 
                },
                source_url: { type: "string" },
                source_type: { 
                  type: "string", 
                  description: "website|linkedin|instagram|facebook|news|other" 
                },
                source_date: { 
                  type: "string", 
                  nullable: true, 
                  description: "ISO date if available (post/article/profile last updated)" 
                },
                confidence: { 
                  type: "number", 
                  description: "0-1" 
                },
                email_public: { 
                  type: "string", 
                  nullable: true, 
                  description: "Only if clearly published; never guess" 
                },
                email_type: { 
                  type: "string", 
                  nullable: true, 
                  description: "generic|personal" 
                },
                phone_public: { type: "string", nullable: true },
                linkedin_url: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
              },
              required: ["name", "title", "role_normalized", "source_url", "source_type", "source_date", "confidence", "email_public", "email_type", "phone_public", "linkedin_url", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["placeId", "contacts"],
        additionalProperties: false,
      };

      // Process items with concurrency control
      const enrichItem = async (item: any) => {
        const placeId = item.placeId || item.resourceName?.replace(/^places\//, "") || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const phone = item.phone || "";
        const domain = item.domain || (website ? new URL(website).hostname : "");

        // Extract city/town from address for contact search
        const cityMatch = address.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
        const city = cityMatch ? cityMatch[1].trim() : "";

        const prompt = `You are a B2B sales research assistant. Enrich this business with web search:

Business: ${name}
Address: ${address}
${website ? `Website: ${website}` : ""}
${phone ? `Phone: ${phone}` : ""}

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Tasks:
1. ${website ? "Verify the website is correct" : "Find the official website"}
2. Extract domain name (e.g., example.com)
3. Find generic contact email if publicly listed (info@, hello@, contact@)
4. Find social media links (LinkedIn, Twitter, Instagram, Facebook)
5. Classify the business type (e.g., pub, brewery, restaurant, cafe)
6. Write a 1-2 sentence neutral summary of what they do
7. Create a short suggested outreach intro (1 sentence, professional, no fluff)
8. Assign a lead score 0-100 based on online presence quality

Return structured data with the EXACT placeId provided above: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "enrichment",
                schema: enrichmentSchema,
              },
            },
          };

          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();

          // Extract text from response
          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.content?.[0]?.text) {
                outputText = item.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const enrichment = JSON.parse(outputText);
          
          // CRITICAL: Validate that GPT returned the exact Place ID we provided - reject if mismatch
          if (enrichment.placeId !== placeId) {
            console.error(`Enrichment Place ID mismatch! Expected: ${placeId}, Got: ${enrichment.placeId}. Rejecting enrichment.`);
            // Don't use hallucinated enrichment for wrong place - return minimal data
            return {
              ...item,
              placeId,
              domain: null,
              contact_email: null,
              socials: {},
              category: "unknown",
              summary: "Enrichment rejected due to Place ID mismatch",
              suggested_intro: "",
              lead_score: 0,
              ...(contactsConfig.enabled ? { contacts: [] } : {}),
            };
          }

          // Optional: Enrich with public contacts if enabled
          let contacts = [];
          if (contactsConfig.enabled) {
            const enrichedDomain = enrichment.domain || domain;
            const enrichedWebsite = enrichment.socials?.website || website;

            const contactPrompt = `You are a B2B sales research assistant. Find PUBLIC contact information for this business.

Business: ${name}
${city ? `City: ${city}` : ""}
${enrichedDomain ? `Domain: ${enrichedDomain}` : ""}
${enrichedWebsite ? `Website: ${enrichedWebsite}` : ""}

CRITICAL SAFETY RULES:
- Only return PUBLIC contact info with a verifiable source URL
- Never guess personal emails, phone numbers, or names
- If unsure, return an empty contacts list
- Never use paywalled, login-gated, or scraped sources

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Search for contacts with these roles: ${contactsConfig.roles.join(", ")}

Search strategy:
1. Check "${name}" ${city} manager OR owner
2. ${enrichedDomain ? `Search site:${enrichedDomain} for "team" OR "staff" OR "meet the team" OR "about us"` : ""}
3. Search "${name}" LinkedIn for relevant roles (${contactsConfig.roles.slice(0, 3).join(", ")})
4. Check Instagram/Facebook business pages for contact info
5. Look for press mentions or news articles

For each contact found:
- Verify they are current (within ~18 months)
- Include the exact source URL where you found the info
- Set confidence (0-1) based on how current and authoritative the source is
- Only include email/phone if clearly published publicly
- Classify source_type as: website, linkedin, instagram, facebook, news, or other

Return up to ${contactsConfig.maxPerPlace} contacts with confidence >= ${contactsConfig.minConfidence}.
Return structured data with the EXACT placeId: "${placeId}"`;

            try {
              const contactRequestBody = {
                model: "gpt-4o-mini",
                input: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "input_text",
                        text: contactPrompt,
                      },
                    ],
                  },
                ],
                tools: [{ type: "web_search" }],
                text: {
                  format: {
                    type: "json_schema",
                    name: "contact_enrichment",
                    schema: contactEnrichmentSchema,
                  },
                },
              };

              const contactResponse = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify(contactRequestBody),
              });

              if (contactResponse.ok) {
                const contactData = await contactResponse.json();

                let contactOutputText: string | null = null;
                if (contactData.output?.[1]?.content?.[0]?.text) {
                  contactOutputText = contactData.output[1].content[0].text;
                } else if (contactData.output?.[0]?.content?.[0]?.text) {
                  contactOutputText = contactData.output[0].content[0].text;
                } else if (Array.isArray(contactData.output)) {
                  for (const contactItem of contactData.output) {
                    if (contactItem.content?.[0]?.text) {
                      contactOutputText = contactItem.content[0].text;
                      break;
                    }
                  }
                }

                if (contactOutputText) {
                  const contactEnrichment = JSON.parse(contactOutputText);
                  
                  // CRITICAL: Validate Place ID - reject mismatches instead of overwriting
                  if (contactEnrichment.placeId !== placeId) {
                    console.error(`Contact Place ID mismatch! Expected: ${placeId}, Got: ${contactEnrichment.placeId}. Rejecting contact enrichment.`);
                    // Don't use hallucinated contacts for wrong place
                  } else {
                    // Filter contacts by role, confidence, source validation, and max count
                  const normalizedRoles = contactsConfig.roles.map((r: string) => 
                    r.toLowerCase().replace(/\s+/g, "_")
                  );
                  
                    contacts = (contactEnrichment.contacts || [])
                      .filter((c: any) => {
                        // Must have source URL
                        if (!c.source_url || typeof c.source_url !== "string") {
                          console.warn(`Contact "${c.name}" rejected: missing source_url`);
                          return false;
                        }
                        
                        // Source URL must be valid HTTPS URL
                        try {
                          const url = new URL(c.source_url);
                          if (!url.protocol.startsWith("http")) {
                            console.warn(`Contact "${c.name}" rejected: invalid source_url protocol`);
                            return false;
                          }
                        } catch (e) {
                          console.warn(`Contact "${c.name}" rejected: malformed source_url`);
                          return false;
                        }
                        
                        // Must meet confidence threshold
                        if (c.confidence < contactsConfig.minConfidence) {
                          return false;
                        }
                        
                        // Must match requested roles
                        if (normalizedRoles.length > 0 && !normalizedRoles.includes(c.role_normalized)) {
                          return false;
                        }
                        
                        return true;
                      })
                      .slice(0, contactsConfig.maxPerPlace);
                  }
                }
              }
            } catch (contactError: any) {
              console.error(`Contact enrichment error for ${name}:`, contactError.message);
            }
          }
          
          return {
            ...item,
            ...enrichment,
            ...(contactsConfig.enabled ? { contacts } : {}),
          };
        } catch (error: any) {
          console.error(`Enrichment error for ${name}:`, error.message);
          return {
            ...item,
            placeId,
            domain: null,
            contact_email: null,
            socials: {},
            category: "unknown",
            summary: "Enrichment failed",
            suggested_intro: "",
            lead_score: 0,
            ...(contactsConfig.enabled ? { contacts: [] } : {}),
          };
        }
      };

      // Process in batches with concurrency control
      const enriched = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichItem));
        enriched.push(...batchResults);
      }

      return res.json({ enriched });
    } catch (e: any) {
      console.error("prospects/enrich error:", e);
      return res.status(500).json({ error: e.message || "Enrichment failed" });
    }
  });

  // =========================================
  // POST /api/prospects/enrich_contacts - Contacts-only enrichment
  // =========================================
  app.post("/api/prospects/enrich_contacts", async (req, res) => {
    try {
      const { items, concurrency = 3, roles, maxPerPlace = 3, minConfidence = 0.6 } = req.body || {};

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing or empty `items` array" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
      }

      const contactRoles = roles || ["general manager", "bar manager", "taproom manager", "head brewer", "owner", "landlord"];

      // JSON schema for contact enrichment
      const contactEnrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          contacts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                role_normalized: { type: "string", description: "one of: general_manager, bar_manager, taproom_manager, head_brewer, owner, landlord, other" },
                source_url: { type: "string" },
                source_type: { type: "string", description: "website|linkedin|instagram|facebook|news|other" },
                source_date: { type: "string", nullable: true, description: "ISO date if available" },
                confidence: { type: "number", description: "0-1" },
                email_public: { type: "string", nullable: true, description: "Only if clearly published; never guess" },
                email_type: { type: "string", nullable: true, description: "generic|personal" },
                phone_public: { type: "string", nullable: true },
                linkedin_url: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
              },
              required: ["name", "title", "role_normalized", "source_url", "source_type", "source_date", "confidence", "email_public", "email_type", "phone_public", "linkedin_url", "notes"],
              additionalProperties: false,
            },
          },
        },
        required: ["placeId", "contacts"],
        additionalProperties: false,
      };

      const enrichContactsForItem = async (item: any) => {
        const placeId = item.placeId || item.resourceName?.replace(/^places\//, "") || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const domain = item.domain || (website ? new URL(website).hostname : "");

        // Extract city from address
        const cityMatch = address.match(/,\s*([^,\d]+?)(?:,|\s+[A-Z]{1,2}\d|$)/i);
        const city = cityMatch ? cityMatch[1].trim() : "";

        const contactPrompt = `You are a B2B sales research assistant. Find PUBLIC contact information for this business.

Business: ${name}
${city ? `City: ${city}` : ""}
${domain ? `Domain: ${domain}` : ""}
${website ? `Website: ${website}` : ""}

CRITICAL SAFETY RULES:
- Only return PUBLIC contact info with a verifiable source URL
- Never guess personal emails, phone numbers, or names
- If unsure, return an empty contacts list
- Never use paywalled, login-gated, or scraped sources

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Search for contacts with these roles: ${contactRoles.join(", ")}

Search strategy:
1. Check "${name}" ${city} manager OR owner
2. ${domain ? `Search site:${domain} for "team" OR "staff" OR "meet the team" OR "about us"` : ""}
3. Search "${name}" LinkedIn for relevant roles (${contactRoles.slice(0, 3).join(", ")})
4. Check Instagram/Facebook business pages for contact info
5. Look for press mentions or news articles

For each contact found:
- Verify they are current (within ~18 months)
- Include the exact source URL where you found the info
- Set confidence (0-1) based on how current and authoritative the source is
- Only include email/phone if clearly published publicly
- Classify source_type as: website, linkedin, instagram, facebook, news, or other

Return up to ${maxPerPlace} contacts with confidence >= ${minConfidence}.
Return structured data with the EXACT placeId: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: contactPrompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "contact_enrichment",
                schema: contactEnrichmentSchema,
              },
            },
          };

          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();

          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const contactItem of data.output) {
              if (contactItem.content?.[0]?.text) {
                outputText = contactItem.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const contactEnrichment = JSON.parse(outputText);

          // CRITICAL: Validate Place ID - reject mismatches instead of overwriting
          if (contactEnrichment.placeId !== placeId) {
            console.error(`Contact Place ID mismatch! Expected: ${placeId}, Got: ${contactEnrichment.placeId}. Rejecting contact enrichment.`);
            // Don't use hallucinated contacts for wrong place
            return {
              placeId,
              contacts: [],
            };
          }

          // Filter contacts by role, confidence, source validation, and max count
          const normalizedRoles = contactRoles.map((r: string) => 
            r.toLowerCase().replace(/\s+/g, "_")
          );
          
          const contacts = (contactEnrichment.contacts || [])
            .filter((c: any) => {
              // Must have source URL
              if (!c.source_url || typeof c.source_url !== "string") {
                console.warn(`Contact "${c.name}" rejected: missing source_url`);
                return false;
              }
              
              // Source URL must be valid HTTP/HTTPS URL
              try {
                const url = new URL(c.source_url);
                if (!url.protocol.startsWith("http")) {
                  console.warn(`Contact "${c.name}" rejected: invalid source_url protocol`);
                  return false;
                }
              } catch (e) {
                console.warn(`Contact "${c.name}" rejected: malformed source_url`);
                return false;
              }
              
              // Must meet confidence threshold
              if (c.confidence < minConfidence) {
                return false;
              }
              
              // Must match requested roles
              if (normalizedRoles.length > 0 && !normalizedRoles.includes(c.role_normalized)) {
                return false;
              }
              
              return true;
            })
            .slice(0, maxPerPlace);

          return {
            placeId,
            contacts,
          };
        } catch (error: any) {
          console.error(`Contact enrichment error for ${name}:`, error.message);
          return {
            placeId,
            contacts: [],
          };
        }
      };

      // Process in batches with concurrency control
      const enriched = [];
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichContactsForItem));
        enriched.push(...batchResults);
      }

      return res.json({ enriched });
    } catch (e: any) {
      console.error("prospects/enrich_contacts error:", e);
      return res.status(500).json({ error: e.message || "Contact enrichment failed" });
    }
  });

  // =========================================
  // POST /api/prospects/search_and_enrich - Combined endpoint
  // =========================================
  app.post("/api/prospects/search_and_enrich", async (req, res) => {
    try {
      const { query, locationText, lat, lng, radiusMeters, typesFilter, maxResults, enrich = true, concurrency = 3 } = req.body || {};

      if (!query) {
        return res.status(400).json({ error: "Missing `query`" });
      }

      // Step 1: Search Places
      const { searchPlaces } = await import("./googlePlaces");
      const places = await searchPlaces({
        query,
        locationText,
        lat: lat !== undefined ? Number(lat) : undefined,
        lng: lng !== undefined ? Number(lng) : undefined,
        radiusMeters: radiusMeters !== undefined ? Number(radiusMeters) : undefined,
        maxResults: maxResults !== undefined ? Number(maxResults) : 20,
        typesFilter,
      });

      if (!enrich) {
        return res.json({
          verified: true,
          results: places,
          generated_at: new Date().toISOString(),
        });
      }

      // Step 2: Enrich with GPT
      if (!process.env.OPENAI_API_KEY) {
        return res.json({
          verified: true,
          results: places,
          generated_at: new Date().toISOString(),
          note: "Enrichment skipped - OPENAI_API_KEY not configured",
        });
      }

      const enrichmentSchema = {
        type: "object",
        properties: {
          placeId: { type: "string" },
          domain: { type: "string", nullable: true },
          contact_email: { type: "string", nullable: true },
          socials: {
            type: "object",
            properties: {
              website: { type: "string", nullable: true },
              linkedin: { type: "string", nullable: true },
              twitter: { type: "string", nullable: true },
              instagram: { type: "string", nullable: true },
              facebook: { type: "string", nullable: true },
            },
            required: ["website", "linkedin", "twitter", "instagram", "facebook"],
            additionalProperties: false,
          },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_intro: { type: "string" },
          lead_score: { type: "number" },
        },
        required: ["placeId", "domain", "contact_email", "socials", "category", "summary", "suggested_intro", "lead_score"],
        additionalProperties: false,
      };

      const enrichItem = async (item: any) => {
        const placeId = item.placeId || "";
        const name = item.name || "";
        const address = item.address || "";
        const website = item.website || "";
        const phone = item.phone || "";

        const prompt = `You are a B2B sales research assistant. Enrich this business with web search:

Business: ${name}
Address: ${address}
${website ? `Website: ${website}` : ""}
${phone ? `Phone: ${phone}` : ""}

CRITICAL: You MUST use the exact Place ID provided below. Do NOT generate or modify it.
Place ID (use verbatim): ${placeId}

Tasks:
1. ${website ? "Verify the website is correct" : "Find the official website"}
2. Extract domain name (e.g., example.com)
3. Find generic contact email if publicly listed (info@, hello@, contact@)
4. Find social media links (LinkedIn, Twitter, Instagram, Facebook)
5. Classify the business type (e.g., pub, brewery, restaurant, cafe)
6. Write a 1-2 sentence neutral summary of what they do
7. Create a short suggested outreach intro (1 sentence, professional, no fluff)
8. Assign a lead score 0-100 based on online presence quality

Return structured data with the EXACT placeId provided above: "${placeId}"`;

        try {
          const requestBody = {
            model: "gpt-4o-mini",
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt,
                  },
                ],
              },
            ],
            tools: [{ type: "web_search" }],
            text: {
              format: {
                type: "json_schema",
                name: "enrichment",
                schema: enrichmentSchema,
              },
            },
          };

          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${errorText}`);
          }

          const data = await response.json();

          // Extract text from response
          let outputText: string | null = null;
          if (data.output?.[1]?.content?.[0]?.text) {
            outputText = data.output[1].content[0].text;
          } else if (data.output?.[0]?.content?.[0]?.text) {
            outputText = data.output[0].content[0].text;
          } else if (Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.content?.[0]?.text) {
                outputText = item.content[0].text;
                break;
              }
            }
          }

          if (!outputText) {
            throw new Error("No text output from Responses API");
          }

          const enrichment = JSON.parse(outputText);
          
          // CRITICAL: Validate that GPT returned the exact Place ID we provided
          if (enrichment.placeId !== placeId) {
            console.error(`Place ID mismatch! Expected: ${placeId}, Got: ${enrichment.placeId}`);
            // Force the correct Place ID instead of accepting fabricated one
            enrichment.placeId = placeId;
          }
          
          return {
            ...item,
            ...enrichment,
          };
        } catch (error: any) {
          console.error(`Enrichment error for ${name}:`, error.message);
          return {
            ...item,
            placeId,
            domain: null,
            contact_email: null,
            socials: {},
            category: "unknown",
            summary: "Enrichment failed",
            suggested_intro: "",
            lead_score: 0,
          };
        }
      };

      // Process in batches
      const enriched = [];
      for (let i = 0; i < places.length; i += concurrency) {
        const batch = places.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(enrichItem));
        enriched.push(...batchResults);
      }

      return res.json({
        verified: true,
        results: enriched,
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("prospects/search_and_enrich error:", e);
      return res.status(500).json({ error: e.message || "Search and enrich failed" });
    }
  });

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

      // Update job status to running
      await storage.updateJob(jobId, { status: "running" });

      // Start the background worker
      const { startJobWorker } = await import('./jobWorker');
      startJobWorker(jobId);

      return res.json({ ok: true, jobId, status: "running" });
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
      const { jobId } = req.body;
      
      if (!jobId) {
        return res.status(400).json({ error: "jobId is required" });
      }

      const { storage } = await import('./storage');
      const job = await storage.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Update job status to paused
      await storage.updateJob(jobId, { status: "paused" });

      // Stop the worker (it will check status and pause)
      const { stopJobWorker } = await import('./jobWorker');
      stopJobWorker(jobId);

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

  // ===========================
  // GET /api/regions/list
  // ===========================
  app.get("/api/regions/list", async (req, res) => {
    try {
      const { country, granularity, region_filter } = req.query;

      if (!country || !granularity) {
        return res.status(400).json({ 
          error: "Missing required parameters: country and granularity" 
        });
      }

      if (country !== 'UK' && country !== 'US') {
        return res.status(400).json({ 
          error: "Invalid country. Must be 'UK' or 'US'" 
        });
      }

      if (!['county', 'borough', 'state'].includes(String(granularity))) {
        return res.status(400).json({ 
          error: "Invalid granularity. Must be 'county', 'borough', or 'state'" 
        });
      }

      const { getRegions } = await import('./regions');
      const regionsResult = await getRegions(
        country as string,
        granularity as string,
        region_filter as string | undefined
      );

      return res.json(regionsResult);
    } catch (e: any) {
      console.error("regions/list error:", e);
      return res.status(500).json({ error: e.message || "Failed to load regions" });
    }
  });

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

  app.post("/api/deep-research", async (req, res) => {
    try {
      const validation = deepResearchCreateRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request format", 
          details: validation.error 
        });
      }

      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Verify userId in request matches authenticated user
      if (validation.data.userId && validation.data.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to create research for ${validation.data.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot create research for another user" });
      }

      // Extract sessionId so we can send notifications when research completes
      const sessionId = getSessionId(req);
      
      // Log what intensity we received
      console.log(`🔬 Received intensity: ${validation.data.intensity || 'undefined (will default to standard)'}`);
      
      // ENHANCE VAGUE PROMPTS using conversation context
      const { conversationId } = validation.data;
      const userId = auth.userId; // Use authenticated userId instead of trusting client
      const enhancement = await enhancePromptWithContext(
        validation.data.prompt,
        conversationId,
        userId
      );
      
      // Use enhanced prompt (which will be original prompt if enhancement fails)
      const finalPrompt = enhancement.enhancedPrompt;
      
      // Validate that we have a non-empty prompt
      if (!finalPrompt || finalPrompt.trim().length === 0) {
        return res.status(400).json({ 
          error: "Please specify a research topic. For example: 'Research coffee shops in London' or 'Find information about dental practices in Manchester'" 
        });
      }
      const finalCounties = validation.data.counties || enhancement.context.regions;
      const finalWindowMonths = validation.data.windowMonths ?? enhancement.context.windowMonths;
      
      console.log(`📝 Deep research request - Original: "${validation.data.prompt}", Final: "${finalPrompt}"`);
      if (enhancement.context.isInferred) {
        console.log(`🧠 Context extracted: regions=${finalCounties}, windowMonths=${finalWindowMonths}`);
      }
      
      const run = await startBackgroundResponsesJob({ 
        prompt: finalPrompt,
        label: validation.data.label,
        mode: validation.data.mode,
        intensity: validation.data.intensity,
        counties: finalCounties,
        windowMonths: finalWindowMonths,
        schemaName: validation.data.schemaName,
        schema: validation.data.schema,
      }, sessionId, userId);
      
      // Extract facts from the research prompt in the background (don't await)
      const { extractFactsFromPrompt } = await import("./memory");
      const effectiveUserId = userId || "demo-user";
      extractFactsFromPrompt(effectiveUserId, finalPrompt, openai)
        .then(() => console.log("✅ Facts extracted from research prompt"))
        .catch((err) => console.error("❌ Fact extraction from prompt failed:", err.message));
      
      res.json({ run: stripLargeOutput(run) });
    } catch (error: any) {
      console.error("Deep research creation error:", error);
      res.status(500).json({ error: error.message || "Failed to start research" });
    }
  });

  app.get("/api/deep-research", async (req, res) => {
    try {
      // Disable caching and ETags to ensure frontend gets real-time status updates
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.removeHeader('ETag');
      
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // SECURITY: Only allow users to access their own runs
      const runs = await getAllRuns(auth.userId);
      res.json({ runs: runs.map(stripLargeOutput) });
    } catch (error: any) {
      console.error("Deep research list error:", error);
      res.status(500).json({ error: error.message || "Failed to list research runs" });
    }
  });

  app.get("/api/deep-research/:id", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const run = await getRun(req.params.id);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }
      
      // SECURITY: Verify the research run belongs to the authenticated user
      if (run.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to access research run ${req.params.id} owned by ${run.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot access other users' research runs" });
      }
      
      res.json({ run });
    } catch (error: any) {
      console.error("Deep research get error:", error);
      res.status(500).json({ error: error.message || "Failed to get research run" });
    }
  });

  app.post("/api/deep-research/:id/stop", async (req, res) => {
    try {
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // First check if run exists and get ownership info
      const existingRun = await getRun(req.params.id);
      if (!existingRun) {
        return res.status(404).json({ error: "Research run not found" });
      }
      
      // SECURITY: Verify the research run belongs to the authenticated user
      if (existingRun.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to stop research run ${req.params.id} owned by ${existingRun.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot stop other users' research runs" });
      }
      
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
      // SECURITY: Validate authenticated user
      const auth = await getAuthenticatedUserId(req);
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // First check if run exists and get ownership info
      const existingRun = await getRun(req.params.id);
      if (!existingRun) {
        return res.status(404).json({ error: "Research run not found" });
      }
      
      // SECURITY: Verify the research run belongs to the authenticated user
      if (existingRun.userId !== auth.userId) {
        console.warn(`🚫 User ${auth.userEmail} attempted to duplicate research run ${req.params.id} owned by ${existingRun.userId}`);
        return res.status(403).json({ error: "Forbidden: Cannot duplicate other users' research runs" });
      }
      
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
      const auth = await getAuthenticatedUserId(req);
      
      // Verify the run exists
      const run = await getRun(runId);
      if (!run) {
        return res.status(404).json({ error: "Research run not found" });
      }
      
      // Demo users must sign up to view deep research reports
      if (auth?.userId) {
        const user = await storage.getUserById(auth.userId);
        if (user && user.isDemo) {
          return res.status(403).json({ 
            error: "DEMO_SIGNUP_REQUIRED",
            message: "Sign up for a free account to view your deep research reports!",
            requiresSignup: true
          });
        }
      }
      
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

  const httpServer = createServer(app);
  return httpServer;
}
