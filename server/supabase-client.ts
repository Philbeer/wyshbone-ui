import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

let supabase: SupabaseClient | null = null;
let initialized = false;

// Lazy initialization - only check env vars when first accessed
function initializeSupabase(): void {
  if (initialized) return;
  initialized = true;

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ Supabase credentials not configured. Supervisor integration disabled.');
    console.warn('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable Supervisor.');
  } else {
    // Use service role key for backend writes (bypasses RLS)
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log('✅ Supabase Supervisor client initialized');
  }
}

function ensureSupabaseClient(): SupabaseClient {
  initializeSupabase();
  if (!supabase) {
    throw new Error('Supabase client not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabase;
}

export interface SupervisorTaskData {
  user_message: string;
  search_query?: {
    business_type?: string;
    location?: string;
    requested_count?: number;
  };
  demo?: string;
  metadata?: Record<string, any>;
}

export interface SupervisorTask {
  id: string;
  conversation_id: string;
  user_id: string;
  task_type: 'find_prospects' | 'analyze_conversation' | 'provide_insights';
  request_data: SupervisorTaskData;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  run_id?: string;
  client_request_id?: string;
  created_at: number;
}

export interface SupervisorMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  source: 'supervisor' | 'ui' | 'system';
  metadata?: {
    supervisor_task_id?: string;
    capabilities?: string[];
    lead_ids?: string[];
  };
  created_at: number;
}

export async function createSupervisorTask(
  conversationId: string,
  userId: string,
  taskType: 'find_prospects' | 'analyze_conversation' | 'provide_insights',
  requestData: SupervisorTaskData,
  options?: { runId?: string; clientRequestId?: string }
): Promise<SupervisorTask> {
  const client = ensureSupabaseClient();
  
  const task: SupervisorTask = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    user_id: userId,
    task_type: taskType,
    request_data: requestData,
    status: 'pending',
    run_id: options?.runId || undefined,
    client_request_id: options?.clientRequestId || undefined,
    created_at: Date.now(),
  };

  const { data, error } = await client
    .from('supervisor_tasks')
    .insert(task)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create Supervisor task:', error);
    throw new Error(`Failed to create Supervisor task: ${error.message}`);
  }

  // Parse BIGINT created_at from string to number (Supabase returns it as string)
  const parsedData = {
    ...data,
    created_at: typeof data.created_at === 'string' ? Number(data.created_at) : data.created_at,
  } as SupervisorTask;

  console.log('✅ Created Supervisor task:', parsedData.id);
  return parsedData;
}

export async function getSupervisorMessages(
  conversationId: string
): Promise<SupervisorMessage[]> {
  const client = ensureSupabaseClient();
  
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('source', 'supervisor')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch Supervisor messages:', error);
    throw new Error(`Failed to fetch Supervisor messages: ${error.message}`);
  }

  // Parse BIGINT created_at from string to number (Supabase returns it as string)
  const messages = (data || []).map(msg => ({
    ...msg,
    created_at: typeof msg.created_at === 'string' ? Number(msg.created_at) : msg.created_at,
  })) as SupervisorMessage[];

  return messages;
}

export async function getActiveSupervisorTask(
  conversationId: string
): Promise<SupervisorTask | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const client = ensureSupabaseClient();
  
  const { data, error } = await client
    .from('supervisor_tasks')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // No active task found is not an error
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('❌ Failed to fetch active Supervisor task:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  // Parse BIGINT created_at from string to number
  const parsedData = {
    ...data,
    created_at: typeof data.created_at === 'string' ? Number(data.created_at) : data.created_at,
  } as SupervisorTask;

  return parsedData;
}

export function isSupabaseConfigured(): boolean {
  initializeSupabase();
  return supabase !== null;
}

// ============================================
// Lead Persistence (for plan execution)
// ============================================

export interface LeadToUpsert {
  /** Google Place ID or other unique identifier */
  place_id?: string;
  /** Business name */
  business_name: string;
  /** Location/address */
  location: string;
  /** Source of the lead (e.g., 'plan', 'google_places') */
  source?: string;
  /** Status (e.g., 'new') */
  status?: string;
  /** Website domain */
  website?: string;
  /** Email if discovered */
  email?: string;
  /** Phone number */
  phone?: string;
  /** Notes */
  notes?: string;
  /** Plan ID that created this lead */
  plan_id?: string;
  /** User ID who owns this lead */
  user_id?: string;
  /** Draft outreach fields */
  draft_outreach_subject?: string;
  draft_outreach_body?: string;
  draft_outreach_persona?: string;
}

