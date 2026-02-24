import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;

/**
 * Robustly parse timestamp from Supabase realtime payload.
 * Handles: numeric timestamps (ms/s/μs), BIGINT strings, ISO strings, SQL-formatted timestamps.
 * Returns milliseconds since epoch, or current time as fallback.
 */
function parseTimestamp(value: any): number {
  // Already a number - infer unit based on magnitude
  if (typeof value === 'number') {
    // Heuristic: if value is reasonable as milliseconds (year 2000-2100), use as-is
    if (value > 946684800000 && value < 4102444800000) {
      return value; // milliseconds
    }
    // If value looks like seconds (10 digits, year 2000-2100), convert to ms
    if (value > 946684800 && value < 4102444800) {
      return value * 1000; // seconds → milliseconds
    }
    // If value looks like microseconds (16+ digits), convert to ms
    if (value > 946684800000000) {
      return Math.floor(value / 1000); // microseconds → milliseconds
    }
    // Unknown magnitude - use as-is and warn
    console.warn('⚠️ Ambiguous numeric timestamp, using as-is:', value);
    return value;
  }
  
  // String - try multiple parsing strategies
  if (typeof value === 'string') {
    // Strategy 1: Try as numeric string (BIGINT) - recursively parse
    const asNumber = Number(value);
    if (!isNaN(asNumber) && asNumber > 0) {
      return parseTimestamp(asNumber); // Recursive call to apply unit inference
    }
    
    // Strategy 2: Try Date.parse (handles ISO and many SQL formats)
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) {
      return parsed;
    }
    
    // Strategy 3: Try new Date constructor (handles more formats)
    const dateObj = new Date(value);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.getTime();
    }
  }
  
  // Fallback: use current time
  console.warn('⚠️ Failed to parse timestamp, using current time:', value);
  return Date.now();
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabase) return supabase;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.debug('ℹ️ Supabase not configured – realtime Supervisor chat disabled (activity tracking uses AFR)');
    return null;
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return supabase;
}

export type SupervisorMessage = {
  id: string;
  conversation_id: string;
  source: 'supervisor';
  role: 'assistant';
  content: string;
  metadata: Record<string, any> | null;
  created_at: number;
};

export function subscribeSupervisorMessages(
  conversationId: string,
  onMessage: (message: SupervisorMessage) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  console.log(`🔔 Subscribing to Supervisor messages for conversation: ${conversationId}`);

  const handler = (payload: any) => {
    const rawMessage = payload.new as any;

    if (rawMessage.source !== 'supervisor') {
      return;
    }

    console.log('🤖 Received Supervisor message (event=' + payload.eventType + '):', rawMessage);

    const message: SupervisorMessage = {
      ...rawMessage,
      created_at: parseTimestamp(rawMessage.created_at),
    };

    onMessage(message);
  };

  const channel = client
    .channel(`supervisor-messages-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      handler,
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      handler,
    )
    .subscribe((status) => {
      console.log(`📡 Realtime subscription status: ${status}`);
    });

  return channel;
}
