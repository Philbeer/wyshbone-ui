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
  if (events.length === 0) return milestones;

  const sorted = [...events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  let lastMilestoneTs = 0;

  const findFirstAfter = (
    filter: (e: StreamEvent) => boolean,
    afterTs: number
  ): StreamEvent | null => {
    return sorted.find(e => new Date(e.ts).getTime() > afterTs && filter(e)) || null;
  };

  const findLast = (filter: (e: StreamEvent) => boolean): StreamEvent | null => {
    const matches = sorted.filter(filter);
    return matches.length > 0 ? matches[matches.length - 1] : null;
  };

  const countUniqueCompleted = (
    filter: (e: StreamEvent) => boolean
  ): number => {
    const matches = sorted.filter(filter);
    const seen = new Set<string>();
    for (const e of matches) {
      const task = e.details?.task || e.summary || '';
      const urlMatch = task.match(/https?:\/\/(?:www\.)?([^/\s&]+)/);
      seen.add(urlMatch ? urlMatch[1] : e.id);
    }
    return seen.size;
  };

  // ── Milestone 1: Google Places search ──
  const gpFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (s.includes('SEARCH_PLACES') || s.includes('SEARCH PLACES') ||
            t.includes('SEARCH_PLACES') || t.includes('SEARCH PLACES')) &&
           (s.includes('COMPLETED') || s.includes('FOUND') || e.status === 'completed');
  };
  const gpEvent = findLast(gpFilter) || sorted.find(e => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return s.includes('SEARCH_PLACES') || t.includes('SEARCH_PLACES');
  });
  if (gpEvent) {
    let maxCount = 0;
    for (const e of sorted) {
      const s = (e.summary || '').toUpperCase();
      const t = (e.details?.task || '').toUpperCase();
      if (s.includes('SEARCH_PLACES') || t.includes('SEARCH_PLACES')) {
        const count = extractCount(e.details?.task) ?? extractCount(e.summary) ?? 0;
        if (count > maxCount) maxCount = count;
      }
    }
    const ts = new Date(gpEvent.ts).getTime();
    milestones.push({
      key: 'gp_search',
      icon: '🔍',
      text: maxCount > 0 ? `Google Places — found ${maxCount} candidates` : 'Searching Google Places...',
      timestamp: ts,
    });
    lastMilestoneTs = ts;
  }

  // ── Milestone 1.5: Reloop (only if system re-looped with a different executor) ──
  const reloopFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    return (s.includes('RELOOP') || s.includes('RE-LOOP') || s.includes('RE_LOOP')) &&
           !s.includes('STOP_DELIVER') && !s.includes('COMPLETE') && !s.includes('→ PASS');
  };
  const reloopEvent = findFirstAfter(reloopFilter, lastMilestoneTs);
  if (reloopEvent) {
    const task = reloopEvent.details?.task || reloopEvent.summary || '';
    let nextApproach = 'trying a different approach';
    if (/gpt4o|web.?search/i.test(task)) nextApproach = 'switching to web search';
    else if (/gp_cascade|google|places/i.test(task) && milestones.some(m => m.key === 'gp_search')) nextApproach = 'switching to web search';

    const ts = new Date(reloopEvent.ts).getTime();
    milestones.push({
      key: 'reloop',
      icon: '🔄',
      text: `Not enough coverage — ${nextApproach}`,
      timestamp: ts,
    });
    lastMilestoneTs = ts;
  }

  // ── Milestone 2: Checking websites (only show AFTER GP search completes) ──
  const webVisitAnyFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (s.includes('WEB VISIT') || s.includes('WEB_VISIT') || t.includes('WEB VISIT') || t.includes('WEB_VISIT')) &&
           !s.includes('SEARCH_PLACES') && !s.includes('SEARCH PLACES');
  };
  const firstWebVisitEvent = findFirstAfter(webVisitAnyFilter, lastMilestoneTs);
  if (firstWebVisitEvent) {
    // Count both successful AND failed web visits — failed means bot-blocked, still an attempt
    const webVisitCompletedFilter = (e: StreamEvent) => {
      const s = (e.summary || '').toUpperCase();
      return (s.includes('TOOL COMPLETED') || s.includes('TOOL FAILED')) &&
             (s.includes('WEB VISIT') || s.includes('WEB_VISIT'));
    };
    const completedMatches = sorted.filter(webVisitCompletedFilter);
    const seenDomains = new Set<string>();
    for (const e of completedMatches) {
      const task = e.details?.task || e.summary || '';
      const urlMatch = task.match(/https?:\/\/(?:www\.)?([^/\s&]+)/);
      if (urlMatch) seenDomains.add(urlMatch[1]);
      else seenDomains.add(e.id);
    }
    const completedCount = seenDomains.size;

    // Use post-exclusion count if available, otherwise GP count
    const exclusionEvent = sorted.find(e => {
      const s = (e.summary || '').toUpperCase();
      return s.includes('EXCLUSION FILTER') && s.includes('KEPT');
    });
    let totalExpected = 0;
    if (exclusionEvent) {
      const keptMatch = (exclusionEvent.details?.task || exclusionEvent.summary || '').match(/(\d+)\s*kept/i);
      totalExpected = keptMatch ? parseInt(keptMatch[1], 10) : 0;
    }
    if (totalExpected === 0) {
      const gpMilestone = milestones.find(m => m.key === 'gp_search');
      totalExpected = gpMilestone ? (extractCount(gpMilestone.text) ?? 0) : 0;
    }

    const ts = new Date(firstWebVisitEvent.ts).getTime();
    let text: string;
    if (completedCount > 0 && totalExpected > 0) {
      text = `Checking websites — ${completedCount} of ${totalExpected} visited`;
    } else if (completedCount > 0) {
      text = `Checking websites — ${completedCount} visited so far`;
    } else {
      text = 'Checking pub websites for evidence...';
    }
    milestones.push({
      key: 'web_evidence',
      icon: '🌐',
      text,
      timestamp: ts,
    });
    lastMilestoneTs = ts;
  }

  // ── Milestone 3: Evidence verification complete (only AFTER web visits) ──
  const verifyFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return (s.includes('CHECKS PASSED') || t.includes('CHECKS PASSED')) ||
           (s.includes('EVIDENCE VERIFICATION:') || t.includes('EVIDENCE VERIFICATION:')) ||
           (s.includes('FINAL DELIVERY:') && (s.includes('LEADS') || t.includes('LEADS')));
  };
  const verifyEvent = findFirstAfter(verifyFilter, lastMilestoneTs);
  if (verifyEvent) {
    const task = verifyEvent.details?.task || verifyEvent.summary || '';
    const match = task.match(/(\d+)\/(\d+)/);
    const text = match
      ? `Evidence verified: ${match[1]}/${match[2]} checks passed`
      : 'Evidence verification complete';
    const ts = new Date(verifyEvent.ts).getTime();
    milestones.push({
      key: 'evidence_done',
      icon: '📋',
      text,
      timestamp: ts,
    });
    lastMilestoneTs = ts;
  }

  // ── Milestone 4: Tower quality check (only AFTER evidence verification) ──
  const towerFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    const a = (e.details?.action || '').toLowerCase();
    return (s.includes('[TOWER]') || s.includes('TOWER VERDICT') || s.includes('TOWER FINAL') ||
            a === 'tower_judgement' || a === 'tower_evaluation_completed') &&
           !s.includes('REQUESTING') && !s.includes('SEMANTIC');
  };
  const towerEvent = findFirstAfter(towerFilter, lastMilestoneTs);
  if (towerEvent) {
    const task = towerEvent.details?.task || towerEvent.summary || '';
    const verdictMatch = task.match(/(pass|fail|stop|accept|reject)/i);
    const verdict = verdictMatch ? verdictMatch[1].toUpperCase() : '';
    const ts = new Date(towerEvent.ts).getTime();
    milestones.push({
      key: 'tower_verdict',
      icon: '⚖️',
      text: verdict ? `Quality check: ${verdict}` : 'Quality check complete',
      timestamp: ts,
    });
    lastMilestoneTs = ts;
  }

  // ── Milestone 5: Run complete (only AFTER tower) ──
  const completeFilter = (e: StreamEvent) => {
    const s = (e.summary || '').toUpperCase();
    const t = (e.details?.task || '').toUpperCase();
    return s.includes('RUN COMPLETED') || s.includes('EXECUTION COMPLETED') ||
           t.includes('RUN COMPLETED') || s.includes('MISSION-DRIVEN EXECUTION COMPLETE');
  };
  const completeEvent = findFirstAfter(completeFilter, lastMilestoneTs);
  if (completeEvent) {
    const task = completeEvent.details?.task || completeEvent.summary || '';
    const countMatch = task.match(/(\d+)\s*leads/i);
    const text = countMatch ? `${countMatch[1]} verified results delivered` : 'Run complete';
    milestones.push({
      key: 'run_complete',
      icon: '✅',
      text,
      timestamp: new Date(completeEvent.ts).getTime(),
    });
  }

  return milestones;
}

