import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  RefreshCw, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, 
  MessageSquare, Route, FileSearch, Wrench, ListChecks, Play, ChevronDown, ChevronUp,
  Zap, Brain, Send, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser } from "@/contexts/UserContext";
import { usePlan } from "@/contexts/PlanContext";

// Animated brain icons for thinking indicator
function ThinkingIndicator({ variant = "inline" }: { variant?: "inline" | "footer" }) {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  const brainCount = phase + 1;
  
  if (variant === "footer") {
    return (
      <div className="flex items-center gap-2 py-2 px-1 text-muted-foreground">
        <div className="flex items-center gap-0.5">
          {[0, 1, 2].map(i => (
            <Brain 
              key={i}
              className={cn(
                "h-3 w-3 transition-opacity duration-200",
                i < brainCount ? "opacity-70" : "opacity-20"
              )} 
            />
          ))}
        </div>
        <span className="text-xs">Working...</span>
      </div>
    );
  }
  
  return (
    <div className="relative pb-4">
      <span className="absolute left-[7px] top-0 -ml-px h-full w-0.5 bg-border" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-4 items-center">
          <Sparkles className="h-4 w-4 text-muted-foreground/50 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map(i => (
                <Brain 
                  key={i}
                  className={cn(
                    "h-3 w-3 text-muted-foreground transition-opacity duration-200",
                    i < brainCount ? "opacity-60" : "opacity-20"
                  )} 
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground/70">Thinking...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Starting overlay component - shows for 2 seconds when new request starts
function StartingOverlay() {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);
  
  const brainCount = phase + 1;
  
  return (
    <div 
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-card animate-in fade-in duration-200"
      style={{ backgroundColor: 'hsl(var(--card))' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(i => (
            <Brain 
              key={i}
              className={cn(
                "h-6 w-6 text-primary transition-all duration-300",
                i < brainCount ? "opacity-100 scale-110" : "opacity-30 scale-100"
              )} 
            />
          ))}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Starting request...</p>
          <p className="text-xs text-muted-foreground mt-0.5">Routing and planning</p>
        </div>
      </div>
    </div>
  );
}

// Terminal status row
function SequenceStatusRow({ status }: { status: "completed" | "failed" | "stopped" }) {
  const config = {
    completed: { 
      icon: CheckCircle2, 
      label: "Sequence complete", 
      className: "text-green-500/70" 
    },
    failed: { 
      icon: XCircle, 
      label: "Sequence failed", 
      className: "text-red-500/70" 
    },
    stopped: { 
      icon: AlertTriangle, 
      label: "Sequence stopped", 
      className: "text-orange-500/70" 
    },
  };
  
  const { icon: Icon, label, className } = config[status];
  
  return (
    <div className="flex items-center gap-2 py-2 px-1 border-t border-border/50 mt-2">
      <Icon className={cn("h-4 w-4", className)} />
      <span className={cn("text-xs font-medium", className)}>{label}</span>
    </div>
  );
}

interface StreamEvent {
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
    label?: string | null;
    prompt?: string | null;
    mode?: string | null;
    outputPreview?: string | null;
  };
  status: 'pending' | 'running' | 'completed' | 'failed';
  run_id: string | null;
  client_request_id: string | null;
  router_decision?: string | null;
  router_reason?: string | null;
}

interface StreamResponse {
  client_request_id: string | null;
  title: string;
  status: 'idle' | 'routing' | 'planning' | 'executing' | 'completed' | 'failed';
  is_terminal: boolean;
  terminal_state: 'completed' | 'failed' | 'stopped' | null;
  events: StreamEvent[];
  event_count: number;
  last_updated: string;
  error?: string;
  message?: string;
}

type OverallStatus = 'idle' | 'routing' | 'planning' | 'executing' | 'deep_research' | 'completed' | 'failed' | 'stopped';

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: false 
  });
}

