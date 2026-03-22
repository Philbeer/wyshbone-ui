import { useState, useEffect, useRef } from "react";
import { Loader2, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDevAuthParams, buildApiUrl } from "@/lib/queryClient";

export interface IntentNarrativePayload {
  entity_description?: string;
  entity_exclusions?: string[];
  commercial_context?: string;
  key_discriminator?: string;
  findability?: 'easy' | 'moderate' | 'hard' | 'very_hard';
  scarcity_expectation?: string;
  suggested_approaches?: string[];
  clarification_needed?: boolean;
  clarification_question?: string;
}

export interface LiveActivityTickerProps {
  runId: string | null;
  clientRequestId: string | null;
  isActive: boolean;
  intentNarrativePayload?: IntentNarrativePayload | null;
}

interface Milestone {
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

function deriveMilestones(events: StreamEvent[]): Milestone[] {
  const milestones: Milestone[] = [];

  // Milestone 1: Google Places search — consolidate ALL search_places events into one
  const gpEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (
      s.includes('SEARCH_PLACES') || s.includes('SEARCH PLACES') ||
      t.includes('SEARCH_PLACES') || t.includes('SEARCH PLACES')
    );
  });
  if (gpEvents.length > 0) {
    let maxCount = 0;
    for (const e of gpEvents) {
      const count = extractCount(e.details?.task) ?? extractCount(e.summary) ?? 0;
      if (count > maxCount) maxCount = count;
    }
    const text = maxCount > 0
      ? `Google Places — found ${maxCount} candidates`
      : 'Google Places search';
    milestones.push({ key: 'gp_search', icon: '🔍', text, timestamp: new Date(gpEvents[0].ts).getTime() });
  }

  // Milestone 2: Website evidence checking (when web visits begin)
  const webVisitEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    return s.includes('WEB VISIT') || s.includes('WEB_VISIT') || s.includes('VISITING');
  });
  const evidenceEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.type || '').toLowerCase();
    return s.includes('EVIDENCE') || t.includes('evidence');
  });
  const webVisitCount = webVisitEvents.length;
  if (webVisitCount > 0 || evidenceEvents.length > 0) {
    const text = webVisitCount > 0
      ? `Checking ${webVisitCount} websites for evidence`
      : 'Checking evidence...';
    const firstTs = webVisitEvents[0]?.ts || evidenceEvents[0]?.ts;
    milestones.push({ key: 'web_evidence', icon: '🌐', text, timestamp: new Date(firstTs).getTime() });
  }

  // Milestone 3: Evidence verification complete
  const verifyEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (
      s.includes('EVIDENCE VERIF') || s.includes('VERIFICATION') || t.includes('VERIF') ||
      s.includes('CHECKS PASSED') || t.includes('CHECKS PASSED')
    );
  });
  if (verifyEvents.length > 0) {
    const last = verifyEvents[verifyEvents.length - 1];
    const task = last.details?.task || last.summary || '';
    const match = task.match(/(\d+)\/(\d+)/);
    const text = match
      ? `Evidence verified: ${match[1]}/${match[2]} checks passed`
      : 'Evidence verification complete';
    milestones.push({ key: 'evidence_done', icon: '📋', text, timestamp: new Date(last.ts).getTime() });
  }

  // Milestone 4: Tower quality check
  const towerEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    const a = (e.details?.action || '').toLowerCase();
    return (
      s.includes('TOWER VERDICT') || s.includes('TOWER JUDGEMENT') ||
      a.includes('tower_judgement') || s.includes('[TOWER]') ||
      t.includes('TOWER VERDICT') || s.includes('QUALITY CHECK')
    );
  });
  if (towerEvents.length > 0) {
    const last = towerEvents[towerEvents.length - 1];
    const task = last.details?.task || last.summary || '';
    const verdictMatch = task.match(/(pass|fail|stop|accept|reject)/i);
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : '';
    const text = verdict ? `Quality check: ${verdict}` : 'Quality check complete';
    milestones.push({ key: 'tower_verdict', icon: '⚖️', text, timestamp: new Date(last.ts).getTime() });
  }

  // Milestone 5: Run complete
  const completeEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (
      s.includes('RUN COMPLETED') || s.includes('EXECUTION COMPLETED') ||
      t.includes('RUN COMPLETED') || s.includes('MISSION-DRIVEN EXECUTION COMPLETE')
    );
  });
  if (completeEvents.length > 0) {
    const last = completeEvents[completeEvents.length - 1];
    const task = last.details?.task || last.summary || '';
    const countMatch = task.match(/(\d+)\s*leads/i);
    const text = countMatch
      ? `${countMatch[1]} verified results delivered`
      : 'Run complete';
    milestones.push({ key: 'run_complete', icon: '✅', text, timestamp: new Date(last.ts).getTime() });
  }

  // Milestone: Reloop (insert after gp_search if present)
  const reloopEvents = events.filter(e => {
    const s = (e.summary || '').toUpperCase();
    return s.includes('RELOOP') || s.includes('RE-LOOP') || s.includes('RE_LOOP');
  });
  if (reloopEvents.length > 0) {
    const reloopEvent = reloopEvents.find(e => {
      const s = (e.summary || '').toUpperCase();
      return !s.includes('STOP_DELIVER') && !s.includes('COMPLETE');
    });
    if (reloopEvent) {
      const gpIdx = milestones.findIndex(m => m.key === 'gp_search');
      const insertAt = gpIdx >= 0 ? gpIdx + 1 : 1;
      milestones.splice(insertAt, 0, {
        key: 'reloop',
        icon: '🔄',
        text: 'Not enough — trying another approach',
        timestamp: new Date(reloopEvent.ts).getTime(),
      });
    }
  }

  return milestones;
}