function deriveEphemeral(events: StreamEvent[]): LiveEvent | null {
  // ── Step 1: Build a URL-domain → pub-name map from ALL events ──
  // Evidence events contain: "Norfolk Tap" + "norfolktap.com" 
  // WEB_VISIT events contain: "https://norfolktap.com/"
  // By mapping domains to names, we can show "Visiting Norfolk Tap..." even for URL-only events
  const domainToName = new Map<string, string>();
  
  for (const event of events) {
    const task = event.details?.task || '';
    const summary = event.summary || '';
    const combined = task + ' ' + summary;
    
    // Extract quoted name and URL from the same event
    const nameMatch = combined.match(/"([^"]{2,40})"/);
    const urlMatch = combined.match(/https?:\/\/(?:www\.)?([^/\s&"]+)/);
    
    if (nameMatch && urlMatch) {
      const domain = urlMatch[1].toLowerCase();
      domainToName.set(domain, nameMatch[1]);
    }
    
    // Also extract from patterns like "WEB_VISIT: https://domain/ (N pages)" + nearby evidence with name
    // And "Evidence: "Name" — ..." patterns
    if (nameMatch && !urlMatch) {
      // Store name keyed by event id so we can look it up for nearby events
      domainToName.set(`name:${event.id}`, nameMatch[1]);
    }
  }

  // ── Step 2: Helper to get a human name for any event ──
  const getDisplayName = (event: StreamEvent): string | null => {
    const task = event.details?.task || '';
    const summary = event.summary || '';
    const combined = task + ' ' + summary;
    
    // Direct quoted name in this event
    const nameMatch = combined.match(/"([^"]{2,40})"/);
    if (nameMatch) return nameMatch[1];
    
    // URL in this event → look up in our domain map
    const urlMatch = combined.match(/https?:\/\/(?:www\.)?([^/\s&"]+)/);
    if (urlMatch) {
      const domain = urlMatch[1].toLowerCase();
      const mapped = domainToName.get(domain);
      if (mapped) return mapped;
      // Fallback: clean the domain into a readable name
      // "norfolktap.com" → "norfolktap", "www.redlionarundel.com" → "redlionarundel"
      const cleanDomain = domain.replace(/\.co\.uk$|\.com$|\.org\.uk$|\.org$|\.uk$|\.net$/, '');
      if (cleanDomain.length > 2 && cleanDomain.length < 30) return cleanDomain;
    }
    
    return null;
  };

  // ── Step 3: Find the best recent ephemeral event ──
  const JUNK_PATTERNS = [
    /PROBE:/i, /ROUTER:/i, /ARTEFACT POST/i, /ARTEFACT.*SUCCEEDED/i,
    /ARTEFACTID=/i, /SUPERVISOR_PLAN/i, /INTENT_EXTRACTOR/i,
    /MISSION.*RECEIVED/i, /SEARCH QUERY PLAN/i, /SHADOW INTENT/i,
    /IMPLICIT CONSTRAINT/i, /CONSTRAINT.*CHECKLIST/i, /CAPABILITY CHECK/i,
    /PLAN V\d/i, /VERIFICATION POLICY/i, /INTENT NARRATIVE/i,
    /COMPLETENESS CHECK/i, /MISSION COMPLETENESS/i, /HANDOFF/i,
    /PASS 1 CONSTRAINT/i, /CONSTRAINT EXPANSION/i,
  ];

  let latest: LiveEvent | null = null;
  let latestTs = 0;

  for (const event of events) {
    const ts = new Date(event.ts).getTime();
    if (ts <= latestTs) continue;

    const summary = event.summary || '';
    const summaryUp = summary.toUpperCase();
    const task = event.details?.task || '';
    const combined = summaryUp + ' ' + (task || '').toUpperCase();

    // Skip milestone-level events
    if (
      summaryUp.includes('RUN COMPLETED') || summaryUp.includes('TOWER VERDICT') ||
      summaryUp.includes('EXECUTION COMPLETED') || summaryUp.includes('[TOWER]') ||
      summaryUp.includes('MISSION-DRIVEN EXECUTION COMPLETE')
    ) continue;

    // Skip junk
    if (JUNK_PATTERNS.some(p => p.test(combined))) continue;

    const name = getDisplayName(event);
    let icon = '⚙️';
    let text = '';

    // ── WEB VISIT events (executing or completed) ──
    if (summaryUp.includes('WEB VISIT') || summaryUp.includes('WEB_VISIT') || summaryUp.includes('VISITING')) {
      icon = '🌐';
      text = name ? `Visiting ${name}...` : 'Visiting website...';
    }
    // ── Evidence events ──
    else if (summaryUp.includes('EVIDENCE') && !summaryUp.includes('VERIFICATION')) {
      icon = '📄';
      text = name ? `Checking ${name} for live music...` : 'Checking evidence...';
    }
    // ── Tower semantic verify ──
    else if (summaryUp.includes('TOWER SEMANTIC') || summaryUp.includes('SEMANTIC VERIFY')) {
      icon = '⚖️';
      text = name ? `Verifying ${name}...` : 'Verifying...';
    }
    // ── Exclusion filter ──
    else if (summaryUp.includes('EXCLUSION FILTER')) {
      icon = '🔍';
      const countMatch = (task || summary).match(/(\d+)\s*kept/i);
      text = countMatch ? `Filtered to ${countMatch[1]} candidates` : 'Filtering candidates...';
    }
    // ── Executing Tool events ──
    else if (summaryUp.includes('EXECUTING TOOL') || summaryUp.includes('EXECUTING:')) {
      // Extract tool type and humanise
      if (/WEB.?VISIT/i.test(combined)) {
        icon = '🌐';
        text = name ? `Visiting ${name}...` : 'Visiting website...';
      } else if (/EVIDENCE/i.test(combined)) {
        icon = '📄';
        text = name ? `Checking ${name}...` : 'Checking evidence...';
      } else {
        continue; // Skip generic tool executions
      }
    }
    // ── Artefact created events — only show if they have a useful name ──
    else if (summaryUp.includes('ARTEFACT')) {
      if (name && (summaryUp.includes('EVIDENCE') || summaryUp.includes('WEB VISIT'))) {
        icon = '📄';
        text = `Found evidence for ${name}`;
      } else {
        continue; // Skip generic artefact events
      }
    }
    // ── Search places (skip — it's a milestone) ──
    else if (summaryUp.includes('SEARCH_PLACES') || summaryUp.includes('SEARCH PLACES')) {
      continue;
    }
    // ── Anything else with a name is worth showing ──
    else if (name) {
      text = `Processing ${name}...`;
    }
    // ── Skip nameless generic events entirely ──
    else {
      continue;
    }

    if (!text) continue;

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
    <div className="pl-5 relative py-2">
      {/* Vertical connector line running full height */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border/60" />

      {/* Thinking brains when nothing yet */}
      {isActive && milestones.length === 0 && !liveEvent && (
        <div className="relative pb-5">
          <span className="absolute left-[-1px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary/40 bg-card z-10" />
          <div className="pl-5">
            <ThinkingBrains />
          </div>
        </div>
      )}

      {/* Intent confirmation — what the system understood */}
      {intentNarrativePayload?.entity_description && (
        <div className="relative pb-6">
          <span className="absolute left-[-1px] top-1.5 h-3 w-3 rounded-full border-2 border-primary/40 bg-primary/40 z-10" />
          <div className="pl-5 text-[13px] text-foreground/70">
            <span>🧠</span>{' '}
            <span className="italic">{intentNarrativePayload.entity_description}</span>
          </div>
        </div>
      )}

      {/* Milestone events */}
      {milestones.map((ms) => (
        <div key={ms.key} className="relative pb-6">
          <span className={cn(
            "absolute left-[-1px] top-1.5 h-3 w-3 rounded-full border-2 z-10",
            ms.key === 'run_complete'
              ? "border-green-500 bg-green-500"
              : ms.key === 'tower_verdict'
                ? "border-amber-500 bg-amber-500"
                : "border-primary/60 bg-primary/60"
          )} />
          <div className="pl-5 flex items-center gap-2 text-[13px] text-foreground/80 font-medium">
            <span>{ms.icon}</span>
            <span>{ms.text}</span>
          </div>
        </div>
      ))}

      {/* Ephemeral cycling line */}
      {isActive && liveEvent && !milestones.some(m => m.key === 'run_complete' || m.key === 'tower_verdict') && (
        <div className="relative pb-6">
          <span className="absolute left-[-1px] top-1.5 h-3 w-3 rounded-full border-2 border-muted-foreground/30 bg-card animate-pulse z-10" />
          <div className="pl-5 flex items-center gap-2 text-xs text-muted-foreground/60">
            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
            <span className="transition-all duration-300">{liveEvent.text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
