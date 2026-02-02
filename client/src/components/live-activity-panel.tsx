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

// Constants
const TERMINAL_DELAY_MS = 800; // Wait 800ms after terminal seen with no new events before confirming
const WORKING_MIN_DISPLAY_MS = 600; // Minimum time to show working indicator (prevent flicker)
const OVERLAY_DURATION_MS = 2000;
const DEBUG_LIVE_ACTIVITY = false; // TEMPORARY: Enable debug logs (user can turn on if needed)

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
  const [showOverlay, setShowOverlay] = useState(false);
  
  // === STATE PER USER SPECIFICATION ===
  // These are the ONLY state variables that control terminal/working display
  const [lastSeenEventAt, setLastSeenEventAt] = useState<number | null>(null); // Timestamp of last event for activeClientRequestId
  const [hasAnyEventsForActiveRequest, setHasAnyEventsForActiveRequest] = useState(false);
  const [terminalSeenAt, setTerminalSeenAt] = useState<number | null>(null); // When terminal first seen for THIS request
  const [terminalConfirmed, setTerminalConfirmed] = useState(false);
  
  // isWorking = activeClientRequestId exists AND NOT terminalConfirmed
  const isWorking = !!activeClientRequestId && !terminalConfirmed;
  
  // For minimum display time of working indicator
  const [workingIndicatorVisible, setWorkingIndicatorVisible] = useState(false);
  const workingVisibleSinceRef = useRef<number | null>(null);
  
  // Check if there's an active plan (for mode display)
  const hasActivePlan = plan && ['approved', 'executing', 'pending_approval'].includes(plan.status);
  const isMultiStepPlan = hasActivePlan && plan.steps && plan.steps.length >= 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(0);
  const prevRequestIdRef = useRef<string | null | undefined>(undefined);
  const overlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalConfirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalSeenEventCountRef = useRef<number | null>(null); // Event count when terminal timer started
  const nearBottomRef = useRef(true); // Track if user is near bottom for chat-like scroll
  
  // Track stream state for overlay trigger
  const streamRequestId = stream?.client_request_id;
  const streamStatus = stream?.status;
  

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
      const now = Date.now();
      
      // Only update state if stream is for the current active request
      const isForActiveRequest = !activeClientRequestId || data.client_request_id === activeClientRequestId;
      
      if (isForActiveRequest) {
        setStream(data);
        setError(null);
        setLastFetch(new Date());
        
        // Track events for the active request
        if (data.event_count > 0) {
          setHasAnyEventsForActiveRequest(true);
          
          // Update lastSeenEventAt if we have new events
          if (data.event_count > prevEventCountRef.current) {
            setLastSeenEventAt(now);
            
            // If new events arrive AFTER terminalSeenAt, clear terminal state
            if (terminalSeenAt !== null) {
              if (DEBUG_LIVE_ACTIVITY) {
                console.log('[LIVE_ACTIVITY] New events after terminal seen - clearing terminal state');
              }
              setTerminalSeenAt(null);
              setTerminalConfirmed(false);
              if (terminalConfirmTimerRef.current) {
                clearTimeout(terminalConfirmTimerRef.current);
                terminalConfirmTimerRef.current = null;
              }
            }
          }
        }
        
        prevEventCountRef.current = data.event_count;
      }

      // Update activeClientRequestId only if we don't have one yet
      if (data.client_request_id && !activeClientRequestId) {
        onRequestIdChange?.(data.client_request_id);
      }

      // Chat-like auto-scroll: scroll to bottom if user is near bottom
      if (nearBottomRef.current && data.event_count > prevEventCountRef.current) {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      }

    } catch (err: any) {
      console.error("[LiveActivityPanel] Fetch error:", err);
      setError("Could not load activity stream.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeClientRequestId, onRequestIdChange, terminalSeenAt]);

  useEffect(() => {
    fetchStream();
  }, [fetchStream]);

  // CRITICAL: Reset ALL state when activeClientRequestId changes
  // This is "Rule 3": On new request start, immediately clear previous terminal/completed UI
  useEffect(() => {
    if (activeClientRequestId && activeClientRequestId !== prevRequestIdRef.current) {
      if (DEBUG_LIVE_ACTIVITY) {
        console.log('[LIVE_ACTIVITY] activeClientRequestId changed:', {
          from: prevRequestIdRef.current,
          to: activeClientRequestId
        });
      }
      
      // Immediate reset - clear ALL terminal/event state for new request
      setTerminalConfirmed(false);
      setTerminalSeenAt(null);
      setHasAnyEventsForActiveRequest(false);
      setLastSeenEventAt(null);
      prevEventCountRef.current = 0;
      terminalSeenEventCountRef.current = null;
      setStream(null);
      
      // Clear any pending terminal confirm timer
      if (terminalConfirmTimerRef.current) {
        clearTimeout(terminalConfirmTimerRef.current);
        terminalConfirmTimerRef.current = null;
      }
      
      // Show overlay for new request
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
      setShowOverlay(true);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, OVERLAY_DURATION_MS);
      
      // Immediately show working indicator
      setWorkingIndicatorVisible(true);
      workingVisibleSinceRef.current = Date.now();
    }
    prevRequestIdRef.current = activeClientRequestId;
  }, [activeClientRequestId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
      }
      if (terminalConfirmTimerRef.current) {
        clearTimeout(terminalConfirmTimerRef.current);
      }
    };
  }, []);

  // Polling interval - faster when active
  useEffect(() => {
    const intervalMs = isWorking ? 1500 : 10000;
    const interval = setInterval(fetchStream, intervalMs);
    return () => clearInterval(interval);
  }, [isWorking, fetchStream]);

  useEffect(() => {
    const handleFocus = () => fetchStream();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStream]);

  // TERMINAL CONFIRMATION LOGIC (per user specification):
  // - Only start confirmation AFTER hasAnyEventsForActiveRequest is true
  // - When terminal first seen, set terminalSeenAt but do NOT immediately show completed
  // - Confirm only when: (a) no new events for 800ms after terminalSeenAt OR (b) server says terminal AND ID matches
  // - If new event arrives after terminalSeenAt, clear terminalSeenAt and terminalConfirmed (handled in fetchStream)
  useEffect(() => {
    const apiIsTerminal = stream?.is_terminal ?? false;
    const terminalState = stream?.terminal_state;
    const now = Date.now();
    
    // HARD RULES:
    // 1. Never confirm terminal for different request ID
    const isCurrentStream = activeClientRequestId 
      ? stream?.client_request_id === activeClientRequestId
      : true;
    
    // 2. Never confirm terminal if no events for this request
    if (!isCurrentStream || !hasAnyEventsForActiveRequest) {
      if (terminalSeenAt !== null || terminalConfirmed) {
        if (DEBUG_LIVE_ACTIVITY) console.log('[LIVE_ACTIVITY] Guards failed - resetting terminal');
        setTerminalSeenAt(null);
        setTerminalConfirmed(false);
      }
      return;
    }
    
    // DEBUG logging
    if (DEBUG_LIVE_ACTIVITY) {
      console.log('[LIVE_ACTIVITY] Terminal check:', {
        activeClientRequestId: activeClientRequestId?.slice(-8),
        streamRequestId: stream?.client_request_id?.slice(-8),
        apiIsTerminal,
        terminalState,
        hasAnyEventsForActiveRequest,
        terminalSeenAt,
        terminalConfirmed,
        lastSeenEventAt
      });
    }
    
    // If server says NOT terminal, reset
    if (!apiIsTerminal || !terminalState) {
      if (terminalSeenAt !== null || terminalConfirmed) {
        if (DEBUG_LIVE_ACTIVITY) console.log('[LIVE_ACTIVITY] Server says not terminal - resetting');
        setTerminalSeenAt(null);
        setTerminalConfirmed(false);
        if (terminalConfirmTimerRef.current) {
          clearTimeout(terminalConfirmTimerRef.current);
          terminalConfirmTimerRef.current = null;
        }
      }
      return;
    }
    
    // Server says terminal AND all guards pass
    // First time seeing terminal for this request?
    if (terminalSeenAt === null) {
      if (DEBUG_LIVE_ACTIVITY) console.log('[LIVE_ACTIVITY] First terminal seen - starting 800ms timer');
      setTerminalSeenAt(now);
      
      // Store the current event count to detect if new events arrive during the timer
      const eventCountAtTimerStart = stream?.event_count || 0;
      terminalSeenEventCountRef.current = eventCountAtTimerStart;
      
      // Start timer to confirm after 800ms with no new events
      if (terminalConfirmTimerRef.current) {
        clearTimeout(terminalConfirmTimerRef.current);
      }
      terminalConfirmTimerRef.current = setTimeout(() => {
        // RACE CONDITION FIX: Check if new events arrived during the timer
        // If event count changed, do NOT confirm - new events arrived
        if (terminalSeenEventCountRef.current !== null && 
            prevEventCountRef.current > terminalSeenEventCountRef.current) {
          if (DEBUG_LIVE_ACTIVITY) {
            console.log('[LIVE_ACTIVITY] 800ms elapsed but new events arrived - NOT confirming', {
              eventCountAtTimerStart: terminalSeenEventCountRef.current,
              currentEventCount: prevEventCountRef.current
            });
          }
          terminalConfirmTimerRef.current = null;
          return;
        }
        
        if (DEBUG_LIVE_ACTIVITY) console.log('[LIVE_ACTIVITY] 800ms elapsed - confirming terminal');
        setTerminalConfirmed(true);
        terminalConfirmTimerRef.current = null;
        terminalSeenEventCountRef.current = null;
      }, TERMINAL_DELAY_MS);
      return;
    }
    
    // Terminal was already seen - check if timer already confirmed it
    // (Timer will set terminalConfirmed when it fires)
  }, [stream?.is_terminal, stream?.terminal_state, stream?.client_request_id, activeClientRequestId, hasAnyEventsForActiveRequest, terminalSeenAt, terminalConfirmed, lastSeenEventAt]);
  
  // WORKING INDICATOR MANAGEMENT
  // Per user spec: Always show when isWorking is true, with 600ms minimum display time
  useEffect(() => {
    if (isWorking) {
      // Show indicator immediately
      if (!workingIndicatorVisible) {
        setWorkingIndicatorVisible(true);
        workingVisibleSinceRef.current = Date.now();
      }
    } else {
      // Hide indicator, respecting minimum display time
      if (workingIndicatorVisible) {
        const visibleSince = workingVisibleSinceRef.current || 0;
        const elapsed = Date.now() - visibleSince;
        
        if (elapsed >= WORKING_MIN_DISPLAY_MS) {
          // Shown long enough, hide immediately
          setWorkingIndicatorVisible(false);
          workingVisibleSinceRef.current = null;
        } else {
          // Need to wait before hiding
          const remaining = WORKING_MIN_DISPLAY_MS - elapsed;
          const hideTimer = setTimeout(() => {
            setWorkingIndicatorVisible(false);
            workingVisibleSinceRef.current = null;
          }, remaining);
          return () => clearTimeout(hideTimer);
        }
      }
    }
  }, [isWorking, workingIndicatorVisible]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Chat-like scroll detection: user is "near bottom" if within 120px
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    nearBottomRef.current = nearBottom;
    setAutoScroll(nearBottom);
  };

  // Compute display status - driven by API's is_terminal and terminal_state fields
  // HARD RULES (per user spec):
  // 1. Never show Completed if 0 events for activeClientRequestId
  // 2. Never show Completed for a different request id than activeClientRequestId
  // 3. If server claims terminal but ID doesn't match, ignore it
  // 4. If new request starts, immediately clear terminal UI state
  const mappedStatus: OverallStatus = (() => {
    // If no stream and no active request, show idle
    if (!stream) {
      return activeClientRequestId ? 'executing' : 'idle';
    }
    
    // STEP C.2: Determine if stream matches active request
    // isCurrentStream = true only if IDs match exactly
    const isCurrentStream = activeClientRequestId 
      ? stream.client_request_id === activeClientRequestId
      : true; // If no active request, accept any stream
    
    // Count events for the current request (server already filters by ID)
    const eventCount = stream.events.length;
    
    // STEP C.3: Determine if we can show terminal state
    // canShowTerminal requires ALL THREE conditions:
    // 1. isCurrentStream (IDs match)
    // 2. events.length > 0 (we have events for this request)  
    // 3. stream.is_terminal === true (server says terminal)
    const canShowTerminal = isCurrentStream && 
      eventCount > 0 && 
      stream.is_terminal === true &&
      stream.terminal_state !== null;
    
    if (DEBUG_LIVE_ACTIVITY) {
      console.log('[STATUS_DEBUG] mappedStatus evaluation:', {
        isCurrentStream,
        eventCount,
        serverIsTerminal: stream.is_terminal,
        serverTerminalState: stream.terminal_state,
        canShowTerminal,
        terminalConfirmed,
        activeClientRequestId: activeClientRequestId?.slice(-8),
        streamClientRequestId: stream.client_request_id?.slice(-8)
      });
    }
    
    // If stream doesn't match active request, always show executing (waiting for data)
    if (activeClientRequestId && !isCurrentStream) {
      return 'executing';
    }
    
    // Terminal state handling
    if (canShowTerminal && terminalConfirmed) {
      // All conditions met - show terminal state
      return stream.terminal_state!;
    }
    
    // If server says terminal but we haven't confirmed, show executing briefly
    if (canShowTerminal && !terminalConfirmed) {
      return 'executing';
    }
    
    // Non-terminal states
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
    
    // No events yet for this request - show executing if we have an active request
    if (activeClientRequestId && eventCount === 0) {
      return 'executing';
    }
    
    return 'idle';
  })();
    
  // DEBUG LOGGING - Temporary to diagnose status issues (must be before early returns)
  const streamEvents = stream?.events || [];
  useEffect(() => {
    if (DEBUG_LIVE_ACTIVITY) {
      console.log('[STATUS_DEBUG] Poll state:', {
        activeClientRequestId,
        is_terminal: stream?.is_terminal,
        terminal_state: stream?.terminal_state,
        mappedStatus,
        terminalConfirmed,
        hasAnyEventsForActiveRequest,
        eventCount: stream?.event_count || 0,
        isWorking,
      });
    }
  }, [stream?.is_terminal, stream?.terminal_state, stream?.event_count, terminalConfirmed, mappedStatus, activeClientRequestId, hasAnyEventsForActiveRequest, isWorking]);

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
        {/* TEMPORARY DEBUG STRIP - remove after fix confirmed */}
        {DEBUG_LIVE_ACTIVITY && (
          <div className="mt-1 px-1 py-0.5 bg-muted/50 rounded text-[9px] font-mono text-muted-foreground/70 leading-tight">
            <div>active: {activeClientRequestId?.slice(-8) || 'null'} | stream: {stream?.client_request_id?.slice(-8) || 'null'} | working: {String(isWorking)}</div>
            <div>is_terminal: {String(stream?.is_terminal)} | terminalConfirmed: {String(terminalConfirmed)} | events: {stream?.events?.length ?? 0}</div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0 relative">
        {/* Starting overlay - shows for 2 seconds when new request begins */}
        {showOverlay && <StartingOverlay />}
        
        {!hasEvents ? (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No activity yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Send a message to see live updates
              </p>
            </div>
            {/* Working indicator in no-events state - ALWAYS show when isWorking (per user spec) */}
            {workingIndicatorVisible && (
              <div className="mt-4">
                <ThinkingIndicator variant="footer" />
              </div>
            )}
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
                isLast={index === events.length - 1 && terminalConfirmed}
              />
            ))}
            
            {/* Terminal status indicator - only shows when terminal is confirmed */}
            {terminalConfirmed && (mappedStatus === 'completed' || mappedStatus === 'failed' || mappedStatus === 'stopped') && (
              <SequenceStatusRow status={mappedStatus} />
            )}
            
            {/* PERSISTENT animated working indicator - ALWAYS shows when isWorking (per user spec) */}
            {workingIndicatorVisible && (
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
