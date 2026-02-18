import { Router } from 'express';
import { getDrizzleDb } from '../storage';
import { sql } from 'drizzle-orm';
import { getSupabaseClient, getSupabaseUrlForLogging } from '../supabase-client';
import {
  evaluateAndPersist,
  parseConstraints,
  type EvaluationInput,
  type EvaluationLead,
} from './delivery-evaluator';

const POLL_INTERVAL_MS = 8_000;
const POLL_LOOKBACK_MS = 5 * 60 * 1000;

let pollerRunning = false;
let pollerTimer: ReturnType<typeof setInterval> | null = null;
const processedTaskIds = new Set<string>();

async function fetchCompletedTasks(): Promise<any[]> {
  try {
    const client = getSupabaseClient();
    if (!client) return [];

    const cutoff = Date.now() - POLL_LOOKBACK_MS;

    const { data, error } = await client
      .from('supervisor_tasks')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn(`[COMPLETION_POLLER] Supabase query error: ${error.message}`);
      return [];
    }

    return data || [];
  } catch (err: any) {
    console.warn(`[COMPLETION_POLLER] Error fetching tasks: ${err.message}`);
    return [];
  }
}

async function taskHasArtefacts(runId: string): Promise<boolean> {
  try {
    const db = getDrizzleDb();
    const result = await db.execute(
      sql`SELECT count(*)::int as cnt FROM artefacts WHERE run_id = ${runId} AND type = 'delivery_summary'`
    );
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    return (rows[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function fetchLeadsForTask(task: any): Promise<EvaluationLead[]> {
  try {
    const client = getSupabaseClient();
    if (!client) return [];

    const runId = task.run_id;
    const conversationId = task.conversation_id;

    if (runId) {
      const db = getDrizzleDb();
      const result = await db.execute(
        sql`SELECT payload_json FROM artefacts WHERE run_id = ${runId} AND type = 'leads_list' ORDER BY created_at DESC LIMIT 1`
      );
      const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
      if (rows.length > 0) {
        const payload = rows[0].payload_json;
        const leads = Array.isArray(payload) ? payload : (payload as any)?.leads || [];
        return leads.map((l: any) => ({
          name: l.name || l.business_name || 'Unknown',
          location: l.location || l.address || l.formatted_address || '',
          phone: l.phone || l.phoneNumber || l.formatted_phone_number,
          website: l.website,
          place_id: l.place_id || l.placeId,
          types: l.types || [],
          business_type: l.business_type || l.type,
          raw: l,
        }));
      }
    }

    const { data: messages } = await client
      .from('messages')
      .select('content, metadata')
      .eq('conversation_id', conversationId)
      .eq('source', 'supervisor')
      .order('created_at', { ascending: false })
      .limit(10);

    if (messages && messages.length > 0) {
      const leads: EvaluationLead[] = [];
      for (const msg of messages) {
        if (msg.metadata?.lead_ids || msg.metadata?.capabilities?.includes('search_places')) {
          const nameMatches = (msg.content || '').match(/\*\*(.+?)\*\*/g);
          if (nameMatches) {
            for (const m of nameMatches) {
              leads.push({
                name: m.replace(/\*\*/g, ''),
                location: '',
                types: [],
              });
            }
          }
        }
      }
      if (leads.length > 0) return leads;
    }

    return [];
  } catch (err: any) {
    console.warn(`[COMPLETION_HANDLER] Error fetching leads: ${err.message}`);
    return [];
  }
}

function extractRequestedCount(task: any): number {
  const requestData = task.request_data || {};
  const msg = (requestData.user_message || '').toLowerCase();
  const countMatch = msg.match(/(?:find|get|show|list|discover)\s+(\d+)\s/i);
  if (countMatch) return parseInt(countMatch[1], 10);

  if (requestData.constraints?.requested_count) {
    return requestData.constraints.requested_count;
  }

  return 10;
}

async function handleCompletedTask(task: any): Promise<void> {
  const taskId = task.id;
  const runId = task.run_id || task.client_request_id || taskId;
  const supabaseRef = getSupabaseUrlForLogging();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[COMPLETION_HANDLER] Processing completed task`);
  console.log(`  taskId: ${taskId}`);
  console.log(`  runId: ${runId}`);
  console.log(`  task_type: ${task.task_type}`);
  console.log(`  Supabase project: ${supabaseRef}`);
  console.log(`${'='.repeat(70)}`);

  const alreadyHas = await taskHasArtefacts(runId);
  if (alreadyHas) {
    console.log(`[COMPLETION_HANDLER] Skipping — artefacts already exist for run=${runId}`);
    return;
  }

  const requestData = task.request_data || {};
  const userMessage = requestData.user_message || '';
  const searchQuery = requestData.search_query;
  const requestedCount = extractRequestedCount(task);

  const constraints = parseConstraints(userMessage, searchQuery);
  console.log(`[COMPLETION_HANDLER] Parsed ${constraints.length} constraints from message: "${userMessage.slice(0, 80)}..."`);
  constraints.forEach(c => console.log(`  - [${c.hard ? 'HARD' : 'SOFT'}] [${c.verifiable ? 'VERIFIABLE' : 'UNVERIFIABLE'}] ${c.text}`));

  const leads = await fetchLeadsForTask(task);
  console.log(`[COMPLETION_HANDLER] Found ${leads.length} leads for evaluation`);

  const evalInput: EvaluationInput = {
    runId,
    requestedCount,
    userMessage,
    constraints,
    leads,
  };

  const result = await evaluateAndPersist(evalInput);

  console.log(`[COMPLETION_HANDLER] Evaluation complete: verdict=${result.verdict} ok=${result.ok} run=${runId}`);
  if (!result.ok) {
    console.error(`[COMPLETION_HANDLER] Persistence error: ${result.error}`);
  }
  console.log(`${'='.repeat(70)}\n`);
}

async function pollOnce(): Promise<void> {
  const tasks = await fetchCompletedTasks();
  if (tasks.length === 0) return;

  for (const task of tasks) {
    if (processedTaskIds.has(task.id)) continue;

    processedTaskIds.add(task.id);
    try {
      await handleCompletedTask(task);
    } catch (err: any) {
      console.error(`[COMPLETION_POLLER] Error processing task ${task.id}: ${err.message}`);
    }
  }

  if (processedTaskIds.size > 500) {
    const arr = Array.from(processedTaskIds);
    const toRemove = arr.slice(0, arr.length - 200);
    toRemove.forEach(id => processedTaskIds.delete(id));
  }
}

export function startCompletionPoller(): void {
  if (pollerRunning) {
    console.log('[COMPLETION_POLLER] Already running');
    return;
  }

  pollerRunning = true;
  console.log(`[COMPLETION_POLLER] Started — polling every ${POLL_INTERVAL_MS / 1000}s, Supabase: ${getSupabaseUrlForLogging()}`);

  setTimeout(() => pollOnce().catch(e => console.error('[COMPLETION_POLLER] Initial poll error:', e.message)), 2000);

  pollerTimer = setInterval(() => {
    pollOnce().catch(e => console.error('[COMPLETION_POLLER] Poll error:', e.message));
  }, POLL_INTERVAL_MS);
}

export function stopCompletionPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  pollerRunning = false;
  console.log('[COMPLETION_POLLER] Stopped');
}

export function createCompletionWebhookRouter(): Router {
  const router = Router();

  router.post('/supervisor-completed', async (req, res) => {
    try {
      const { taskId, runId, client_request_id, leads, result_data } = req.body;

      if (!taskId && !runId) {
        return res.status(400).json({ error: 'taskId or runId required' });
      }

      const effectiveRunId = runId || client_request_id || taskId;
      console.log(`[WEBHOOK] POST /supervisor-completed taskId=${taskId} runId=${effectiveRunId}`);

      const alreadyHas = await taskHasArtefacts(effectiveRunId);
      if (alreadyHas) {
        return res.json({ ok: true, skipped: true, reason: 'artefacts already exist' });
      }

      let task: any = null;
      if (taskId) {
        const client = getSupabaseClient();
        if (client) {
          const { data } = await client
            .from('supervisor_tasks')
            .select('*')
            .eq('id', taskId)
            .single();
          task = data;
        }
      }

      const requestData = task?.request_data || req.body.request_data || {};
      const userMessage = requestData.user_message || '';
      const searchQuery = requestData.search_query;
      const requestedCount = task ? extractRequestedCount(task) : (req.body.requested_count || 10);

      const constraints = parseConstraints(userMessage, searchQuery);

      let evalLeads: EvaluationLead[] = [];
      if (Array.isArray(leads)) {
        evalLeads = leads.map((l: any) => ({
          name: l.name || l.business_name || 'Unknown',
          location: l.location || l.address || '',
          phone: l.phone,
          website: l.website,
          place_id: l.place_id,
          types: l.types || [],
          business_type: l.business_type,
          raw: l,
        }));
      } else if (task) {
        evalLeads = await fetchLeadsForTask(task);
      }

      const evalResult = await evaluateAndPersist({
        runId: effectiveRunId,
        requestedCount,
        userMessage,
        constraints,
        leads: evalLeads,
      });

      res.json({
        ok: evalResult.ok,
        verdict: evalResult.verdict,
        runId: effectiveRunId,
        error: evalResult.error,
      });
    } catch (err: any) {
      console.error('[WEBHOOK] /supervisor-completed error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/evaluate-run', async (req, res) => {
    try {
      const { runId, userMessage, searchQuery, requestedCount, leads } = req.body;

      if (!runId) {
        return res.status(400).json({ error: 'runId required' });
      }

      const constraints = parseConstraints(userMessage || '', searchQuery);

      const evalLeads: EvaluationLead[] = (leads || []).map((l: any) => ({
        name: l.name || l.business_name || 'Unknown',
        location: l.location || l.address || '',
        phone: l.phone,
        website: l.website,
        place_id: l.place_id,
        types: l.types || [],
        business_type: l.business_type,
        raw: l,
      }));

      const result = await evaluateAndPersist({
        runId,
        requestedCount: requestedCount || 10,
        userMessage: userMessage || '',
        constraints,
        leads: evalLeads,
      });

      res.json(result);
    } catch (err: any) {
      console.error('[WEBHOOK] /evaluate-run error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
