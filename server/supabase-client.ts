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
  };
}

export interface SupervisorTask {
  id: string;
  conversation_id: string;
  user_id: string;
  task_type: 'generate_leads' | 'analyze_conversation' | 'provide_insights';
  request_data: SupervisorTaskData;
  status: 'pending' | 'processing' | 'completed' | 'failed';
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
  taskType: 'generate_leads' | 'analyze_conversation' | 'provide_insights',
  requestData: SupervisorTaskData
): Promise<SupervisorTask> {
  const client = ensureSupabaseClient();
  
  const task: SupervisorTask = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    user_id: userId,
    task_type: taskType,
    request_data: requestData,
    status: 'pending',
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

export function isSupabaseConfigured(): boolean {
  initializeSupabase();
  return supabase !== null;
}