export interface PersistLeadsResult {
  success: boolean;
  inserted: number;
  updated: number;
  errors: string[];
}

/**
 * Get masked Supabase URL for logging (shows project ref only)
 */
export function getSupabaseUrlForLogging(): string {
  const url = process.env.SUPABASE_URL || '';
  if (!url) return '(not configured)';
  
  // Extract project ref from URL: https://<ref>.supabase.co
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (match) {
    return `https://${match[1]}.supabase.co`;
  }
  return url;
}

/**
 * Persist leads to Supabase with upsert logic
 * Uses place_id as dedupe key if available, otherwise business_name + location
 */
export async function persistLeadsToSupabase(
  leads: LeadToUpsert[],
  planId?: string,
  userId?: string
): Promise<PersistLeadsResult> {
  const supabaseUrl = getSupabaseUrlForLogging();
  const tableName = 'leads';
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📥 [LEAD_PERSIST] Starting lead persistence`);
  console.log(`   Supabase URL: ${supabaseUrl}`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Leads to process: ${leads.length}`);
  console.log(`   PlanId: ${planId || '(none)'}`);
  console.log(`   UserId: ${userId || '(none)'}`);
  console.log(`${'='.repeat(60)}`);
  
  if (!isSupabaseConfigured()) {
    console.error(`❌ [LEAD_PERSIST] SUPABASE NOT CONFIGURED!`);
    console.error(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? 'set' : 'NOT SET'}`);
    console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET'}`);
    return { success: false, inserted: 0, updated: 0, errors: ['Supabase not configured'] };
  }
  
  const client = ensureSupabaseClient();
  const result: PersistLeadsResult = { success: true, inserted: 0, updated: 0, errors: [] };
  
  for (const lead of leads) {
    try {
      // Build the row to insert
      const row: Record<string, any> = {
        business_name: lead.business_name,
        location: lead.location,
        source: lead.source || 'plan',
        status: lead.status || 'new',
        user_id: userId || lead.user_id,
      };
      
      // Optional fields
      if (lead.place_id) row.place_id = lead.place_id;
      if (lead.website) row.website = lead.website;
      if (lead.email) row.email = lead.email;
      if (lead.phone) row.phone = lead.phone;
      if (lead.notes) row.notes = lead.notes;
      if (planId) row.plan_id = planId;
      
      // Draft outreach fields (only if provided)
      if (lead.draft_outreach_subject) row.draft_outreach_subject = lead.draft_outreach_subject;
      if (lead.draft_outreach_body) row.draft_outreach_body = lead.draft_outreach_body;
      if (lead.draft_outreach_persona) row.draft_outreach_persona = lead.draft_outreach_persona;
      if (lead.draft_outreach_subject || lead.draft_outreach_body) {
        row.draft_outreach_generated_at = new Date().toISOString();
      }
      
      // Create dedupe key: prefer place_id, else hash of business_name + location
      const dedupeKey = lead.place_id || 
        `${lead.business_name.toLowerCase().trim()}|${lead.location.toLowerCase().trim()}`;
      
      // Check if lead already exists
      let existingLead = null;
      
      if (lead.place_id) {
        const { data } = await client
          .from('leads')
          .select('id')
          .eq('place_id', lead.place_id)
          .maybeSingle();
        existingLead = data;
      } else {
        // Fallback: check by business_name + location
        const { data } = await client
          .from('leads')
          .select('id')
          .eq('business_name', lead.business_name)
          .eq('location', lead.location)
          .maybeSingle();
        existingLead = data;
      }
      
      if (existingLead) {
        // Update existing lead (only update non-null fields, preserve existing data)
        const updateFields: Record<string, any> = {};
        if (lead.email && !row.email) updateFields.email = lead.email;
        if (lead.phone && !row.phone) updateFields.phone = lead.phone;
        if (lead.website && !row.website) updateFields.website = lead.website;
        if (lead.draft_outreach_subject) {
          updateFields.draft_outreach_subject = lead.draft_outreach_subject;
          updateFields.draft_outreach_body = lead.draft_outreach_body;
          updateFields.draft_outreach_persona = lead.draft_outreach_persona;
          updateFields.draft_outreach_generated_at = new Date().toISOString();
        }
        
        if (Object.keys(updateFields).length > 0) {
          const { data, error, status, statusText } = await client
            .from('leads')
            .update(updateFields)
            .eq('id', existingLead.id)
            .select();
          
          console.log(`   [UPDATE] ${lead.business_name}: status=${status} ${statusText}, data=${data?.length || 0} rows, error=${error?.message || 'none'}`);
          
          if (error) {
            console.error(`❌ [LEAD_PERSIST] UPDATE FAILED for ${lead.business_name}:`);
            console.error(`   Error code: ${error.code}`);
            console.error(`   Error message: ${error.message}`);
            console.error(`   Error details: ${error.details || 'none'}`);
            console.error(`   Error hint: ${error.hint || 'none'}`);
            result.errors.push(`Update failed for ${lead.business_name}: ${error.message} (code: ${error.code})`);
          } else {
            result.updated++;
          }
        }
      } else {
        // Insert new lead
        console.log(`   [INSERT] Inserting: ${lead.business_name} at ${lead.location.substring(0, 30)}...`);
        
        const { data, error, status, statusText } = await client
          .from('leads')
          .insert(row)
          .select();
        
        console.log(`   [INSERT] ${lead.business_name}: status=${status} ${statusText}, data=${data?.length || 0} rows, error=${error?.message || 'none'}`);
        
        if (error) {
          console.error(`❌ [LEAD_PERSIST] INSERT FAILED for ${lead.business_name}:`);
          console.error(`   Error code: ${error.code}`);
          console.error(`   Error message: ${error.message}`);
          console.error(`   Error details: ${error.details || 'none'}`);
          console.error(`   Error hint: ${error.hint || 'none'}`);
          console.error(`   Row data: ${JSON.stringify(row).substring(0, 200)}...`);
          result.errors.push(`Insert failed for ${lead.business_name}: ${error.message}`);
        } else {
          result.inserted++;
        }
      }
    } catch (err: any) {
      console.error(`❌ [LEAD_PERSIST] EXCEPTION persisting lead ${lead.business_name}:`);
      console.error(`   Error: ${err.message}`);
      console.error(`   Stack: ${err.stack?.substring(0, 200) || 'none'}`);
      result.errors.push(`Exception for ${lead.business_name}: ${err.message}`);
    }
  }
  
  result.success = result.errors.length === 0;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 [LEAD_PERSIST] PERSISTENCE COMPLETE`);
  console.log(`   Supabase URL: ${supabaseUrl}`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated: ${result.updated}`);
  console.log(`   Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log(`   First 3 errors:`);
    result.errors.slice(0, 3).forEach((e, i) => console.log(`     ${i + 1}. ${e}`));
  }
  console.log(`   Success: ${result.success}`);
  console.log(`${'='.repeat(60)}\n`);
  
  return result;
}

// ============================================
// Behaviour Judge Results (Judge B)
// ============================================

export interface BehaviourJudgeResult {
  run_id: string;
  outcome: string;
  confidence: number | null;
  reason: string | null;
  tower_verdict: string | null;
  delivered_count: number | null;
  requested_count: number | null;
  created_at: string | null;
}

export async function getBehaviourJudgeResult(runId: string): Promise<BehaviourJudgeResult | null> {
  if (!isSupabaseConfigured()) return null;
  const client = ensureSupabaseClient();
  const { data, error } = await client
    .from('behaviour_judge_results')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();
  if (error) {
    console.error('[behaviour-judge] lookup error:', error.message);
    return null;
  }
  return data as BehaviourJudgeResult | null;
}

export async function getBehaviourJudgeResults(runIds: string[]): Promise<Record<string, BehaviourJudgeResult>> {
  if (!isSupabaseConfigured() || runIds.length === 0) return {};
  const client = ensureSupabaseClient();
  const { data, error } = await client
    .from('behaviour_judge_results')
    .select('run_id, outcome, confidence, reason')
    .in('run_id', runIds);
  if (error) {
    console.error('[behaviour-judge] bulk lookup error:', error.message);
    return {};
  }
  const map: Record<string, BehaviourJudgeResult> = {};
  for (const row of (data || [])) {
    map[(row as any).run_id] = row as BehaviourJudgeResult;
  }
  return map;
}