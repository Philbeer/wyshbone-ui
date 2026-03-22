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

export function LiveActivityTicker({ runId, clientRequestId, isActive }: LiveActivityTickerProps) {
  const [pinnedEvents, setPinnedEvents] = useState<PinnedEvent[]>([]);
  const [liveEvent, setLiveEvent] = useState<LiveEvent | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedRef = useRef(false);

  const fetchAndProcess = async () => {
    if (!runId && !clientRequestId) return;
    try {
      const params = new URLSearchParams();
      if (clientRequestId) params.set('client_request_id', clientRequestId);
      if (runId) params.set('runId', runId);
      const url = addDevAuthParams(buildApiUrl(`/api/afr/artefacts?${params.toString()}`));
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const rows: any[] = await res.json();
      if (!Array.isArray(rows)) return;

      const newPinned: PinnedEvent[] = [];
      let latestEphemeral: LiveEvent | null = null;
      let latestEphemeralTs = 0;

      for (const row of rows) {
        const type: string = row.type || '';
        let payload: any = row.payload_json;
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch { payload = {}; }
        }
        payload = payload || {};
        const rowTs: number = row.created_at ? new Date(row.created_at).getTime() : 0;

        if (type === 'reloop_iteration') {
          const loopNum: number = payload.loop_number ?? 0;
          const pinnedKey = `reloop_iteration-${loopNum}`;
          if (!newPinned.some(e => e.key === pinnedKey)) {
            const executorType: string = payload.executor_type ?? '';
            const entitiesFound: number = payload.executor_output_summary?.entitiesFound ?? 0;
            let icon = '🔍';
            let text = '';
            if (/gp_cascade|google|places/i.test(executorType)) {
              text = `Searched Google Places — found ${entitiesFound} results`;
            } else if (/gpt4o_search|gpt4o|web/i.test(executorType)) {
              icon = '🌐';
              text = `Web search — found ${entitiesFound} more results`;
            } else {
              text = `Searched — found ${entitiesFound} results`;
            }
            newPinned.push({ key: pinnedKey, icon, text, timestamp: rowTs || Date.now() });
          }
        } else if (type === 'tower_judgement' && payload.artefact_type === 'combined_delivery') {
          const pinnedKey = 'tower_judgement-combined_delivery';
          if (!newPinned.some(e => e.key === pinnedKey)) {
            const verdict = payload.verdict || payload.result || 'unknown';
            newPinned.push({ key: pinnedKey, icon: '⚖️', text: `Quality check: ${verdict}`, timestamp: rowTs || Date.now() });
          }
        } else if (type === 'reloop_chain_summary') {
          const pinnedKey = 'reloop_chain_summary';
          if (!newPinned.some(e => e.key === pinnedKey)) {
            const totalEntities: number = payload.total_entities ?? 0;
            const totalLoops: number = payload.total_loops ?? 0;
            if (totalLoops > 1) {
              newPinned.push({ key: pinnedKey, icon: '✅', text: `${totalEntities} results from ${totalLoops} search loops`, timestamp: rowTs || Date.now() });
            }
          }
        } else {
          let icon = '⚙️';
          let text = 'Processing...';

          if (type.includes('evidence')) {
            icon = '📄';
            const entityName = payload.entity_name || payload.lead_name || payload.name || '';
            text = entityName ? `Checking evidence for ${entityName}...` : 'Checking evidence...';
          } else if (type === 'tower_semantic_judgement') {
            icon = '⚖️';
            const leadName = payload.lead_name || payload.name || '';
            text = leadName ? `Verifying ${leadName}...` : 'Verifying result...';
          } else if (type === 'web_visit' || type.includes('web_visit')) {
            icon = '🌐';
            const rawUrl = payload.url || payload.source_url || '';
            let domain = rawUrl;
            try { domain = new URL(rawUrl).hostname.replace('www.', ''); } catch {}
            text = domain ? `Visiting ${domain}...` : 'Visiting website...';
          } else if (type === 'lead_pack') {
            icon = '📦';
            const entityName = payload.entity_name || '';
            text = entityName ? `Building lead pack for ${entityName}...` : 'Building lead pack...';
          } else if (type === 'contact_extract') {
            icon = '📧';
            text = 'Extracting contacts...';
          } else if (type === 'tool_call_started' || type === 'tool_call_completed') {
            icon = '🔧';
            const toolName = payload.tool_name || payload.name || '';
            text = toolName ? `Running ${toolName}...` : 'Running tool...';
          }

          if (rowTs > latestEphemeralTs) {
            latestEphemeralTs = rowTs;
            latestEphemeral = { icon, text, timestamp: rowTs || Date.now() };
          }
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
          return merged;
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
    <div className="space-y-1 py-2">
      {pinnedEvents.map((evt) => (
        <div key={evt.key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{evt.icon}</span>
          <span>{evt.text}</span>
        </div>
      ))}
      {isActive && liveEvent && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground/60 animate-pulse"
          key={liveEvent.timestamp}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="transition-opacity duration-300">{liveEvent.text}</span>
        </div>
      )}
    </div>
  );
}
