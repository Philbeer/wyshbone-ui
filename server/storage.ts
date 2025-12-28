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
  SelectUser,
  InsertLeadGenPlan,
  SelectLeadGenPlan,
  InsertCrmSettings,
  SelectCrmSettings,
  InsertCrmCustomer,
  SelectCrmCustomer,
  InsertCrmDeliveryRun,
  SelectCrmDeliveryRun,
  InsertCrmOrder,
  SelectCrmOrder,
  InsertCrmOrderLine,
  SelectCrmOrderLine,
  InsertBrewProduct,
  SelectBrewProduct,
  InsertBrewBatch,
  SelectBrewBatch,
  InsertBrewInventoryItem,
  SelectBrewInventoryItem,
  InsertBrewContainer,
  SelectBrewContainer,
  InsertBrewDutyReport,
  SelectBrewDutyReport,
  InsertBrewSettings,
  SelectBrewSettings,
  SelectBrewDutyLookupBand
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  deepResearchRuns, 
  conversations, 
  messages, 
  facts, 
  scheduledMonitors, 
  userSessions, 
  integrations, 
  batchJobs, 
  users,
  leadGenPlans,
  crmSettings,
  crmCustomers,
  crmDeliveryRuns,
  crmOrders,
  crmOrderLines,
  brewProducts,
  brewBatches,
  brewInventoryItems,
  brewContainers,
  brewDutyReports,
  brewSettings,
  brewDutyLookupBands
} from "@shared/schema";
import { eq, or, and, desc, asc, lt, gt, lte, gte, isNull, sql } from "drizzle-orm";

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
  
  // User goal tracking (for per-session sales/lead goals)
  setUserGoal(sessionId: string, goalText: string): Promise<void>;
  getUserGoal(sessionId: string): Promise<string | null>;
  hasUserGoal(sessionId: string): Promise<boolean>;
  setAwaitingGoal(sessionId: string, awaiting: boolean): Promise<void>;
  isAwaitingGoal(sessionId: string): Promise<boolean>;
  
  // Lead Request Context tracking (UI-002: clarification questions for lead requests)
  getLeadRequestContext(sessionId: string): Promise<{
    targetRegion?: string;
    targetPersona?: string;
    volume?: string;
    timing?: string;
  }>;
  saveLeadRequestContext(sessionId: string, context: {
    targetRegion?: string;
    targetPersona?: string;
    volume?: string;
    timing?: string;
  }): Promise<void>;
  clearLeadRequestContext(sessionId: string): Promise<void>;
  isAwaitingLeadClarification(sessionId: string): Promise<boolean>;
  setAwaitingLeadClarification(sessionId: string, missingFields: Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>): Promise<void>;
  clearAwaitingLeadClarification(sessionId: string): Promise<void>;
  getPendingLeadClarificationFields(sessionId: string): Promise<Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>>;
  
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
  updateIntegration(id: string, updates: Partial<InsertIntegration>): Promise<SelectIntegration | null>;
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
  deleteUser(id: string): Promise<boolean>;
  
  // Demo user transfer methods
  transferUserData(fromUserId: string, toUserId: string): Promise<void>;
  
  // ============= LEADGEN PLANS CRUD METHODS =============
  createLeadGenPlan(plan: InsertLeadGenPlan): Promise<SelectLeadGenPlan>;
  getLeadGenPlan(id: string): Promise<SelectLeadGenPlan | null>;
  listLeadGenPlans(userId: string): Promise<SelectLeadGenPlan[]>;
  listActiveLeadGenPlans(userId: string): Promise<SelectLeadGenPlan[]>;
  updateLeadGenPlan(id: string, updates: Partial<InsertLeadGenPlan>): Promise<SelectLeadGenPlan | null>;
  deleteLeadGenPlan(id: string): Promise<boolean>;
  
  // ============= CRM SETTINGS CRUD METHODS =============
  getCrmSettings(workspaceId: string): Promise<SelectCrmSettings | null>;
  createCrmSettings(settings: InsertCrmSettings): Promise<SelectCrmSettings>;
  updateCrmSettings(id: string, updates: Partial<InsertCrmSettings>): Promise<SelectCrmSettings | null>;
  
  // ============= CRM CUSTOMERS CRUD METHODS =============
  createCrmCustomer(customer: InsertCrmCustomer): Promise<SelectCrmCustomer>;
  getCrmCustomer(id: string): Promise<SelectCrmCustomer | null>;
  listCrmCustomers(workspaceId: string): Promise<SelectCrmCustomer[]>;
  searchCrmCustomers(workspaceId: string, searchTerm: string): Promise<SelectCrmCustomer[]>;
  updateCrmCustomer(id: string, updates: Partial<InsertCrmCustomer>): Promise<SelectCrmCustomer | null>;
  deleteCrmCustomer(id: string): Promise<boolean>;
  
  // ============= CRM DELIVERY RUNS CRUD METHODS =============
  createCrmDeliveryRun(deliveryRun: InsertCrmDeliveryRun): Promise<SelectCrmDeliveryRun>;
  getCrmDeliveryRun(id: string): Promise<SelectCrmDeliveryRun | null>;
  listCrmDeliveryRuns(workspaceId: string): Promise<SelectCrmDeliveryRun[]>;
  listCrmDeliveryRunsByStatus(workspaceId: string, status: string): Promise<SelectCrmDeliveryRun[]>;
  updateCrmDeliveryRun(id: string, updates: Partial<InsertCrmDeliveryRun>): Promise<SelectCrmDeliveryRun | null>;
  deleteCrmDeliveryRun(id: string): Promise<boolean>;
  
  // ============= CRM ORDERS CRUD METHODS =============
  createCrmOrder(order: InsertCrmOrder): Promise<SelectCrmOrder>;
  getCrmOrder(id: string): Promise<SelectCrmOrder | null>;
  listCrmOrders(workspaceId: string): Promise<SelectCrmOrder[]>;
  listCrmOrdersByCustomer(customerId: string): Promise<SelectCrmOrder[]>;
  listCrmOrdersByDeliveryRun(deliveryRunId: string): Promise<SelectCrmOrder[]>;
  updateCrmOrder(id: string, updates: Partial<InsertCrmOrder>): Promise<SelectCrmOrder | null>;
  deleteCrmOrder(id: string): Promise<boolean>;
  
  // ============= CRM ORDER LINES CRUD METHODS =============
  createCrmOrderLine(orderLine: InsertCrmOrderLine): Promise<SelectCrmOrderLine>;
  getCrmOrderLine(id: string): Promise<SelectCrmOrderLine | null>;
  listCrmOrderLinesByOrder(orderId: string): Promise<SelectCrmOrderLine[]>;
  updateCrmOrderLine(id: string, updates: Partial<InsertCrmOrderLine>): Promise<SelectCrmOrderLine | null>;
  deleteCrmOrderLine(id: string): Promise<boolean>;
  
  // ============= BREWERY PRODUCTS CRUD METHODS =============
  createBrewProduct(product: InsertBrewProduct): Promise<SelectBrewProduct>;
  getBrewProduct(id: string): Promise<SelectBrewProduct | null>;
  listBrewProducts(workspaceId: string): Promise<SelectBrewProduct[]>;
  listActiveBrewProducts(workspaceId: string): Promise<SelectBrewProduct[]>;
  updateBrewProduct(id: string, updates: Partial<InsertBrewProduct>): Promise<SelectBrewProduct | null>;
  deleteBrewProduct(id: string): Promise<boolean>;
  
  // ============= BREWERY BATCHES CRUD METHODS =============
  createBrewBatch(batch: InsertBrewBatch): Promise<SelectBrewBatch>;
  getBrewBatch(id: string): Promise<SelectBrewBatch | null>;
  listBrewBatches(workspaceId: string): Promise<SelectBrewBatch[]>;
  listBrewBatchesByProduct(productId: string): Promise<SelectBrewBatch[]>;
  updateBrewBatch(id: string, updates: Partial<InsertBrewBatch>): Promise<SelectBrewBatch | null>;
  deleteBrewBatch(id: string): Promise<boolean>;
  
  // ============= BREWERY INVENTORY CRUD METHODS =============
  createBrewInventoryItem(item: InsertBrewInventoryItem): Promise<SelectBrewInventoryItem>;
  getBrewInventoryItem(id: string): Promise<SelectBrewInventoryItem | null>;
  listBrewInventoryItems(workspaceId: string): Promise<SelectBrewInventoryItem[]>;
  listBrewInventoryItemsByProduct(productId: string): Promise<SelectBrewInventoryItem[]>;
  listBrewInventoryItemsByBatch(batchId: string): Promise<SelectBrewInventoryItem[]>;
  updateBrewInventoryItem(id: string, updates: Partial<InsertBrewInventoryItem>): Promise<SelectBrewInventoryItem | null>;
  deleteBrewInventoryItem(id: string): Promise<boolean>;
  
  // ============= BREWERY CONTAINERS CRUD METHODS =============
  createBrewContainer(container: InsertBrewContainer): Promise<SelectBrewContainer>;
  getBrewContainer(id: string): Promise<SelectBrewContainer | null>;
  listBrewContainers(workspaceId: string): Promise<SelectBrewContainer[]>;
  listBrewContainersByStatus(workspaceId: string, status: string): Promise<SelectBrewContainer[]>;
  updateBrewContainer(id: string, updates: Partial<InsertBrewContainer>): Promise<SelectBrewContainer | null>;
  deleteBrewContainer(id: string): Promise<boolean>;
  
  // ============= BREWERY DUTY REPORTS CRUD METHODS =============
  createBrewDutyReport(report: InsertBrewDutyReport): Promise<SelectBrewDutyReport>;
  getBrewDutyReport(id: string): Promise<SelectBrewDutyReport | null>;
  listBrewDutyReports(workspaceId: string): Promise<SelectBrewDutyReport[]>;
  updateBrewDutyReport(id: string, updates: Partial<InsertBrewDutyReport>): Promise<SelectBrewDutyReport | null>;
  deleteBrewDutyReport(id: string): Promise<boolean>;
  
  // ============= BREWERY SETTINGS CRUD METHODS =============
  getBrewSettings(workspaceId: string): Promise<SelectBrewSettings | null>;
  createBrewSettings(settings: InsertBrewSettings): Promise<SelectBrewSettings>;
  updateBrewSettings(id: string, updates: Partial<InsertBrewSettings>): Promise<SelectBrewSettings | null>;
  
  // ============= BREWERY DUTY LOOKUP BANDS METHODS =============
  listActiveDutyLookupBands(regime?: string): Promise<SelectBrewDutyLookupBand[]>;
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
  private userGoals: Map<string, string> = new Map();
  private awaitingGoalFlags: Map<string, boolean> = new Map();
  private leadRequestContexts: Map<string, { targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }> = new Map();
  private awaitingLeadClarificationFlags: Map<string, boolean> = new Map();
  private pendingLeadClarificationFields: Map<string, Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>> = new Map();
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
  
  async setUserGoal(sessionId: string, goalText: string): Promise<void> {
    this.userGoals.set(sessionId, goalText);
  }
  
  async getUserGoal(sessionId: string): Promise<string | null> {
    return this.userGoals.get(sessionId) || null;
  }
  
  async hasUserGoal(sessionId: string): Promise<boolean> {
    return this.userGoals.has(sessionId);
  }
  
  async setAwaitingGoal(sessionId: string, awaiting: boolean): Promise<void> {
    if (awaiting) {
      this.awaitingGoalFlags.set(sessionId, true);
    } else {
      this.awaitingGoalFlags.delete(sessionId);
    }
  }
  
  async isAwaitingGoal(sessionId: string): Promise<boolean> {
    return this.awaitingGoalFlags.get(sessionId) || false;
  }
  
  async getLeadRequestContext(sessionId: string): Promise<{ targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }> {
    return this.leadRequestContexts.get(sessionId) || {};
  }
  
  async saveLeadRequestContext(sessionId: string, context: { targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }): Promise<void> {
    this.leadRequestContexts.set(sessionId, context);
  }
  
  async clearLeadRequestContext(sessionId: string): Promise<void> {
    this.leadRequestContexts.delete(sessionId);
  }
  
  async isAwaitingLeadClarification(sessionId: string): Promise<boolean> {
    return this.awaitingLeadClarificationFlags.get(sessionId) || false;
  }
  
  async setAwaitingLeadClarification(sessionId: string, missingFields: Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>): Promise<void> {
    if (missingFields.length > 0) {
      this.awaitingLeadClarificationFlags.set(sessionId, true);
      this.pendingLeadClarificationFields.set(sessionId, missingFields);
    } else {
      this.awaitingLeadClarificationFlags.delete(sessionId);
      this.pendingLeadClarificationFields.delete(sessionId);
    }
  }
  
  async clearAwaitingLeadClarification(sessionId: string): Promise<void> {
    this.awaitingLeadClarificationFlags.delete(sessionId);
    this.pendingLeadClarificationFields.delete(sessionId);
  }
  
  async getPendingLeadClarificationFields(sessionId: string): Promise<Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>> {
    return this.pendingLeadClarificationFields.get(sessionId) || [];
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

  async updateIntegration(id: string, updates: Partial<InsertIntegration>): Promise<SelectIntegration | null> {
    const existing = this.integrations.get(id);
    if (!existing) return null;
    
    const updated = { ...existing, ...updates, updatedAt: Date.now() };
    this.integrations.set(id, updated);
    return updated;
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
  async deleteUser(id: string): Promise<boolean> { return false; }
  async transferUserData(fromUserId: string, toUserId: string): Promise<void> {}
  
  async listActiveDutyLookupBands(regime?: string): Promise<SelectBrewDutyLookupBand[]> { return []; }
}

// Database connection validation and setup
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL environment variable is not set.');
  console.error('   Please set DATABASE_URL in your .env or .env.local file.');
  console.error('   Example: DATABASE_URL=postgres://user:pass@host:5432/dbname');
  throw new Error('DATABASE_URL is required but not set. Check your environment configuration.');
}

