import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { addDevAuthParams, buildApiUrl } from "@/lib/queryClient";

export interface LiveActivityTickerProps {
  runId: string | null;
  clientRequestId: string | null;
  isActive: boolean;
}

interface PinnedEvent {
  key: string;
  icon: string;
  text: string;
  timestamp: number;
}

interface LiveEvent {
  icon: string;
  text: string;
  timestamp: number;
}

interface StreamEventDetails {
  runType?: string;
  action?: string | null;
  task?: string | null;
  error?: string | null;
  durationMs?: number | null;
  results?: string | null;
  label?: string | null;
  prompt?: string | null;
  mode?: string | null;
  outputPreview?: string | null;
}

interface StreamEvent {
  id: string;
  ts: string;
  type: string;
  summary: string;
  details: StreamEventDetails;
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_id: string | null;
  client_request_id: string | null;
}

interface StreamResponse {
  client_request_id: string | null;
  title: string;
  status: string;
  is_terminal: boolean;
  events: StreamEvent[];
  event_count: number;
}

function extractCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function classifyEvent(event: StreamEvent): { pinned: PinnedEvent | null; ephemeral: LiveEvent | null } {
  const type = (event.type || '').toLowerCase();
  const summary = event.summary || '';
  const details = event.details || {};
  const task = details.task || '';
  const action = details.action || '';
  const label = details.label || '';
  const results = details.results || '';
  const ts = event.ts ? new Date(event.ts).getTime() : Date.now();

  if (/search_places/.test(type) || /gp_cascade/.test(type)) {
    const count = extractCount(results) ?? extractCount(summary);
    const text = count != null
      ? `Google Places — found ${count} results`
      : 'Google Places search';
    return { pinned: { key: `search_places-${event.id}`, icon: '🔍', text, timestamp: ts }, ephemeral: null };
  }

  if (/reloop_iteration/.test(type)) {
    return { pinned: { key: `reloop-${event.id}`, icon: '🔄', text: 'Re-loop: trying another approach', timestamp: ts }, ephemeral: null };
  }

  if (type === 'tower_evaluation_completed' || type === 'tower_judgement') {
    const verdict = results || action || summary || 'unknown';
    return { pinned: { key: `tower_eval-${event.id}`, icon: '⚖️', text: `Quality check: ${verdict.slice(0, 40)}`, timestamp: ts }, ephemeral: null };
  }

  if (type === 'run_completed' || type === 'reloop_chain_summary') {
    return { pinned: { key: 'run_completed', icon: '✅', text: 'Run complete', timestamp: ts }, ephemeral: null };
  }

  if (/step_completed/.test(type) && (/google|places/i.test(task) || /google|places/i.test(summary))) {
    return { pinned: { key: `step_completed_places-${event.id}`, icon: '🔍', text: 'Found results via Google Places', timestamp: ts }, ephemeral: null };
  }

  if (/tool_call_started/.test(type)) {
    const toolName = action || label || '';
    const text = toolName ? `${toolName}...` : 'Running tool...';
    return { pinned: null, ephemeral: { icon: '🔧', text, timestamp: ts } };
  }

  if (/web.?visit/.test(type)) {
    return { pinned: null, ephemeral: { icon: '🌐', text: 'Visiting website...', timestamp: ts } };
  }

  if (/step_started/.test(type)) {
    const stepLabel = label || task || action || summary;
    const text = stepLabel ? `${stepLabel.slice(0, 40)}...` : 'Working...';
    return { pinned: null, ephemeral: { icon: '⚙️', text, timestamp: ts } };
  }

  if (type === 'tower_decision_change_plan') {
    return { pinned: null, ephemeral: { icon: '🔄', text: 'Replanning...', timestamp: ts } };
  }

  if (/evidence/.test(type)) {
    const name = action || label || '';
    const text = name ? `Checking evidence for ${name.slice(0, 30)}...` : 'Checking evidence...';
    return { pinned: null, ephemeral: { icon: '📄', text, timestamp: ts } };
  }

  if (/tower_semantic|verif/.test(type)) {
    const name = action || label || '';
    const text = name ? `Verifying ${name.slice(0, 30)}...` : 'Verifying result...';
    return { pinned: null, ephemeral: { icon: '⚖️', text, timestamp: ts } };
  }

  const fallbackText = summary ? summary.slice(0, 40) : 'Processing...';
  return { pinned: null, ephemeral: { icon: '⚙️', text: fallbackText, timestamp: ts } };
}

export function LiveActivityTicker({ runId, clientRequestId, isActive }: LiveActivityTickerProps) {
  const [pinnedEvents, setPinnedEvents] = useState<PinnedEvent[]>([]);
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAndProcess = async () => {
    if (!runId && !clientRequestId) return;
    try {
      const params = new URLSearchParams();
      if (clientRequestId) params.set('client_request_id', clientRequestId);
      if (runId) params.set('runId', runId);
      params.set('_t', String(Date.now()));
      const url = addDevAuthParams(buildApiUrl(`/api/afr/stream?${params.toString()}`));
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data: StreamResponse = await res.json();
      if (!data || !Array.isArray(data.events)) return;

      const newPinned: PinnedEvent[] = [];
      let latestEphemeral: LiveEvent | null = null;
      let latestEphemeralTs = 0;

      for (const event of data.events) {
        const { pinned, ephemeral } = classifyEvent(event);
        if (pinned) {
          newPinned.push(pinned);
        } else if (ephemeral && ephemeral.timestamp > latestEphemeralTs) {
          latestEphemeralTs = ephemeral.timestamp;
          latestEphemeral = ephemeral;
        }
      }

      if (newPinned.length > 0) {
        setPinnedEvents(prev => {
          const merged = [...prev];
          for (const evt of newPinned) {
            if (!merged.some(e => e.key === evt.key)) {
              merged.push(evt);
            }
          }
          return merged.slice(-5);
        });
      }

      if (isActive && latestEphemeral) {
        setLiveEvent(latestEphemeral);
      }
    } catch {}
  };

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    fetchAndProcess();

    if (isActive) {
      intervalRef.current = setInterval(fetchAndProcess, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, runId, clientRequestId]);

  useEffect(() => {
    if (!isActive) {
      setLiveEvent(null);
      fetchAndProcess();
    }
  }, [isActive]);

  if (pinnedEvents.length === 0 && !liveEvent) return null;

  return (
    <div className="border-l-2 border-primary/20 pl-3 space-y-1 py-2">
      {pinnedEvents.map((evt) => (
        <div key={evt.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{evt.icon}</span>
          <span>{evt.text}</span>
        </div>
      ))}
      {isActive && liveEvent && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground/80 animate-pulse"
          key={liveEvent.timestamp}
        >
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          <span className="transition-opacity duration-300">{liveEvent.text}</span>
        </div>
      )}
    </div>
  );
}
