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
  InsertCrmProduct,
  SelectCrmProduct,
  InsertCrmStock,
  SelectCrmStock,
  InsertCrmProduct,
  SelectCrmProduct,
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
  SelectBrewDutyLookupBand,
  InsertCrmCallDiary,
  SelectCrmCallDiary,
  InsertBrewPriceBook,
  SelectBrewPriceBook,
  InsertCrmProductPrice,
  SelectCrmProductPrice,
  InsertBrewPriceBand,
  SelectBrewPriceBand,
  InsertBrewTradeStoreSettings,
  SelectBrewTradeStoreSettings,
  InsertBrewTradeStoreAccess,
  SelectBrewTradeStoreAccess,
  InsertBrewTradeStoreSession,
  SelectBrewTradeStoreSession,
  InsertCrmSavedFilter,
  SelectCrmSavedFilter,
  InsertCrmCustomerTag,
  SelectCrmCustomerTag,
  InsertCrmCustomerTagAssignment,
  SelectCrmCustomerTagAssignment,
  InsertCrmCustomerGroup,
  SelectCrmCustomerGroup,
  InsertCrmActivity,
  SelectCrmActivity,
  InsertCrmTask,
  SelectCrmTask,
  InsertBrewContainerMovement,
  SelectBrewContainerMovement,
  InsertXeroConnection,
  SelectXeroConnection,
  InsertXeroImportJob,
  SelectXeroImportJob,
  InsertXeroWebhookEvent,
  SelectXeroWebhookEvent,
  InsertXeroSyncQueue,
  SelectXeroSyncQueue,
  InsertSupplier,
  SelectSupplier,
  InsertSupplierPurchase,
  SelectSupplierPurchase,
  InsertDeliveryRoute,
  SelectDeliveryRoute,
  InsertRouteStop,
  SelectRouteStop,
  InsertRouteOptimizationResult,
  SelectRouteOptimizationResult,
  InsertDeliveryBase,
  SelectDeliveryBase,
  InsertAgentActivity,
  SelectAgentActivity,
  InsertAfrRuleUpdate,
  SelectAfrRuleUpdate
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
  crmProducts,
  crmStock,
  crmProducts,
  brewBatches,
  brewInventoryItems,
  brewContainers,
  brewDutyReports,
  brewSettings,
  brewDutyLookupBands,
  crmCallDiary,
  brewPriceBooks,
  brewProductPrices,
  brewPriceBands,
  brewTradeStoreSettings,
  brewTradeStoreAccess,
  brewTradeStoreSessions,
  crmSavedFilters,
  crmCustomerTags,
  crmCustomerTagAssignments,
  crmCustomerGroups,
  crmActivities,
  crmTasks,
  brewContainerMovements,
  xeroConnections,
  xeroImportJobs,
  xeroWebhookEvents,
  xeroSyncQueue,
  suppliers,
  supplierPurchases,
  deliveryBases,
  deliveryRoutes,
  routeStops,
  routeOptimizationResults,
  afrRuleUpdates
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

export interface CallDiaryFilters {
  entityType?: 'customer' | 'lead';
  startDate?: number; // Unix timestamp
  endDate?: number; // Unix timestamp
  completed?: boolean;
  county?: string;
  limit?: number;
  offset?: number;
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
  // Xero order lookups
  getOrderByXeroInvoiceId(xeroInvoiceId: string, workspaceId: string): Promise<SelectCrmOrder | null>;
  
  // ============= SUPPLIERS CRUD METHODS =============
  getSupplierById(id: string, workspaceId: string): Promise<SelectSupplier | null>;
  listSuppliers(workspaceId: string): Promise<SelectSupplier[]>;
  getSupplierByXeroContactId(xeroContactId: string, workspaceId: string): Promise<SelectSupplier | null>;

  // ============= CRM ORDER LINES CRUD METHODS =============
  createCrmOrderLine(orderLine: InsertCrmOrderLine): Promise<SelectCrmOrderLine>;
  getCrmOrderLine(id: string): Promise<SelectCrmOrderLine | null>;
  listCrmOrderLinesByOrder(orderId: string): Promise<SelectCrmOrderLine[]>;
  updateCrmOrderLine(id: string, updates: Partial<InsertCrmOrderLine>): Promise<SelectCrmOrderLine | null>;
  deleteCrmOrderLine(id: string): Promise<boolean>;
  
