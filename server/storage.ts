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

// Slots interface matching slotExtractor.ts
export interface SlotContext {
  query: string;
  position?: string;
  location?: string;
  country?: string;
  country_code?: string;
  granularity?: string;
  region_filter?: string;
  needs_clarification?: boolean;
  question?: string;
  awaiting_country_for?: string; // For tracking clarification state
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
  
  // Slot context methods
  setSlotContext(sessionId: string, context: SlotContext): Promise<void>;
  getSlotContext(sessionId: string): Promise<SlotContext | null>;
  clearSlotContext(sessionId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private slotContexts: Map<string, SlotContext> = new Map();

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

  async setSlotContext(sessionId: string, context: SlotContext): Promise<void> {
    this.slotContexts.set(sessionId, context);
  }

  async getSlotContext(sessionId: string): Promise<SlotContext | null> {
    return this.slotContexts.get(sessionId) || null;
  }

  async clearSlotContext(sessionId: string): Promise<void> {
    this.slotContexts.delete(sessionId);
  }
}

export const storage = new MemStorage();