const queryClient = postgres(process.env.DATABASE_URL);
const db = drizzle(queryClient);

export class DbStorage implements IStorage {
  // Job methods - keeping in-memory for now
  private jobs: Map<string, Job> = new Map();
  private pendingConfirmations: Map<string, PendingBatchConfirmation> = new Map();
  private partialWorkflows: Map<string, PartialWorkflow> = new Map();
  private lastViewedRuns: Map<string, string> = new Map();
  private userGoals: Map<string, string> = new Map();
  private awaitingGoalFlags: Map<string, boolean> = new Map();
  private leadRequestContexts: Map<string, { targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }> = new Map();
  private awaitingLeadClarificationFlags: Map<string, boolean> = new Map();
  private pendingLeadClarificationFields: Map<string, Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>> = new Map();

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
    try {
      const [newConv] = await db.insert(conversations).values(conversation).returning();
      return newConv;
    } catch (error: any) {
      // Fallback to REST API on DNS failure
      if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
        console.warn("[Conversation] Database DNS failed, using REST API fallback...");
        return await this.createConversationViaRest(conversation);
      }
      throw error;
    }
  }

  private async createConversationViaRest(conversation: InsertConversation): Promise<SelectConversation> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }

    // created_at is stored as bigint (Unix timestamp in milliseconds)
    const createdAtMs = typeof conversation.createdAt === 'number' 
      ? conversation.createdAt 
      : Date.now();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        id: conversation.id,
        user_id: conversation.userId,
        label: conversation.label,
        type: conversation.type || 'chat',
        monitor_id: conversation.monitorId,
        run_sequence: conversation.runSequence,
        created_at: createdAtMs,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Failed to create conversation via REST API: ${errorBody.message || response.statusText}`);
    }

    const [created] = await response.json();
    console.log(`[Conversation] REST API create succeeded: ${created.id}`);
    return {
      ...created,
      userId: created.user_id,
      monitorId: created.monitor_id,
      runSequence: created.run_sequence,
      createdAt: typeof created.created_at === 'number' ? created.created_at : Date.now(),
    };
  }

  async getConversation(id: string): Promise<SelectConversation | null> {
    try {
      const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
      return conv || null;
    } catch (error: any) {
      // Fallback to REST API on DNS failure
      if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
        console.warn("[Conversation] Database DNS failed, using REST API fallback...");
        return await this.getConversationViaRest(id);
      }
      throw error;
    }
  }

  private async getConversationViaRest(id: string): Promise<SelectConversation | null> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get conversation via REST API: ${response.statusText}`);
    }

    const rows = await response.json();
    if (rows.length === 0) return null;
    
    const conv = rows[0];
    return {
      ...conv,
      userId: conv.user_id,
      monitorId: conv.monitor_id,
      runSequence: conv.run_sequence,
      createdAt: typeof conv.created_at === 'number' ? conv.created_at : Date.now(),
    };
  }

  async updateConversation(id: string, updates: Partial<InsertConversation>): Promise<SelectConversation | null> {
    try {
      const [updated] = await db
        .update(conversations)
        .set(updates)
        .where(eq(conversations.id, id))
        .returning();
      return updated || null;
    } catch (error: any) {
      // Fallback to REST API on DNS failure
      if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
        console.warn("[Conversation] Database DNS failed, using REST API fallback for update...");
        return await this.updateConversationViaRest(id, updates);
      }
      throw error;
    }
  }

  private async updateConversationViaRest(id: string, updates: Partial<InsertConversation>): Promise<SelectConversation | null> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }

    // Map to snake_case for Supabase
    const payload: Record<string, any> = {};
    if (updates.label !== undefined) payload.label = updates.label;
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.userId !== undefined) payload.user_id = updates.userId;
    if (updates.monitorId !== undefined) payload.monitor_id = updates.monitorId;
    if (updates.runSequence !== undefined) payload.run_sequence = updates.runSequence;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Failed to update conversation via REST API: ${errorBody.message || response.statusText}`);
    }

    const rows = await response.json();
    if (rows.length === 0) return null;

    const conv = rows[0];
    console.log(`[Conversation] REST API update succeeded: ${conv.id}`);
    return {
      ...conv,
      userId: conv.user_id,
      monitorId: conv.monitor_id,
      runSequence: conv.run_sequence,
      createdAt: typeof conv.created_at === 'number' ? conv.created_at : Date.now(),
    };
  }

  async listConversations(userId: string): Promise<SelectConversation[]> {
    try {
      // Exclude monitor_run conversations - those are accessed via monitors in sidebar
      return await db
        .select()
        .from(conversations)
        .where(and(
          eq(conversations.userId, userId),
          eq(conversations.type, "chat")
        ))
        .orderBy(desc(conversations.createdAt));
    } catch (error: any) {
      // In dev mode with demo-user, return empty array on DNS failure
      if (error.cause?.code === 'ENOTFOUND' && userId === 'demo-user') {
        console.warn("[Conversations] Database DNS failed for demo-user, returning empty array");
        return [];
      }
      throw error;
    }
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
    try {
      const [newMsg] = await db.insert(messages).values(message).returning();
      return newMsg;
    } catch (error: any) {
      // Fallback to REST API on DNS failure
      if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
        console.warn("[Message] Database DNS failed, using REST API fallback...");
        return await this.createMessageViaRest(message);
      }
      throw error;
    }
  }

  private async createMessageViaRest(message: InsertMessage): Promise<SelectMessage> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }

    // created_at is stored as bigint (Unix timestamp in milliseconds)
    const createdAtMs = typeof message.createdAt === 'number' 
      ? message.createdAt 
      : Date.now();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        id: message.id,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        created_at: createdAtMs,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Failed to create message via REST API: ${errorBody.message || response.statusText}`);
    }

    const [created] = await response.json();
    return {
      ...created,
      conversationId: created.conversation_id,
      createdAt: typeof created.created_at === 'number' ? created.created_at : Date.now(),
    };
  }

  async listMessages(conversationId: string): Promise<SelectMessage[]> {
    try {
      return await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt));
    } catch (error: any) {
      // Fallback to REST API on DNS failure
      if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo ENOTFOUND')) {
        console.warn("[Message] Database DNS failed, using REST API fallback...");
        return await this.listMessagesViaRest(conversationId);
      }
      throw error;
    }
  }

  private async listMessagesViaRest(conversationId: string): Promise<SelectMessage[]> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc`, 
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list messages via REST API: ${response.statusText}`);
    }

    const rows = await response.json();
    return rows.map((msg: any) => ({
      ...msg,
      conversationId: msg.conversation_id,
      createdAt: typeof msg.created_at === 'number' ? msg.created_at : Date.now(),
    }));
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

  async searchFacts(userId: string, searchQuery: string): Promise<SelectFact[]> {
    const searchPattern = `%${searchQuery}%`;
    return db
      .select()
      .from(facts)
      .where(
        and(
          eq(facts.userId, userId),
          or(
            ilike(facts.fact, searchPattern),
            ilike(facts.category, searchPattern)
          )
        )
      )
      .orderBy(desc(facts.score), desc(facts.createdAt));
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
  
  async setUserGoal(sessionId: string, goalText: string): Promise<void> {
    this.userGoals.set(sessionId, goalText);
  }
  
  async getUserGoal(sessionId: string): Promise<string | null> {
    return this.userGoals.get(sessionId) || null;
  }
  
  async hasUserGoal(sessionId: string): Promise<boolean> {
    return this.userGoals.has(sessionId);
  }
  
  async setAwaitingGoal(sessionId: string, awaiting: boolean): Promise<void> {
    if (awaiting) {
      this.awaitingGoalFlags.set(sessionId, true);
    } else {
      this.awaitingGoalFlags.delete(sessionId);
    }
  }
  
  async isAwaitingGoal(sessionId: string): Promise<boolean> {
    return this.awaitingGoalFlags.get(sessionId) || false;
  }
  
  async getLeadRequestContext(sessionId: string): Promise<{ targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }> {
    return this.leadRequestContexts.get(sessionId) || {};
  }
  
  async saveLeadRequestContext(sessionId: string, context: { targetRegion?: string; targetPersona?: string; volume?: string; timing?: string }): Promise<void> {
    this.leadRequestContexts.set(sessionId, context);
  }
  
  async clearLeadRequestContext(sessionId: string): Promise<void> {
    this.leadRequestContexts.delete(sessionId);
  }
  
  async isAwaitingLeadClarification(sessionId: string): Promise<boolean> {
    return this.awaitingLeadClarificationFlags.get(sessionId) || false;
  }
  
  async setAwaitingLeadClarification(sessionId: string, missingFields: Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>): Promise<void> {
    if (missingFields.length > 0) {
      this.awaitingLeadClarificationFlags.set(sessionId, true);
      this.pendingLeadClarificationFields.set(sessionId, missingFields);
    } else {
      this.awaitingLeadClarificationFlags.delete(sessionId);
      this.pendingLeadClarificationFields.delete(sessionId);
    }
  }
  
  async clearAwaitingLeadClarification(sessionId: string): Promise<void> {
    this.awaitingLeadClarificationFlags.delete(sessionId);
    this.pendingLeadClarificationFields.delete(sessionId);
  }
  
  async getPendingLeadClarificationFields(sessionId: string): Promise<Array<'targetRegion' | 'targetPersona' | 'volume' | 'timing'>> {
    return this.pendingLeadClarificationFields.get(sessionId) || [];
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

  async updateIntegration(id: string, updates: Partial<InsertIntegration>): Promise<SelectIntegration | null> {
    const result = await db.update(integrations)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(integrations.id, id))
      .returning();
    return result[0] || null;
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

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users)
      .where(eq(users.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async transferUserData(fromUserId: string, toUserId: string): Promise<void> {
    // Transfer all conversations
    await db.update(conversations)
      .set({ userId: toUserId })
      .where(eq(conversations.userId, fromUserId));
    
    // Transfer all facts
    await db.update(facts)
      .set({ userId: toUserId })
      .where(eq(facts.userId, fromUserId));
    
    // Transfer all scheduled monitors
    await db.update(scheduledMonitors)
      .set({ userId: toUserId })
      .where(eq(scheduledMonitors.userId, fromUserId));
    
    // Transfer all deep research runs
    await db.update(deepResearchRuns)
      .set({ userId: toUserId })
      .where(eq(deepResearchRuns.userId, fromUserId));
    
    // Transfer all batch jobs
    await db.update(batchJobs)
      .set({ userId: toUserId })
      .where(eq(batchJobs.userId, fromUserId));
    
    // Transfer all integrations
    await db.update(integrations)
      .set({ userId: toUserId })
      .where(eq(integrations.userId, fromUserId));
  }
  
  // ============= LEADGEN PLANS CRUD METHODS =============
  // With REST API fallback for DNS/connectivity issues
  
  async createLeadGenPlan(plan: InsertLeadGenPlan): Promise<SelectLeadGenPlan> {
    try {
      const [created] = await db.insert(leadGenPlans).values(plan).returning();
      return created;
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        return this.createLeadGenPlanViaRest(plan);
      }
      throw error;
    }
  }
  
  private async createLeadGenPlanViaRest(plan: InsertLeadGenPlan): Promise<SelectLeadGenPlan> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }
    
    // Convert camelCase to snake_case for REST API
    const payload = {
      id: plan.id,
      user_id: plan.userId,
      session_id: plan.sessionId,
      conversation_id: plan.conversationId || null,
      goal: plan.goal,
      steps: plan.steps,
      status: plan.status,
      supervisor_task_id: plan.supervisorTaskId || null,
      tool_metadata: plan.toolMetadata || null,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    };
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/lead_gen_plans`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LeadGenPlan] REST API create failed:', errorText);
      throw new Error(`REST API create failed: ${response.status} ${errorText}`);
    }
    
    const [created] = await response.json();
    console.log('[LeadGenPlan] REST API create succeeded:', created.id);
    
    // Convert snake_case back to camelCase
    return {
      id: created.id,
      userId: created.user_id,
      sessionId: created.session_id,
      conversationId: created.conversation_id,
      goal: created.goal,
      steps: created.steps,
      status: created.status,
      supervisorTaskId: created.supervisor_task_id,
      toolMetadata: created.tool_metadata,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }
  
  async getLeadGenPlan(id: string): Promise<SelectLeadGenPlan | null> {
    try {
      const [plan] = await db.select().from(leadGenPlans).where(eq(leadGenPlans.id, id));
      return plan || null;
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        return this.getLeadGenPlanViaRest(id);
      }
      throw error;
    }
  }
  
  private async getLeadGenPlanViaRest(id: string): Promise<SelectLeadGenPlan | null> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_gen_plans?id=eq.${encodeURIComponent(id)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`REST API get failed: ${response.status}`);
    }
    
    const results = await response.json();
    if (!results || results.length === 0) return null;
    
    const plan = results[0];
    return {
      id: plan.id,
      userId: plan.user_id,
      sessionId: plan.session_id,
      conversationId: plan.conversation_id,
      goal: plan.goal,
      steps: plan.steps,
      status: plan.status,
      supervisorTaskId: plan.supervisor_task_id,
      toolMetadata: plan.tool_metadata,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    };
  }
  
  async listLeadGenPlans(userId: string): Promise<SelectLeadGenPlan[]> {
    try {
      return await db.select().from(leadGenPlans).where(eq(leadGenPlans.userId, userId)).orderBy(desc(leadGenPlans.createdAt));
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        return this.listLeadGenPlansViaRest(userId);
      }
      throw error;
    }
  }
  
  private async listLeadGenPlansViaRest(userId: string): Promise<SelectLeadGenPlan[]> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_gen_plans?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`REST API list failed: ${response.status}`);
    }
    
    const results = await response.json();
    return (results || []).map((plan: any) => ({
      id: plan.id,
      userId: plan.user_id,
      sessionId: plan.session_id,
      conversationId: plan.conversation_id,
      goal: plan.goal,
      steps: plan.steps,
      status: plan.status,
      supervisorTaskId: plan.supervisor_task_id,
      toolMetadata: plan.tool_metadata,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    }));
  }
  
  async listActiveLeadGenPlans(userId: string): Promise<SelectLeadGenPlan[]> {
    try {
      return await db.select().from(leadGenPlans)
        .where(and(
          eq(leadGenPlans.userId, userId),
          or(
            eq(leadGenPlans.status, 'pending_approval'),
            eq(leadGenPlans.status, 'in_progress')
          )
        ))
        .orderBy(desc(leadGenPlans.createdAt));
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        const all = await this.listLeadGenPlansViaRest(userId);
        return all.filter(p => p.status === 'pending_approval' || p.status === 'in_progress');
      }
      throw error;
    }
  }
  
  async updateLeadGenPlan(id: string, updates: Partial<InsertLeadGenPlan>): Promise<SelectLeadGenPlan | null> {
    try {
      const [updated] = await db.update(leadGenPlans)
        .set({ ...updates, updatedAt: Date.now() })
        .where(eq(leadGenPlans.id, id))
        .returning();
      return updated || null;
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        return this.updateLeadGenPlanViaRest(id, updates);
      }
      throw error;
    }
  }
  
  private async updateLeadGenPlanViaRest(id: string, updates: Partial<InsertLeadGenPlan>): Promise<SelectLeadGenPlan | null> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    
    // Convert camelCase to snake_case
    const payload: any = { updated_at: Date.now() };
    if (updates.userId !== undefined) payload.user_id = updates.userId;
    if (updates.sessionId !== undefined) payload.session_id = updates.sessionId;
    if (updates.conversationId !== undefined) payload.conversation_id = updates.conversationId;
    if (updates.goal !== undefined) payload.goal = updates.goal;
    if (updates.steps !== undefined) payload.steps = updates.steps;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.supervisorTaskId !== undefined) payload.supervisor_task_id = updates.supervisorTaskId;
    if (updates.toolMetadata !== undefined) payload.tool_metadata = updates.toolMetadata;
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_gen_plans?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`REST API update failed: ${response.status} ${errorText}`);
    }
    
    const results = await response.json();
    if (!results || results.length === 0) return null;
    
    const plan = results[0];
    console.log('[LeadGenPlan] REST API update succeeded:', plan.id);
    
    return {
      id: plan.id,
      userId: plan.user_id,
      sessionId: plan.session_id,
      conversationId: plan.conversation_id,
      goal: plan.goal,
      steps: plan.steps,
      status: plan.status,
      supervisorTaskId: plan.supervisor_task_id,
      toolMetadata: plan.tool_metadata,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    };
  }
  
  async deleteLeadGenPlan(id: string): Promise<boolean> {
    try {
      await db.delete(leadGenPlans).where(eq(leadGenPlans.id, id));
      return true;
    } catch (error: any) {
      if (error.cause?.code === 'ENOTFOUND') {
        console.warn('[LeadGenPlan] Database DNS failed, using REST API fallback...');
        return this.deleteLeadGenPlanViaRest(id);
      }
      throw error;
    }
  }
  
  private async deleteLeadGenPlanViaRest(id: string): Promise<boolean> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/lead_gen_plans?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    
    return response.ok;
  }
  
  // ============= CRM SETTINGS CRUD METHODS =============
  async getCrmSettings(workspaceId: string): Promise<SelectCrmSettings | null> {
    const [settings] = await db.select().from(crmSettings).where(eq(crmSettings.workspaceId, workspaceId));
    return settings || null;
  }
  
  async createCrmSettings(settings: InsertCrmSettings): Promise<SelectCrmSettings> {
    const [created] = await db.insert(crmSettings).values(settings).returning();
    return created;
  }
  
  async updateCrmSettings(id: string, updates: Partial<InsertCrmSettings>): Promise<SelectCrmSettings | null> {
    const [updated] = await db.update(crmSettings)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmSettings.id, id))
      .returning();
    return updated || null;
  }
  
  // ============= CRM CUSTOMERS CRUD METHODS =============
  async createCrmCustomer(customer: InsertCrmCustomer): Promise<SelectCrmCustomer> {
    const [created] = await db.insert(crmCustomers).values(customer).returning();
    return created;
  }
  
  async getCrmCustomer(id: string): Promise<SelectCrmCustomer | null> {
    const [customer] = await db.select().from(crmCustomers).where(eq(crmCustomers.id, id));
    return customer || null;
  }
  
  async listCrmCustomers(workspaceId: string): Promise<SelectCrmCustomer[]> {
    return await db.select().from(crmCustomers).where(eq(crmCustomers.workspaceId, workspaceId)).orderBy(crmCustomers.name);
  }
  
  async searchCrmCustomers(workspaceId: string, searchTerm: string): Promise<SelectCrmCustomer[]> {
    return await db.select().from(crmCustomers)
      .where(and(
        eq(crmCustomers.workspaceId, workspaceId),
        or(
          ilike(crmCustomers.name, `%${searchTerm}%`),
          ilike(crmCustomers.email, `%${searchTerm}%`)
        )
      ))
      .orderBy(crmCustomers.name);
  }
  
  async updateCrmCustomer(id: string, updates: Partial<InsertCrmCustomer>): Promise<SelectCrmCustomer | null> {
    const [updated] = await db.update(crmCustomers)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmCustomers.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmCustomer(id: string): Promise<boolean> {
    const result = await db.delete(crmCustomers).where(eq(crmCustomers.id, id));
    return true;
  }
  
  // ============= CRM DELIVERY RUNS CRUD METHODS =============
  async createCrmDeliveryRun(deliveryRun: InsertCrmDeliveryRun): Promise<SelectCrmDeliveryRun> {
    const [created] = await db.insert(crmDeliveryRuns).values(deliveryRun).returning();
    return created;
  }
  
  async getCrmDeliveryRun(id: string): Promise<SelectCrmDeliveryRun | null> {
    const [run] = await db.select().from(crmDeliveryRuns).where(eq(crmDeliveryRuns.id, id));
    return run || null;
  }
  
  async listCrmDeliveryRuns(workspaceId: string): Promise<SelectCrmDeliveryRun[]> {
    return await db.select().from(crmDeliveryRuns).where(eq(crmDeliveryRuns.workspaceId, workspaceId)).orderBy(desc(crmDeliveryRuns.scheduledDate));
  }
  
  async listCrmDeliveryRunsByStatus(workspaceId: string, status: string): Promise<SelectCrmDeliveryRun[]> {
    return await db.select().from(crmDeliveryRuns)
      .where(and(
        eq(crmDeliveryRuns.workspaceId, workspaceId),
        eq(crmDeliveryRuns.status, status)
      ))
      .orderBy(desc(crmDeliveryRuns.scheduledDate));
  }
  
  async updateCrmDeliveryRun(id: string, updates: Partial<InsertCrmDeliveryRun>): Promise<SelectCrmDeliveryRun | null> {
    const [updated] = await db.update(crmDeliveryRuns)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmDeliveryRuns.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmDeliveryRun(id: string): Promise<boolean> {
    const result = await db.delete(crmDeliveryRuns).where(eq(crmDeliveryRuns.id, id));
    return true;
  }
  
  // ============= CRM ORDERS CRUD METHODS =============
  async createCrmOrder(order: InsertCrmOrder): Promise<SelectCrmOrder> {
    const [created] = await db.insert(crmOrders).values(order).returning();
    return created;
  }
  
  async getCrmOrder(id: string): Promise<SelectCrmOrder | null> {
    const [order] = await db.select().from(crmOrders).where(eq(crmOrders.id, id));
    return order || null;
  }
  
  async listCrmOrders(workspaceId: string): Promise<SelectCrmOrder[]> {
    return await db.select().from(crmOrders).where(eq(crmOrders.workspaceId, workspaceId)).orderBy(desc(crmOrders.orderDate));
  }
  
  async listCrmOrdersByCustomer(customerId: string): Promise<SelectCrmOrder[]> {
    return await db.select().from(crmOrders).where(eq(crmOrders.customerId, customerId)).orderBy(desc(crmOrders.orderDate));
  }
  
  async listCrmOrdersByDeliveryRun(deliveryRunId: string): Promise<SelectCrmOrder[]> {
    return await db.select().from(crmOrders).where(eq(crmOrders.deliveryRunId, deliveryRunId)).orderBy(desc(crmOrders.orderDate));
  }
  
  async updateCrmOrder(id: string, updates: Partial<InsertCrmOrder>): Promise<SelectCrmOrder | null> {
    const [updated] = await db.update(crmOrders)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmOrders.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmOrder(id: string): Promise<boolean> {
    const result = await db.delete(crmOrders).where(eq(crmOrders.id, id));
    return true;
  }
  
  // ============= CRM ORDER LINES CRUD METHODS =============
  async createCrmOrderLine(orderLine: InsertCrmOrderLine): Promise<SelectCrmOrderLine> {
    const [created] = await db.insert(crmOrderLines).values(orderLine).returning();
    return created;
  }
  
  async getCrmOrderLine(id: string): Promise<SelectCrmOrderLine | null> {
    const [line] = await db.select().from(crmOrderLines).where(eq(crmOrderLines.id, id));
    return line || null;
  }
  
  async listCrmOrderLinesByOrder(orderId: string): Promise<SelectCrmOrderLine[]> {
    return await db.select().from(crmOrderLines).where(eq(crmOrderLines.orderId, orderId));
  }
  
  async updateCrmOrderLine(id: string, updates: Partial<InsertCrmOrderLine>): Promise<SelectCrmOrderLine | null> {
    const [updated] = await db.update(crmOrderLines)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmOrderLines.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmOrderLine(id: string): Promise<boolean> {
    const result = await db.delete(crmOrderLines).where(eq(crmOrderLines.id, id));
    return true;
  }
  
  // ============= BREWERY PRODUCTS CRUD METHODS =============
  async createBrewProduct(product: InsertBrewProduct): Promise<SelectBrewProduct> {
    const [created] = await db.insert(brewProducts).values(product).returning();
    return created;
  }
  
  async getBrewProduct(id: string): Promise<SelectBrewProduct | null> {
    const [product] = await db.select().from(brewProducts).where(eq(brewProducts.id, id));
    return product || null;
  }
  
  async listBrewProducts(workspaceId: string): Promise<SelectBrewProduct[]> {
    return await db.select().from(brewProducts).where(eq(brewProducts.workspaceId, workspaceId)).orderBy(brewProducts.name);
  }
  
  async listActiveBrewProducts(workspaceId: string): Promise<SelectBrewProduct[]> {
    return await db.select().from(brewProducts)
      .where(and(
        eq(brewProducts.workspaceId, workspaceId),
        eq(brewProducts.isActive, 1)
      ))
      .orderBy(brewProducts.name);
  }
  
  async updateBrewProduct(id: string, updates: Partial<InsertBrewProduct>): Promise<SelectBrewProduct | null> {
    const [updated] = await db.update(brewProducts)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewProducts.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteBrewProduct(id: string): Promise<boolean> {
    const result = await db.delete(brewProducts).where(eq(brewProducts.id, id));
    return true;
  }
  
  // ============= BREWERY BATCHES CRUD METHODS =============
  async createBrewBatch(batch: InsertBrewBatch): Promise<SelectBrewBatch> {
    const [created] = await db.insert(brewBatches).values(batch).returning();
    return created;
  }
  
  async getBrewBatch(id: string): Promise<SelectBrewBatch | null> {
    const [batch] = await db.select().from(brewBatches).where(eq(brewBatches.id, id));
    return batch || null;
  }
  
  async listBrewBatches(workspaceId: string): Promise<SelectBrewBatch[]> {
    return await db.select().from(brewBatches).where(eq(brewBatches.workspaceId, workspaceId)).orderBy(desc(brewBatches.brewDate));
  }
  
  async listBrewBatchesByProduct(productId: string): Promise<SelectBrewBatch[]> {
    return await db.select().from(brewBatches).where(eq(brewBatches.productId, productId)).orderBy(desc(brewBatches.brewDate));
  }
  
  async updateBrewBatch(id: string, updates: Partial<InsertBrewBatch>): Promise<SelectBrewBatch | null> {
    const [updated] = await db.update(brewBatches)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewBatches.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteBrewBatch(id: string): Promise<boolean> {
    const result = await db.delete(brewBatches).where(eq(brewBatches.id, id));
    return true;
  }
  
  // ============= BREWERY INVENTORY CRUD METHODS =============
  async createBrewInventoryItem(item: InsertBrewInventoryItem): Promise<SelectBrewInventoryItem> {
    const [created] = await db.insert(brewInventoryItems).values(item).returning();
    return created;
  }
  
  async getBrewInventoryItem(id: string): Promise<SelectBrewInventoryItem | null> {
    const [item] = await db.select().from(brewInventoryItems).where(eq(brewInventoryItems.id, id));
    return item || null;
  }
  
  async listBrewInventoryItems(workspaceId: string): Promise<SelectBrewInventoryItem[]> {
    return await db.select().from(brewInventoryItems).where(eq(brewInventoryItems.workspaceId, workspaceId));
  }
  
  async listBrewInventoryItemsByProduct(productId: string): Promise<SelectBrewInventoryItem[]> {
    return await db.select().from(brewInventoryItems).where(eq(brewInventoryItems.productId, productId));
  }
  
  async listBrewInventoryItemsByBatch(batchId: string): Promise<SelectBrewInventoryItem[]> {
    return await db.select().from(brewInventoryItems).where(eq(brewInventoryItems.batchId, batchId));
  }
  
  async updateBrewInventoryItem(id: string, updates: Partial<InsertBrewInventoryItem>): Promise<SelectBrewInventoryItem | null> {
    const [updated] = await db.update(brewInventoryItems)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewInventoryItems.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteBrewInventoryItem(id: string): Promise<boolean> {
    const result = await db.delete(brewInventoryItems).where(eq(brewInventoryItems.id, id));
    return true;
  }
  
  // ============= BREWERY CONTAINERS CRUD METHODS =============
  async createBrewContainer(container: InsertBrewContainer): Promise<SelectBrewContainer> {
    const [created] = await db.insert(brewContainers).values(container).returning();
    return created;
  }
  
  async getBrewContainer(id: string): Promise<SelectBrewContainer | null> {
    const [container] = await db.select().from(brewContainers).where(eq(brewContainers.id, id));
    return container || null;
  }
  
  async listBrewContainers(workspaceId: string): Promise<SelectBrewContainer[]> {
    return await db.select().from(brewContainers).where(eq(brewContainers.workspaceId, workspaceId)).orderBy(brewContainers.containerCode);
  }
  
  async listBrewContainersByStatus(workspaceId: string, status: string): Promise<SelectBrewContainer[]> {
    return await db.select().from(brewContainers)
      .where(and(
        eq(brewContainers.workspaceId, workspaceId),
        eq(brewContainers.status, status)
      ))
      .orderBy(brewContainers.containerCode);
  }
  
  async updateBrewContainer(id: string, updates: Partial<InsertBrewContainer>): Promise<SelectBrewContainer | null> {
    const [updated] = await db.update(brewContainers)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewContainers.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteBrewContainer(id: string): Promise<boolean> {
    const result = await db.delete(brewContainers).where(eq(brewContainers.id, id));
    return true;
  }
  
  // ============= BREWERY DUTY REPORTS CRUD METHODS =============
  async createBrewDutyReport(report: InsertBrewDutyReport): Promise<SelectBrewDutyReport> {
    const [created] = await db.insert(brewDutyReports).values(report).returning();
    return created;
  }
  
  async getBrewDutyReport(id: string): Promise<SelectBrewDutyReport | null> {
    const [report] = await db.select().from(brewDutyReports).where(eq(brewDutyReports.id, id));
    return report || null;
  }
  
  async listBrewDutyReports(workspaceId: string): Promise<SelectBrewDutyReport[]> {
    return await db.select().from(brewDutyReports).where(eq(brewDutyReports.workspaceId, workspaceId)).orderBy(desc(brewDutyReports.periodStart));
  }
  
  async updateBrewDutyReport(id: string, updates: Partial<InsertBrewDutyReport>): Promise<SelectBrewDutyReport | null> {
    const [updated] = await db.update(brewDutyReports)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewDutyReports.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteBrewDutyReport(id: string): Promise<boolean> {
    const result = await db.delete(brewDutyReports).where(eq(brewDutyReports.id, id));
    return true;
  }
  
  // ============= BREWERY SETTINGS CRUD METHODS =============
  async getBrewSettings(workspaceId: string): Promise<SelectBrewSettings | null> {
    const [settings] = await db.select().from(brewSettings).where(eq(brewSettings.workspaceId, workspaceId));
    return settings || null;
  }
  
  async createBrewSettings(settings: InsertBrewSettings): Promise<SelectBrewSettings> {
    const [created] = await db.insert(brewSettings).values(settings).returning();
    return created;
  }
  
  async updateBrewSettings(id: string, updates: Partial<InsertBrewSettings>): Promise<SelectBrewSettings | null> {
    const [updated] = await db.update(brewSettings)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(brewSettings.id, id))
      .returning();
    return updated || null;
  }
  
  // ============= BREWERY DUTY LOOKUP BANDS METHODS =============
  async listActiveDutyLookupBands(regime: string = 'UK'): Promise<SelectBrewDutyLookupBand[]> {
    try {
      // Fetch all bands for the regime, then filter in JS for date validity
      // This is more robust than complex date comparisons in SQL
      const allBands = await db.select()
        .from(brewDutyLookupBands)
        .where(eq(brewDutyLookupBands.regime, regime))
        .orderBy(brewDutyLookupBands.dutyCategoryKey, desc(brewDutyLookupBands.thresholdHl));
      
      // Filter for active bands (effective_from <= today AND (effective_to IS NULL OR effective_to >= today))
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const activeBands = allBands.filter(band => {
        const fromDate = band.effectiveFrom;
        const toDate = band.effectiveTo;
        const isAfterStart = fromDate <= today;
        const isBeforeEnd = !toDate || toDate >= today;
        return isAfterStart && isBeforeEnd;
      });
      
      console.log(`[DutyLookup] Found ${allBands.length} total bands, ${activeBands.length} active for regime=${regime}`);
      return activeBands;
    } catch (error: any) {
      // If DNS resolution or DB connection fails, fall back to Supabase REST API
      if (error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo') || error.cause?.code === 'ENOTFOUND') {
        console.warn('[DutyLookup] Database DNS resolution failed, trying Supabase REST API fallback...');
        return this.listActiveDutyLookupBandsViaRest(regime);
      }
      console.error("[DutyLookup] Error fetching duty lookup bands:", error);
      throw error;
    }
  }
  
  // Fallback method using Supabase REST API when database connection fails
  private async listActiveDutyLookupBandsViaRest(regime: string = 'UK'): Promise<SelectBrewDutyLookupBand[]> {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured for REST API fallback');
    }
    
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/brew_duty_lookup_bands?regime=eq.${encodeURIComponent(regime)}&order=duty_category_key.asc,threshold_hl.desc`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase REST API error: ${response.status} ${errorText}`);
      }
      
      const allBands = await response.json();
      
      // Filter for active bands (effective_from <= today AND (effective_to IS NULL OR effective_to >= today))
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const activeBands = allBands.filter((band: any) => {
        const fromDate = band.effective_from;
        const toDate = band.effective_to;
        const isAfterStart = fromDate <= today;
        const isBeforeEnd = !toDate || toDate >= today;
        return isAfterStart && isBeforeEnd;
      });
      
      // Map snake_case from REST API to camelCase expected by the app
      const mappedBands = activeBands.map((band: any) => ({
        id: band.id,
        regime: band.regime,
        dutyCategoryKey: band.duty_category_key,
        thresholdHl: band.threshold_hl,
        m: band.m,
        c: band.c,
        baseRatePerHl: band.base_rate_per_hl,
        effectiveFrom: band.effective_from,
        effectiveTo: band.effective_to,
        createdAt: band.created_at,
      }));
      
      console.log(`[DutyLookup] REST API fallback: Found ${allBands.length} total bands, ${mappedBands.length} active for regime=${regime}`);
      return mappedBands;
    } catch (error: any) {
      console.error('[DutyLookup] Supabase REST API fallback failed:', error.message);
      throw error;
    }
  }
}

export const storage = new DbStorage();
