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
  InsertFact
} from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { deepResearchRuns, conversations, messages, facts } from "@shared/schema";
import { eq, or, desc, asc } from "drizzle-orm";

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
  listDeepResearchRuns(): Promise<SelectDeepResearchRun[]>;
  updateDeepResearchRun(id: string, updates: Partial<InsertDeepResearchRun>): Promise<SelectDeepResearchRun | null>;
  deleteDeepResearchRun(id: string): Promise<boolean>;
  listPendingDeepResearchRuns(): Promise<SelectDeepResearchRun[]>;
  
  // Conversation CRUD methods
  createConversation(conversation: InsertConversation): Promise<SelectConversation>;
  getConversation(id: string): Promise<SelectConversation | null>;
  listConversations(userId: string): Promise<SelectConversation[]>;
  listAllConversations(): Promise<SelectConversation[]>;
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
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();
  private deepResearchRuns: Map<string, SelectDeepResearchRun> = new Map();
  private conversations: Map<string, SelectConversation> = new Map();
  private messages: Map<string, SelectMessage> = new Map();
  private facts: Map<string, SelectFact> = new Map();

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

  async listDeepResearchRuns(): Promise<SelectDeepResearchRun[]> {
    return Array.from(this.deepResearchRuns.values()).sort((a, b) => b.createdAt - a.createdAt);
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

  async listConversations(userId: string): Promise<SelectConversation[]> {
    return Array.from(this.conversations.values())
      .filter(conv => conv.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async listAllConversations(): Promise<SelectConversation[]> {
    return Array.from(this.conversations.values())
      .sort((a, b) => b.createdAt - a.createdAt);
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
}

// Database connection
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export class DbStorage implements IStorage {
  // Job methods - keeping in-memory for now
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();

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

  async listDeepResearchRuns(): Promise<SelectDeepResearchRun[]> {
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
}

export const storage = new DbStorage();
