/**
 * SUP-002: LeadGen Plan Execution System
 * 
 * ARCHITECTURE DECISION (Phase 3):
 * ================================
 * Plans are executed LOCALLY in the UI backend for simplicity and reliability.
 * 
 * Flow:
 * 1. User approves plan in UI → POST /api/plan/approve
 * 2. UI backend executes steps via this executor
 * 3. Progress is tracked in-memory and synced to plan status in database
 * 4. Results are logged to Tower for analytics (if TOWER_URL configured)
 * 
 * Why local execution (not via Supervisor)?
 * - Simpler debugging (single codebase)
 * - No network latency between services
 * - Supervisor focuses on background tasks (monitors, signals)
 * 
 * The Supervisor CAN execute plans via its own executor for:
 * - Background/scheduled plan execution
 * - Plans triggered by signals/monitors
 * 
 * Both executors log to Tower for unified analytics.
 */

import type { LeadGenPlan, LeadGenStep } from './leadgen-plan.js';
import { logRunToTower, startRunLog, completeRunLog, logPlanExecutionToTower } from './lib/towerClient.js';
import { logPlanEvent } from './lib/activity-logger.js';
import { persistLeadsToSupabase, type LeadToUpsert } from './supabase-client.js';
import { updateStepProgress, updatePlanStatus as persistPlanStatus, getPlanExecutionStatus } from './leadgen-plan.js';
import { isDemoMode } from './demo-config.js';
import { 
  debugOnExecutionStart, 
  debugOnStepProgress, 
  debugOnLeadsPersisted, 
  debugOnExecutionComplete, 
  debugOnExecutionFailure 
} from './debugState.js';

export interface StepProgress {
  stepId: string;
  stepIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  resultSummary?: string;
}

export interface PlanExecution {
  planId: string;
  sessionId: string;
  conversationId?: string;
  goal: string;
  steps: LeadGenStep[];
  currentStepIndex: number;
  stepProgress: StepProgress[];
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// In-memory execution state
const executions = new Map<string, PlanExecution>();

/**
 * Start executing an approved plan
 */
export async function startPlanExecution(plan: LeadGenPlan): Promise<PlanExecution> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [PLAN_EXEC] Starting execution for plan ${plan.id}`);
  console.log(`   Goal: ${plan.goal}`);
  console.log(`   Steps: ${plan.steps.map(s => s.type).join(' → ')}`);
  console.log(`   UserId: ${plan.userId}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const startTime = Date.now();
  
  // Initialize execution state
  const execution: PlanExecution = {
    planId: plan.id,
    sessionId: plan.sessionId,
    conversationId: plan.conversationId,
    goal: plan.goal,
    steps: plan.steps,
    currentStepIndex: 0,
    stepProgress: plan.steps.map((step, index) => ({
      stepId: step.id,
      stepIndex: index,
      status: 'pending' as const
    })),
    status: 'executing',
    startedAt: new Date().toISOString()
  };
  
  executions.set(plan.id, execution);
  
  // Update debug state
  debugOnExecutionStart(plan.id);
  
  // Log to AFR (non-blocking)
  logPlanEvent({
    userId: plan.userId,
    planId: plan.id,
    status: 'started',
    label: `Plan execution started: ${plan.goal.substring(0, 80)}`,
    metadata: { stepCount: plan.steps.length }
  }).catch(err => console.warn('[AFR] Plan execution log failed:', err.message));
  
  // Log plan start to Tower (non-blocking)
  logPlanExecutionToTower({
    planId: plan.id,
    userId: plan.userId,
    userEmail: '', // Will be filled by Tower from userId lookup
    goal: plan.goal,
    status: 'started',
    steps: plan.steps.map(s => ({ id: s.id, label: s.label, status: 'pending' })),
    startedAt: startTime,
  }).catch(err => console.warn('Tower plan start log failed:', err.message));
  
