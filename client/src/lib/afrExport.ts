import { addDevAuthParams, authedFetch } from '@/lib/queryClient';

export interface StreamEvent {
  id: string;
  ts: string;
  type: string;
  summary: string;
  details: {
    runType?: string;
    action?: string | null;
    task?: string | null;
    error?: string | null;
    durationMs?: number | null;
    results?: string | null;
  };
  status: string;
  run_id: string | null;
  client_request_id: string | null;
  router_decision?: string | null;
  router_reason?: string | null;
}

export interface Judgement {
  id: string;
  evaluated_at: string;
  verdict: string;
  reason_code: string;
  explanation: string;
}

export interface Artefact {
  id: string;
  run_id: string;
  type: string;
  title: string;
  summary: string | null;
  payload_json: any | null;
  created_at: string;
}

export interface BenchmarkMeta {
  benchmark_test_id: string | null;
  query: string | null;
  query_class: string | null;
  expected_mode: string | null;
  behaviour_result: string | null;
  metadata: any;
}

export interface RunGlance {
  goal: string;
  status: string;
  clarified: boolean;
  blocked: boolean;
  towerJudged: boolean;
  towerVerdict: string | null;
  missionCheckPassed: boolean | null;
  eventCount: number;
  artefactCount: number;
  judgementCount: number;
  keyReason: string | null;
  terminalState: string | null;
}

export const KEY_EVENT_TYPES = new Set([
  'mission_extraction', 'mission_completeness_check', 'clarify_gate', 'constraint_gate',
  'pre_execution_constraint_gate', 'plan_created', 'plan_update', 'tower_verdict',
  'tower_call_started', 'stop', 'change_plan', 'block', 'execution_completed',
  'run_completed', 'run_failed', 'router_decision', 'supervisor_delegation',
  'clarify_resolution', 'run_started', 'search_places', 'deep_research',
]);

export const IMPORTANT_ARTEFACT_TYPES = new Set([
  'mission_extraction', 'constraints_extracted', 'constraint_capability_check',
  'diagnostic', 'tower_judgement', 'clarify_gate', 'clarify_resolution',
  'intent_preview', 'run_configuration', 'leads_list', 'plan', 'plan_result',
  'plan_update',
]);

export const HIGHLIGHT_PAYLOAD_FIELDS = [
  'raw_input', 'user_input', 'raw_user_input',
  'pass1_interpretation', 'semantic_interpretation', 'pass1',
  'pass2_structured', 'structured_mission', 'pass2',
  'constraint_types', 'constraints', 'constraint_type',
  'dropped_concepts', 'dropped',
  'recommended_action', 'action', 'recommended',
  'blocking_reason', 'why_blocked', 'block_reason',
  'clarify_question', 'question', 'questions', 'pending_questions',
  'verdict', 'tower_verdict',
  'suggested_changes', 'suggestions',
  'stop_reason', 'reason',
  'evidence_summary', 'evidence', 'rationale',
  'entity_type', 'business_type', 'location', 'location_text',
  'requested_count', 'count',
  'route', 'mode', 'scenario',
  'can_execute', 'explanation',
  'proxy_used', 'confidence',
];

