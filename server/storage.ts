// Storage interface for the Wyshbone Chat Agent
import type { Job, SelectDeepResearchRun, InsertDeepResearchRun } from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { deepResearchRuns } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();
  private deepResearchRuns: Map<string, SelectDeepResearchRun> = new Map();

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
}

export const storage = new DbStorage();