  // Start background execution
  executeStepsInBackground(execution, startTime).catch(error => {
    console.error(`❌ Plan execution failed for ${plan.id}:`, error);
    execution.status = 'failed';
    execution.error = error.message;
    execution.completedAt = new Date().toISOString();
  });
  
  return execution;
}

/**
 * Background executor that processes steps sequentially
 */
async function executeStepsInBackground(execution: PlanExecution, startTime: number = Date.now()): Promise<void> {
  console.log(`⚙️ Background executor started for plan ${execution.planId}`);
  
  // Import updatePlanStatus to persist state back to leadgen-plan
  const { updatePlanStatus, getPlanById } = await import('./leadgen-plan.js');
  
  // Get plan for userId (needed for Tower logging)
  const plan = await getPlanById(execution.planId);
  
  for (let i = 0; i < execution.steps.length; i++) {
    const step = execution.steps[i];
    const progress = execution.stepProgress[i];
    
    // Update step status to running (in memory + DB)
    progress.status = 'running';
    progress.startedAt = new Date().toISOString();
    execution.currentStepIndex = i;
    executions.set(execution.planId, execution);
    
    // Persist to database (crash-safe)
    await updateStepProgress(execution.planId, step.id, {
      stepStatus: 'running',
      startedAt: progress.startedAt,
    });
    
    console.log(`▶️ [PLAN_EXEC] Executing step ${i + 1}/${execution.steps.length}: ${step.label}`);
    
    // Update debug state for step start
    debugOnStepProgress(execution.planId, step.label, 'running');
    
    try {
      // Execute the step
      await executeStep(step, execution);
      
      // Mark step as completed (in memory + DB)
      progress.status = 'completed';
      progress.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      // Get leadsCreated from step result if available
      const leadsCreated = (execution as any).lastStepLeadsCreated;
      delete (execution as any).lastStepLeadsCreated;
      
      // Persist to database (crash-safe)
      await updateStepProgress(execution.planId, step.id, {
        stepStatus: 'completed',
        completedAt: progress.completedAt,
        resultSummary: progress.resultSummary,
        leadsCreated: leadsCreated,
      });
      
      // Update debug state for step completion
      debugOnStepProgress(execution.planId, step.label, 'completed');
      
      console.log(`✅ [PLAN_EXEC] Completed step ${i + 1}/${execution.steps.length}: ${step.label}`);
    } catch (error: any) {
      // Mark step as failed (in memory + DB)
      progress.status = 'failed';
      progress.error = error.message;
      progress.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      // Persist to database (crash-safe)
      await updateStepProgress(execution.planId, step.id, {
        stepStatus: 'failed',
        completedAt: progress.completedAt,
        error: error.message,
        resultSummary: `Failed: ${error.message}`,
      });
      
      console.error(`❌ [PLAN_EXEC] Step ${i + 1}/${execution.steps.length} failed:`, error);
      
      // Update debug state for step failure
      debugOnStepProgress(execution.planId, step.label, 'failed');
      
      // Stop execution on failure
      execution.status = 'failed';
      execution.error = `Step ${i + 1} failed: ${error.message}`;
      execution.completedAt = new Date().toISOString();
      executions.set(execution.planId, execution);
      
      // Update debug state for execution failure
      debugOnExecutionFailure(execution.planId, execution.error);
      
      // Persist failure status back to plan
      await persistPlanStatus(execution.planId, 'failed');
      
      // Log failure to Tower
      if (plan) {
        logPlanExecutionToTower({
          planId: execution.planId,
          userId: plan.userId,
          userEmail: '',
          goal: execution.goal,
          status: 'error',
          steps: execution.stepProgress.map(sp => ({
            id: sp.stepId,
            label: execution.steps[sp.stepIndex]?.label || sp.stepId,
            status: sp.status,
            error: sp.error,
          })),
          startedAt: startTime,
          completedAt: Date.now(),
          error: execution.error,
        }).catch(err => console.warn('Tower plan error log failed:', err.message));
        
        // Log failure to AFR
        logPlanEvent({
          userId: plan.userId,
          planId: execution.planId,
          status: 'failed',
          label: `Plan execution failed: ${execution.error?.substring(0, 80)}`,
          error: execution.error,
          metadata: { stepsFailed: i + 1, totalSteps: execution.steps.length }
        }).catch(err => console.warn('[AFR] Plan failure log failed:', err.message));
      }
      
      console.log(`💾 [PLAN_EXEC] Persisted failed status to plan ${execution.planId}`);
      return;
    }
  }
  
  // All steps completed
  execution.status = 'completed';
  execution.completedAt = new Date().toISOString();
  executions.set(execution.planId, execution);
  
  // Update debug state for execution completion
  debugOnExecutionComplete(execution.planId);
  
  // Persist completion status back to plan (crash-safe)
  await persistPlanStatus(execution.planId, 'completed');
  
  // Log success to Tower
  if (plan) {
    logPlanExecutionToTower({
      planId: execution.planId,
      userId: plan.userId,
      userEmail: '',
      goal: execution.goal,
      status: 'success',
      steps: execution.stepProgress.map(sp => ({
        id: sp.stepId,
        label: execution.steps[sp.stepIndex]?.label || sp.stepId,
        status: sp.status,
      })),
      startedAt: startTime,
      completedAt: Date.now(),
    }).catch(err => console.warn('Tower plan success log failed:', err.message));
    
    // Log success to AFR
    logPlanEvent({
      userId: plan.userId,
      planId: execution.planId,
      status: 'completed',
      label: `Plan execution completed: ${execution.goal.substring(0, 80)}`,
      metadata: { totalSteps: execution.steps.length, durationMs: Date.now() - startTime }
    }).catch(err => console.warn('[AFR] Plan success log failed:', err.message));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 [PLAN_EXEC] Plan ${execution.planId} COMPLETED`);
  console.log(`   Steps: ${execution.stepProgress.map(s => s.status).join(' → ')}`);
  console.log(`   Duration: ${Date.now() - startTime}ms`);
  console.log(`${'='.repeat(60)}\n`);
}

/**
 * Check if simulation mode is forced
 */
function isSimulationForced(): boolean {
  const simulate = process.env.SIMULATE_TOOLS;
  return simulate === 'true' || simulate === '1';
}

/**
 * Check if real Google Places API is available
 */
function hasGooglePlacesKey(): boolean {
  return !!(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * Default location when none is specified
 */
const DEFAULT_LOCATION = 'United Kingdom';
const DEFAULT_COUNTRY = 'GB';

/**
 * Parse search parameters from goal text
 * Examples:
 *   "find pubs in sussex" -> { query: "pubs", location: "sussex" }
 *   "search for restaurants in london" -> { query: "restaurants", location: "london" }
 */
function parseGoalForSearch(goal: string): { query: string; location: string } {
  const normalized = goal.toLowerCase().trim();
  
  // Pattern: "find/search [for] X in/near Y"
  const inMatch = normalized.match(/(?:find|search|look for|get)\s+(?:for\s+)?(.+?)\s+(?:in|near|around|at)\s+(.+)/i);
  if (inMatch) {
    return { query: inMatch[1].trim(), location: inMatch[2].trim() };
  }
  
  // Pattern: "X in Y" (simpler)
  const simpleMatch = normalized.match(/(.+?)\s+(?:in|near|around)\s+(.+)/i);
  if (simpleMatch) {
    return { query: simpleMatch[1].trim(), location: simpleMatch[2].trim() };
  }
  
  // Fallback: use entire goal as query, default location
  console.log(`  ⚠️ [PLAN_EXEC] No location found in goal, using default: ${DEFAULT_LOCATION}`);
  return { query: goal, location: DEFAULT_LOCATION };
}

/**
 * Validate search parameters before calling Places API
 * Throws a controlled error if invalid
 */
function validateSearchParams(query: string, location: string): void {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query is empty. Please provide a specific search term (e.g., "pubs", "restaurants", "cafes")');
  }
  
  if (query.trim().length < 2) {
    throw new Error(`Search query "${query}" is too short. Please provide a more specific term.`);
  }
  
  // Remove common stop words that don't help the search
  const stopWords = ['find', 'search', 'look', 'get', 'for', 'the', 'a', 'an'];
  const cleanedQuery = query.split(' ').filter(w => !stopWords.includes(w.toLowerCase())).join(' ');
  
  if (cleanedQuery.trim().length === 0) {
    throw new Error('Search query contains only common words. Please include a business type (e.g., "pubs", "restaurants")');
  }
}

/**
 * Execute a single step using the action registry
 */
async function executeStep(step: LeadGenStep, execution: PlanExecution): Promise<void> {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ▶️ [STEP] Executing step: ${step.label} (type: ${step.type})`);
  console.log(`     Plan: ${execution.planId}`);
  console.log(`     Goal: ${execution.goal}`);
  console.log(`${'─'.repeat(50)}`);
  
  // Check simulation mode
  if (isSimulationForced()) {
    console.log(`  ⚠️ SIMULATE_TOOLS=true — forcing simulation mode`);
    return executeSimulatedStep(step, execution);
  }
  
  // Check if Google Places API key is available
  const hasPlacesKey = hasGooglePlacesKey();
  console.log(`  🔑 GOOGLE_PLACES_API_KEY: ${hasPlacesKey ? 'PRESENT' : 'MISSING'}`);
  
  // Get the plan to access toolMetadata
  const { getPlanById } = await import('./leadgen-plan.js');
  const plan = await getPlanById(execution.planId);
  console.log(`  📋 Plan toolMetadata: ${plan?.toolMetadata ? 'PRESENT (' + plan.toolMetadata.toolName + ')' : 'NONE'}`);
  
  // If the plan has tool metadata, execute the real action
  if (plan?.toolMetadata) {
    console.log(`  🔧 Using tool metadata for real execution: ${plan.toolMetadata.toolName}`);
    
    // Import the action execution system
    const { executeAction } = await import('./lib/actions.js');
    
    // Map tool names to action types and execute
    const { toolName, toolArgs, userId } = plan.toolMetadata;
    
    try {
      switch (toolName) {
        case 'SEARCH_PLACES':
        case 'search_wyshbone_database':
        case 'bubble_run_batch': {
          // Build query from available fields
          const searchQuery = toolArgs.query || toolArgs.business_types?.join(' ') || '';
          const searchLocation = toolArgs.location || toolArgs.region || DEFAULT_LOCATION;
          const searchCountry = toolArgs.country || DEFAULT_COUNTRY;
          
          // Validate search parameters
          validateSearchParams(searchQuery, searchLocation);
          
          console.log(`📍 [PLAN_EXEC] Executing search: query="${searchQuery}", location="${searchLocation}"`);
          console.log(`  📍 GOOGLE_PLACES: REAL search (via action registry)`);
          
          const result = await executeAction({
            action: 'SEARCH_PLACES',
            params: {
              query: searchQuery,
              locationText: searchLocation,
              country: searchCountry,
              maxResults: 30
            },
            userId,
          });
          
          console.log(`  📍 Action result: ok=${result.ok}, places=${result.data?.places?.length || 0}, error=${result.error || 'none'}`);
          
          if (!result.ok) {
            throw new Error(result.error || 'Search failed');
          }
          
          const places = result.data?.places || [];
          console.log(`📍 [PLAN_EXEC] Found ${places.length} businesses`);
          
          // Persist leads to Supabase
          if (places.length > 0) {
            const leadsToUpsert: LeadToUpsert[] = places.map((place: any) => ({
              place_id: place.place_id || place.placeId,
              business_name: place.name || place.displayName?.text || 'Unknown Business',
              location: place.formatted_address || place.formattedAddress || place.address || toolArgs.location || '',
              source: 'plan',
              status: 'new',
              website: place.website || place.websiteUri,
              phone: place.formatted_phone_number || place.nationalPhoneNumber || place.phone,
              user_id: userId,
            }));
            
            console.log(`💾 [PLAN_EXEC] Persisting ${leadsToUpsert.length} leads to Supabase...`);
            
            const persistResult = await persistLeadsToSupabase(leadsToUpsert, execution.planId, userId);
            
            // Update debug state for leads persisted
            debugOnLeadsPersisted(execution.planId, persistResult.inserted);
            
            if (persistResult.errors.length > 0) {
              console.warn(`⚠️ [PLAN_EXEC] Some leads failed to persist:`, persistResult.errors.slice(0, 3));
            }
            
            const totalSaved = persistResult.inserted + persistResult.updated;
            execution.stepProgress[execution.currentStepIndex].resultSummary = 
              `Found ${places.length} businesses, saved ${persistResult.inserted} new leads`;
            
            // Store leads count for step progress persistence
            (execution as any).lastStepLeadsCreated = persistResult.inserted;
            
            // Store places in execution for downstream steps (e.g., outreach)
            (execution as any).searchResults = places;
            
            console.log(`✅ [PLAN_EXEC] Search complete: ${places.length} found, ${persistResult.inserted} new, ${persistResult.updated} updated`);
          } else {
            execution.stepProgress[execution.currentStepIndex].resultSummary = 'No businesses found matching criteria';
            console.warn(`⚠️ [PLAN_EXEC] Search returned 0 results`);
            // Don't throw error - empty results are valid, just note it
          }
          
          break;
        }
        
        case 'DEEP_RESEARCH':
        case 'deep_research': {
          // Validate required fields
          if (!toolArgs.prompt) {
            throw new Error('Missing required field: prompt');
          }
          
          // Execute deep research action
          const researchResult = await executeAction({
            action: 'DEEP_RESEARCH',
            params: {
              prompt: toolArgs.prompt,
              sourceConversationId: execution.conversationId
            },
            userId,
          });
          console.log(`  📍 Deep research result: ok=${researchResult.ok}, error=${researchResult.error || 'none'}`);
          execution.stepProgress[execution.currentStepIndex].resultSummary = researchResult.ok ? 'Deep research completed' : `Failed: ${researchResult.error}`;
          if (!researchResult.ok) throw new Error(researchResult.error || 'Deep research failed');
          break;
        }
        
        case 'BATCH_CONTACT_FINDER':
        case 'batch_contact_finder':
        case 'saleshandy_batch_call': {
          // Accept various parameter shapes: company_names/roles OR query/location
          if (!toolArgs.company_names && !toolArgs.roles && !toolArgs.query && !toolArgs.location) {
            throw new Error('Missing required fields: need company_names, roles, query, or location');
          }
          
          // Execute batch contact finder action
          const emailResult = await executeAction({
            action: 'BATCH_CONTACT_FINDER',
            params: {
              companyNames: toolArgs.company_names || [],
              roles: toolArgs.roles || [],
              query: toolArgs.query,
              location: toolArgs.location
            },
            userId,
          });
          console.log(`  📍 Email finder result: ok=${emailResult.ok}, error=${emailResult.error || 'none'}`);
          execution.stepProgress[execution.currentStepIndex].resultSummary = emailResult.ok ? 'Email contacts discovered' : `Failed: ${emailResult.error}`;
          if (!emailResult.ok) throw new Error(emailResult.error || 'Email finder failed');
          break;
        }
        
        case 'CREATE_SCHEDULED_MONITOR':
        case 'create_scheduled_monitor': {
          // Validate required fields
          if (!toolArgs.label) {
            throw new Error('Missing required field: label');
          }
          
          // Execute scheduled monitor creation
          const monitorResult = await executeAction({
            action: 'CREATE_SCHEDULED_MONITOR',
            params: {
              label: toolArgs.label,
              schedule: toolArgs.schedule || 'weekly',
              queryParams: toolArgs
            },
            userId,
          });
          console.log(`  📍 Monitor creation result: ok=${monitorResult.ok}, error=${monitorResult.error || 'none'}`);
          execution.stepProgress[execution.currentStepIndex].resultSummary = monitorResult.ok ? 'Monitor created' : `Failed: ${monitorResult.error}`;
          if (!monitorResult.ok) throw new Error(monitorResult.error || 'Monitor creation failed');
          break;
        }
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
      console.log(`  ✅ Real action executed for ${step.label}`);
      return;
    } catch (error: any) {
      console.error(`  ❌ Action execution failed:`, error.message);
      throw error; // Re-throw to be caught by step execution error handler
    }
  }
  
  // No toolMetadata - try to execute real actions for search steps if API key is available
  if (step.type === 'search' && hasGooglePlacesKey()) {
    console.log(`  🔧 [PLAN_EXEC] No tool metadata, but GOOGLE_PLACES_API_KEY present — executing REAL search`);
    console.log(`  📍 GOOGLE_PLACES: REAL search`);
    
    // Parse the goal to extract search parameters
    const { query, location } = parseGoalForSearch(execution.goal);
    console.log(`  📍 Parsed goal: query="${query}", location="${location || DEFAULT_LOCATION}"`);
    
    // Validate search parameters BEFORE calling API
    try {
      validateSearchParams(query, location);
    } catch (validationError: any) {
      // Validation failed - mark step as failed with clear error
      console.error(`  ❌ Search validation failed: ${validationError.message}`);
      execution.stepProgress[execution.currentStepIndex].resultSummary = 
        `Failed: ${validationError.message}`;
      throw validationError; // Propagate to step error handler
    }
    
    try {
      // Import and execute real search
      const { searchPlaces } = await import('./googlePlaces.js');
      
      // Use location or default
      const searchLocation = location || DEFAULT_LOCATION;
      
      const places = await searchPlaces({
        query,
        locationText: searchLocation,
        maxResults: 30,
        region: DEFAULT_COUNTRY,
      });
      
      console.log(`  📍 Found ${places.length} businesses via Google Places API`);
      
      // Persist leads to Supabase
      if (places.length > 0 && plan) {
        const leadsToUpsert: LeadToUpsert[] = places.map((place: any) => ({
          place_id: place.placeId || place.id,
          business_name: place.name || 'Unknown Business',
          location: place.address || searchLocation || '',
          source: 'google_places',
          status: 'new',
          website: place.website || null,
          phone: place.phone || null,
          user_id: plan.userId,
        }));
        
        console.log(`  💾 Persisting ${leadsToUpsert.length} leads to Supabase...`);
        
        const persistResult = await persistLeadsToSupabase(leadsToUpsert, execution.planId, plan.userId);
        
        // Update debug state for leads persisted
        debugOnLeadsPersisted(execution.planId, persistResult.inserted);
        
        if (persistResult.errors.length > 0) {
          console.warn(`  ⚠️ Some leads failed to persist:`, persistResult.errors.slice(0, 3));
        }
        
        execution.stepProgress[execution.currentStepIndex].resultSummary = 
          `Found ${places.length} businesses, saved ${persistResult.inserted} new leads`;
        
        // Store leads count for step progress persistence
        (execution as any).lastStepLeadsCreated = persistResult.inserted;
        
        // Store places in execution for downstream steps
        (execution as any).searchResults = places;
        
        console.log(`  ✅ Search complete: ${places.length} found, ${persistResult.inserted} new, ${persistResult.updated} updated`);
      } else {
        execution.stepProgress[execution.currentStepIndex].resultSummary = 'No businesses found matching criteria';
        console.warn(`  ⚠️ Search returned 0 results`);
      }
      
      return; // Successfully executed real search
    } catch (error: any) {
      // API error - don't fall back to simulation, propagate the error
      console.error(`  ❌ Google Places API error: ${error.message}`);
      execution.stepProgress[execution.currentStepIndex].resultSummary = 
        `Failed: Google Places API error - ${error.message}`;
      throw error; // Propagate to step error handler
    }
  }
  
  // Fallback: simulate execution
  console.log(`  ⚠️ [PLAN_EXEC] Falling back to simulation for step type: ${step.type}`);
  console.log(`     Reason: step.type=${step.type}, hasGooglePlacesKey=${hasGooglePlacesKey()}, hasToolMetadata=${!!plan?.toolMetadata}`);
  return executeSimulatedStep(step, execution);
}

/**
 * Execute a simulated step (when no API key or forced simulation)
 */
async function executeSimulatedStep(step: LeadGenStep, execution: PlanExecution): Promise<void> {
  console.log(`  ⚠️ [PLAN_EXEC] Simulating execution for step type: ${step.type}`);
  console.log(`  📍 GOOGLE_PLACES: SIMULATED (API key not available or SIMULATE_TOOLS=true)`);
  
  // FAST DEV MODE: Use minimal delays in demo/dev mode for instant feedback
  const fastMode = isDemoMode();
  
  const baseDelay = fastMode 
    ? 100 // ~100ms in dev mode
    : (step.type === 'search' ? 2000 : 
       step.type === 'enrich' ? 3000 : 
       step.type === 'outreach' ? 1500 : 2000);
  
  const delay = fastMode ? baseDelay : baseDelay + Math.random() * 1000;
  
  console.log(`  ⏱️ [PLAN_EXEC] Step ${step.label} ${fastMode ? '(FAST MODE)' : 'simulating'} (~${Math.round(delay)}ms)`);
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Update step progress with result summary
  const progress = execution.stepProgress[execution.currentStepIndex];
  
  if (step.type === 'search') {
    progress.resultSummary = `Simulated: Found businesses matching criteria (no real search executed - missing API key or SIMULATE_TOOLS=true)`;
  } else if (step.type === 'enrich') {
    progress.resultSummary = `Simulated: Discovered email contacts`;
  } else if (step.type === 'outreach') {
    progress.resultSummary = `Simulated: Generated personalized messages`;
  } else {
    progress.resultSummary = `Simulated: Completed ${step.label}`;
  }
  
  console.log(`  ✅ [PLAN_EXEC] Step ${step.label} (simulated): ${progress.resultSummary}`);
}

/**
 * Get execution state for a plan
 */
export function getPlanExecution(planId: string): PlanExecution | null {
  return executions.get(planId) || null;
}

/**
 * Get execution by session ID (returns most recent execution regardless of status)
 */
export function getExecutionBySession(sessionId: string): PlanExecution | null {
  const sessionExecutions = Array.from(executions.values())
    .filter(exec => exec.sessionId === sessionId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  
  return sessionExecutions[0] || null;
}

/**
 * Get execution by conversation ID (returns most recent execution regardless of status)
 */
export function getExecutionByConversation(conversationId: string): PlanExecution | null {
  const conversationExecutions = Array.from(executions.values())
    .filter(exec => exec.conversationId === conversationId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  
  return conversationExecutions[0] || null;
}

/**
 * Cancel a running execution
 */
export function cancelExecution(planId: string): boolean {
  const execution = executions.get(planId);
  if (!execution || execution.status !== 'executing') {
    return false;
  }
  
  execution.status = 'failed';
  execution.error = 'Execution cancelled by user';
  execution.completedAt = new Date().toISOString();
  executions.set(planId, execution);
  
  console.log(`🛑 Execution cancelled for plan ${planId}`);
  return true;
}

/**
 * Get all executions for debugging
 */
export function getAllExecutions(): PlanExecution[] {
  return Array.from(executions.values());
}