function deriveEphemeral(events: StreamEvent[]): LiveEvent | null {
  let latest: LiveEvent | null = null;
  let latestTs = 0;

  for (const event of events) {
    const ts = new Date(event.ts).getTime();
    if (ts <= latestTs) continue;

    const summary = event.summary || '';
    const summaryUp = summary.toUpperCase();
    const task = event.details?.task || '';

    // Skip milestone-level events
    if (
      summaryUp.includes('SEARCH_PLACES') ||
      summaryUp.includes('RUN COMPLETED') ||
      summaryUp.includes('TOWER VERDICT') ||
      summaryUp.includes('EXECUTION COMPLETED') ||
      summaryUp.includes('MISSION-DRIVEN EXECUTION COMPLETE')
    ) continue;

    let icon = '⚙️';
    let text = summary.slice(0, 50) || 'Processing...';

    if (summaryUp.includes('WEB VISIT') || summaryUp.includes('VISITING')) {
      icon = '🌐';
      const urlMatch = (task || summary).match(/https?:\/\/(?:www\.)?([^/\s]+)/);
      text = urlMatch ? `Visiting ${urlMatch[1]}...` : 'Visiting website...';
    } else if (summaryUp.includes('EVIDENCE')) {
      icon = '📄';
      const nameMatch = (task || summary).match(/"([^"]+)"/);
      text = nameMatch ? `Checking ${nameMatch[1]}...` : 'Checking evidence...';
    } else if (summaryUp.includes('TOWER SEMANTIC') || summaryUp.includes('VERIF')) {
      icon = '⚖️';
      const nameMatch = (task || summary).match(/"([^"]+)"/);
      text = nameMatch ? `Verifying ${nameMatch[1]}...` : 'Verifying...';
    } else if (summaryUp.includes('EXECUTING') || summaryUp.includes('TOOL')) {
      icon = '🔧';
      const toolMatch = summary.match(/(?:Tool|Executing)[:\s]+(.+)/i);
      text = toolMatch ? `${toolMatch[1].slice(0, 40)}...` : 'Executing...';
    } else if (summaryUp.includes('ARTEFACT')) {
      icon = '📦';
      text = task ? task.slice(0, 50) : summary.slice(0, 50);
    }

    latestTs = ts;
    latest = { icon, text, timestamp: ts };
  }

  return latest;
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

export function LiveActivityTicker({ runId, clientRequestId, isActive, intentNarrativePayload }: LiveActivityTickerProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
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

      const newMilestones = deriveMilestones(data.events);
      setMilestones(newMilestones);

      const ephemeral = isActive ? deriveEphemeral(data.events) : null;
      if (ephemeral) setLiveEvent(ephemeral);
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

  const hasAnything = milestones.length > 0 || !!liveEvent || !!intentNarrativePayload;
  if (!isActive && !hasAnything) return null;

  return (
    <div className="pl-4 relative py-2">
      {/* Vertical connector line running full height */}
      <div className="absolute left-[7px] top-0 bottom-0 w-0.5 bg-border" />

      {/* Thinking brains when nothing yet */}
      {isActive && milestones.length === 0 && !liveEvent && (
        <div className="relative pb-5">
          <span className="absolute left-[-1px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary/40 bg-card z-10" />
          <div className="pl-5">
            <ThinkingBrains />
          </div>
        </div>
      )}

      {/* Milestone events */}
      {milestones.map((ms) => (
        <div key={ms.key} className="relative pb-5">
          <span className={cn(
            "absolute left-[-1px] top-1.5 h-2.5 w-2.5 rounded-full border-2 z-10",
            ms.key === 'run_complete'
              ? "border-green-500 bg-green-500"
              : ms.key === 'tower_verdict'
                ? "border-amber-500 bg-amber-500"
                : "border-primary/60 bg-primary/60"
          )} />
          <div className="pl-5 flex items-center gap-2 text-xs text-foreground/80 font-medium">
            <span>{ms.icon}</span>
            <span>{ms.text}</span>
          </div>
        </div>
      ))}

      {/* Ephemeral cycling line */}
      {isActive && liveEvent && (
        <div className="relative pb-3">
          <span className="absolute left-[-1px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/30 bg-card animate-pulse z-10" />
          <div className="pl-5 flex items-center gap-2 text-xs text-muted-foreground/60">
            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
            <span className="transition-all duration-300">{liveEvent.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