export const EXPORT_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #1a1a1a; padding: 32px; max-width: 1200px; margin: 0 auto; line-height: 1.6; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
    h3 { font-size: 14px; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; vertical-align: top; font-size: 12px; }
    th { background: #f3f4f6; font-weight: 600; }
    .meta-grid { display: grid; grid-template-columns: 150px 1fr; gap: 4px 12px; margin-bottom: 16px; }
    .meta-grid dt { font-weight: 600; color: #6b7280; font-size: 12px; }
    .meta-grid dd { font-family: monospace; font-size: 12px; word-break: break-all; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-completed, .badge-success, .badge-pass, .badge-accept { background: #dcfce7; color: #166534; }
    .badge-failed, .badge-fail, .badge-reject, .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-running, .badge-executing, .badge-pending, .badge-started { background: #dbeafe; color: #1e40af; }
    .badge-stopped, .badge-clarifying, .badge-revise { background: #fef9c3; color: #854d0e; }
    pre { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 11px; font-family: 'SF Mono', 'Fira Code', monospace; max-height: none; }
    .section-empty { color: #9ca3af; font-style: italic; padding: 12px 0; }

    .run-separator { border: none; border-top: 4px solid #4f46e5; margin: 56px 0 32px; }
    .run-header-block { background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 2px solid #818cf8; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
    .run-header-block h2 { margin: 0; border: none; padding: 0; font-size: 18px; color: #312e81; }
    .run-header-block .run-subtitle { margin-top: 6px; color: #4338ca; font-size: 12px; font-family: monospace; }
    .run-header-block .run-meta-row { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #4b5563; }
    .run-header-block .run-meta-row span { display: inline-flex; align-items: center; gap: 4px; }

    .glance-box { background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
    .glance-box h3 { margin: 0 0 10px; font-size: 14px; color: #92400e; border: none; }
    .glance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px 16px; font-size: 12px; }
    .glance-grid .glance-item { display: flex; gap: 6px; }
    .glance-grid .glance-label { font-weight: 600; color: #78716c; min-width: 100px; }
    .glance-grid .glance-value { color: #1c1917; }
    .glance-reason { margin-top: 10px; padding-top: 8px; border-top: 1px solid #fde68a; font-size: 12px; color: #92400e; }

    .key-moments { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
    .key-moments h3 { margin: 0 0 10px; font-size: 14px; color: #166534; border: none; }
    .key-moments ol { padding-left: 20px; margin: 0; }
    .key-moments li { margin-bottom: 4px; font-size: 12px; line-height: 1.5; }
    .key-moments .km-type { font-weight: 600; color: #15803d; }
    .key-moments .km-status { margin-left: 6px; }
    .key-moments .km-time { color: #6b7280; font-size: 11px; margin-left: 6px; }

    .event-row-important { background: #fefce8; }
    .event-row-fail { background: #fef2f2; }
    .event-row-clarify { background: #eff6ff; }
    .event-row { border-bottom: 1px solid #e5e7eb; padding: 8px 0; }
    .event-row:last-child { border-bottom: none; }

    .artefact-card { margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .artefact-card-important { border-color: #818cf8; border-width: 2px; }
    .artefact-card-header { padding: 10px 14px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    .artefact-card-important .artefact-card-header { background: #eef2ff; }
    .artefact-card-header h3 { margin: 0; font-size: 13px; }
    .artefact-type-label { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; }
    .atl-mission { background: #dbeafe; color: #1e40af; }
    .atl-constraint { background: #fce7f3; color: #9d174d; }
    .atl-diagnostic { background: #e0e7ff; color: #3730a3; }
    .atl-tower { background: #fef3c7; color: #92400e; }
    .atl-clarify { background: #cffafe; color: #155e75; }
    .atl-plan { background: #d1fae5; color: #065f46; }
    .atl-leads { background: #dcfce7; color: #166534; }
    .atl-config { background: #f3e8ff; color: #6b21a8; }
    .artefact-card-body { padding: 12px 14px; }
    .artefact-summary-fields { margin-bottom: 12px; padding: 10px 12px; background: #fefce8; border: 1px solid #fde68a; border-radius: 4px; font-size: 12px; }
    .artefact-summary-fields dt { font-weight: 600; color: #78716c; margin-top: 4px; }
    .artefact-summary-fields dt:first-child { margin-top: 0; }
    .artefact-summary-fields dd { margin-left: 0; color: #1c1917; word-break: break-word; }
    .raw-payload-toggle { font-size: 11px; color: #6b7280; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb; }
    .raw-payload-toggle summary { cursor: pointer; font-weight: 600; }

    .toc { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; }
    .toc h3 { margin: 0 0 8px; font-size: 14px; color: #334155; border: none; }
    .toc ol { padding-left: 20px; margin: 0; }
    .toc li { margin-bottom: 3px; font-size: 12px; }
    .toc a { color: #4f46e5; text-decoration: none; }
    .toc a:hover { text-decoration: underline; }

    @media print { body { padding: 16px; } h2 { break-before: auto; } pre { white-space: pre-wrap; } .run-separator { break-before: page; } details { open: true; } details[open] summary { display: none; } }
    @page { margin: 1.5cm; }
  `;

export function escHtml(str: unknown): string {
  const s = String(str ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatTs(ts: string | number | null | undefined): string {
  if (!ts) return '-';
  try { return new Date(ts).toISOString(); } catch { return String(ts); }
}

export function prettyJson(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') {
    try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
  }
  return JSON.stringify(val, null, 2);
}

export function exportBadgeClass(s: string): string {
  const sl = (s || '').toLowerCase();
  if (sl === 'completed' || sl === 'success' || sl === 'pass' || sl === 'accept' || sl === 'accept_with_unverified') return 'badge-completed';
  if (sl === 'failed' || sl === 'fail' || sl === 'reject' || sl === 'error') return 'badge-failed';
  if (sl === 'running' || sl === 'executing' || sl === 'pending' || sl === 'started') return 'badge-running';
  if (sl === 'stopped' || sl === 'clarifying' || sl === 'revise') return 'badge-stopped';
  return '';
}

export function artefactTypeLabel(type: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('mission') || t === 'intent_preview') return '<span class="artefact-type-label atl-mission">Mission</span>';
  if (t.includes('constraint') || t === 'constraints_extracted' || t === 'constraint_capability_check') return '<span class="artefact-type-label atl-constraint">Constraint</span>';
  if (t === 'diagnostic') return '<span class="artefact-type-label atl-diagnostic">Diagnostic</span>';
  if (t.includes('tower') || t === 'tower_judgement') return '<span class="artefact-type-label atl-tower">Tower</span>';
  if (t.includes('clarify')) return '<span class="artefact-type-label atl-clarify">Clarify</span>';
  if (t.includes('plan')) return '<span class="artefact-type-label atl-plan">Plan</span>';
  if (t.includes('leads') || t === 'leads_list') return '<span class="artefact-type-label atl-leads">Leads</span>';
  if (t === 'run_configuration') return '<span class="artefact-type-label atl-config">Config</span>';
  return '';
}

export function extractHighlightFields(payload: any): Array<{ key: string; value: string }> {
  if (!payload) return [];
  const obj = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return null; } })() : payload;
  if (!obj || typeof obj !== 'object') return [];
  const results: Array<{ key: string; value: string }> = [];
  for (const field of HIGHLIGHT_PAYLOAD_FIELDS) {
    if (field in obj && obj[field] != null) {
      const val = obj[field];
      const display = typeof val === 'object' ? JSON.stringify(val, null, 1) : String(val);
      if (display.length > 0 && display !== 'null' && display !== 'undefined') {
        results.push({ key: field, value: display.length > 500 ? display.slice(0, 500) + '...' : display });
      }
    }
  }
  return results;
}

export function extractRunGlance(
  runData: any,
  events: StreamEvent[],
  artefacts: Artefact[],
  judgements: Judgement[],
): RunGlance {
  const clarifyEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('clarify') || ev.status?.toLowerCase() === 'clarifying'
  );
  const blockEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('block') || ev.summary?.toLowerCase().includes('block')
  );
  const towerEvents = events.filter(ev =>
    ev.type?.toLowerCase().includes('tower')
  );
  const towerArtefacts = artefacts.filter(a => a.type === 'tower_judgement');

  let towerVerdict: string | null = null;
  if (towerArtefacts.length > 0) {
    const lastTower = towerArtefacts[towerArtefacts.length - 1];
    const p = typeof lastTower.payload_json === 'string'
      ? (() => { try { return JSON.parse(lastTower.payload_json); } catch { return null; } })()
      : lastTower.payload_json;
    towerVerdict = p?.verdict || null;
  }
  if (!towerVerdict && judgements.length > 0) {
    towerVerdict = judgements[judgements.length - 1].verdict || null;
  }

  const missionCheckArts = artefacts.filter(a =>
    a.type === 'constraint_capability_check' || a.type === 'mission_completeness_check'
  );
  let missionCheckPassed: boolean | null = null;
  if (missionCheckArts.length > 0) {
    const last = missionCheckArts[missionCheckArts.length - 1];
    const p = typeof last.payload_json === 'string'
      ? (() => { try { return JSON.parse(last.payload_json); } catch { return null; } })()
      : last.payload_json;
    if (p?.can_execute !== undefined) missionCheckPassed = !!p.can_execute;
    else if (p?.pass !== undefined) missionCheckPassed = !!p.pass;
  }

  let keyReason: string | null = null;
  const stopEvent = events.find(ev => ev.type?.toLowerCase().includes('stop') || ev.type?.toLowerCase().includes('block'));
  if (stopEvent) keyReason = stopEvent.summary || null;
  if (!keyReason && blockEvents.length > 0) keyReason = blockEvents[0].summary || null;
  const clarifyGate = artefacts.find(a => a.type === 'clarify_gate');
  if (!keyReason && clarifyGate) {
    const p = typeof clarifyGate.payload_json === 'string'
      ? (() => { try { return JSON.parse(clarifyGate.payload_json); } catch { return null; } })()
      : clarifyGate.payload_json;
    keyReason = p?.reason || p?.constraint_label || clarifyGate.summary || null;
  }

  return {
    goal: runData?.title || 'Unknown',
    status: runData?.status || 'unknown',
    clarified: clarifyEvents.length > 0 || artefacts.some(a => a.type?.includes('clarify')),
    blocked: blockEvents.length > 0 || artefacts.some(a => {
      if (a.type !== 'constraint_capability_check') return false;
      const p = typeof a.payload_json === 'string'
        ? (() => { try { return JSON.parse(a.payload_json); } catch { return null; } })()
        : a.payload_json;
      return p?.can_execute === false;
    }),
    towerJudged: towerEvents.length > 0 || towerArtefacts.length > 0 || judgements.length > 0,
    towerVerdict,
    missionCheckPassed,
    eventCount: events.length,
    artefactCount: artefacts.length,
    judgementCount: judgements.length,
    keyReason,
    terminalState: runData?.terminal_state || null,
  };
}

export function buildGlanceHtml(glance: RunGlance): string {
  const yesNo = (v: boolean) => v ? '<strong style="color:#15803d">Yes</strong>' : 'No';
  const passFailNull = (v: boolean | null) => v === null ? '<span style="color:#9ca3af">N/A</span>' : v ? '<strong style="color:#15803d">Passed</strong>' : '<strong style="color:#dc2626">Failed</strong>';

  return `<div class="glance-box">
    <h3>At a Glance</h3>
    <div class="glance-grid">
      <div class="glance-item"><span class="glance-label">Goal:</span><span class="glance-value">${escHtml(glance.goal)}</span></div>
      <div class="glance-item"><span class="glance-label">Final status:</span><span class="glance-value"><span class="badge ${exportBadgeClass(glance.status)}">${escHtml(glance.status)}</span></span></div>
      <div class="glance-item"><span class="glance-label">Clarified:</span><span class="glance-value">${yesNo(glance.clarified)}</span></div>
      <div class="glance-item"><span class="glance-label">Blocked:</span><span class="glance-value">${yesNo(glance.blocked)}</span></div>
      <div class="glance-item"><span class="glance-label">Tower judged:</span><span class="glance-value">${yesNo(glance.towerJudged)}${glance.towerVerdict ? ` — <span class="badge ${exportBadgeClass(glance.towerVerdict)}">${escHtml(glance.towerVerdict)}</span>` : ''}</span></div>
      <div class="glance-item"><span class="glance-label">Mission check:</span><span class="glance-value">${passFailNull(glance.missionCheckPassed)}</span></div>
      <div class="glance-item"><span class="glance-label">Events:</span><span class="glance-value">${glance.eventCount}</span></div>
      <div class="glance-item"><span class="glance-label">Artefacts:</span><span class="glance-value">${glance.artefactCount}</span></div>
      <div class="glance-item"><span class="glance-label">Judgements:</span><span class="glance-value">${glance.judgementCount}</span></div>
      ${glance.terminalState ? `<div class="glance-item"><span class="glance-label">Terminal state:</span><span class="glance-value">${escHtml(glance.terminalState)}</span></div>` : ''}
    </div>
    ${glance.keyReason ? `<div class="glance-reason"><strong>Key reason:</strong> ${escHtml(glance.keyReason)}</div>` : ''}
  </div>`;
}

export function buildKeyMomentsHtml(events: StreamEvent[]): string {
  const keyEvents = events.filter(ev => {
    const t = (ev.type || '').toLowerCase();
    if (KEY_EVENT_TYPES.has(t)) return true;
    const s = (ev.status || '').toLowerCase();
    if (s === 'failed' || s === 'error' || s === 'stopped') return true;
    const sum = (ev.summary || '').toLowerCase();
    if (sum.includes('clarif') || sum.includes('block') || sum.includes('tower') || sum.includes('stop') || sum.includes('mission')) return true;
    return false;
  });

  if (keyEvents.length === 0) {
    return '';
  }

  let html = '<div class="key-moments"><h3>Key Moments</h3><ol>';
  keyEvents.forEach(ev => {
    const statusBadge = ev.status ? `<span class="km-status badge ${exportBadgeClass(ev.status)}">${escHtml(ev.status)}</span>` : '';
    const time = ev.ts ? `<span class="km-time">${escHtml(formatTs(ev.ts))}</span>` : '';
    const summary = ev.summary ? ` — ${escHtml(ev.summary.length > 120 ? ev.summary.slice(0, 120) + '...' : ev.summary)}` : '';
    html += `<li><span class="km-type">${escHtml(ev.type)}</span>${summary} ${statusBadge} ${time}</li>`;
  });
  html += '</ol></div>';
  return html;
}

export function eventRowClass(ev: StreamEvent): string {
  const t = (ev.type || '').toLowerCase();
  const s = (ev.status || '').toLowerCase();
  if (s === 'failed' || s === 'error') return 'event-row-fail';
  if (t.includes('clarify') || s === 'clarifying') return 'event-row-clarify';
  if (KEY_EVENT_TYPES.has(t) || t.includes('tower') || t.includes('stop') || t.includes('block')) return 'event-row-important';
  return '';
}

export async function fetchRunExportData(
  runId: string,
  clientRequestId: string | null,
): Promise<{ runData: any; events: StreamEvent[]; artefacts: Artefact[]; judgements: Judgement[] }> {
  const fetchJson = async (path: string) => {
    const url = addDevAuthParams(path);
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  };

  let runData: any = null;
  let events: StreamEvent[] = [];
  let artefacts: Artefact[] = [];
  let judgements: Judgement[] = [];

  const streamPromise = clientRequestId
    ? fetchJson(`/api/afr/stream?client_request_id=${encodeURIComponent(clientRequestId)}`)
    : fetchJson(`/api/afr/runs/${encodeURIComponent(runId)}`);
  const artefactsPromise = fetchJson(`/api/afr/runs/${encodeURIComponent(runId)}/artefacts`);
  const judgementsPromise = fetchJson(`/api/afr/judgements?run_id=${encodeURIComponent(runId)}`);

  const [streamResult, artefactsResult, judgementsResult] = await Promise.all([
    streamPromise, artefactsPromise, judgementsPromise,
  ]);

  if (streamResult) {
    if (streamResult.events) {
      events = [...streamResult.events].sort(
        (a: StreamEvent, b: StreamEvent) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
      );
      runData = {
        title: streamResult.title || 'Agent Run',
        status: streamResult.status || 'unknown',
        run_id: streamResult.run_id || runId,
        client_request_id: streamResult.client_request_id || clientRequestId,
        conversation_id: streamResult.conversation_id || null,
        is_terminal: streamResult.is_terminal,
        terminal_state: streamResult.terminal_state,
        created_at: streamResult.created_at,
        updated_at: streamResult.updated_at,
        run_type: streamResult.run_type,
      };
    } else if (streamResult.run) {
      const r = streamResult.run;
      runData = {
        title: r.goal_summary || 'Agent Run',
        status: r.status || 'unknown',
        run_id: runId,
        client_request_id: r.client_request_id || clientRequestId,
        conversation_id: r.conversation_id || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        run_type: r.run_type || r.vertical,
      };
      events = (streamResult.activities || []).map((a: any) => ({
        id: a.id,
        ts: a.timestamp,
        type: a.runType || a.type || 'activity',
        summary: a.label || a.action || 'Activity',
        details: {
          action: a.action,
          durationMs: a.durationMs,
          error: a.error,
          results: a.results ? (typeof a.results === 'string' ? a.results : JSON.stringify(a.results)) : null,
        },
        status: a.status,
        run_id: runId,
        client_request_id: null,
      }));
    }
  }

  if (artefactsResult) {
    artefacts = Array.isArray(artefactsResult) ? artefactsResult : (artefactsResult?.rows ?? []);
  }

  if (judgementsResult?.judgements) {
    judgements = judgementsResult.judgements;
  }

  return { runData, events, artefacts, judgements };
}

export async function fetchBenchmarkMetaForRuns(runIds: string[]): Promise<Record<string, BenchmarkMeta>> {
  if (runIds.length === 0) return {};
  try {
    const resp = await authedFetch(addDevAuthParams('/api/qa-metrics/by-runs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runIds }),
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    return json.data || {};
  } catch {
    return {};
  }
}

export function buildBenchmarkSectionHtml(bm: BenchmarkMeta): string {
  const meta = typeof bm.metadata === 'string' ? (() => { try { return JSON.parse(bm.metadata); } catch { return {}; } })() : (bm.metadata || {});
  const llmResp = meta.behaviour_llm_response || null;
  const evalPacket = meta.behaviour_eval_packet || null;
  const bd = meta.behaviour_decision || {};
  const expectedOutcome = meta.expected_outcome_text || meta.expectedOutcome || bm.expected_mode || '—';
  const expectedBehaviour = meta.expected_behaviour_text || bm.expected_mode || '—';
  const bEvalMode = meta.behaviour_eval_mode || llmResp?.eval_mode || 'unknown';

  const derivedSource: string = meta.behaviour_source_of_truth || (bEvalMode.startsWith('llm') && !bEvalMode.includes('error') && !bEvalMode.includes('parse_error') ? 'llm' : bEvalMode === 'fallback_legacy' ? 'fallback_legacy' : 'unknown');
  const bResult = derivedSource === 'llm'
    ? (llmResp?.behaviour_result?.toUpperCase() || bm.behaviour_result || bd.result || '—')
    : (bm.behaviour_result || bd.result || llmResp?.behaviour_result?.toUpperCase() || '—');
  const bReason = derivedSource === 'llm'
    ? (llmResp?.behaviour_reason || meta.behaviour_reason || bd.reason || '—')
    : (meta.behaviour_reason || bd.reason || llmResp?.behaviour_reason || '—');
  const bExpectedCheck = meta.behaviour_expected_outcome_check || llmResp?.expected_outcome_check || bd.expected || '—';
  const bObservedCheck = meta.behaviour_observed_outcome_check || llmResp?.observed_outcome_check || bd.observed || '—';
  const bFailureType = meta.behaviour_key_failure_type || llmResp?.key_failure_type || 'none';
  const bConfidence = meta.behaviour_confidence ?? llmResp?.confidence ?? null;

  const sourceOfTruth: string = derivedSource;
  const fallbackUsed: boolean = meta.behaviour_fallback_used ?? (sourceOfTruth !== 'llm');
  const fallbackReason: string | null = meta.fallback_reason || null;
  const evalParseOk: boolean | null = meta.behaviour_eval_parse_ok ?? (llmResp ? true : null);
  const evalResponseRaw: string | null = meta.behaviour_eval_response_raw || null;

  const isPass = bResult === 'PASS' || bResult === 'pass';
  const isFail = bResult === 'FAIL' || bResult === 'fail';
  const borderColor = isPass ? '#bbf7d0' : isFail ? '#fecaca' : '#e5e7eb';
  const bgColor = isPass ? '#f0fdf4' : isFail ? '#fef2f2' : '#f9fafb';
  const headingColor = isPass ? '#15803d' : isFail ? '#dc2626' : '#6b7280';

  const sourceLabel = sourceOfTruth === 'llm' ? 'LLM evaluator' : sourceOfTruth === 'fallback_legacy' ? 'Fallback legacy logic' : 'Unknown';
  const sourceBg = sourceOfTruth === 'llm' ? '#dbeafe' : sourceOfTruth === 'fallback_legacy' ? '#fef3c7' : '#f3f4f6';
  const sourceColor = sourceOfTruth === 'llm' ? '#1e40af' : sourceOfTruth === 'fallback_legacy' ? '#92400e' : '#6b7280';
  const sourceBorder = sourceOfTruth === 'llm' ? '#93c5fd' : sourceOfTruth === 'fallback_legacy' ? '#fcd34d' : '#d1d5db';

  const MODE_LABELS: Record<string, string> = {
    deliver_results: 'Deliver results matching the query',
    clarify: 'Clarify before running (missing info)',
    honest_refusal: 'Honest refusal (impossible/fictional)',
    best_effort_honest: 'Best effort delivery or clarify',
  };
  const expectedBehaviourLabel = MODE_LABELS[expectedBehaviour] || expectedBehaviour;

  const rowStyle = 'padding:3px 14px 3px 0; font-weight:600; color:#4b5563; vertical-align:top;';
  const valStyle = 'padding:3px 0; vertical-align:top;';

  const driverLine = sourceOfTruth === 'llm'
    ? 'Behaviour verdict shown in harness was driven by the LLM.'
    : sourceOfTruth === 'fallback_legacy'
    ? 'Behaviour verdict shown in harness was driven by fallback logic.'
    : 'Behaviour verdict source could not be determined.';

  let html = `<div style="margin:16px 0 12px 0; padding:12px 18px; border:2px solid ${sourceBorder}; border-radius:8px; background:${sourceBg};">
    <div style="font-size:13px; color:${sourceColor}; line-height:1.6;">
      <strong>Behaviour source:</strong> ${escHtml(sourceLabel)}<br/>
      <strong>Behaviour result:</strong> <span class="badge ${exportBadgeClass(bResult)}" style="font-size:12px; font-weight:700;">${escHtml(bResult)}</span><br/>
      <strong>Why:</strong> ${escHtml(bReason)}
    </div>
    <div style="margin-top:8px; padding-top:8px; border-top:1px solid ${sourceBorder}; font-size:12px; color:${sourceColor}; font-weight:600;">
      ${escHtml(driverLine)}
    </div>
    <table style="width:auto; margin:6px 0 0 0; font-size:11px; border-collapse:collapse; color:${sourceColor};">
      <tr><td style="padding:2px 10px 2px 0; font-weight:600;">behaviour_source_of_truth:</td><td><code>${escHtml(sourceOfTruth)}</code></td></tr>
      <tr><td style="padding:2px 10px 2px 0; font-weight:600;">behaviour_eval_mode:</td><td><code>${escHtml(bEvalMode)}</code></td></tr>
      <tr><td style="padding:2px 10px 2px 0; font-weight:600;">behaviour_eval_parse_ok:</td><td><code>${evalParseOk === true ? 'true' : evalParseOk === false ? 'false' : 'null'}</code></td></tr>
    </table>
  </div>`;

  html += `<div class="benchmark-section" style="margin:16px 0; padding:14px 18px; border:2px solid #c7d2fe; border-radius:8px; background:#eef2ff;">
    <h3 style="margin:0 0 10px 0; color:#4338ca; font-size:14px;">1. Benchmark Expectation</h3>
    <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
      <tr><td style="${rowStyle}">Test ID:</td><td style="${valStyle}">${escHtml(bm.benchmark_test_id || '—')}</td></tr>
      <tr><td style="${rowStyle}">Original query:</td><td style="${valStyle}">${escHtml(evalPacket?.original_query || bm.query || '—')}</td></tr>
      <tr><td style="${rowStyle}">Query class:</td><td style="${valStyle}">${escHtml(bm.query_class || '—')}</td></tr>
      <tr><td style="${rowStyle}">Expected outcome:</td><td style="${valStyle}">${escHtml(expectedOutcome)}</td></tr>
      <tr><td style="${rowStyle}">Expected behaviour:</td><td style="${valStyle}">${escHtml(expectedBehaviourLabel)}</td></tr>
    </table>
  </div>`;

  html += `<div class="behaviour-result-section" style="margin:16px 0; padding:14px 18px; border:2px solid ${borderColor}; border-radius:8px; background:${bgColor};">
    <h3 style="margin:0 0 10px 0; color:${headingColor}; font-size:14px;">2. Behaviour Result</h3>
    <table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
      <tr><td style="${rowStyle}">Final result:</td><td style="${valStyle}"><span class="badge ${exportBadgeClass(bResult)}" style="font-size:13px; font-weight:700;">${escHtml(bResult)}</span></td></tr>
      <tr><td style="${rowStyle}">Source of truth:</td><td style="${valStyle}"><strong style="color:${sourceColor};">${escHtml(sourceLabel)}</strong></td></tr>
      <tr><td style="${rowStyle}">Eval mode:</td><td style="${valStyle}"><code>${escHtml(bEvalMode)}</code></td></tr>
      <tr><td style="${rowStyle}">Fallback used?</td><td style="${valStyle}">${fallbackUsed ? '<strong style="color:#b45309">Yes</strong>' : 'No'}</td></tr>
      ${fallbackReason ? `<tr><td style="${rowStyle}">Fallback reason:</td><td style="${valStyle}">${escHtml(fallbackReason)}</td></tr>` : ''}
    </table>
  </div>`;

  html += `<div class="behaviour-packet-section" style="margin:16px 0; padding:14px 18px; border:2px solid #ddd6fe; border-radius:8px; background:#f5f3ff;">
    <h3 style="margin:0 0 4px 0; color:#6d28d9; font-size:14px;">3. Stored Behaviour Evaluation Packet</h3>
    <div style="font-size:10px; color:#7c3aed; margin-bottom:10px;">Source: stored behaviour_eval_packet from qa_run_metrics</div>`;

  if (evalPacket) {
    const outcome = evalPacket.final_run_outcome || {};
    const runState = outcome.run_state || evalPacket.actual_run_state || '—';
    const clarified = outcome.clarified ?? evalPacket.clarified ?? false;
    const clarifyQ = outcome.clarify_question || evalPacket.clarify_question || '';
    const clarifyA = outcome.clarify_answer || evalPacket.clarify_answer || '';
    const deliveredCount = outcome.delivered_count ?? evalPacket.delivered_count ?? '—';

    const entities = Array.isArray(evalPacket.delivered_results)
      ? evalPacket.delivered_results
      : Array.isArray(evalPacket.delivered_entities) ? evalPacket.delivered_entities : [];
    const evidence = Array.isArray(evalPacket.delivered_result_evidence)
      ? evalPacket.delivered_result_evidence
      : Array.isArray(evalPacket.evidence_summary) ? evalPacket.evidence_summary : [];

    html += `<table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
      <tr><td style="${rowStyle}">actual_run_state:</td><td style="${valStyle}"><code>${escHtml(runState)}</code></td></tr>
      <tr><td style="${rowStyle}">delivered_count:</td><td style="${valStyle}">${escHtml(String(deliveredCount))}</td></tr>
      <tr><td style="${rowStyle}">clarified:</td><td style="${valStyle}">${clarified ? '<strong style="color:#b45309">Yes</strong>' : 'No'}</td></tr>
      ${clarifyQ ? `<tr><td style="${rowStyle}">clarify_question:</td><td style="${valStyle}">${escHtml(clarifyQ)}</td></tr>` : ''}
      ${clarifyA ? `<tr><td style="${rowStyle}">clarify_answer:</td><td style="${valStyle}">${escHtml(clarifyA)}</td></tr>` : ''}
    </table>`;

    if (entities.length > 0) {
      html += `<div style="margin-top:10px; font-size:12px; font-weight:600; color:#4b5563;">Delivered results (${entities.length}):</div>`;
      html += `<ol style="font-size:12px; padding-left:18px; margin:4px 0 0 0;">`;
      entities.slice(0, 20).forEach((e: any) => {
        const name = typeof e === 'string' ? e : (e.name || e.entity || JSON.stringify(e));
        html += `<li style="margin-bottom:2px;">${escHtml(name)}</li>`;
      });
      if (entities.length > 20) html += `<li style="color:#6b7280; font-style:italic;">... and ${entities.length - 20} more</li>`;
      html += `</ol>`;
    }

    if (evidence.length > 0) {
      const visibleSummary = evidence.slice(0, 3).map((e: any) => typeof e === 'string' ? e : JSON.stringify(e)).join('; ');
      html += `<p style="margin:2px 0 0 0; font-size:11px; color:#374151;">${escHtml(visibleSummary)}</p>`;
    }

    html += `<details class="raw-payload-toggle" style="margin-top:10px;">
      <summary style="font-size:11px; color:#6d28d9; cursor:pointer;">Raw behaviour_eval_packet (JSON)</summary>
      <pre style="font-size:10px; max-height:400px; overflow:auto;">${escHtml(prettyJson(evalPacket))}</pre>
    </details>`;

    html += `</div>`;
  } else {
    html += `<div style="padding:12px; color:#9ca3af; font-style:italic; font-size:12px;">No stored Behaviour LLM packet found in qa_run_metrics.</div>`;
    html += `</div>`;
  }

  html += `<div class="behaviour-llm-response-section" style="margin:16px 0; padding:14px 18px; border:2px solid #a7f3d0; border-radius:8px; background:#ecfdf5;">
    <h3 style="margin:0 0 4px 0; color:#065f46; font-size:14px;">4. Stored Behaviour LLM Response</h3>
    <div style="font-size:10px; color:#047857; margin-bottom:10px;">Source: stored behaviour_llm_response / behaviour_eval_response_raw from qa_run_metrics</div>`;

  const hasLlmResponse = !!(llmResp || evalResponseRaw);
  if (hasLlmResponse) {
    html += `<table style="width:auto; margin:0; font-size:12px; border-collapse:collapse;">
        <tr><td style="${rowStyle}">behaviour_result:</td><td style="${valStyle}"><span class="badge ${exportBadgeClass(bResult)}" style="font-size:13px; font-weight:700;">${escHtml(bResult)}</span></td></tr>
        <tr><td style="${rowStyle}">behaviour_reason:</td><td style="${valStyle} max-width:600px;">${escHtml(bReason)}</td></tr>
        <tr><td style="${rowStyle}">expected_outcome_check:</td><td style="${valStyle}">${escHtml(bExpectedCheck)}</td></tr>
        <tr><td style="${rowStyle}">observed_outcome_check:</td><td style="${valStyle}">${escHtml(bObservedCheck)}</td></tr>
        <tr><td style="${rowStyle}">key_failure_type:</td><td style="${valStyle}"><code>${escHtml(bFailureType)}</code></td></tr>
        <tr><td style="${rowStyle}">confidence:</td><td style="${valStyle}">${bConfidence != null ? String(bConfidence) : '—'}</td></tr>
        <tr><td style="${rowStyle}">parse_ok:</td><td style="${valStyle}">${evalParseOk === true ? 'Yes' : evalParseOk === false ? '<strong style="color:#dc2626">No</strong>' : '—'}</td></tr>
      </table>`;

    html += `<details class="raw-payload-toggle" style="margin-top:10px;">
      <summary style="font-size:11px; color:#065f46; cursor:pointer;">Raw behaviour_llm_response (JSON)</summary>
      <pre style="font-size:10px; max-height:400px; overflow:auto;">${escHtml(prettyJson(llmResp || { note: 'No parsed LLM response stored' }))}</pre>
    </details>`;

    if (evalResponseRaw) {
      html += `<details class="raw-payload-toggle" style="margin-top:6px;">
        <summary style="font-size:11px; color:#065f46; cursor:pointer;">Raw behaviour_eval_response_raw (text)</summary>
        <pre style="font-size:10px; max-height:400px; overflow:auto; white-space:pre-wrap;">${escHtml(evalResponseRaw)}</pre>
      </details>`;
    }
  } else {
    html += `<div style="padding:12px; color:#9ca3af; font-style:italic; font-size:12px;">No stored Behaviour LLM response found in qa_run_metrics.</div>`;
  }

  html += `</div>`;

  html += `<details class="raw-payload-toggle" style="margin-bottom:12px;">
    <summary style="font-size:11px; color:#6b7280; cursor:pointer;">Full benchmark metadata (JSON)</summary>
    <pre style="font-size:10px; max-height:400px; overflow:auto;">${escHtml(prettyJson({ benchmark_test_id: bm.benchmark_test_id, query: bm.query, query_class: bm.query_class, expected_mode: bm.expected_mode, behaviour_result: bm.behaviour_result, metadata: meta }))}</pre>
  </details>`;

  return html;
}

export function buildRunSectionHtml(
  runData: any,
  runId: string,
  clientRequestId: string | null,
  events: StreamEvent[],
  artefacts: Artefact[],
  judgements: Judgement[],
  sectionPrefix: string,
  runIndex?: number,
  totalRuns?: number,
  benchmarkMeta?: BenchmarkMeta | null,
): string {
  const glance = extractRunGlance(runData, events, artefacts, judgements);

  const anchorId = `run-${runIndex ?? 0}`;
  const headerLabel = (runIndex != null && totalRuns != null)
    ? `Run ${runIndex + 1} of ${totalRuns}`
    : 'Run Details';

  let headerHtml = `<div class="run-header-block" id="${anchorId}">
    <h2>${escHtml(headerLabel)}: ${escHtml(runData?.title || 'Untitled')}</h2>
    <div class="run-subtitle">
      Run ID: ${escHtml(runData?.run_id || runId)} &nbsp;|&nbsp;
      CRID: ${escHtml(runData?.client_request_id || clientRequestId || '-')}
    </div>
    <div class="run-meta-row">
      <span><strong>Status:</strong> <span class="badge ${exportBadgeClass(runData?.status || '')}">${escHtml(runData?.status || 'unknown')}</span></span>
      ${runData?.terminal_state ? `<span><strong>Terminal:</strong> ${escHtml(runData.terminal_state)}</span>` : ''}
      ${glance.towerVerdict ? `<span><strong>Verdict:</strong> <span class="badge ${exportBadgeClass(glance.towerVerdict)}">${escHtml(glance.towerVerdict)}</span></span>` : ''}
      <span><strong>Type:</strong> ${escHtml(runData?.run_type || '-')}</span>
      <span><strong>Created:</strong> ${escHtml(formatTs(runData?.created_at))}</span>
      ${runData?.updated_at ? `<span><strong>Updated:</strong> ${escHtml(formatTs(runData.updated_at))}</span>` : ''}
      ${runData?.conversation_id ? `<span><strong>Conv:</strong> ${escHtml(String(runData.conversation_id).slice(0, 12))}...</span>` : ''}
    </div>
  </div>`;

  const glanceHtml = buildGlanceHtml(glance);

  let behaviourGlanceLine = '';
  if (benchmarkMeta) {
    const bmMeta = typeof benchmarkMeta.metadata === 'string' ? (() => { try { return JSON.parse(benchmarkMeta.metadata); } catch { return {}; } })() : (benchmarkMeta.metadata || {});
    const bmLlmResp = bmMeta.behaviour_llm_response || null;
    const bmBd = bmMeta.behaviour_decision || {};
    const bmBResult = bmLlmResp?.behaviour_result?.toUpperCase() || bmBd.result || benchmarkMeta.behaviour_result || '—';
    const bmBReason = bmMeta.behaviour_reason || bmLlmResp?.behaviour_reason || bmBd.reason || '—';
    const bmEvalMode = bmMeta.behaviour_eval_mode || bmLlmResp?.eval_mode || 'unknown';
    const bmSource = bmMeta.behaviour_source_of_truth || (bmEvalMode.startsWith('llm') && !bmEvalMode.includes('error') && !bmEvalMode.includes('parse_error') ? 'LLM' : bmEvalMode === 'fallback_legacy' ? 'Fallback legacy' : 'Unknown');
    const bmSourceLabel = bmSource === 'llm' ? 'LLM' : bmSource === 'fallback_legacy' ? 'Fallback legacy' : bmSource;
    const bmIsPass = bmBResult === 'PASS' || bmBResult === 'pass';
    const bmIsFail = bmBResult === 'FAIL' || bmBResult === 'fail';
    const bmLineColor = bmIsPass ? '#166534' : bmIsFail ? '#991b1b' : '#6b7280';
    const bmLineBg = bmIsPass ? '#dcfce7' : bmIsFail ? '#fee2e2' : '#f3f4f6';
    behaviourGlanceLine = `<div style="margin:-12px 0 20px 0; padding:8px 18px; border-radius:0 0 6px 6px; background:${bmLineBg}; border:1px solid ${bmIsPass ? '#bbf7d0' : bmIsFail ? '#fecaca' : '#d1d5db'}; border-top:none; font-size:12px; color:${bmLineColor}; line-height:1.5;">
      <strong>Behaviour source:</strong> ${escHtml(bmSourceLabel)} &nbsp;|&nbsp;
      <strong>Behaviour result:</strong> <span class="badge ${exportBadgeClass(bmBResult)}" style="font-weight:700;">${escHtml(bmBResult)}</span> &nbsp;|&nbsp;
      <strong>Why:</strong> ${escHtml(bmBReason.length > 100 ? bmBReason.slice(0, 100) + '...' : bmBReason)}
    </div>`;
  }

  const keyMomentsHtml = buildKeyMomentsHtml(events);

  let eventsHtml = '';
  if (events.length === 0) {
    eventsHtml = '<p class="section-empty">No events recorded.</p>';
  } else {
    eventsHtml = '<table><thead><tr><th>#</th><th>Timestamp</th><th>Type</th><th>Status</th><th>Summary</th></tr></thead><tbody>';
    events.forEach((ev, i) => {
      const rowCls = eventRowClass(ev);
      const summaryText = ev.summary || '';
      const truncated = summaryText.length > 150 ? summaryText.slice(0, 150) + '...' : summaryText;
      eventsHtml += `<tr class="${rowCls}">
        <td>${i + 1}</td>
        <td style="white-space:nowrap; font-size:11px;">${escHtml(formatTs(ev.ts))}</td>
        <td><code style="font-weight:${KEY_EVENT_TYPES.has((ev.type || '').toLowerCase()) ? '700' : '400'}">${escHtml(ev.type)}</code></td>
        <td><span class="badge ${exportBadgeClass(ev.status)}">${escHtml(ev.status)}</span></td>
        <td title="${escHtml(summaryText)}">${escHtml(truncated)}</td>
      </tr>`;
    });
    eventsHtml += '</tbody></table>';

    const eventsWithDetails = events.filter(ev => ev.details && Object.values(ev.details).some(v => v != null));
    if (eventsWithDetails.length > 0) {
      eventsHtml += '<h3>Event Details</h3>';
      eventsWithDetails.forEach((ev) => {
        const rowCls = eventRowClass(ev);
        eventsHtml += `<div class="event-row ${rowCls}" style="padding:8px 0;">
          <strong>${escHtml(ev.type)}</strong> &mdash; ${escHtml(formatTs(ev.ts))}`;
        if (ev.details.action) eventsHtml += `<br/><strong>Action:</strong> <code>${escHtml(ev.details.action)}</code>`;
        if (ev.details.durationMs != null) eventsHtml += `<br/><strong>Duration:</strong> ${ev.details.durationMs}ms`;
        if (ev.details.error) eventsHtml += `<br/><strong style="color:#dc2626">Error:</strong> <span style="color:#dc2626">${escHtml(ev.details.error)}</span>`;
        if (ev.details.results) {
          const highlighted = extractHighlightFields(ev.details.results);
          if (highlighted.length > 0) {
            eventsHtml += '<br/><div class="artefact-summary-fields"><dl style="margin:0">';
            highlighted.forEach(h => {
              eventsHtml += `<dt>${escHtml(h.key)}</dt><dd>${escHtml(h.value)}</dd>`;
            });
            eventsHtml += '</dl></div>';
          }
        }
        eventsHtml += `<details class="raw-payload-toggle"><summary>Raw payload</summary><pre>${escHtml(prettyJson(ev.details))}</pre></details>`;
        eventsHtml += '</div>';
      });
    }
  }

  let artefactsHtml = '';
  if (artefacts.length === 0) {
    artefactsHtml = '<p class="section-empty">No artefacts recorded.</p>';
  } else {
    artefacts.forEach((art, i) => {
      const isImportant = IMPORTANT_ARTEFACT_TYPES.has(art.type);
      const typeLabel = artefactTypeLabel(art.type);
      const highlighted = extractHighlightFields(art.payload_json);

      artefactsHtml += `<div class="artefact-card ${isImportant ? 'artefact-card-important' : ''}">
        <div class="artefact-card-header">
          <h3>${i + 1}. ${escHtml(art.title || 'Untitled')} ${typeLabel}</h3>
          <div style="margin-top:4px; font-size:11px; color:#6b7280;">
            Type: <code>${escHtml(art.type)}</code> &nbsp;|&nbsp;
            Created: ${escHtml(formatTs(art.created_at))} &nbsp;|&nbsp;
            ID: <code>${escHtml(String(art.id).slice(0, 12))}</code>
            ${art.summary ? `<br/>Summary: ${escHtml(art.summary)}` : ''}
          </div>
        </div>
        <div class="artefact-card-body">`;

      if (highlighted.length > 0) {
        artefactsHtml += '<div class="artefact-summary-fields"><dl style="margin:0">';
        highlighted.forEach(h => {
          artefactsHtml += `<dt>${escHtml(h.key)}</dt><dd>${escHtml(h.value)}</dd>`;
        });
        artefactsHtml += '</dl></div>';
      }

      artefactsHtml += `<details class="raw-payload-toggle"><summary>Full payload (JSON)</summary><pre>${escHtml(prettyJson(art.payload_json))}</pre></details>`;
      artefactsHtml += '</div></div>';
    });
  }

  let judgementsHtml = '';
  if (judgements.length === 0) {
    judgementsHtml = '<p class="section-empty">No judgements recorded.</p>';
  } else {
    judgementsHtml = '<table><thead><tr><th>Evaluated At</th><th>Verdict</th><th>Reason Code</th><th>Explanation</th></tr></thead><tbody>';
    judgements.forEach(j => {
      judgementsHtml += `<tr>
        <td style="white-space:nowrap">${escHtml(formatTs(j.evaluated_at))}</td>
        <td><span class="badge ${exportBadgeClass(j.verdict)}">${escHtml(j.verdict)}</span></td>
        <td><code>${escHtml(j.reason_code)}</code></td>
        <td>${escHtml(j.explanation)}</td>
      </tr>`;
    });
    judgementsHtml += '</tbody></table>';
    judgements.forEach((j, i) => {
      judgementsHtml += `<details class="raw-payload-toggle" style="margin-bottom:12px;">
        <summary>${i + 1}. ${escHtml(j.verdict)} — ${escHtml(j.reason_code)}</summary>
        <pre>${escHtml(prettyJson(j))}</pre>
      </details>`;
    });
  }

  const benchmarkHtml = benchmarkMeta ? `<h2>${sectionPrefix}Benchmark</h2>\n${buildBenchmarkSectionHtml(benchmarkMeta)}` : '';

  return `
${headerHtml}
${glanceHtml}
${behaviourGlanceLine}
${benchmarkHtml}
${keyMomentsHtml}

<h2>${sectionPrefix}Event Timeline (${events.length} events)</h2>
${eventsHtml}

<h2>${sectionPrefix}Artefacts (${artefacts.length})</h2>
${artefactsHtml}

<h2>${sectionPrefix}Judgements (${judgements.length})</h2>
${judgementsHtml}`;
}

export function triggerHtmlDownload(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export async function exportRunAsHtml(
  runId: string,
  clientRequestId: string | null,
) {
  const [{ runData, events, artefacts, judgements }, bmMap] = await Promise.all([
    fetchRunExportData(runId, clientRequestId),
    fetchBenchmarkMetaForRuns([runId]),
  ]);
  const bm = bmMap[runId] || null;

  const bodyHtml = buildRunSectionHtml(runData, runId, clientRequestId, events, artefacts, judgements, '', 0, 1, bm);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AFR Run Export — ${escHtml(runData?.title || runId)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<h1>Wyshbone AFR — Single Run Export</h1>
<p style="color:#6b7280; margin-bottom:20px">Generated ${new Date().toISOString()} &nbsp;|&nbsp; Run ID: <code>${escHtml(runId)}</code></p>

${bodyHtml}

</body>
</html>`;

  triggerHtmlDownload(html, `afr-run-${runId}.html`);
}

export async function autoExportRun(runId: string, clientRequestId: string | null): Promise<void> {
  try {
    await exportRunAsHtml(runId, clientRequestId);
    console.log(`[AFR_AUTO_EXPORT] Downloaded AFR for run ${runId}`);
  } catch (err: any) {
    console.warn(`[AFR_AUTO_EXPORT] Failed to export run ${runId}: ${err.message}`);
  }
}
