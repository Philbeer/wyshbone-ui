import { useState, useEffect, useRef } from "react";
import { Loader2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const summaryUp = summary.toUpperCase();
  const details = event.details || {};
  const task = details.task || '';
  const taskUp = task.toUpperCase();
  const ts = event.ts ? new Date(event.ts).getTime() : Date.now();

  const matchesSummaryOrTask = (pattern: RegExp) =>
    pattern.test(summary) || pattern.test(task);

  if (matchesSummaryOrTask(/SEARCH_PLACES|SEARCH PLACES|Google Places/i) || /search_places|gp_cascade/.test(type)) {
    const count = extractCount(task) ?? extractCount(summary);
    const text = count != null
      ? `Google Places — found ${count} results`
      : 'Google Places search';
    return { pinned: { key: `search_places-${event.id}`, icon: '🔍', text, timestamp: ts }, ephemeral: null };
  }

  if (matchesSummaryOrTask(/WEB.?SEARCH|GPT.?4o search|web search/i)) {
    return { pinned: { key: `web_search-${event.id}`, icon: '🌐', text: 'Web search complete', timestamp: ts }, ephemeral: null };
  }

  if (matchesSummaryOrTask(/reloop|re.?loop/i) || /reloop/.test(type)) {
    return { pinned: { key: `reloop-${event.id}`, icon: '🔄', text: 'Re-loop: trying another approach', timestamp: ts }, ephemeral: null };
  }

  if (/tower_evaluation|tower_judgement/.test(type) || matchesSummaryOrTask(/Tower verdict|tower evaluation|tower judgement/i)) {
    const verdict = details.results || details.action || task || summary || 'unknown';
    return { pinned: { key: `tower_eval-${event.id}`, icon: '⚖️', text: `Quality check: ${verdict.slice(0, 40)}`, timestamp: ts }, ephemeral: null };
  }

  if (matchesSummaryOrTask(/Run Completed|Execution Completed/i) || /run_completed|reloop_chain_summary/.test(type)) {
    return { pinned: { key: 'run_completed', icon: '✅', text: 'Complete', timestamp: ts }, ephemeral: null };
  }

  if (matchesSummaryOrTask(/WEB VISIT|Visiting/i) || /web.?visit/.test(type)) {
    return { pinned: null, ephemeral: { icon: '🌐', text: 'Visiting website...', timestamp: ts } };
  }

  if (matchesSummaryOrTask(/Evidence/i) || /evidence/.test(type)) {
    return { pinned: null, ephemeral: { icon: '📄', text: 'Checking evidence...', timestamp: ts } };
  }

  if (matchesSummaryOrTask(/Tower semantic|Verif/i) || /tower_semantic|verif/.test(type)) {
    return { pinned: null, ephemeral: { icon: '⚖️', text: 'Verifying...', timestamp: ts } };
  }

  if (matchesSummaryOrTask(/Tool Completed/i) || /tool_call/.test(type)) {
    const toolMatch = summary.match(/Tool Completed:\s*(.+)/i) || task.match(/Tool[:\s]+(.+)/i);
    const toolName = toolMatch ? toolMatch[1].trim() : (details.action || details.label || '');
    const text = toolName ? `${toolName.slice(0, 40)}...` : 'Running tool...';
    return { pinned: null, ephemeral: { icon: '🔧', text, timestamp: ts } };
  }

  if (matchesSummaryOrTask(/Executing/i) || /step_started/.test(type)) {
    const label = details.label || details.task || details.action || summary;
    const text = label ? `${label.slice(0, 50)}...` : 'Executing...';
    return { pinned: null, ephemeral: { icon: '⚙️', text, timestamp: ts } };
  }

  const fallbackText = summary ? summary.slice(0, 50) : 'Processing...';
  return { pinned: null, ephemeral: { icon: '⚙️', text: fallbackText, timestamp: ts } };
}

function ThinkingBrains() {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-0.5">
        {[0, 1, 2].map(i => (
          <Brain
            key={i}
            className={cn(
              "h-3 w-3 transition-opacity duration-200",
              i < phase ? "opacity-70" : "opacity-20"
            )}
          />
        ))}
      </div>
      <span>Thinking...</span>
    </div>
  );
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

  if (!isActive && pinnedEvents.length === 0 && !liveEvent) return null;

  return (
    <div className="border-l-2 border-primary/20 pl-3 space-y-1 py-2">
      {isActive && pinnedEvents.length === 0 && !liveEvent && (
        <ThinkingBrains />
      )}
      {pinnedEvents.map((evt) => (
        <div key={evt.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{evt.icon}</span>
          <span>{evt.text}</span>
        </div>
      ))}
      {isActive && liveEvent && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground/70 animate-pulse"
          key={liveEvent.timestamp}
        >
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          <span className="transition-opacity duration-300">{liveEvent.text}</span>
        </div>
      )}
    </div>
  );
}
