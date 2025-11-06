// Storage interface for the Wyshbone Chat Agent
import type { 
  Job, 
  SelectDeepResearchRun, 
  InsertDeepResearchRun,
  SelectConversation,
  InsertConversation,
  SelectMessage,
  InsertMessage,
  SelectFact,
  InsertFact,
  SelectScheduledMonitor,
  InsertScheduledMonitor,
  SelectUserSession,
  InsertIntegration,
  SelectIntegration,
  InsertBatchJob,
  SelectBatchJob,
  InsertUser,
  SelectUser
} from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { deepResearchRuns, conversations, messages, facts, scheduledMonitors, userSessions, integrations, batchJobs, users } from "@shared/schema";
import { eq, or, and, desc, asc, lt, gt } from "drizzle-orm";

export interface PendingBatchConfirmation {
  business_types: string[];
  roles?: string[];
  delay_ms?: number;
  number_countiestosearch?: number;
  smarlead_id?: string;
  counties: string[];
  country?: string;
  timestamp: string;
}

export interface PartialWorkflow {
  business_types?: string[];
  counties?: string[];
  country?: string;
  roles?: string[];
  missing_fields: string[];
  timestamp: string;
}

export interface IStorage {
  // Job CRUD methods
  createJob(job: Job): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | null>;
  deleteJob(id: string): Promise<boolean>;
  listJobs(email?: string): Promise<Job[]>;
  
  // Pending confirmation methods
  setPendingConfirmation(sessionId: string, params: PendingBatchConfirmation): Promise<void>;
  getPendingConfirmation(sessionId: string): Promise<PendingBatchConfirmation | null>;
  clearPendingConfirmation(sessionId: string): Promise<void>;
  
  // Partial workflow methods (for gathering missing info)
  setPartialWorkflow(sessionId: string, params: PartialWorkflow): Promise<void>;
  getPartialWorkflow(sessionId: string): Promise<PartialWorkflow | null>;
  clearPartialWorkflow(sessionId: string): Promise<void>;
  
  // Deep Research CRUD methods
  createDeepResearchRun(run: InsertDeepResearchRun): Promise<SelectDeepResearchRun>;
  getDeepResearchRun(id: string): Promise<SelectDeepResearchRun | null>;
  listDeepResearchRuns(userId?: string): Promise<SelectDeepResearchRun[]>;
  updateDeepResearchRun(id: string, updates: Partial<InsertDeepResearchRun>): Promise<SelectDeepResearchRun | null>;
  deleteDeepResearchRun(id: string): Promise<boolean>;
  listPendingDeepResearchRuns(): Promise<SelectDeepResearchRun[]>;
  
  // Conversation CRUD methods
  createConversation(conversation: InsertConversation): Promise<SelectConversation>;
  getConversation(id: string): Promise<SelectConversation | null>;
  updateConversation(id: string, updates: Partial<InsertConversation>): Promise<SelectConversation | null>;
  listConversations(userId: string): Promise<SelectConversation[]>;
  listAllConversations(): Promise<SelectConversation[]>;
  listMonitorRunConversations(monitorId: string): Promise<SelectConversation[]>;
  deleteConversation(id: string): Promise<boolean>;
  
  // Message CRUD methods
  createMessage(message: InsertMessage): Promise<SelectMessage>;
  listMessages(conversationId: string): Promise<SelectMessage[]>;
  
  // Fact CRUD methods
  createFact(fact: InsertFact): Promise<SelectFact>;
  listTopFacts(userId: string, limit?: number): Promise<SelectFact[]>;
  getAllFacts(): Promise<SelectFact[]>;
  deleteFact(id: string): Promise<boolean>;
  
  // Conversation helper methods
  getConversationMessages(conversationId: string): Promise<SelectMessage[]>;
  
  // Last viewed run tracking (for summarization)
  setLastViewedRun(sessionId: string, runId: string): Promise<void>;
  getLastViewedRun(sessionId: string): Promise<string | null>;
  
  // Scheduled Monitor CRUD methods
  createScheduledMonitor(monitor: InsertScheduledMonitor): Promise<SelectScheduledMonitor>;
  getScheduledMonitor(id: string): Promise<SelectScheduledMonitor | null>;
  listScheduledMonitors(userId: string): Promise<SelectScheduledMonitor[]>;
  listActiveScheduledMonitors(): Promise<SelectScheduledMonitor[]>;
  updateScheduledMonitor(id: string, updates: Partial<InsertScheduledMonitor>): Promise<SelectScheduledMonitor | null>;
  deleteScheduledMonitor(id: string): Promise<boolean>;
  