  // ============= GENERIC CRM PRODUCTS CRUD METHODS =============
  createCrmProduct(product: InsertCrmProduct): Promise<SelectCrmProduct>;
  getCrmProduct(id: string): Promise<SelectCrmProduct | null>;
  listCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]>;
  listActiveCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]>;
  updateCrmProduct(id: string, updates: Partial<InsertCrmProduct>): Promise<SelectCrmProduct | null>;
  deleteCrmProduct(id: string): Promise<boolean>;
  
  // ============= GENERIC CRM STOCK CRUD METHODS =============
  createCrmStock(stock: InsertCrmStock): Promise<SelectCrmStock>;
  getCrmStock(id: string): Promise<SelectCrmStock | null>;
  getCrmStockByProduct(productId: string, location?: string): Promise<SelectCrmStock | null>;
  listCrmStock(workspaceId: string): Promise<SelectCrmStock[]>;
  listCrmStockByProduct(productId: string): Promise<SelectCrmStock[]>;
  updateCrmStock(id: string, updates: Partial<InsertCrmStock>): Promise<SelectCrmStock | null>;
  deleteCrmStock(id: string): Promise<boolean>;
  
  // ============= CRM CALL DIARY CRUD METHODS =============
  createCallDiaryEntry(entry: InsertCrmCallDiary): Promise<SelectCrmCallDiary>;
  getCallDiaryEntry(id: number, workspaceId: string): Promise<SelectCrmCallDiary | null>;
  listCallDiaryEntries(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]>;
  listUpcomingCalls(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]>;
  listOverdueCalls(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]>;
  listCallHistory(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]>;
  updateCallDiaryEntry(id: number, workspaceId: string, updates: Partial<InsertCrmCallDiary>): Promise<SelectCrmCallDiary | null>;
  deleteCallDiaryEntry(id: number, workspaceId: string): Promise<boolean>;
  getCallsForEntity(entityType: string, entityId: string, workspaceId: string): Promise<SelectCrmCallDiary[]>;
  
  // ============= BREWERY PRODUCTS CRUD METHODS =============
  createCrmProduct(product: InsertCrmProduct): Promise<SelectCrmProduct>;
  getCrmProduct(id: string): Promise<SelectCrmProduct | null>;
  listCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]>;
  listActiveCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]>;
  updateCrmProduct(id: string, updates: Partial<InsertCrmProduct>): Promise<SelectCrmProduct | null>;
  deleteCrmProduct(id: string): Promise<boolean>;
  // Xero product lookups
  getProductByXeroItemId(xeroItemId: string, workspaceId: string): Promise<SelectCrmProduct | null>;
  getProductByXeroItemCode(xeroItemCode: string, workspaceId: string): Promise<SelectCrmProduct | null>;
  getProductBySKU(sku: string, workspaceId: string): Promise<SelectCrmProduct | null>;
  
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
  
  // ============= BREWERY PRICE BOOKS CRUD METHODS =============
  createBrewPriceBook(priceBook: InsertBrewPriceBook): Promise<SelectBrewPriceBook>;
  getBrewPriceBook(id: number, workspaceId: string): Promise<SelectBrewPriceBook | null>;
  listBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]>;
  listActiveBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]>;
  getDefaultPriceBook(workspaceId: string): Promise<SelectBrewPriceBook | null>;
  updateBrewPriceBook(id: number, workspaceId: string, updates: Partial<InsertBrewPriceBook>): Promise<SelectBrewPriceBook | null>;
  deleteBrewPriceBook(id: number, workspaceId: string): Promise<boolean>;
  unsetDefaultPriceBook(workspaceId: string): Promise<void>;
  
  // ============= BREWERY PRODUCT PRICES CRUD METHODS =============
  createCrmProductPrice(productPrice: InsertCrmProductPrice): Promise<SelectCrmProductPrice>;
  getProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice[]>;
  getProductPriceForBook(productId: string, priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice | null>;
  bulkUpsertProductPrices(priceBookId: number, workspaceId: string, prices: Array<{ productId: string; price: number }>): Promise<void>;
  copyPriceBookPrices(sourcePriceBookId: number, targetPriceBookId: number, workspaceId: string): Promise<void>;
  deleteProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<void>;
  
  // ============= BREWERY PRICE BANDS CRUD METHODS =============
  createBrewPriceBand(priceBand: InsertBrewPriceBand): Promise<SelectBrewPriceBand>;
  getPriceBandsByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectBrewPriceBand[]>;
  deletePriceBand(id: number, workspaceId: string): Promise<boolean>;
  
  // ============= EFFECTIVE PRICING METHODS =============
  getEffectiveProductPrice(productId: string, workspaceId: string, customerId?: string, quantity?: number): Promise<{ price: number; priceBookName: string | null; priceBookId: number | null }>;
  getCustomersByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmCustomer[]>;
  updateCustomerPriceBook(customerId: string, workspaceId: string, priceBookId: number | null): Promise<void>;
  
  // ============= TRADE STORE SETTINGS METHODS =============
  getTradeStoreSettings(workspaceId: string): Promise<SelectBrewTradeStoreSettings | null>;
  createOrUpdateTradeStoreSettings(data: InsertBrewTradeStoreSettings): Promise<SelectBrewTradeStoreSettings>;
  
  // ============= TRADE STORE ACCESS METHODS =============
  getTradeStoreAccessList(workspaceId: string): Promise<any[]>;
  createTradeStoreAccess(data: InsertBrewTradeStoreAccess): Promise<SelectBrewTradeStoreAccess>;
  getTradeStoreAccessByCode(accessCode: string): Promise<SelectBrewTradeStoreAccess | null>;
  updateTradeStoreAccess(id: number, workspaceId: string, updates: Partial<InsertBrewTradeStoreAccess>): Promise<SelectBrewTradeStoreAccess | null>;
  
  // ============= TRADE STORE SESSION METHODS =============
  createTradeStoreSession(data: InsertBrewTradeStoreSession): Promise<SelectBrewTradeStoreSession>;
  getTradeStoreSessionByToken(token: string): Promise<SelectBrewTradeStoreSession | null>;
  
  // ============= CRM SAVED FILTERS METHODS =============
  getSavedFilters(workspaceId: string): Promise<SelectCrmSavedFilter[]>;
  createSavedFilter(data: InsertCrmSavedFilter): Promise<SelectCrmSavedFilter>;
  deleteSavedFilter(id: number, workspaceId: string): Promise<boolean>;
  
  // ============= CRM CUSTOMER TAGS METHODS =============
  getCustomerTags(workspaceId: string): Promise<SelectCrmCustomerTag[]>;
  createCustomerTag(data: InsertCrmCustomerTag): Promise<SelectCrmCustomerTag>;
  deleteCustomerTag(id: number, workspaceId: string): Promise<boolean>;
  getCustomerTagsForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmCustomerTag[]>;
  assignTagToCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void>;
  removeTagFromCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void>;
  
  // ============= CRM CUSTOMER GROUPS METHODS =============
  getCustomerGroups(workspaceId: string): Promise<SelectCrmCustomerGroup[]>;
  createCustomerGroup(data: InsertCrmCustomerGroup): Promise<SelectCrmCustomerGroup>;
  updateCustomerGroup(id: number, workspaceId: string, updates: Partial<InsertCrmCustomerGroup>): Promise<SelectCrmCustomerGroup | null>;
  deleteCustomerGroup(id: number, workspaceId: string): Promise<boolean>;
  
  // ============= CRM ACTIVITIES METHODS =============
  getActivities(workspaceId: string, filters?: any): Promise<any[]>;
  getActivitiesForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmActivity[]>;
  createActivity(data: InsertCrmActivity): Promise<SelectCrmActivity>;
  
  // ============= CRM TASKS METHODS =============
  getTasks(workspaceId: string, filters?: any): Promise<any[]>;
  getUpcomingTasks(workspaceId: string): Promise<SelectCrmTask[]>;
  getOverdueTasks(workspaceId: string): Promise<SelectCrmTask[]>;
  createTask(data: InsertCrmTask): Promise<SelectCrmTask>;
  updateTask(id: number, workspaceId: string, updates: Partial<InsertCrmTask>): Promise<SelectCrmTask | null>;
  completeTask(id: number, workspaceId: string): Promise<SelectCrmTask | null>;
  
  // ============= CONTAINER QR TRACKING METHODS =============
  generateContainerQRCode(containerId: string, workspaceId: string): Promise<SelectBrewContainer | null>;
  getContainerByQRCode(qrCode: string): Promise<SelectBrewContainer | null>;
  logContainerMovement(data: InsertBrewContainerMovement): Promise<SelectBrewContainerMovement>;
  getContainerMovements(containerId: string, workspaceId: string): Promise<any[]>;
  getContainersWithCustomer(customerId: string, workspaceId: string): Promise<any[]>;
  
  // ============= DASHBOARD & REPORTING METHODS =============
  getDashboardKPIs(workspaceId: string): Promise<any>;
  getRevenueByMonth(workspaceId: string, months?: number): Promise<any[]>;
  getTopCustomersByRevenue(workspaceId: string, limit?: number): Promise<any[]>;
  getTopProductsBySales(workspaceId: string, limit?: number): Promise<any[]>;
  
  // ============= XERO CONNECTIONS METHODS =============
  getXeroConnection(workspaceId: string): Promise<SelectXeroConnection | null>;
  createXeroConnection(data: InsertXeroConnection): Promise<SelectXeroConnection>;
  updateXeroConnection(workspaceId: string, data: Partial<InsertXeroConnection>): Promise<SelectXeroConnection | null>;
  updateXeroTokens(workspaceId: string, accessToken: string, refreshToken: string, expiresAt: Date): Promise<SelectXeroConnection | null>;
  disconnectXero(workspaceId: string): Promise<SelectXeroConnection | null>;
  
  // ============= XERO IMPORT JOBS METHODS =============
  createXeroImportJob(data: InsertXeroImportJob): Promise<SelectXeroImportJob>;
  getXeroImportJob(jobId: number, workspaceId: string): Promise<SelectXeroImportJob | null>;
  updateXeroImportJob(jobId: number, workspaceId: string, data: Partial<SelectXeroImportJob>): Promise<SelectXeroImportJob | null>;
  getRecentXeroImportJobs(workspaceId: string, limit?: number): Promise<SelectXeroImportJob[]>;
  
  // ============= CUSTOMER XERO LOOKUPS =============
  getCustomerByXeroContactId(xeroContactId: string, workspaceId: string): Promise<SelectCrmCustomer | null>;
  getCustomersWithoutXeroId(workspaceId: string): Promise<SelectCrmCustomer[]>;
  
  // ============= XERO WEBHOOK EVENTS METHODS =============
  createWebhookEvent(event: InsertXeroWebhookEvent): Promise<SelectXeroWebhookEvent>;
  getWebhookEvent(eventId: string): Promise<SelectXeroWebhookEvent | null>;
  markWebhookProcessed(eventId: string, error?: string): Promise<void>;
  getXeroConnectionByTenantId(tenantId: string): Promise<SelectXeroConnection | null>;
  getAllActiveXeroConnections(): Promise<SelectXeroConnection[]>;
  
  // ============= XERO SYNC QUEUE METHODS =============
  addToSyncQueue(item: { workspaceId: string; entityType: string; entityId: string; action: string }): Promise<SelectXeroSyncQueue>;
  getPendingSyncItems(): Promise<SelectXeroSyncQueue[]>;
  markSyncItemProcessed(id: number): Promise<void>;
  incrementSyncRetry(id: number, error: string): Promise<void>;
  getSyncQueue(workspaceId: string): Promise<SelectXeroSyncQueue[]>;
  
  // ============= SYNC STATUS UPDATES =============
  updateOrderSyncStatus(orderId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void>;
  updateCustomerSyncStatus(customerId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void>;
  updateProductSyncStatus(productId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void>;
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
  
  // Price Books - stub methods
  async createBrewPriceBook(priceBook: InsertBrewPriceBook): Promise<SelectBrewPriceBook> { throw new Error("MemStorage: Price book operations not supported"); }
  async getBrewPriceBook(id: number, workspaceId: string): Promise<SelectBrewPriceBook | null> { return null; }
  async listBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]> { return []; }
  async listActiveBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]> { return []; }
  async getDefaultPriceBook(workspaceId: string): Promise<SelectBrewPriceBook | null> { return null; }
  async updateBrewPriceBook(id: number, workspaceId: string, updates: Partial<InsertBrewPriceBook>): Promise<SelectBrewPriceBook | null> { return null; }
  async deleteBrewPriceBook(id: number, workspaceId: string): Promise<boolean> { return false; }
  async unsetDefaultPriceBook(workspaceId: string): Promise<void> {}
  async createCrmProductPrice(productPrice: InsertCrmProductPrice): Promise<SelectCrmProductPrice> { throw new Error("MemStorage: Product price operations not supported"); }
  async getProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice[]> { return []; }
  async getProductPriceForBook(productId: string, priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice | null> { return null; }
  async bulkUpsertProductPrices(priceBookId: number, workspaceId: string, prices: Array<{ productId: string; price: number }>): Promise<void> {}
  async copyPriceBookPrices(sourcePriceBookId: number, targetPriceBookId: number, workspaceId: string): Promise<void> {}
  async deleteProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<void> {}
  async createBrewPriceBand(priceBand: InsertBrewPriceBand): Promise<SelectBrewPriceBand> { throw new Error("MemStorage: Price band operations not supported"); }
  async getPriceBandsByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectBrewPriceBand[]> { return []; }
  async deletePriceBand(id: number, workspaceId: string): Promise<boolean> { return false; }
  async getEffectiveProductPrice(productId: string, workspaceId: string, customerId?: string, quantity?: number): Promise<{ price: number; priceBookName: string | null; priceBookId: number | null }> { return { price: 0, priceBookName: null, priceBookId: null }; }
  async getCustomersByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmCustomer[]> { return []; }
  async updateCustomerPriceBook(customerId: string, workspaceId: string, priceBookId: number | null): Promise<void> {}
  
  // Trade Store - stub methods
  async getTradeStoreSettings(workspaceId: string): Promise<SelectBrewTradeStoreSettings | null> { return null; }
  async createOrUpdateTradeStoreSettings(data: InsertBrewTradeStoreSettings): Promise<SelectBrewTradeStoreSettings> { throw new Error("MemStorage: Trade store operations not supported"); }
  async getTradeStoreAccessList(workspaceId: string): Promise<any[]> { return []; }
  async createTradeStoreAccess(data: InsertBrewTradeStoreAccess): Promise<SelectBrewTradeStoreAccess> { throw new Error("MemStorage: Trade store operations not supported"); }
  async getTradeStoreAccessByCode(accessCode: string): Promise<SelectBrewTradeStoreAccess | null> { return null; }
  async updateTradeStoreAccess(id: number, workspaceId: string, updates: Partial<InsertBrewTradeStoreAccess>): Promise<SelectBrewTradeStoreAccess | null> { return null; }
  async createTradeStoreSession(data: InsertBrewTradeStoreSession): Promise<SelectBrewTradeStoreSession> { throw new Error("MemStorage: Trade store operations not supported"); }
  async getTradeStoreSessionByToken(token: string): Promise<SelectBrewTradeStoreSession | null> { return null; }
  
  // Saved Filters - stub methods
  async getSavedFilters(workspaceId: string): Promise<SelectCrmSavedFilter[]> { return []; }
  async createSavedFilter(data: InsertCrmSavedFilter): Promise<SelectCrmSavedFilter> { throw new Error("MemStorage: Saved filter operations not supported"); }
  async deleteSavedFilter(id: number, workspaceId: string): Promise<boolean> { return false; }
  
  // Customer Tags - stub methods
  async getCustomerTags(workspaceId: string): Promise<SelectCrmCustomerTag[]> { return []; }
  async createCustomerTag(data: InsertCrmCustomerTag): Promise<SelectCrmCustomerTag> { throw new Error("MemStorage: Customer tag operations not supported"); }
  async deleteCustomerTag(id: number, workspaceId: string): Promise<boolean> { return false; }
  async getCustomerTagsForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmCustomerTag[]> { return []; }
  async assignTagToCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void> {}
  async removeTagFromCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void> {}
  
  // Customer Groups - stub methods
  async getCustomerGroups(workspaceId: string): Promise<SelectCrmCustomerGroup[]> { return []; }
  async createCustomerGroup(data: InsertCrmCustomerGroup): Promise<SelectCrmCustomerGroup> { throw new Error("MemStorage: Customer group operations not supported"); }
  async updateCustomerGroup(id: number, workspaceId: string, updates: Partial<InsertCrmCustomerGroup>): Promise<SelectCrmCustomerGroup | null> { return null; }
  async deleteCustomerGroup(id: number, workspaceId: string): Promise<boolean> { return false; }

  // Sample Data - stub methods
  async deleteSampleCustomers(workspaceId: string): Promise<number> { return 0; }
  async deleteSampleProducts(workspaceId: string): Promise<number> { return 0; }
  async deleteSampleOrders(workspaceId: string): Promise<number> { return 0; }

  // Activities - stub methods
  async getActivities(workspaceId: string, filters?: any): Promise<any[]> { return []; }
  async getActivitiesForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmActivity[]> { return []; }
  async createActivity(data: InsertCrmActivity): Promise<SelectCrmActivity> { throw new Error("MemStorage: Activity operations not supported"); }
  
  // Tasks - stub methods
  async getTasks(workspaceId: string, filters?: any): Promise<any[]> { return []; }
  async getUpcomingTasks(workspaceId: string): Promise<SelectCrmTask[]> { return []; }
  async getOverdueTasks(workspaceId: string): Promise<SelectCrmTask[]> { return []; }
  async createTask(data: InsertCrmTask): Promise<SelectCrmTask> { throw new Error("MemStorage: Task operations not supported"); }
  async updateTask(id: number, workspaceId: string, updates: Partial<InsertCrmTask>): Promise<SelectCrmTask | null> { return null; }
  async completeTask(id: number, workspaceId: string): Promise<SelectCrmTask | null> { return null; }
  
  // Container QR Tracking - stub methods
  async generateContainerQRCode(containerId: string, workspaceId: string): Promise<SelectBrewContainer | null> { return null; }
  async getContainerByQRCode(qrCode: string): Promise<SelectBrewContainer | null> { return null; }
  async logContainerMovement(data: InsertBrewContainerMovement): Promise<SelectBrewContainerMovement> { throw new Error("MemStorage: Container movement operations not supported"); }
  async getContainerMovements(containerId: string, workspaceId: string): Promise<any[]> { return []; }
  async getContainersWithCustomer(customerId: string, workspaceId: string): Promise<any[]> { return []; }
  
  // Dashboard - stub methods
  async getDashboardKPIs(workspaceId: string): Promise<any> { return {}; }
  async getRevenueByMonth(workspaceId: string, months?: number): Promise<any[]> { return []; }
  async getTopCustomersByRevenue(workspaceId: string, limit?: number): Promise<any[]> { return []; }
  async getTopProductsBySales(workspaceId: string, limit?: number): Promise<any[]> { return []; }
  
  // Xero product/order lookups - stub methods
  async getProductByXeroItemId(xeroItemId: string, workspaceId: string): Promise<SelectCrmProduct | null> { return null; }
  async getProductByXeroItemCode(xeroItemCode: string, workspaceId: string): Promise<SelectCrmProduct | null> { return null; }
  async getProductBySKU(sku: string, workspaceId: string): Promise<SelectCrmProduct | null> { return null; }
  async getOrderByXeroInvoiceId(xeroInvoiceId: string, workspaceId: string): Promise<SelectCrmOrder | null> { return null; }
  
  // Xero Connections - stub methods
  async getXeroConnection(workspaceId: string): Promise<SelectXeroConnection | null> { return null; }
  async createXeroConnection(data: InsertXeroConnection): Promise<SelectXeroConnection> { throw new Error("MemStorage: Xero operations not supported"); }
  async updateXeroConnection(workspaceId: string, data: Partial<InsertXeroConnection>): Promise<SelectXeroConnection | null> { return null; }
  async updateXeroTokens(workspaceId: string, accessToken: string, refreshToken: string, expiresAt: Date): Promise<SelectXeroConnection | null> { return null; }
  async disconnectXero(workspaceId: string): Promise<SelectXeroConnection | null> { return null; }
  
  // Xero Import Jobs - stub methods
  async createXeroImportJob(data: InsertXeroImportJob): Promise<SelectXeroImportJob> { throw new Error("MemStorage: Xero operations not supported"); }
  async getXeroImportJob(jobId: number, workspaceId: string): Promise<SelectXeroImportJob | null> { return null; }
  async updateXeroImportJob(jobId: number, workspaceId: string, data: Partial<SelectXeroImportJob>): Promise<SelectXeroImportJob | null> { return null; }
  async getRecentXeroImportJobs(workspaceId: string, limit?: number): Promise<SelectXeroImportJob[]> { return []; }
  
  // Customer Xero Lookups - stub methods
  async getCustomerByXeroContactId(xeroContactId: string, workspaceId: string): Promise<SelectCrmCustomer | null> { return null; }
  async getCustomersWithoutXeroId(workspaceId: string): Promise<SelectCrmCustomer[]> { return []; }
  
  // Xero Webhook Events - stub methods
  async createWebhookEvent(event: InsertXeroWebhookEvent): Promise<SelectXeroWebhookEvent> { throw new Error("MemStorage: Xero operations not supported"); }
  async getWebhookEvent(eventId: string): Promise<SelectXeroWebhookEvent | null> { return null; }
  async markWebhookProcessed(eventId: string, error?: string): Promise<void> {}
  async getXeroConnectionByTenantId(tenantId: string): Promise<SelectXeroConnection | null> { return null; }
  async getAllActiveXeroConnections(): Promise<SelectXeroConnection[]> { return []; }
  
  // Xero Sync Queue - stub methods
  async addToSyncQueue(item: { workspaceId: string; entityType: string; entityId: string; action: string }): Promise<SelectXeroSyncQueue> { throw new Error("MemStorage: Xero operations not supported"); }
  async getPendingSyncItems(): Promise<SelectXeroSyncQueue[]> { return []; }
  async markSyncItemProcessed(id: number): Promise<void> {}
  async incrementSyncRetry(id: number, error: string): Promise<void> {}
  async getSyncQueue(workspaceId: string): Promise<SelectXeroSyncQueue[]> { return []; }
  
  // Sync Status Updates - stub methods
  async updateOrderSyncStatus(orderId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void> {}
  async updateCustomerSyncStatus(customerId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void> {}
  async updateProductSyncStatus(productId: string, workspaceId: string, status: 'synced' | 'pending' | 'failed', error?: string): Promise<void> {}
}

// Database connection validation and setup
// Prefer SUPABASE_DATABASE_URL to avoid conflict with Replit's built-in DATABASE_URL
const DATABASE_CONNECTION_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_CONNECTION_URL) {
  console.error('❌ FATAL: Database URL environment variable is not set.');
  console.error('   Please set SUPABASE_DATABASE_URL or DATABASE_URL in your .env or .env.local file.');
  console.error('   Example: SUPABASE_DATABASE_URL=postgres://user:pass@host:5432/dbname');
  throw new Error('Database URL is required but not set. Check your environment configuration.');
}

// Set faster connection and query timeout for quicker fallback in demo mode
const queryClient = postgres(DATABASE_CONNECTION_URL, {
  connect_timeout: 5, // 5 second connection timeout (default is much longer)
  idle_timeout: 10,
  max_lifetime: 60 * 30,
});
const db = drizzle(queryClient);

/**
 * Get the drizzle database instance for direct queries
 */
export function getDrizzleDb() {
  return db;
}

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

  async deleteSampleCustomers(workspaceId: string): Promise<number> {
    const result = await db.delete(crmCustomers)
      .where(and(
        eq(crmCustomers.workspaceId, workspaceId),
        eq(crmCustomers.isSample, true)
      ));
    return result.rowCount || 0;
  }

  async deleteSampleProducts(workspaceId: string): Promise<number> {
    const result = await db.delete(crmProducts)
      .where(and(
        eq(crmProducts.workspaceId, workspaceId),
        eq(crmProducts.isSample, true)
      ));
    return result.rowCount || 0;
  }

  async deleteSampleOrders(workspaceId: string): Promise<number> {
    const result = await db.delete(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        eq(crmOrders.isSample, true)
      ));
    return result.rowCount || 0;
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
  
  // Xero order lookups
  async getOrderByXeroInvoiceId(xeroInvoiceId: string, workspaceId: string): Promise<SelectCrmOrder | null> {
    const [order] = await db.select().from(crmOrders)
      .where(and(
        eq(crmOrders.xeroInvoiceId, xeroInvoiceId),
        eq(crmOrders.workspaceId, workspaceId)
      ));
    return order || null;
  }
  
  // ============= SUPPLIERS CRUD METHODS =============
  async getSupplierById(id: string, workspaceId: string): Promise<SelectSupplier | null> {
    const [supplier] = await db.select().from(suppliers)
      .where(and(
        eq(suppliers.id, id),
        eq(suppliers.workspaceId, workspaceId)
      ));
    return supplier || null;
  }

  async listSuppliers(workspaceId: string): Promise<SelectSupplier[]> {
    return await db.select().from(suppliers)
      .where(eq(suppliers.workspaceId, workspaceId))
      .orderBy(suppliers.name);
  }

  async getSupplierByXeroContactId(xeroContactId: string, workspaceId: string): Promise<SelectSupplier | null> {
    const [supplier] = await db.select().from(suppliers)
      .where(and(
        eq(suppliers.xeroContactId, xeroContactId),
        eq(suppliers.workspaceId, workspaceId)
      ));
    return supplier || null;
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
  
  // ============= GENERIC CRM PRODUCTS CRUD METHODS =============
  async createCrmProduct(product: InsertCrmProduct): Promise<SelectCrmProduct> {
    const [created] = await db.insert(crmProducts).values(product).returning();
    return created;
  }
  
  async getCrmProduct(id: string): Promise<SelectCrmProduct | null> {
    const [product] = await db.select().from(crmProducts).where(eq(crmProducts.id, id));
    return product || null;
  }
  
  async listCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]> {
    return await db.select().from(crmProducts).where(eq(crmProducts.workspaceId, workspaceId)).orderBy(crmProducts.name);
  }
  
  async listActiveCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]> {
    return await db.select().from(crmProducts)
      .where(and(
        eq(crmProducts.workspaceId, workspaceId),
        eq(crmProducts.isActive, 1)
      ))
      .orderBy(crmProducts.name);
  }
  
  async updateCrmProduct(id: string, updates: Partial<InsertCrmProduct>): Promise<SelectCrmProduct | null> {
    console.log('[Storage] updateCrmProduct called with id:', id);
    console.log('[Storage] updateCrmProduct updates:', JSON.stringify(updates, null, 2));

    const [updated] = await db.update(crmProducts)
      .set(updates)
      .where(eq(crmProducts.id, id))
      .returning();

    console.log('[Storage] updateCrmProduct result:', updated ? JSON.stringify(updated, null, 2) : 'null');
    return updated || null;
  }
  
  async deleteCrmProduct(id: string): Promise<boolean> {
    console.log('[Storage] deleteCrmProduct called with id:', id);
    const result = await db.delete(crmProducts).where(eq(crmProducts.id, id));
    console.log('[Storage] deleteCrmProduct result:', result);
    return true;
  }
  
  // ============= GENERIC CRM STOCK CRUD METHODS =============
  async createCrmStock(stock: InsertCrmStock): Promise<SelectCrmStock> {
    const [created] = await db.insert(crmStock).values(stock).returning();
    return created;
  }
  
  async getCrmStock(id: string): Promise<SelectCrmStock | null> {
    const [stock] = await db.select().from(crmStock).where(eq(crmStock.id, id));
    return stock || null;
  }
  
  async getCrmStockByProduct(productId: string, location?: string): Promise<SelectCrmStock | null> {
    if (location) {
      const [stock] = await db.select().from(crmStock)
        .where(and(eq(crmStock.productId, productId), eq(crmStock.location, location)));
      return stock || null;
    }
    const [stock] = await db.select().from(crmStock).where(eq(crmStock.productId, productId));
    return stock || null;
  }
  
  async listCrmStock(workspaceId: string): Promise<SelectCrmStock[]> {
    return await db.select().from(crmStock).where(eq(crmStock.workspaceId, workspaceId));
  }
  
  async listCrmStockByProduct(productId: string): Promise<SelectCrmStock[]> {
    return await db.select().from(crmStock).where(eq(crmStock.productId, productId));
  }
  
  async updateCrmStock(id: string, updates: Partial<InsertCrmStock>): Promise<SelectCrmStock | null> {
    const [updated] = await db.update(crmStock)
      .set(updates)
      .where(eq(crmStock.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmStock(id: string): Promise<boolean> {
    await db.delete(crmStock).where(eq(crmStock.id, id));
    return true;
  }
  
  // ============= CRM CALL DIARY CRUD METHODS =============
  async createCallDiaryEntry(entry: InsertCrmCallDiary): Promise<SelectCrmCallDiary> {
    const [created] = await db.insert(crmCallDiary).values(entry).returning();
    return created;
  }
  
  async getCallDiaryEntry(id: number, workspaceId: string): Promise<SelectCrmCallDiary | null> {
    const [entry] = await db.select().from(crmCallDiary)
      .where(and(
        eq(crmCallDiary.id, id),
        eq(crmCallDiary.workspaceId, workspaceId)
      ));
    return entry || null;
  }
  
  async listCallDiaryEntries(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]> {
    const conditions = [eq(crmCallDiary.workspaceId, workspaceId)];
    
    if (filters?.entityType) {
      conditions.push(eq(crmCallDiary.entityType, filters.entityType));
    }
    if (filters?.completed !== undefined) {
      conditions.push(eq(crmCallDiary.completed, filters.completed ? 1 : 0));
    }
    if (filters?.startDate) {
      conditions.push(gte(crmCallDiary.scheduledDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(crmCallDiary.scheduledDate, filters.endDate));
    }
    
    let query = db.select().from(crmCallDiary)
      .where(and(...conditions))
      .orderBy(desc(crmCallDiary.scheduledDate));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as typeof query;
    }
    
    return await query;
  }
  
  async listUpcomingCalls(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]> {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const conditions = [
      eq(crmCallDiary.workspaceId, workspaceId),
      eq(crmCallDiary.completed, 0),
      gte(crmCallDiary.scheduledDate, startOfToday.getTime())
    ];
    
    if (filters?.entityType) {
      conditions.push(eq(crmCallDiary.entityType, filters.entityType));
    }
    if (filters?.endDate) {
      conditions.push(lte(crmCallDiary.scheduledDate, filters.endDate));
    }
    
    let query = db.select().from(crmCallDiary)
      .where(and(...conditions))
      .orderBy(asc(crmCallDiary.scheduledDate));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    
    return await query;
  }
  
  async listOverdueCalls(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const conditions = [
      eq(crmCallDiary.workspaceId, workspaceId),
      eq(crmCallDiary.completed, 0),
      lt(crmCallDiary.scheduledDate, startOfToday.getTime())
    ];
    
    if (filters?.entityType) {
      conditions.push(eq(crmCallDiary.entityType, filters.entityType));
    }
    
    let query = db.select().from(crmCallDiary)
      .where(and(...conditions))
      .orderBy(asc(crmCallDiary.scheduledDate));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    
    return await query;
  }
  
  async listCallHistory(workspaceId: string, filters?: CallDiaryFilters): Promise<SelectCrmCallDiary[]> {
    const conditions = [
      eq(crmCallDiary.workspaceId, workspaceId),
      eq(crmCallDiary.completed, 1)
    ];
    
    if (filters?.entityType) {
      conditions.push(eq(crmCallDiary.entityType, filters.entityType));
    }
    if (filters?.startDate) {
      conditions.push(gte(crmCallDiary.completedDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(crmCallDiary.completedDate, filters.endDate));
    }
    
    let query = db.select().from(crmCallDiary)
      .where(and(...conditions))
      .orderBy(desc(crmCallDiary.completedDate));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as typeof query;
    }
    
    return await query;
  }
  
  async updateCallDiaryEntry(id: number, workspaceId: string, updates: Partial<InsertCrmCallDiary>): Promise<SelectCrmCallDiary | null> {
    const [updated] = await db.update(crmCallDiary)
      .set({ ...updates, updatedAt: Date.now() })
      .where(and(
        eq(crmCallDiary.id, id),
        eq(crmCallDiary.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }
  
  async deleteCallDiaryEntry(id: number, workspaceId: string): Promise<boolean> {
    await db.delete(crmCallDiary)
      .where(and(
        eq(crmCallDiary.id, id),
        eq(crmCallDiary.workspaceId, workspaceId)
      ));
    return true;
  }
  
  async getCallsForEntity(entityType: string, entityId: string, workspaceId: string): Promise<SelectCrmCallDiary[]> {
    return await db.select().from(crmCallDiary)
      .where(and(
        eq(crmCallDiary.workspaceId, workspaceId),
        eq(crmCallDiary.entityType, entityType),
        eq(crmCallDiary.entityId, entityId)
      ))
      .orderBy(desc(crmCallDiary.scheduledDate));
  }
  
  // ============= BREWERY PRODUCTS CRUD METHODS =============
  async createCrmProduct(product: InsertCrmProduct): Promise<SelectCrmProduct> {
    const [created] = await db.insert(crmProducts).values(product).returning();
    return created;
  }
  
  async getCrmProduct(id: string): Promise<SelectCrmProduct | null> {
    const [product] = await db.select().from(crmProducts).where(eq(crmProducts.id, id));
    return product || null;
  }
  
  async listCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]> {
    return await db.select().from(crmProducts).where(eq(crmProducts.workspaceId, workspaceId)).orderBy(crmProducts.name);
  }
  
  async listActiveCrmProducts(workspaceId: string): Promise<SelectCrmProduct[]> {
    return await db.select().from(crmProducts)
      .where(and(
        eq(crmProducts.workspaceId, workspaceId),
        eq(crmProducts.isActive, 1)
      ))
      .orderBy(crmProducts.name);
  }
  
  async updateCrmProduct(id: string, updates: Partial<InsertCrmProduct>): Promise<SelectCrmProduct | null> {
    const [updated] = await db.update(crmProducts)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(crmProducts.id, id))
      .returning();
    return updated || null;
  }
  
  async deleteCrmProduct(id: string): Promise<boolean> {
    const result = await db.delete(crmProducts).where(eq(crmProducts.id, id));
    return true;
  }
  
  // Xero product lookups
  async getProductByXeroItemId(xeroItemId: string, workspaceId: string): Promise<SelectCrmProduct | null> {
    const [product] = await db.select().from(crmProducts)
      .where(and(
        eq(crmProducts.xeroItemId, xeroItemId),
        eq(crmProducts.workspaceId, workspaceId)
      ));
    return product || null;
  }
  
  async getProductByXeroItemCode(xeroItemCode: string, workspaceId: string): Promise<SelectCrmProduct | null> {
    const [product] = await db.select().from(crmProducts)
      .where(and(
        eq(crmProducts.xeroItemCode, xeroItemCode),
        eq(crmProducts.workspaceId, workspaceId)
      ));
    return product || null;
  }
  
  async getProductBySKU(sku: string, workspaceId: string): Promise<SelectCrmProduct | null> {
    const [product] = await db.select().from(crmProducts)
      .where(and(
        eq(crmProducts.sku, sku),
        eq(crmProducts.workspaceId, workspaceId)
      ));
    return product || null;
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

  // ============= BREWERY PRICE BOOKS CRUD METHODS =============
  
  async createBrewPriceBook(priceBook: InsertBrewPriceBook): Promise<SelectBrewPriceBook> {
    const [created] = await db.insert(brewPriceBooks).values(priceBook).returning();
    return created;
  }

  async getBrewPriceBook(id: number, workspaceId: string): Promise<SelectBrewPriceBook | null> {
    const [priceBook] = await db.select().from(brewPriceBooks)
      .where(and(
        eq(brewPriceBooks.id, id),
        eq(brewPriceBooks.workspaceId, workspaceId)
      ));
    return priceBook || null;
  }

  async listBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]> {
    return await db.select().from(brewPriceBooks)
      .where(eq(brewPriceBooks.workspaceId, workspaceId))
      .orderBy(asc(brewPriceBooks.name));
  }

  async listActiveBrewPriceBooks(workspaceId: string): Promise<SelectBrewPriceBook[]> {
    return await db.select().from(brewPriceBooks)
      .where(and(
        eq(brewPriceBooks.workspaceId, workspaceId),
        eq(brewPriceBooks.isActive, 1)
      ))
      .orderBy(asc(brewPriceBooks.name));
  }

  async getDefaultPriceBook(workspaceId: string): Promise<SelectBrewPriceBook | null> {
    const [defaultBook] = await db.select().from(brewPriceBooks)
      .where(and(
        eq(brewPriceBooks.workspaceId, workspaceId),
        eq(brewPriceBooks.isDefault, 1)
      ));
    return defaultBook || null;
  }

  async updateBrewPriceBook(id: number, workspaceId: string, updates: Partial<InsertBrewPriceBook>): Promise<SelectBrewPriceBook | null> {
    const [updated] = await db.update(brewPriceBooks)
      .set({ ...updates, updatedAt: Date.now() })
      .where(and(
        eq(brewPriceBooks.id, id),
        eq(brewPriceBooks.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }

  async deleteBrewPriceBook(id: number, workspaceId: string): Promise<boolean> {
    const [deleted] = await db.delete(brewPriceBooks)
      .where(and(
        eq(brewPriceBooks.id, id),
        eq(brewPriceBooks.workspaceId, workspaceId)
      ))
      .returning();
    return !!deleted;
  }

  async unsetDefaultPriceBook(workspaceId: string): Promise<void> {
    await db.update(brewPriceBooks)
      .set({ isDefault: 0, updatedAt: Date.now() })
      .where(eq(brewPriceBooks.workspaceId, workspaceId));
  }

  // ============= BREWERY PRODUCT PRICES CRUD METHODS =============

  async createCrmProductPrice(productPrice: InsertCrmProductPrice): Promise<SelectCrmProductPrice> {
    const [created] = await db.insert(brewProductPrices).values(productPrice).returning();
    return created;
  }

  async getProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice[]> {
    return await db.select().from(brewProductPrices)
      .where(and(
        eq(brewProductPrices.priceBookId, priceBookId),
        eq(brewProductPrices.workspaceId, workspaceId)
      ));
  }

  async getProductPriceForBook(productId: string, priceBookId: number, workspaceId: string): Promise<SelectCrmProductPrice | null> {
    const [price] = await db.select().from(brewProductPrices)
      .where(and(
        eq(brewProductPrices.productId, productId),
        eq(brewProductPrices.priceBookId, priceBookId),
        eq(brewProductPrices.workspaceId, workspaceId)
      ));
    return price || null;
  }

  async bulkUpsertProductPrices(priceBookId: number, workspaceId: string, prices: Array<{ productId: string; price: number }>): Promise<void> {
    // Delete existing prices for this price book first
    await db.delete(brewProductPrices)
      .where(and(
        eq(brewProductPrices.priceBookId, priceBookId),
        eq(brewProductPrices.workspaceId, workspaceId)
      ));
    
    // Insert new prices if any
    if (prices.length > 0) {
      const now = Date.now();
      const values = prices.map(p => ({
        workspaceId,
        productId: p.productId,
        priceBookId,
        price: p.price,
        createdAt: now,
        updatedAt: now,
      }));
      await db.insert(brewProductPrices).values(values);
    }
  }

  async copyPriceBookPrices(sourcePriceBookId: number, targetPriceBookId: number, workspaceId: string): Promise<void> {
    // Get source prices
    const sourcePrices = await this.getProductPricesByPriceBook(sourcePriceBookId, workspaceId);
    
    if (sourcePrices.length > 0) {
      const now = Date.now();
      const values = sourcePrices.map(p => ({
        workspaceId,
        productId: p.productId,
        priceBookId: targetPriceBookId,
        price: p.price,
        createdAt: now,
        updatedAt: now,
      }));
      
      // Delete existing prices for target first
      await db.delete(brewProductPrices)
        .where(and(
          eq(brewProductPrices.priceBookId, targetPriceBookId),
          eq(brewProductPrices.workspaceId, workspaceId)
        ));
      
      // Insert copied prices
      await db.insert(brewProductPrices).values(values);
    }
  }

  async deleteProductPricesByPriceBook(priceBookId: number, workspaceId: string): Promise<void> {
    await db.delete(brewProductPrices)
      .where(and(
        eq(brewProductPrices.priceBookId, priceBookId),
        eq(brewProductPrices.workspaceId, workspaceId)
      ));
  }

  // ============= BREWERY PRICE BANDS CRUD METHODS =============

  async createBrewPriceBand(priceBand: InsertBrewPriceBand): Promise<SelectBrewPriceBand> {
    const [created] = await db.insert(brewPriceBands).values(priceBand).returning();
    return created;
  }

  async getPriceBandsByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectBrewPriceBand[]> {
    return await db.select().from(brewPriceBands)
      .where(and(
        eq(brewPriceBands.priceBookId, priceBookId),
        eq(brewPriceBands.workspaceId, workspaceId)
      ))
      .orderBy(asc(brewPriceBands.minQuantity));
  }

  async deletePriceBand(id: number, workspaceId: string): Promise<boolean> {
    const [deleted] = await db.delete(brewPriceBands)
      .where(and(
        eq(brewPriceBands.id, id),
        eq(brewPriceBands.workspaceId, workspaceId)
      ))
      .returning();
    return !!deleted;
  }

  // ============= EFFECTIVE PRICING METHODS =============

  async getEffectiveProductPrice(
    productId: string, 
    workspaceId: string, 
    customerId?: string, 
    quantity: number = 1
  ): Promise<{ price: number; priceBookName: string | null; priceBookId: number | null }> {
    let priceBookId: number | null = null;
    let priceBookName: string | null = null;

    // 1. Get customer's assigned price book if customerId provided
    if (customerId) {
      const [customer] = await db.select({ priceBookId: crmCustomers.priceBookId })
        .from(crmCustomers)
        .where(and(
          eq(crmCustomers.id, customerId),
          eq(crmCustomers.workspaceId, workspaceId)
        ));
      
      if (customer?.priceBookId) {
        priceBookId = customer.priceBookId;
      }
    }

    // 2. If no customer price book, use default price book
    if (!priceBookId) {
      const defaultBook = await this.getDefaultPriceBook(workspaceId);
      if (defaultBook) {
        priceBookId = defaultBook.id;
        priceBookName = defaultBook.name;
      }
    }

    // 3. Get price from price book if we have one
    if (priceBookId) {
      // First get price book name if not already set
      if (!priceBookName) {
        const priceBook = await this.getBrewPriceBook(priceBookId, workspaceId);
        priceBookName = priceBook?.name || null;
      }

      // Get the specific product price for this price book
      const productPrice = await this.getProductPriceForBook(productId, priceBookId, workspaceId);
      
      if (productPrice) {
        let finalPrice = productPrice.price;

        // Check for quantity-based discounts
        const bands = await this.getPriceBandsByPriceBook(priceBookId, workspaceId);
        const applicableBand = bands.find(band => {
          const matchesProduct = !band.productId || band.productId === productId;
          const meetsMin = quantity >= band.minQuantity;
          const meetsMax = !band.maxQuantity || quantity <= band.maxQuantity;
          return matchesProduct && meetsMin && meetsMax;
        });

        if (applicableBand) {
          if (applicableBand.discountType === 'percentage') {
            // discountValue is in basis points (e.g., 1000 = 10%)
            const discountMultiplier = 1 - (applicableBand.discountValue / 10000);
            finalPrice = Math.round(finalPrice * discountMultiplier);
          } else if (applicableBand.discountType === 'fixed') {
            finalPrice = Math.max(0, finalPrice - applicableBand.discountValue);
          }
        }

        return { price: finalPrice, priceBookName, priceBookId };
      }
    }

    // 4. Fallback to product's default price
    const [product] = await db.select({ price: crmProducts.defaultUnitPriceExVat })
      .from(crmProducts)
      .where(and(
        eq(crmProducts.id, productId),
        eq(crmProducts.workspaceId, workspaceId)
      ));

    return { 
      price: product?.price || 0, 
      priceBookName: null, 
      priceBookId: null 
    };
  }

  async getCustomersByPriceBook(priceBookId: number, workspaceId: string): Promise<SelectCrmCustomer[]> {
    return await db.select().from(crmCustomers)
      .where(and(
        eq(crmCustomers.priceBookId, priceBookId),
        eq(crmCustomers.workspaceId, workspaceId)
      ));
  }

  async updateCustomerPriceBook(customerId: string, workspaceId: string, priceBookId: number | null): Promise<void> {
    await db.update(crmCustomers)
      .set({ priceBookId, updatedAt: Date.now() })
      .where(and(
        eq(crmCustomers.id, customerId),
        eq(crmCustomers.workspaceId, workspaceId)
      ));
  }

  // ============= TRADE STORE SETTINGS METHODS =============

  async getTradeStoreSettings(workspaceId: string): Promise<SelectBrewTradeStoreSettings | null> {
    const [settings] = await db.select().from(brewTradeStoreSettings)
      .where(eq(brewTradeStoreSettings.workspaceId, workspaceId));
    return settings || null;
  }

  async createOrUpdateTradeStoreSettings(data: InsertBrewTradeStoreSettings): Promise<SelectBrewTradeStoreSettings> {
    const existing = await this.getTradeStoreSettings(data.workspaceId);
    const now = Date.now();
    
    if (existing) {
      const [updated] = await db.update(brewTradeStoreSettings)
        .set({ ...data, updatedAt: now })
        .where(eq(brewTradeStoreSettings.workspaceId, data.workspaceId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(brewTradeStoreSettings)
        .values({ ...data, createdAt: now, updatedAt: now })
        .returning();
      return created;
    }
  }

  // ============= TRADE STORE ACCESS METHODS =============

  async getTradeStoreAccessList(workspaceId: string): Promise<any[]> {
    return await db.select({
      id: brewTradeStoreAccess.id,
      customerId: brewTradeStoreAccess.customerId,
      customerName: crmCustomers.name,
      accessCode: brewTradeStoreAccess.accessCode,
      isActive: brewTradeStoreAccess.isActive,
      lastLoginAt: brewTradeStoreAccess.lastLoginAt,
      createdAt: brewTradeStoreAccess.createdAt,
    }).from(brewTradeStoreAccess)
      .innerJoin(crmCustomers, eq(brewTradeStoreAccess.customerId, crmCustomers.id))
      .where(eq(brewTradeStoreAccess.workspaceId, workspaceId))
      .orderBy(desc(brewTradeStoreAccess.createdAt));
  }

  async createTradeStoreAccess(data: InsertBrewTradeStoreAccess): Promise<SelectBrewTradeStoreAccess> {
    const [access] = await db.insert(brewTradeStoreAccess).values(data).returning();
    return access;
  }

  async getTradeStoreAccessByCode(accessCode: string): Promise<SelectBrewTradeStoreAccess | null> {
    const [access] = await db.select().from(brewTradeStoreAccess)
      .where(eq(brewTradeStoreAccess.accessCode, accessCode));
    return access || null;
  }

  async updateTradeStoreAccess(id: number, workspaceId: string, updates: Partial<InsertBrewTradeStoreAccess>): Promise<SelectBrewTradeStoreAccess | null> {
    const [updated] = await db.update(brewTradeStoreAccess)
      .set({ ...updates, updatedAt: Date.now() })
      .where(and(
        eq(brewTradeStoreAccess.id, id),
        eq(brewTradeStoreAccess.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }

  // ============= TRADE STORE SESSION METHODS =============

  async createTradeStoreSession(data: InsertBrewTradeStoreSession): Promise<SelectBrewTradeStoreSession> {
    const [session] = await db.insert(brewTradeStoreSessions).values(data).returning();
    return session;
  }

  async getTradeStoreSessionByToken(token: string): Promise<SelectBrewTradeStoreSession | null> {
    const [session] = await db.select().from(brewTradeStoreSessions)
      .where(eq(brewTradeStoreSessions.sessionToken, token));
    return session || null;
  }

  // ============= CRM SAVED FILTERS METHODS =============

  async getSavedFilters(workspaceId: string): Promise<SelectCrmSavedFilter[]> {
    return await db.select().from(crmSavedFilters)
      .where(eq(crmSavedFilters.workspaceId, workspaceId))
      .orderBy(asc(crmSavedFilters.name));
  }

  async createSavedFilter(data: InsertCrmSavedFilter): Promise<SelectCrmSavedFilter> {
    const [filter] = await db.insert(crmSavedFilters).values(data).returning();
    return filter;
  }

  async deleteSavedFilter(id: number, workspaceId: string): Promise<boolean> {
    const [deleted] = await db.delete(crmSavedFilters)
      .where(and(
        eq(crmSavedFilters.id, id),
        eq(crmSavedFilters.workspaceId, workspaceId)
      ))
      .returning();
    return !!deleted;
  }

  // ============= CRM CUSTOMER TAGS METHODS =============

  async getCustomerTags(workspaceId: string): Promise<SelectCrmCustomerTag[]> {
    return await db.select().from(crmCustomerTags)
      .where(eq(crmCustomerTags.workspaceId, workspaceId))
      .orderBy(asc(crmCustomerTags.name));
  }

  async createCustomerTag(data: InsertCrmCustomerTag): Promise<SelectCrmCustomerTag> {
    const [tag] = await db.insert(crmCustomerTags).values(data).returning();
    return tag;
  }

  async deleteCustomerTag(id: number, workspaceId: string): Promise<boolean> {
    const [deleted] = await db.delete(crmCustomerTags)
      .where(and(
        eq(crmCustomerTags.id, id),
        eq(crmCustomerTags.workspaceId, workspaceId)
      ))
      .returning();
    return !!deleted;
  }

  async getCustomerTagsForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmCustomerTag[]> {
    return await db.select({
      id: crmCustomerTags.id,
      workspaceId: crmCustomerTags.workspaceId,
      name: crmCustomerTags.name,
      color: crmCustomerTags.color,
      createdAt: crmCustomerTags.createdAt,
    }).from(crmCustomerTagAssignments)
      .innerJoin(crmCustomerTags, eq(crmCustomerTagAssignments.tagId, crmCustomerTags.id))
      .where(and(
        eq(crmCustomerTagAssignments.customerId, customerId),
        eq(crmCustomerTagAssignments.workspaceId, workspaceId)
      ));
  }

  async assignTagToCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void> {
    await db.insert(crmCustomerTagAssignments)
      .values({ customerId, tagId, workspaceId, createdAt: Date.now() })
      .onConflictDoNothing();
  }

  async removeTagFromCustomer(customerId: string, tagId: number, workspaceId: string): Promise<void> {
    await db.delete(crmCustomerTagAssignments)
      .where(and(
        eq(crmCustomerTagAssignments.customerId, customerId),
        eq(crmCustomerTagAssignments.tagId, tagId)
      ));
  }

  // ============= CRM CUSTOMER GROUPS METHODS =============

  async getCustomerGroups(workspaceId: string): Promise<SelectCrmCustomerGroup[]> {
    return await db.select().from(crmCustomerGroups)
      .where(eq(crmCustomerGroups.workspaceId, workspaceId))
      .orderBy(asc(crmCustomerGroups.name));
  }

  async createCustomerGroup(data: InsertCrmCustomerGroup): Promise<SelectCrmCustomerGroup> {
    const [group] = await db.insert(crmCustomerGroups).values(data).returning();
    return group;
  }

  async updateCustomerGroup(id: number, workspaceId: string, updates: Partial<InsertCrmCustomerGroup>): Promise<SelectCrmCustomerGroup | null> {
    const [updated] = await db.update(crmCustomerGroups)
      .set({ ...updates, updatedAt: Date.now() })
      .where(and(
        eq(crmCustomerGroups.id, id),
        eq(crmCustomerGroups.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }

  async deleteCustomerGroup(id: number, workspaceId: string): Promise<boolean> {
    const [deleted] = await db.delete(crmCustomerGroups)
      .where(and(
        eq(crmCustomerGroups.id, id),
        eq(crmCustomerGroups.workspaceId, workspaceId)
      ))
      .returning();
    return !!deleted;
  }

  // ============= CRM ACTIVITIES METHODS =============

  async getActivities(workspaceId: string, filters?: any): Promise<any[]> {
    let query = db.select({
      activity: crmActivities,
      customerName: crmCustomers.name,
    }).from(crmActivities)
      .leftJoin(crmCustomers, eq(crmActivities.customerId, crmCustomers.id))
      .where(eq(crmActivities.workspaceId, workspaceId))
      .orderBy(desc(crmActivities.createdAt));
    
    return await query;
  }

  async getActivitiesForCustomer(customerId: string, workspaceId: string): Promise<SelectCrmActivity[]> {
    return await db.select().from(crmActivities)
      .where(and(
        eq(crmActivities.customerId, customerId),
        eq(crmActivities.workspaceId, workspaceId)
      ))
      .orderBy(desc(crmActivities.createdAt));
  }

  async createActivity(data: InsertCrmActivity): Promise<SelectCrmActivity> {
    const [activity] = await db.insert(crmActivities).values(data).returning();
    return activity;
  }

  // ============= CRM TASKS METHODS =============

  async getTasks(workspaceId: string, filters?: any): Promise<any[]> {
    let baseQuery = db.select({
      task: crmTasks,
      customerName: crmCustomers.name,
    }).from(crmTasks)
      .leftJoin(crmCustomers, eq(crmTasks.customerId, crmCustomers.id))
      .where(eq(crmTasks.workspaceId, workspaceId))
      .orderBy(asc(crmTasks.dueDate));
    
    return await baseQuery;
  }

  async getUpcomingTasks(workspaceId: string): Promise<SelectCrmTask[]> {
    const now = Date.now();
    return await db.select().from(crmTasks)
      .where(and(
        eq(crmTasks.workspaceId, workspaceId),
        eq(crmTasks.status, 'pending'),
        gte(crmTasks.dueDate, now)
      ))
      .orderBy(asc(crmTasks.dueDate));
  }

  async getOverdueTasks(workspaceId: string): Promise<SelectCrmTask[]> {
    const now = Date.now();
    return await db.select().from(crmTasks)
      .where(and(
        eq(crmTasks.workspaceId, workspaceId),
        eq(crmTasks.status, 'pending'),
        lt(crmTasks.dueDate, now)
      ))
      .orderBy(asc(crmTasks.dueDate));
  }

  async createTask(data: InsertCrmTask): Promise<SelectCrmTask> {
    const [task] = await db.insert(crmTasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, workspaceId: string, updates: Partial<InsertCrmTask>): Promise<SelectCrmTask | null> {
    const [updated] = await db.update(crmTasks)
      .set({ ...updates, updatedAt: Date.now() })
      .where(and(
        eq(crmTasks.id, id),
        eq(crmTasks.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }

  async completeTask(id: number, workspaceId: string): Promise<SelectCrmTask | null> {
    return await this.updateTask(id, workspaceId, {
      status: 'completed',
      completedAt: Date.now(),
    });
  }

  // ============= CONTAINER QR TRACKING METHODS =============

  async generateContainerQRCode(containerId: string, workspaceId: string): Promise<SelectBrewContainer | null> {
    const qrCode = `C-${workspaceId.slice(0, 8)}-${containerId.slice(0, 8)}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const [updated] = await db.update(brewContainers)
      .set({ qrCode, updatedAt: Date.now() })
      .where(and(
        eq(brewContainers.id, containerId),
        eq(brewContainers.workspaceId, workspaceId)
      ))
      .returning();
    return updated || null;
  }

  async getContainerByQRCode(qrCode: string): Promise<SelectBrewContainer | null> {
    const [container] = await db.select().from(brewContainers)
      .where(eq(brewContainers.qrCode, qrCode));
    return container || null;
  }

  async logContainerMovement(data: InsertBrewContainerMovement): Promise<SelectBrewContainerMovement> {
    const [movement] = await db.insert(brewContainerMovements).values(data).returning();
    return movement;
  }

  async getContainerMovements(containerId: string, workspaceId: string): Promise<any[]> {
    return await db.select({
      movement: brewContainerMovements,
      customerName: crmCustomers.name,
    }).from(brewContainerMovements)
      .leftJoin(crmCustomers, eq(brewContainerMovements.customerId, crmCustomers.id))
      .where(and(
        eq(brewContainerMovements.containerId, containerId),
        eq(brewContainerMovements.workspaceId, workspaceId)
      ))
      .orderBy(desc(brewContainerMovements.scannedAt));
  }

  async getContainersWithCustomer(customerId: string, workspaceId: string): Promise<any[]> {
    // Get containers that have been dispatched to this customer and not yet returned
    const movements = await db.select({
      containerId: brewContainerMovements.containerId,
      movementType: brewContainerMovements.movementType,
      scannedAt: brewContainerMovements.scannedAt,
    }).from(brewContainerMovements)
      .where(and(
        eq(brewContainerMovements.customerId, customerId),
        eq(brewContainerMovements.workspaceId, workspaceId)
      ))
      .orderBy(desc(brewContainerMovements.scannedAt));
    
    // Filter to only show containers currently with customer (dispatched but not returned)
    const containerIds = new Set<string>();
    const dispatchedContainers = new Set<string>();
    
    for (const m of movements) {
      if (m.movementType === 'dispatched') {
        dispatchedContainers.add(m.containerId);
      } else if (m.movementType === 'returned') {
        dispatchedContainers.delete(m.containerId);
      }
    }
    
    if (dispatchedContainers.size === 0) return [];
    
    // Get container details
    const containers = await db.select().from(brewContainers)
      .where(and(
        eq(brewContainers.workspaceId, workspaceId),
        sql`${brewContainers.id} = ANY(${Array.from(dispatchedContainers)})`
      ));
    
    return containers;
  }

  // ============= DASHBOARD & REPORTING METHODS =============

  async getDashboardKPIs(workspaceId: string): Promise<any> {
    const now = Date.now();
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000);
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    const firstOfMonthMs = firstOfMonth.getTime();

    // Total customers
    const [customerCount] = await db.select({ count: sql`COUNT(*)` })
      .from(crmCustomers)
      .where(eq(crmCustomers.workspaceId, workspaceId));

    // Active customers (ordered in last 90 days)
    const [activeCustomers] = await db.select({ count: sql`COUNT(DISTINCT ${crmOrders.customerId})` })
      .from(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        gte(crmOrders.orderDate, ninetyDaysAgo)
      ));

    // Orders this month
    const [ordersThisMonth] = await db.select({ count: sql`COUNT(*)` })
      .from(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        gte(crmOrders.orderDate, firstOfMonthMs)
      ));

    // Revenue this month
    const [revenueThisMonth] = await db.select({ total: sql`COALESCE(SUM(${crmOrders.totalIncVat}), 0)` })
      .from(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        gte(crmOrders.orderDate, firstOfMonthMs)
      ));

    // Pending orders
    const [pendingOrders] = await db.select({ count: sql`COUNT(*)` })
      .from(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        eq(crmOrders.status, 'pending')
      ));

    // Overdue tasks
    const [overdueTasks] = await db.select({ count: sql`COUNT(*)` })
      .from(crmTasks)
      .where(and(
        eq(crmTasks.workspaceId, workspaceId),
        eq(crmTasks.status, 'pending'),
        lt(crmTasks.dueDate, now)
      ));

    return {
      totalCustomers: Number(customerCount?.count) || 0,
      activeCustomers: Number(activeCustomers?.count) || 0,
      ordersThisMonth: Number(ordersThisMonth?.count) || 0,
      revenueThisMonth: Number(revenueThisMonth?.total) || 0,
      pendingOrders: Number(pendingOrders?.count) || 0,
      overdueTasks: Number(overdueTasks?.count) || 0,
    };
  }

  async getRevenueByMonth(workspaceId: string, months: number = 12): Promise<any[]> {
    const cutoff = Date.now() - (months * 30 * 24 * 60 * 60 * 1000);
    
    const results = await db.select({
      orderDate: crmOrders.orderDate,
      total: crmOrders.totalIncVat,
    }).from(crmOrders)
      .where(and(
        eq(crmOrders.workspaceId, workspaceId),
        gte(crmOrders.orderDate, cutoff)
      ))
      .orderBy(asc(crmOrders.orderDate));
    
    // Group by month in JS
    const byMonth = new Map<string, { revenue: number; orderCount: number }>();
    
    for (const r of results) {
      const date = new Date(r.orderDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const existing = byMonth.get(monthKey) || { revenue: 0, orderCount: 0 };
      existing.revenue += Number(r.total) || 0;
      existing.orderCount += 1;
      byMonth.set(monthKey, existing);
    }
    
    return Array.from(byMonth.entries()).map(([month, data]) => ({
      month,
      revenue: data.revenue,
      orderCount: data.orderCount,
    }));
  }

  async getTopCustomersByRevenue(workspaceId: string, limit: number = 10): Promise<any[]> {
    const results = await db.select({
      customerId: crmOrders.customerId,
      customerName: crmCustomers.name,
      total: crmOrders.totalIncVat,
    }).from(crmOrders)
      .innerJoin(crmCustomers, eq(crmOrders.customerId, crmCustomers.id))
      .where(eq(crmOrders.workspaceId, workspaceId));
    
    // Aggregate in JS
    const byCustomer = new Map<string, { customerId: string; customerName: string; totalRevenue: number; orderCount: number }>();
    
    for (const r of results) {
      const existing = byCustomer.get(r.customerId!) || {
        customerId: r.customerId!,
        customerName: r.customerName,
        totalRevenue: 0,
        orderCount: 0,
      };
      existing.totalRevenue += Number(r.total) || 0;
      existing.orderCount += 1;
      byCustomer.set(r.customerId!, existing);
    }
    
    return Array.from(byCustomer.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  async getTopProductsBySales(workspaceId: string, limit: number = 10): Promise<any[]> {
    const results = await db.select({
      productId: crmOrderLines.productId,
      productName: crmProducts.name,
      quantity: crmOrderLines.quantity,
      unitPrice: crmOrderLines.unitPriceExVat,
    }).from(crmOrderLines)
      .innerJoin(crmProducts, eq(crmOrderLines.productId, crmProducts.id))
      .where(eq(crmOrderLines.workspaceId, workspaceId));
    
    // Aggregate in JS
    const byProduct = new Map<string, { productId: string; productName: string | null; totalQuantity: number; totalRevenue: number }>();
    
    for (const r of results) {
      const existing = byProduct.get(r.productId!) || {
        productId: r.productId!,
        productName: r.productName,
        totalQuantity: 0,
        totalRevenue: 0,
      };
      existing.totalQuantity += Number(r.quantity) || 0;
      existing.totalRevenue += (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
      byProduct.set(r.productId!, existing);
    }
    
    return Array.from(byProduct.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  // ============================================
  // XERO CONNECTIONS METHODS
  // ============================================

  async getXeroConnection(workspaceId: string): Promise<SelectXeroConnection | null> {
    const [connection] = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.workspaceId, workspaceId));
    return connection || null;
  }

  async createXeroConnection(data: InsertXeroConnection): Promise<SelectXeroConnection> {
    const [connection] = await db
      .insert(xeroConnections)
      .values(data)
      .returning();
    return connection;
  }

  async updateXeroConnection(workspaceId: string, data: Partial<InsertXeroConnection>): Promise<SelectXeroConnection | null> {
    const [updated] = await db
      .update(xeroConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(xeroConnections.workspaceId, workspaceId))
      .returning();
    return updated || null;
  }

  async updateXeroTokens(workspaceId: string, accessToken: string, refreshToken: string, expiresAt: Date): Promise<SelectXeroConnection | null> {
    return await this.updateXeroConnection(workspaceId, {
      accessToken,
      refreshToken,
      tokenExpiresAt: expiresAt,
    });
  }

  async disconnectXero(workspaceId: string): Promise<SelectXeroConnection | null> {
    return await this.updateXeroConnection(workspaceId, {
      isConnected: false,
    });
  }

  // ============================================
  // XERO IMPORT JOBS METHODS
  // ============================================

  async createXeroImportJob(data: InsertXeroImportJob): Promise<SelectXeroImportJob> {
    const [job] = await db
      .insert(xeroImportJobs)
      .values(data)
      .returning();
    return job;
  }

  async getXeroImportJob(jobId: number, workspaceId: string): Promise<SelectXeroImportJob | null> {
    const [job] = await db
      .select()
      .from(xeroImportJobs)
      .where(
        and(
          eq(xeroImportJobs.id, jobId),
          eq(xeroImportJobs.workspaceId, workspaceId)
        )
      );
    return job || null;
  }

  async updateXeroImportJob(jobId: number, workspaceId: string, data: Partial<SelectXeroImportJob>): Promise<SelectXeroImportJob | null> {
    const [updated] = await db
      .update(xeroImportJobs)
      .set(data)
      .where(
        and(
          eq(xeroImportJobs.id, jobId),
          eq(xeroImportJobs.workspaceId, workspaceId)
        )
      )
      .returning();
    return updated || null;
  }

  async getRecentXeroImportJobs(workspaceId: string, limit: number = 10): Promise<SelectXeroImportJob[]> {
    return await db
      .select()
      .from(xeroImportJobs)
      .where(eq(xeroImportJobs.workspaceId, workspaceId))
      .orderBy(desc(xeroImportJobs.createdAt))
      .limit(limit);
  }

  // ============================================
  // CUSTOMER XERO LOOKUPS
  // ============================================

  async getCustomerByXeroContactId(xeroContactId: string, workspaceId: string): Promise<SelectCrmCustomer | null> {
    const [customer] = await db
      .select()
      .from(crmCustomers)
      .where(
        and(
          eq(crmCustomers.xeroContactId, xeroContactId),
          eq(crmCustomers.workspaceId, workspaceId)
        )
      );
    return customer || null;
  }

  async getCustomersWithoutXeroId(workspaceId: string): Promise<SelectCrmCustomer[]> {
    return await db
      .select()
      .from(crmCustomers)
      .where(
        and(
          eq(crmCustomers.workspaceId, workspaceId),
          isNull(crmCustomers.xeroContactId)
        )
      );
  }

  // ============================================
  // XERO WEBHOOK EVENTS METHODS
  // ============================================

  async createWebhookEvent(event: InsertXeroWebhookEvent): Promise<SelectXeroWebhookEvent> {
    const [created] = await db
      .insert(xeroWebhookEvents)
      .values(event)
      .returning();
    return created;
  }

  async getWebhookEvent(eventId: string): Promise<SelectXeroWebhookEvent | null> {
    const [event] = await db
      .select()
      .from(xeroWebhookEvents)
      .where(eq(xeroWebhookEvents.eventId, eventId));
    return event || null;
  }

  async markWebhookProcessed(eventId: string, error?: string): Promise<void> {
    await db
      .update(xeroWebhookEvents)
      .set({
        processed: true,
        processedAt: new Date(),
        errorMessage: error || null,
      })
      .where(eq(xeroWebhookEvents.eventId, eventId));
  }

  async getXeroConnectionByTenantId(tenantId: string): Promise<SelectXeroConnection | null> {
    const [connection] = await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.tenantId, tenantId));
    return connection || null;
  }

  async getAllActiveXeroConnections(): Promise<SelectXeroConnection[]> {
    return await db
      .select()
      .from(xeroConnections)
      .where(eq(xeroConnections.isConnected, true));
  }

  // ============================================
  // XERO SYNC QUEUE METHODS
  // ============================================

  async addToSyncQueue(item: {
    workspaceId: string;
    entityType: string;
    entityId: string;
    action: string;
  }): Promise<SelectXeroSyncQueue> {
    const [created] = await db
      .insert(xeroSyncQueue)
      .values({
        ...item,
        nextRetryAt: new Date(),
      })
      .returning();
    return created;
  }

  async getPendingSyncItems(): Promise<SelectXeroSyncQueue[]> {
    return await db
      .select()
      .from(xeroSyncQueue)
      .where(
        and(
          isNull(xeroSyncQueue.processedAt),
          or(
            isNull(xeroSyncQueue.nextRetryAt),
            lte(xeroSyncQueue.nextRetryAt, new Date())
          ),
          lt(xeroSyncQueue.retryCount, sql`${xeroSyncQueue.maxRetries}`)
        )
      )
      .orderBy(asc(xeroSyncQueue.createdAt));
  }

  async markSyncItemProcessed(id: number): Promise<void> {
    await db
      .update(xeroSyncQueue)
      .set({ processedAt: new Date() })
      .where(eq(xeroSyncQueue.id, id));
  }

  async incrementSyncRetry(id: number, error: string): Promise<void> {
    const [item] = await db
      .select()
      .from(xeroSyncQueue)
      .where(eq(xeroSyncQueue.id, id));

    if (!item) return;

    const nextRetryAt = new Date();
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + Math.pow(2, (item.retryCount || 0) + 1));

    await db
      .update(xeroSyncQueue)
      .set({
        retryCount: (item.retryCount || 0) + 1,
        lastError: error,
        nextRetryAt,
      })
      .where(eq(xeroSyncQueue.id, id));
  }

  async getSyncQueue(workspaceId: string): Promise<SelectXeroSyncQueue[]> {
    return await db
      .select()
      .from(xeroSyncQueue)
      .where(eq(xeroSyncQueue.workspaceId, workspaceId))
      .orderBy(desc(xeroSyncQueue.createdAt));
  }

  // ============================================
  // SYNC STATUS UPDATES
  // ============================================

  async updateOrderSyncStatus(
    orderId: string,
    workspaceId: string,
    status: 'synced' | 'pending' | 'failed',
    error?: string
  ): Promise<void> {
    const updates: any = {
      syncStatus: status,
      lastSyncError: error || null,
    };
    if (status === 'synced') {
      updates.lastXeroSyncAt = new Date();
    }
    await db
      .update(crmOrders)
      .set(updates)
      .where(
        and(
          eq(crmOrders.id, orderId),
          eq(crmOrders.workspaceId, workspaceId)
        )
      );
  }

  async updateCustomerSyncStatus(
    customerId: string,
    workspaceId: string,
    status: 'synced' | 'pending' | 'failed',
    error?: string
  ): Promise<void> {
    const updates: any = {
      xeroSyncStatus: status,
      lastSyncError: error || null,
    };
    if (status === 'synced') {
      updates.lastXeroSyncAt = new Date();
    }
    await db
      .update(crmCustomers)
      .set(updates)
      .where(
        and(
          eq(crmCustomers.id, customerId),
          eq(crmCustomers.workspaceId, workspaceId)
        )
      );
  }

  async updateProductSyncStatus(
    productId: string,
    workspaceId: string,
    status: 'synced' | 'pending' | 'failed',
    error?: string
  ): Promise<void> {
    const updates: any = {
      syncStatus: status,
      lastSyncError: error || null,
    };
    if (status === 'synced') {
      updates.lastXeroSyncAt = new Date();
    }
    await db
      .update(crmProducts)
      .set(updates)
      .where(
        and(
          eq(crmProducts.id, productId),
          eq(crmProducts.workspaceId, workspaceId)
        )
      );
  }

  // ============================================
  // ROUTE PLANNER - Delivery Bases
  // ============================================

  async listDeliveryBases(workspaceId: string): Promise<SelectDeliveryBase[]> {
    return await db
      .select()
      .from(deliveryBases)
      .where(
        and(
          eq(deliveryBases.workspaceId, workspaceId),
          eq(deliveryBases.isActive, true)
        )
      )
      .orderBy(desc(deliveryBases.isDefault), asc(deliveryBases.name));
  }

  async getDeliveryBase(id: number): Promise<SelectDeliveryBase | null> {
    const results = await db
      .select()
      .from(deliveryBases)
      .where(eq(deliveryBases.id, id))
      .limit(1);
    return results[0] || null;
  }

  async getDefaultDeliveryBase(workspaceId: string): Promise<SelectDeliveryBase | null> {
    const results = await db
      .select()
      .from(deliveryBases)
      .where(
        and(
          eq(deliveryBases.workspaceId, workspaceId),
          eq(deliveryBases.isDefault, true),
          eq(deliveryBases.isActive, true)
        )
      )
      .limit(1);
    return results[0] || null;
  }

  async insertDeliveryBase(base: InsertDeliveryBase): Promise<SelectDeliveryBase> {
    // If setting as default, unset other defaults first
    if (base.isDefault) {
      await db
        .update(deliveryBases)
        .set({ isDefault: false })
        .where(eq(deliveryBases.workspaceId, base.workspaceId));
    }
    
    const results = await db
      .insert(deliveryBases)
      .values(base)
      .returning();
    return results[0];
  }

  async updateDeliveryBase(
    id: number,
    updates: Partial<SelectDeliveryBase>
  ): Promise<SelectDeliveryBase | null> {
    // If setting as default, unset other defaults first
    if (updates.isDefault) {
      const existing = await this.getDeliveryBase(id);
      if (existing) {
        await db
          .update(deliveryBases)
          .set({ isDefault: false })
          .where(eq(deliveryBases.workspaceId, existing.workspaceId));
      }
    }
    
    const results = await db
      .update(deliveryBases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(deliveryBases.id, id))
      .returning();
    return results[0] || null;
  }

  async deleteDeliveryBase(id: number): Promise<void> {
    // Soft delete - just mark as inactive
    await db
      .update(deliveryBases)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(deliveryBases.id, id));
  }

  // ============================================
  // ROUTE PLANNER - Delivery Routes
  // ============================================

  async listDeliveryRoutes(workspaceId: string): Promise<SelectDeliveryRoute[]> {
    return await db
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.workspaceId, workspaceId))
      .orderBy(desc(deliveryRoutes.deliveryDate));
  }

  async getDeliveryRoute(id: string): Promise<SelectDeliveryRoute | null> {
    const results = await db
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.id, id))
      .limit(1);
    return results[0] || null;
  }

  async insertDeliveryRoute(route: InsertDeliveryRoute): Promise<SelectDeliveryRoute> {
    const results = await db
      .insert(deliveryRoutes)
      .values(route)
      .returning();
    return results[0];
  }

  async updateDeliveryRoute(
    id: string,
    updates: Partial<SelectDeliveryRoute>
  ): Promise<SelectDeliveryRoute> {
    const results = await db
      .update(deliveryRoutes)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(deliveryRoutes.id, id))
      .returning();
    return results[0];
  }

  async deleteDeliveryRoute(id: string): Promise<void> {
    await db
      .delete(deliveryRoutes)
      .where(eq(deliveryRoutes.id, id));
  }

  async listDeliveryRoutesByDate(
    workspaceId: string,
    startDate: number,
    endDate: number
  ): Promise<SelectDeliveryRoute[]> {
    return await db
      .select()
      .from(deliveryRoutes)
      .where(
        and(
          eq(deliveryRoutes.workspaceId, workspaceId),
          gte(deliveryRoutes.deliveryDate, startDate),
          lte(deliveryRoutes.deliveryDate, endDate)
        )
      )
      .orderBy(asc(deliveryRoutes.deliveryDate));
  }

  async listDeliveryRoutesByStatus(
    workspaceId: string,
    status: string
  ): Promise<SelectDeliveryRoute[]> {
    return await db
      .select()
      .from(deliveryRoutes)
      .where(
        and(
          eq(deliveryRoutes.workspaceId, workspaceId),
          eq(deliveryRoutes.status, status)
        )
      )
      .orderBy(desc(deliveryRoutes.deliveryDate));
  }

  async listDeliveryRoutesByDriver(
    workspaceId: string,
    driverId: string
  ): Promise<SelectDeliveryRoute[]> {
    return await db
      .select()
      .from(deliveryRoutes)
      .where(
        and(
          eq(deliveryRoutes.workspaceId, workspaceId),
          eq(deliveryRoutes.driverId, driverId)
        )
      )
      .orderBy(desc(deliveryRoutes.deliveryDate));
  }

  // ============================================
  // ROUTE PLANNER - Route Stops
  // ============================================

  async listRouteStops(routeId: string): Promise<SelectRouteStop[]> {
    return await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.routeId, routeId))
      .orderBy(asc(routeStops.sequenceNumber));
  }

  async getRouteStop(id: string): Promise<SelectRouteStop | null> {
    const results = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.id, id))
      .limit(1);
    return results[0] || null;
  }

  async insertRouteStop(stop: InsertRouteStop): Promise<SelectRouteStop> {
    const results = await db
      .insert(routeStops)
      .values(stop)
      .returning();
    return results[0];
  }

  async updateRouteStop(
    id: string,
    updates: Partial<SelectRouteStop>
  ): Promise<SelectRouteStop> {
    const results = await db
      .update(routeStops)
      .set({ ...updates, updatedAt: Date.now() })
      .where(eq(routeStops.id, id))
      .returning();
    return results[0];
  }

  async deleteRouteStop(id: string): Promise<void> {
    await db
      .delete(routeStops)
      .where(eq(routeStops.id, id));
  }

  async listRouteStopsByStatus(
    routeId: string,
    status: string
  ): Promise<SelectRouteStop[]> {
    return await db
      .select()
      .from(routeStops)
      .where(
        and(
          eq(routeStops.routeId, routeId),
          eq(routeStops.status, status)
        )
      )
      .orderBy(asc(routeStops.sequenceNumber));
  }

  async listRouteStopsByOrder(orderId: string): Promise<SelectRouteStop[]> {
    return await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.orderId, orderId))
      .orderBy(asc(routeStops.sequenceNumber));
  }

  async listRouteStopsByCustomer(customerId: string): Promise<SelectRouteStop[]> {
    return await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.customerId, customerId))
      .orderBy(desc(routeStops.createdAt));
  }

  // ============================================
  // ROUTE PLANNER - Optimization Results
  // ============================================

  async listOptimizationResults(routeId: string): Promise<SelectRouteOptimizationResult[]> {
    return await db
      .select()
      .from(routeOptimizationResults)
      .where(eq(routeOptimizationResults.routeId, routeId))
      .orderBy(desc(routeOptimizationResults.createdAt));
  }

  async getOptimizationResult(id: string): Promise<SelectRouteOptimizationResult | null> {
    const results = await db
      .select()
      .from(routeOptimizationResults)
      .where(eq(routeOptimizationResults.id, id))
      .limit(1);
    return results[0] || null;
  }

  async insertOptimizationResult(
    result: InsertRouteOptimizationResult
  ): Promise<SelectRouteOptimizationResult> {
    const results = await db
      .insert(routeOptimizationResults)
      .values(result)
      .returning();
    return results[0];
  }

  async listOptimizationResultsByWorkspace(
    workspaceId: string
  ): Promise<SelectRouteOptimizationResult[]> {
    return await db
      .select()
      .from(routeOptimizationResults)
      .where(eq(routeOptimizationResults.workspaceId, workspaceId))
      .orderBy(desc(routeOptimizationResults.createdAt))
      .limit(50);
  }

  // ============================================
  // AFR (Agent Flight Recorder)
  // ============================================

  async listAfrRuleUpdates(limit: number = 200): Promise<SelectAfrRuleUpdate[]> {
    return await db
      .select()
      .from(afrRuleUpdates)
      .orderBy(desc(afrRuleUpdates.createdAt))
      .limit(limit);
  }

  async getAfrRuleUpdate(id: string): Promise<SelectAfrRuleUpdate | null> {
    const results = await db
      .select()
      .from(afrRuleUpdates)
      .where(eq(afrRuleUpdates.id, id))
      .limit(1);
    return results[0] || null;
  }

  async getAfrRuleUpdatesByEvidenceRunId(runId: string): Promise<SelectAfrRuleUpdate[]> {
    try {
      return await db
        .select()
        .from(afrRuleUpdates)
        .where(sql`${afrRuleUpdates.evidenceRunIds} @> ARRAY[${runId}]::text[]`)
        .orderBy(desc(afrRuleUpdates.createdAt));
    } catch (error: any) {
      // Table may not exist in dev database (migrated to Supabase)
      if (error?.cause?.code === '42P01') {
        console.log('[AFR] afr_rule_updates table not found - returning empty array');
        return [];
      }
      throw error;
    }
  }

  async listDeepResearchRunsForAfr(limit: number = 200): Promise<SelectDeepResearchRun[]> {
    return await db
      .select()
      .from(deepResearchRuns)
      .orderBy(desc(deepResearchRuns.createdAt))
      .limit(limit);
  }
}

export const storage = new DbStorage();
