// Storage interface for the Wyshbone Chat Agent
import type { Job } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
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
}

export const storage = new MemStorage();