  // Suggested Monitor methods (for proactive agentic suggestions)
  listSuggestedMonitors(userId: string): Promise<SelectScheduledMonitor[]>;
  approveSuggestedMonitor(id: string): Promise<SelectScheduledMonitor | null>;
  rejectSuggestedMonitor(id: string): Promise<boolean>;
  countActiveSuggestions(userId: string): Promise<number>;
  
  // Session management methods
  createSession(sessionId: string, userId: string, userEmail: string, expiresAt: number, defaultCountry?: string): Promise<SelectUserSession>;
  getSession(sessionId: string): Promise<SelectUserSession | null>;
  deleteSession(sessionId: string): Promise<boolean>;
  deleteExpiredSessions(): Promise<number>;
  getUserEmail(userId: string): Promise<string | null>;
  
  // Integration CRUD methods (for CRM/accounting connections via Nango.dev)
  createIntegration(integration: InsertIntegration): Promise<SelectIntegration>;
  listIntegrations(userId: string): Promise<SelectIntegration[]>;
  getIntegration(id: string): Promise<SelectIntegration | null>;
  deleteIntegration(id: string): Promise<boolean>;
  
  // Batch Job CRUD methods (for Google Places + Hunter.io + SalesHandy pipeline)
  createBatchJob(job: InsertBatchJob): Promise<SelectBatchJob>;
  getBatchJob(id: string): Promise<SelectBatchJob | null>;
  listBatchJobs(userId: string): Promise<SelectBatchJob[]>;
  updateBatchJob(id: string, updates: Partial<InsertBatchJob>): Promise<SelectBatchJob | null>;
  deleteBatchJob(id: string): Promise<boolean>;
  
