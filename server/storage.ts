// Storage interface for the Wyshbone Chat Agent
import type { Job } from "@shared/schema";

export interface IStorage {
  // Job CRUD methods
  createJob(job: Job): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job | null>;
  deleteJob(id: string): Promise<boolean>;
  listJobs(email?: string): Promise<Job[]>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job> = new Map();

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
}

export const storage = new MemStorage();