function StatusBadge({ status }: { status: OverallStatus }) {
  const config: Record<OverallStatus, { icon: typeof Clock; label: string; className: string }> = {
    idle: { icon: Clock, label: "Idle", className: "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300" },
    routing: { icon: Route, label: "Routing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" },
    planning: { icon: Brain, label: "Planning", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200" },
    executing: { icon: Zap, label: "Executing", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200" },
    deep_research: { icon: FileSearch, label: "Researching", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200" },
    completed: { icon: CheckCircle2, label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
    failed: { icon: XCircle, label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
    stopped: { icon: AlertTriangle, label: "Stopped", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200" },
  };

  const { icon: Icon, label, className } = config[status] || config.idle;
  const isAnimated = ['routing', 'planning', 'executing', 'deep_research'].includes(status);
  
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}>
      <Icon className={cn("h-3 w-3", isAnimated && "animate-pulse")} />
      {label}
    </span>
  );
}

function EventIcon({ type }: { type: string }) {
  const iconMap: Record<string, { icon: typeof MessageSquare; className: string }> = {
    user_message_received: { icon: MessageSquare, className: "text-blue-500" },
    router_decision: { icon: Route, className: "text-purple-500" },
    plan_created: { icon: ListChecks, className: "text-indigo-500" },
    plan_approved: { icon: CheckCircle2, className: "text-green-500" },
    plan_rejected: { icon: XCircle, className: "text-red-500" },
    plan_updated: { icon: ListChecks, className: "text-indigo-400" },
    tool_call_started: { icon: Wrench, className: "text-orange-500" },
    tool_call_completed: { icon: CheckCircle2, className: "text-green-500" },
    deep_research_started: { icon: FileSearch, className: "text-cyan-500" },
    deep_research_completed: { icon: CheckCircle2, className: "text-green-500" },
    supervisor_plan: { icon: Brain, className: "text-purple-500" },
    direct_response: { icon: Send, className: "text-blue-400" },
    streaming_response: { icon: Zap, className: "text-yellow-500" },
    run_completed: { icon: CheckCircle2, className: "text-green-500" },
    run_failed: { icon: XCircle, className: "text-red-500" },
  };

  const { icon: Icon, className } = iconMap[type] || { icon: Play, className: "text-gray-500" };
  return <Icon className={cn("h-4 w-4 shrink-0", className)} />;
}

function EventStatusIndicator({ status }: { status: StreamEvent['status'] }) {
  if (status === 'running') {
    return <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />;
  }
  if (status === 'failed') {
    return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
  }
  return <Clock className="h-3 w-3 text-gray-400 shrink-0" />;
}

function TimelineEvent({ event, isLast }: { event: StreamEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = event.details && (
    event.details.error || 
    event.details.results || 
    event.router_decision ||
    event.router_reason
  );

  return (
    <div className="relative pb-4">
      {!isLast && (
        <span className="absolute left-[7px] top-6 -ml-px h-full w-0.5 bg-border" aria-hidden="true" />
      )}
      <div className="relative flex items-start gap-3">
        <div className="flex h-4 items-center">
          <EventIcon type={event.type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground leading-tight">
              {event.summary}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <EventStatusIndicator status={event.status} />
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatEventTime(event.ts)}
              </span>
            </div>
          </div>
          
          {event.router_decision && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {event.router_decision === 'tool_call' ? (
                <>
                  <span className="font-medium text-blue-600 dark:text-blue-400">Mode: Single action</span>
                  {' - Auto-executing'}
                  {event.router_reason && ` (${event.router_reason})`}
                </>
              ) : event.router_decision === 'supervisor_plan' || event.router_decision === 'plan' ? (
                <>
                  <span className="font-medium text-purple-600 dark:text-purple-400">Mode: Multi-step plan</span>
                  {' - Supervisor engaged, running now'}
                </>
              ) : (
                <>
                  Path: <span className="font-medium text-foreground">{event.router_decision}</span>
                  {event.router_reason && ` - ${event.router_reason}`}
                </>
              )}
            </p>
          )}

          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          )}

          {expanded && hasDetails && (
            <div className="mt-2 p-2 bg-muted/50 rounded-md text-xs space-y-1">
              {event.details.error && (
                <p className="text-red-600 dark:text-red-400">
                  Error: {event.details.error}
                </p>
              )}
              {event.details.durationMs && (
                <p className="text-muted-foreground">
                  Duration: {event.details.durationMs}ms
                </p>
              )}
              {event.details.results && (
                <p className="text-muted-foreground break-all">
                  Results: {event.details.results.slice(0, 200)}
                  {event.details.results.length > 200 && '...'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface LiveActivityPanelProps {
  activeClientRequestId?: string | null;
  onRequestIdChange?: (id: string | null) => void;
}

const THINKING_THRESHOLD_MS = 200; // Show inline thinking after 200ms gap
const OVERLAY_DURATION_MS = 2000;
const TERMINAL_STABILITY_MS = 800; // Wait 800ms after terminal + no new events to confirm
const DEBUG_TERMINAL = true; // TEMPORARY: Enable debug logs to diagnose status issues

// Active statuses where we show working indicators
const ACTIVE_STATUSES = ['routing', 'planning', 'executing', 'deep_research', 'running', 'in_progress'];
// Terminal statuses
const TERMINAL_STATUSES = ['completed', 'failed', 'stopped'];

export function LiveActivityPanel({ activeClientRequestId, onRequestIdChange }: LiveActivityPanelProps) {
  const { user } = useUser();
  const { plan } = usePlan();
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showThinking, setShowThinking] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [confirmedTerminal, setConfirmedTerminal] = useState(false); // True only after terminal is confirmed
  
  // Check if there's an active plan (for mode display)
  const hasActivePlan = plan && ['approved', 'executing', 'pending_approval'].includes(plan.status);
  const isMultiStepPlan = hasActivePlan && plan.steps && plan.steps.length >= 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevEventCount = useRef(0);
  const prevActiveIdRef = useRef<string | null | undefined>(undefined); // Track prop changes
  const thinkingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalStabilityTimerRef = useRef<NodeJS.Timeout | null>(null); // 800ms stability check
  const terminalEventCountRef = useRef<number | null>(null); // Event count when stability timer started
  const nearBottomRef = useRef(true); // Track if user is near bottom for chat-like scroll
  
  // Compute idsMatch - CRITICAL for correct terminal/working state
  const streamRequestId = stream?.client_request_id;
  const idsMatch = !!(activeClientRequestId && streamRequestId && activeClientRequestId === streamRequestId);
  

  const fetchStream = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeClientRequestId) {
        params.set('client_request_id', activeClientRequestId);
      }
      if (user?.id) {
        params.set('userId', user.id);
      }
      
      const response = await fetch(`/api/afr/stream?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch activity stream");
      }
      
      const data: StreamResponse = await response.json();
      setStream(data);
      setError(null);
      setLastFetch(new Date());

      if (data.client_request_id && data.client_request_id !== activeClientRequestId) {
        onRequestIdChange?.(data.client_request_id);
      }

      // Chat-like auto-scroll: scroll to bottom if user is near bottom
      if (nearBottomRef.current && data.event_count > prevEventCount.current) {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      }
      
      // Reset thinking indicator when new events arrive
      if (data.event_count > prevEventCount.current) {
        setShowThinking(false);
        if (thinkingTimerRef.current) {
          clearTimeout(thinkingTimerRef.current);
          thinkingTimerRef.current = null;
        }
      }
      
      prevEventCount.current = data.event_count;

    } catch (err: any) {
      console.error("[LiveActivityPanel] Fetch error:", err);
      setError("Could not load activity stream.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeClientRequestId, autoScroll, onRequestIdChange]);

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  // PART 3: Overlay triggers on activeClientRequestId prop change, NOT stream changes
  // When activeClientRequestId changes to a NEW value, show overlay and reset all state
  useEffect(() => {
    if (activeClientRequestId && activeClientRequestId !== prevActiveIdRef.current) {
      if (DEBUG_TERMINAL) {
        console.log('[STATUS_DEBUG] activeClientRequestId changed (overlay trigger):', {
          from: prevActiveIdRef.current,
          to: activeClientRequestId
        });
      }
      
      // Clear any existing timers
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      
      // Reset ALL state for new request
      setConfirmedTerminal(false);
      setShowThinking(false);
      terminalEventCountRef.current = null;
      prevEventCount.current = 0;
      
      // Show overlay for new request
      setShowOverlay(true);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, OVERLAY_DURATION_MS);
    }
    
    prevActiveIdRef.current = activeClientRequestId;
  }, [activeClientRequestId]);
  
  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const isActive = stream?.status && !['idle', 'completed', 'failed'].includes(stream.status) && (stream?.status as string) !== 'stopped';
    const intervalMs = isActive ? 1500 : 10000;

    const interval = setInterval(fetchStream, intervalMs);
    return () => clearInterval(interval);
  }, [stream?.status, fetchStream]);

  useEffect(() => {
    const handleFocus = () => fetchStream();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStream]);

  // PART 4: Terminal confirmation with stability check
  // Only confirm terminal if: idsMatch AND is_terminal AND event count stable for 800ms
  useEffect(() => {
    const apiIsTerminal = stream?.is_terminal ?? false;
    const terminalState = stream?.terminal_state;
    const currentEventCount = stream?.event_count || 0;
    
    // DEBUG: Log terminal detection state
    if (DEBUG_TERMINAL) {
      console.log('[TERMINAL_DEBUG] Check:', {
        apiIsTerminal,
        terminalState,
        idsMatch,
        eventCount: currentEventCount,
        prevEventCount: terminalEventCountRef.current,
        confirmedTerminal
      });
    }
    
    // RULE: If IDs don't match, NEVER confirm terminal (we're showing old request data)
    if (!idsMatch) {
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      terminalEventCountRef.current = null;
      // Don't set confirmedTerminal = false here - it was already reset on ID change
      return;
    }
    
    // If API says NOT terminal, reset and stop any pending confirmation
    if (!apiIsTerminal) {
      if (terminalStabilityTimerRef.current) {
        clearTimeout(terminalStabilityTimerRef.current);
        terminalStabilityTimerRef.current = null;
      }
      if (confirmedTerminal || terminalEventCountRef.current !== null) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] API says not terminal - resetting');
        setConfirmedTerminal(false);
        terminalEventCountRef.current = null;
      }
      return;
    }
    
    // API says terminal AND idsMatch - start or check stability timer
    if (apiIsTerminal && terminalState && idsMatch) {
      // If new events arrived since we started stability timer, reset
      if (terminalEventCountRef.current !== null && currentEventCount !== terminalEventCountRef.current) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] New events arrived, resetting stability timer');
        if (terminalStabilityTimerRef.current) {
          clearTimeout(terminalStabilityTimerRef.current);
          terminalStabilityTimerRef.current = null;
        }
        terminalEventCountRef.current = null;
      }
      
      // Start stability timer if not already running
      if (terminalEventCountRef.current === null && !terminalStabilityTimerRef.current) {
        if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] Starting 800ms stability timer');
        terminalEventCountRef.current = currentEventCount;
        terminalStabilityTimerRef.current = setTimeout(() => {
          if (DEBUG_TERMINAL) console.log('[TERMINAL_DEBUG] *** CONFIRMING TERMINAL after stability ***');
          setConfirmedTerminal(true);
          terminalStabilityTimerRef.current = null;
        }, TERMINAL_STABILITY_MS);
      }
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.event_count, idsMatch]);
  
  // PART 5: Thinking indicator shows while current run is active
  // Show if: activeClientRequestId exists AND confirmedTerminal is false
  // Either (a) no events yet for this request, OR (b) gap of >200ms since last event
  useEffect(() => {
    // Clear any existing timer first
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    
    // If we have an active request and it's not terminal, show thinking indicator after gap
    const hasActiveRequest = !!activeClientRequestId;
    const isRunActive = hasActiveRequest && !confirmedTerminal && !showOverlay;
    
    if (!isRunActive) {
      setShowThinking(false);
      return;
    }
    
    // Start timer to show thinking indicator after threshold (200ms gap)
    thinkingTimerRef.current = setTimeout(() => {
      setShowThinking(true);
      thinkingTimerRef.current = null;
    }, THINKING_THRESHOLD_MS);
    
    return () => {
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
    };
  }, [activeClientRequestId, confirmedTerminal, showOverlay, stream?.event_count]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Chat-like scroll detection: user is "near bottom" if within 120px
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    nearBottomRef.current = nearBottom;
    setAutoScroll(nearBottom);
  };

  // PART 2: Compute display status - NEVER show terminal for non-matching request
  // HARD RULES:
  // - If idsMatch is false and we have activeClientRequestId, treat as executing (not idle, not completed)
  // - Only show terminal status if idsMatch AND confirmedTerminal
  // - If activeClientRequestId is null (no active request), show idle regardless of stream state
  const mappedStatus: OverallStatus = (() => {
    // If we have an active request but stream doesn't match yet, show executing
    if (activeClientRequestId && !idsMatch) {
      return 'executing';
    }
    
    if (!stream) return 'idle';
    
    // If no activeClientRequestId, don't show stale terminal state - just show idle
    // (This prevents showing "Completed" from previous session on page load)
    if (!activeClientRequestId && stream.is_terminal) {
      return 'idle';
    }
    
    // Only show terminal if idsMatch AND confirmedTerminal
    if (idsMatch && stream.is_terminal && stream.terminal_state && confirmedTerminal) {
      return stream.terminal_state;
    }
    
    // If stream says terminal but we haven't confirmed (or IDs don't match), show executing
    if (stream.is_terminal && stream.terminal_state) {
      return 'executing';
    }
    
    const s = stream.status;
    if (s === 'routing') return 'routing';
    if (s === 'planning') return 'planning';
    if (s === 'executing') {
      const hasDeepResearch = stream.events.some(e => 
        e.type.includes('deep_research') && e.status === 'running'
      );
      if (hasDeepResearch) return 'deep_research';
      return 'executing';
    }
    return 'idle';
  })();
  
  // Compute if we're in a working state (should show animated indicators)
  // If we have an activeClientRequestId and not confirmed terminal, we're working
  const isWorking = !showOverlay && (
    (activeClientRequestId && !confirmedTerminal) ||
    (mappedStatus !== 'idle' && mappedStatus !== 'completed' && mappedStatus !== 'failed' && mappedStatus !== 'stopped')
  );
    
  // DEBUG LOGGING - Temporary to diagnose status issues (must be before early returns)
  const streamEvents = stream?.events || [];
  useEffect(() => {
    if (DEBUG_TERMINAL) {
      console.log('[STATUS_DEBUG] Poll state:', {
        activeClientRequestId,
        streamRequestId,
        idsMatch,
        is_terminal: stream?.is_terminal,
        terminal_state: stream?.terminal_state,
        mappedStatus,
        confirmedTerminal,
        isWorking,
        showThinking,
        showOverlay,
        eventCount: stream?.event_count || 0,
      });
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.event_count, confirmedTerminal, mappedStatus, activeClientRequestId, idsMatch, isWorking, showThinking, showOverlay, streamRequestId]);

  if (loading) {
    return (
      <Card className="flex flex-col" style={{ height: '66vh', minHeight: '400px' }}>
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Live Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading activity stream...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col" style={{ height: '66vh', minHeight: '400px' }}>
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="text-sm font-medium">Live Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">{error}</div>
          <Button variant="outline" size="sm" onClick={fetchStream}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const events = stream?.events || [];
  const hasEvents = events.length > 0;

  return (
    <Card className="flex flex-col" style={{ height: '66vh', minHeight: '400px' }}>
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Live Activity</CardTitle>
          <div className="flex items-center gap-2">
            {/* Mode indicator - shows when there's an active plan */}
            {hasActivePlan && isWorking && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                isMultiStepPlan 
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200"
              )}>
                {isMultiStepPlan ? 'Multi-step' : 'Single action'}
              </span>
            )}
            <StatusBadge status={mappedStatus} />
            {lastFetch && (
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeTime(lastFetch.toISOString())}
              </span>
            )}
          </div>
        </div>
        {hasEvents && stream?.title && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {stream.title}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {/* Starting overlay - shows for 2 seconds when new request begins */}
        {showOverlay && <StartingOverlay />}
        
        {!hasEvents ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No activity yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Send a message to see live updates
              </p>
            </div>
          </div>
        ) : (
          <div 
            ref={scrollRef}
            className={cn(
              "h-full overflow-y-auto px-4 py-2 transition-opacity duration-200",
              showOverlay && "opacity-0"
            )}
            onScroll={handleScroll}
          >
            {events.map((event, index) => (
              <TimelineEvent 
                key={event.id} 
                event={event} 
                isLast={index === events.length - 1 && confirmedTerminal}
              />
            ))}
            
            {/* Inline thinking indicator after last event - shows during gaps when working */}
            {showThinking && isWorking && (
              <ThinkingIndicator variant="inline" />
            )}
            
            {/* Terminal status indicator - only shows when terminal is confirmed */}
            {confirmedTerminal && (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'stopped') && (
              <SequenceStatusRow status={mappedStatus} />
            )}
            
            {/* PERSISTENT animated footer - ALWAYS shows when working (status-driven, not timer-driven) */}
            {isWorking && (
              <ThinkingIndicator variant="footer" />
            )}
            
            {/* Bottom sentinel for chat-like auto-scroll */}
            <div ref={bottomRef} />
          </div>
        )}
      </CardContent>

      {!autoScroll && hasEvents && (
        <div className="absolute bottom-4 right-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              nearBottomRef.current = true;
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }}
          >
            <ChevronDown className="h-3 w-3 mr-1" />
            Jump to latest
          </Button>
        </div>
      )}
    </Card>
  );
}