  // User CRUD methods (for authentication and subscription management)
  createUser(user: InsertUser): Promise<SelectUser>;
  getUserByEmail(email: string): Promise<SelectUser | null>;
  getUserById(id: string): Promise<SelectUser | null>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<SelectUser | null>;
  incrementMonitorCount(userId: string): Promise<void>;
  decrementMonitorCount(userId: string): Promise<void>;
  incrementDeepResearchCount(userId: string): Promise<void>;
  resetUsageCounters(userId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();
  private deepResearchRuns: Map<string, SelectDeepResearchRun> = new Map();
  private conversations: Map<string, SelectConversation> = new Map();
  private messages: Map<string, SelectMessage> = new Map();
  private facts: Map<string, SelectFact> = new Map();
  private lastViewedRuns: Map<string, string> = new Map();
  private scheduledMonitors: Map<string, SelectScheduledMonitor> = new Map();
  private integrations: Map<string, SelectIntegration> = new Map();
  private batchJobs: Map<string, SelectBatchJob> = new Map();

  async createJob(job: Job): Promise<Job> {
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    
    const updated = { ...job, ...updates, updated_at: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async listJobs(email?: string): Promise<Job[]> {
    const allJobs = Array.from(this.jobs.values());
    if (email) {
      return allJobs.filter(job => job.created_by_email === email);
    }
    return allJobs;
  }

  async setPendingConfirmation(sessionId: string, params: PendingBatchConfirmation): Promise<void> {
    this.pendingConfirmations.set(sessionId, params);
  }

  async getPendingConfirmation(sessionId: string): Promise<PendingBatchConfirmation | null> {
    return this.pendingConfirmations.get(sessionId) || null;
  }

  async clearPendingConfirmation(sessionId: string): Promise<void> {
    this.pendingConfirmations.delete(sessionId);
  }

  async setPartialWorkflow(sessionId: string, params: PartialWorkflow): Promise<void> {
    this.partialWorkflows.set(sessionId, params);
  }

  async getPartialWorkflow(sessionId: string): Promise<PartialWorkflow | null> {
    return this.partialWorkflows.get(sessionId) || null;
  }

  async clearPartialWorkflow(sessionId: string): Promise<void> {
    this.partialWorkflows.delete(sessionId);
  }

  async createDeepResearchRun(run: InsertDeepResearchRun): Promise<SelectDeepResearchRun> {
    const newRun = run as SelectDeepResearchRun;
    this.deepResearchRuns.set(newRun.id, newRun);
    return newRun;
  }

  async getDeepResearchRun(id: string): Promise<SelectDeepResearchRun | null> {
    return this.deepResearchRuns.get(id) || null;
  }

  async listDeepResearchRuns(userId?: string): Promise<SelectDeepResearchRun[]> {
    const allRuns = Array.from(this.deepResearchRuns.values());
    const filtered = userId ? allRuns.filter(run => run.userId === userId) : allRuns;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateDeepResearchRun(id: string, updates: Partial<InsertDeepResearchRun>): Promise<SelectDeepResearchRun | null> {
    const run = this.deepResearchRuns.get(id);
    if (!run) return null;
    
    const updated = { ...run, ...updates, updatedAt: Date.now() };
    this.deepResearchRuns.set(id, updated);
    return updated;
  }

  async deleteDeepResearchRun(id: string): Promise<boolean> {
    return this.deepResearchRuns.delete(id);
  }

  async listPendingDeepResearchRuns(): Promise<SelectDeepResearchRun[]> {
    return Array.from(this.deepResearchRuns.values())
      .filter(run => run.status === "queued" || run.status === "running")
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }

  async createConversation(conversation: InsertConversation): Promise<SelectConversation> {
    const newConv = conversation as SelectConversation;
    this.conversations.set(newConv.id, newConv);
    return newConv;
  }

  async getConversation(id: string): Promise<SelectConversation | null> {
    return this.conversations.get(id) || null;
  }

  async updateConversation(id: string, updates: Partial<InsertConversation>): Promise<SelectConversation | null> {
    const conv = this.conversations.get(id);
    if (!conv) return null;
    
    const updated = { ...conv, ...updates };
    this.conversations.set(id, updated);
    return updated;
  }

  async listConversations(userId: string): Promise<SelectConversation[]> {
    return Array.from(this.conversations.values())
      .filter(conv => conv.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listAllConversations(): Promise<SelectConversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listMonitorRunConversations(monitorId: string): Promise<SelectConversation[]> {
    return Array.from(this.conversations.values())
      .filter(conv => conv.type === "monitor_run" && conv.monitorId === monitorId)
      .sort((a, b) => (b.runSequence || 0) - (a.runSequence || 0));
  }

  async deleteConversation(id: string): Promise<boolean> {
    return this.conversations.delete(id);
  }

  async createMessage(message: InsertMessage): Promise<SelectMessage> {
    const newMsg = message as SelectMessage;
    this.messages.set(newMsg.id, newMsg);
    return newMsg;
  }

  async listMessages(conversationId: string): Promise<SelectMessage[]> {
    return Array.from(this.messages.values())
      .filter(msg => msg.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async createFact(fact: InsertFact): Promise<SelectFact> {
    const newFact = fact as SelectFact;
    this.facts.set(newFact.id, newFact);
    return newFact;
  }

  async listTopFacts(userId: string, limit: number = 20): Promise<SelectFact[]> {
    return Array.from(this.facts.values())
      .filter(fact => fact.userId === userId)
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getAllFacts(): Promise<SelectFact[]> {
    return Array.from(this.facts.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteFact(id: string): Promise<boolean> {
    return this.facts.delete(id);
  }

  async getConversationMessages(conversationId: string): Promise<SelectMessage[]> {
    return this.listMessages(conversationId);
  }
  
  async setLastViewedRun(sessionId: string, runId: string): Promise<void> {
    this.lastViewedRuns.set(sessionId, runId);
  }
  
  async getLastViewedRun(sessionId: string): Promise<string | null> {
    return this.lastViewedRuns.get(sessionId) || null;
  }
  
  async createScheduledMonitor(monitor: InsertScheduledMonitor): Promise<SelectScheduledMonitor> {
    const newMonitor = monitor as SelectScheduledMonitor;
    this.scheduledMonitors.set(newMonitor.id, newMonitor);
    return newMonitor;
  }

  async getScheduledMonitor(id: string): Promise<SelectScheduledMonitor | null> {
    return this.scheduledMonitors.get(id) || null;
  }

  async listScheduledMonitors(userId: string): Promise<SelectScheduledMonitor[]> {
    return Array.from(this.scheduledMonitors.values())
      .filter(monitor => monitor.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listActiveScheduledMonitors(): Promise<SelectScheduledMonitor[]> {
    return Array.from(this.scheduledMonitors.values())
      .filter(monitor => monitor.isActive === 1)
      .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0));
  }

  async updateScheduledMonitor(id: string, updates: Partial<InsertScheduledMonitor>): Promise<SelectScheduledMonitor | null> {
    const monitor = this.scheduledMonitors.get(id);
    if (!monitor) return null;
    
    const updated = { ...monitor, ...updates, updatedAt: Date.now() };
    this.scheduledMonitors.set(id, updated);
    return updated;
  }

  async deleteScheduledMonitor(id: string): Promise<boolean> {
    return this.scheduledMonitors.delete(id);
  }
  
  async listSuggestedMonitors(userId: string): Promise<SelectScheduledMonitor[]> {
    return Array.from(this.scheduledMonitors.values())
      .filter(monitor => monitor.userId === userId && monitor.status === 'suggested')
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  
  async approveSuggestedMonitor(id: string): Promise<SelectScheduledMonitor | null> {
    const monitor = this.scheduledMonitors.get(id);
    if (!monitor || monitor.status !== 'suggested') return null;
    
    const updated = { ...monitor, status: 'active' as const, updatedAt: Date.now() };
    this.scheduledMonitors.set(id, updated);
    return updated;
  }
  
  async rejectSuggestedMonitor(id: string): Promise<boolean> {
    const monitor = this.scheduledMonitors.get(id);
    if (!monitor || monitor.status !== 'suggested') return false;
    return this.scheduledMonitors.delete(id);
  }
  
  async countActiveSuggestions(userId: string): Promise<number> {
    return Array.from(this.scheduledMonitors.values())
      .filter(monitor => monitor.userId === userId && monitor.status === 'suggested')
      .length;
  }
  
  private sessions: Map<string, SelectUserSession> = new Map();
  
  async createSession(sessionId: string, userId: string, userEmail: string, expiresAt: number, defaultCountry?: string): Promise<SelectUserSession> {
    const session: SelectUserSession = {
      sessionId,
      userId,
      userEmail,
      defaultCountry: defaultCountry || null,
      expiresAt,
      createdAt: Date.now()
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<SelectUserSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Check if session is expired
    if (session.expiresAt < Date.now()) {
      this.deleteSession(sessionId);
      return null;
    }
    
    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        count++;
      }
    }
    return count;
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const now = Date.now();
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.userId === userId && session.expiresAt > now) {
        return session.userEmail;
      }
    }
    return null;
  }

  // Integration CRUD methods
  async createIntegration(integration: InsertIntegration): Promise<SelectIntegration> {
    this.integrations.set(integration.id, integration as SelectIntegration);
    return integration as SelectIntegration;
  }

  async listIntegrations(userId: string): Promise<SelectIntegration[]> {
    return Array.from(this.integrations.values())
      .filter(i => i.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getIntegration(id: string): Promise<SelectIntegration | null> {
    return this.integrations.get(id) || null;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    return this.integrations.delete(id);
  }
  
  // Batch Job methods
  async createBatchJob(job: InsertBatchJob): Promise<SelectBatchJob> {
    this.batchJobs.set(job.id, job as SelectBatchJob);
    return job as SelectBatchJob;
  }

  async getBatchJob(id: string): Promise<SelectBatchJob | null> {
    return this.batchJobs.get(id) || null;
  }

  async listBatchJobs(userId: string): Promise<SelectBatchJob[]> {
    return Array.from(this.batchJobs.values())
      .filter(j => j.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateBatchJob(id: string, updates: Partial<InsertBatchJob>): Promise<SelectBatchJob | null> {
    const job = this.batchJobs.get(id);
    if (!job) return null;
    
    const updated = { ...job, ...updates };
    this.batchJobs.set(id, updated);
    return updated;
  }

  async deleteBatchJob(id: string): Promise<boolean> {
    return this.batchJobs.delete(id);
  }
  
  // User methods (stub - MemStorage not used in production)
  async createUser(user: InsertUser): Promise<SelectUser> {
    throw new Error("MemStorage: User operations not supported");
  }

  async getUserByEmail(email: string): Promise<SelectUser | null> {
    return null;
  }

  async getUserById(id: string): Promise<SelectUser | null> {
    return null;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<SelectUser | null> {
    return null;
  }

  async incrementMonitorCount(userId: string): Promise<void> {}
  async decrementMonitorCount(userId: string): Promise<void> {}
  async incrementDeepResearchCount(userId: string): Promise<void> {}
  async resetUsageCounters(userId: string): Promise<void> {}
}

// Database connection
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export class DbStorage implements IStorage {
  // Job methods - keeping in-memory for now
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();
  private lastViewedRuns: Map<string, string> = new Map();

  async createJob(job: Job): Promise<Job> {
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) || null;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    
    const updated = { ...job, ...updates, updated_at: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }

  async listJobs(email?: string): Promise<Job[]> {
    const allJobs = Array.from(this.jobs.values());
    if (email) {
      return allJobs.filter(job => job.created_by_email === email);
    }
    return allJobs;
  }

  async setPendingConfirmation(sessionId: string, params: PendingBatchConfirmation): Promise<void> {
    this.pendingConfirmations.set(sessionId, params);
  }

  async getPendingConfirmation(sessionId: string): Promise<PendingBatchConfirmation | null> {
    return this.pendingConfirmations.get(sessionId) || null;
  }

  async clearPendingConfirmation(sessionId: string): Promise<void> {
    this.pendingConfirmations.delete(sessionId);
  }

  async setPartialWorkflow(sessionId: string, params: PartialWorkflow): Promise<void> {
    this.partialWorkflows.set(sessionId, params);
  }

  async getPartialWorkflow(sessionId: string): Promise<PartialWorkflow | null> {
    return this.partialWorkflows.get(sessionId) || null;
  }

  async clearPartialWorkflow(sessionId: string): Promise<void> {
    this.partialWorkflows.delete(sessionId);
  }

  // Deep Research methods - using database
  async createDeepResearchRun(run: InsertDeepResearchRun): Promise<SelectDeepResearchRun> {
    const [newRun] = await db.insert(deepResearchRuns).values(run).returning();
    return newRun;
  }

  async getDeepResearchRun(id: string): Promise<SelectDeepResearchRun | null> {
    const [run] = await db.select().from(deepResearchRuns).where(eq(deepResearchRuns.id, id));
    return run || null;
  }

  async listDeepResearchRuns(userId?: string): Promise<SelectDeepResearchRun[]> {
    if (userId) {
      return db.select().from(deepResearchRuns).where(eq(deepResearchRuns.userId, userId)).orderBy(desc(deepResearchRuns.createdAt));
    }
    return db.select().from(deepResearchRuns).orderBy(desc(deepResearchRuns.createdAt));
  }

  async updateDeepResearchRun(id: string, updates: Partial<InsertDeepResearchRun>): Promise<SelectDeepResearchRun | null> {
    const updateData = { ...updates, updatedAt: Date.now() };
    const [updated] = await db
      .update(deepResearchRuns)
      .set(updateData)
      .where(eq(deepResearchRuns.id, id))
      .returning();
    return updated || null;
  }

  async deleteDeepResearchRun(id: string): Promise<boolean> {
    const result = await db.delete(deepResearchRuns).where(eq(deepResearchRuns.id, id)).returning();
    return result.length > 0;
  }

  async listPendingDeepResearchRuns(): Promise<SelectDeepResearchRun[]> {
    return db
      .select()
      .from(deepResearchRuns)
      .where(or(eq(deepResearchRuns.status, "queued"), eq(deepResearchRuns.status, "running")))
      .orderBy(asc(deepResearchRuns.updatedAt));
  }

  async createConversation(conversation: InsertConversation): Promise<SelectConversation> {
    const [newConv] = await db.insert(conversations).values(conversation).returning();
    return newConv;
  }

  async getConversation(id: string): Promise<SelectConversation | null> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv || null;
  }

  async updateConversation(id: string, updates: Partial<InsertConversation>): Promise<SelectConversation | null> {
    const [updated] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, id))
      .returning();
    return updated || null;
  }

  async listConversations(userId: string): Promise<SelectConversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }

  async listAllConversations(): Promise<SelectConversation[]> {
    return db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
  }

  async listMonitorRunConversations(monitorId: string): Promise<SelectConversation[]> {
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.type, "monitor_run"), eq(conversations.monitorId, monitorId)))
      .orderBy(desc(conversations.runSequence));
  }

  async deleteConversation(id: string): Promise<boolean> {
    const result = await db.delete(conversations).where(eq(conversations.id, id)).returning();
    return result.length > 0;
  }

  async createMessage(message: InsertMessage): Promise<SelectMessage> {
    const [newMsg] = await db.insert(messages).values(message).returning();
    return newMsg;
  }

  async listMessages(conversationId: string): Promise<SelectMessage[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }

  async createFact(fact: InsertFact): Promise<SelectFact> {
    const [newFact] = await db.insert(facts).values(fact).returning();
    return newFact;
  }

  async listTopFacts(userId: string, limit: number = 20): Promise<SelectFact[]> {
    return db
      .select()
      .from(facts)
      .where(eq(facts.userId, userId))
      .orderBy(desc(facts.score), desc(facts.createdAt))
      .limit(limit);
  }

  async getAllFacts(): Promise<SelectFact[]> {
    return db
      .select()
      .from(facts)
      .orderBy(desc(facts.createdAt));
  }

  async deleteFact(id: string): Promise<boolean> {
    const result = await db.delete(facts).where(eq(facts.id, id)).returning();
    return result.length > 0;
  }

  async getConversationMessages(conversationId: string): Promise<SelectMessage[]> {
    return this.listMessages(conversationId);
  }
  
  async setLastViewedRun(sessionId: string, runId: string): Promise<void> {
    this.lastViewedRuns.set(sessionId, runId);
  }
  
  async getLastViewedRun(sessionId: string): Promise<string | null> {
    return this.lastViewedRuns.get(sessionId) || null;
  }
  
  async createScheduledMonitor(monitor: InsertScheduledMonitor): Promise<SelectScheduledMonitor> {
    const [newMonitor] = await db.insert(scheduledMonitors).values(monitor).returning();
    return newMonitor;
  }

  async getScheduledMonitor(id: string): Promise<SelectScheduledMonitor | null> {
    const [monitor] = await db.select().from(scheduledMonitors).where(eq(scheduledMonitors.id, id));
    return monitor || null;
  }

  async listScheduledMonitors(userId: string): Promise<SelectScheduledMonitor[]> {
    return db
      .select()
      .from(scheduledMonitors)
      .where(eq(scheduledMonitors.userId, userId))
      .orderBy(desc(scheduledMonitors.createdAt));
  }

  async listActiveScheduledMonitors(): Promise<SelectScheduledMonitor[]> {
    return db
      .select()
      .from(scheduledMonitors)
      .where(eq(scheduledMonitors.isActive, 1))
      .orderBy(asc(scheduledMonitors.nextRunAt));
  }

  async updateScheduledMonitor(id: string, updates: Partial<InsertScheduledMonitor>): Promise<SelectScheduledMonitor | null> {
    const updateData = { ...updates, updatedAt: Date.now() };
    const [updated] = await db
      .update(scheduledMonitors)
      .set(updateData)
      .where(eq(scheduledMonitors.id, id))
      .returning();
    return updated || null;
  }

  async deleteScheduledMonitor(id: string): Promise<boolean> {
    const result = await db.delete(scheduledMonitors).where(eq(scheduledMonitors.id, id)).returning();
    return result.length > 0;
  }
  
  async listSuggestedMonitors(userId: string): Promise<SelectScheduledMonitor[]> {
    return db
      .select()
      .from(scheduledMonitors)
      .where(and(
        eq(scheduledMonitors.userId, userId),
        eq(scheduledMonitors.status, 'suggested')
      ))
      .orderBy(desc(scheduledMonitors.createdAt));
  }
  
  async approveSuggestedMonitor(id: string): Promise<SelectScheduledMonitor | null> {
    const [updated] = await db
      .update(scheduledMonitors)
      .set({ status: 'active', updatedAt: Date.now() })
      .where(and(
        eq(scheduledMonitors.id, id),
        eq(scheduledMonitors.status, 'suggested')
      ))
      .returning();
    return updated || null;
  }
  
  async rejectSuggestedMonitor(id: string): Promise<boolean> {
    const result = await db
      .delete(scheduledMonitors)
      .where(and(
        eq(scheduledMonitors.id, id),
        eq(scheduledMonitors.status, 'suggested')
      ))
      .returning();
    return result.length > 0;
  }
  
  async countActiveSuggestions(userId: string): Promise<number> {
    const results = await db
      .select()
      .from(scheduledMonitors)
      .where(and(
        eq(scheduledMonitors.userId, userId),
        eq(scheduledMonitors.status, 'suggested')
      ));
    return results.length;
  }
  
  async createSession(sessionId: string, userId: string, userEmail: string, expiresAt: number, defaultCountry?: string): Promise<SelectUserSession> {
    const [newSession] = await db.insert(userSessions).values({
      sessionId,
      userId,
      userEmail,
      defaultCountry: defaultCountry || null,
      expiresAt,
      createdAt: Date.now()
    }).returning();
    return newSession;
  }

  async getSession(sessionId: string): Promise<SelectUserSession | null> {
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.sessionId, sessionId));
    
    if (!session) return null;
    
    // Check if session is expired
    if (session.expiresAt < Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }
    
    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await db.delete(userSessions).where(eq(userSessions.sessionId, sessionId)).returning();
    return result.length > 0;
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = Date.now();
    const result = await db.delete(userSessions).where(lt(userSessions.expiresAt, now)).returning();
    return result.length;
  }

  async getUserEmail(userId: string): Promise<string | null> {
    const now = Date.now();
    const sessions = await db.select()
      .from(userSessions)
      .where(and(
        eq(userSessions.userId, userId),
        gt(userSessions.expiresAt, now)
      ))
      .limit(1);
    
    return sessions.length > 0 ? sessions[0].userEmail : null;
  }

  // Integration CRUD methods - using database
  async createIntegration(integration: InsertIntegration): Promise<SelectIntegration> {
    const [newIntegration] = await db.insert(integrations).values(integration).returning();
    return newIntegration;
  }

  async listIntegrations(userId: string): Promise<SelectIntegration[]> {
    return await db.select()
      .from(integrations)
      .where(eq(integrations.userId, userId))
      .orderBy(desc(integrations.createdAt));
  }

  async getIntegration(id: string): Promise<SelectIntegration | null> {
    const [integration] = await db.select()
      .from(integrations)
      .where(eq(integrations.id, id));
    return integration || null;
  }

  async deleteIntegration(id: string): Promise<boolean> {
    const result = await db.delete(integrations)
      .where(eq(integrations.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // Batch Job methods
  async createBatchJob(job: InsertBatchJob): Promise<SelectBatchJob> {
    const [newJob] = await db.insert(batchJobs).values(job).returning();
    return newJob;
  }

  async getBatchJob(id: string): Promise<SelectBatchJob | null> {
    const [job] = await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.id, id));
    return job || null;
  }

  async listBatchJobs(userId: string): Promise<SelectBatchJob[]> {
    return await db.select()
      .from(batchJobs)
      .where(eq(batchJobs.userId, userId))
      .orderBy(desc(batchJobs.createdAt));
  }

  async updateBatchJob(id: string, updates: Partial<InsertBatchJob>): Promise<SelectBatchJob | null> {
    const [updated] = await db.update(batchJobs)
      .set(updates)
      .where(eq(batchJobs.id, id))
      .returning();
    return updated || null;
  }

  async deleteBatchJob(id: string): Promise<boolean> {
    const result = await db.delete(batchJobs)
      .where(eq(batchJobs.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }
  
  // User management methods
  async createUser(user: InsertUser): Promise<SelectUser> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getUserByEmail(email: string): Promise<SelectUser | null> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email));
    return user || null;
  }

  async getUserById(id: string): Promise<SelectUser | null> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, id));
    return user || null;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<SelectUser | null> {
    const [updated] = await db.update(users)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(users.id, id))
      .returning();
    return updated || null;
  }

  async incrementMonitorCount(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (user) {
      await db.update(users)
        .set({ monitorCount: (user.monitorCount || 0) + 1 })
        .where(eq(users.id, userId));
    }
  }

  async decrementMonitorCount(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (user) {
      await db.update(users)
        .set({ monitorCount: Math.max(0, (user.monitorCount || 0) - 1) })
        .where(eq(users.id, userId));
    }
  }

  async incrementDeepResearchCount(userId: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (user) {
      await db.update(users)
        .set({ deepResearchCount: (user.deepResearchCount || 0) + 1 })
        .where(eq(users.id, userId));
    }
  }

  async resetUsageCounters(userId: string): Promise<void> {
    await db.update(users)
      .set({ 
        deepResearchCount: 0, 
        lastResetAt: Date.now() 
      })
      .where(eq(users.id, userId));
  }
}

export const storage = new DbStorage();
