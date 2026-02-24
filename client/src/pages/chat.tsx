declare global {
  interface Window {
    WYSHBONE_DEV_LANE?: boolean;
  }
}

import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, authedFetch, addDevAuthParams, buildApiUrl, handleApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, User, CheckCircle2, Search, Building2, HelpCircle, Activity, Loader2 } from "lucide-react";
import type { ChatMessage, AddNoteResponse, DeepResearchCreateRequest } from "@shared/schema";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";
import { LocationSuggestions } from "@/components/LocationSuggestions";
import { CopyButton } from "@/components/ui/copy-button";
import WishboneSidebar from "@/components/WishboneSidebar";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { AddToXeroDialog } from "@/components/AddToXeroDialog";
import { useSidebarFlash } from "@/contexts/SidebarFlashContext";
import { subscribeSupervisorMessages, type SupervisorMessage } from "@/lib/supabase";
import { useUserGoal } from "@/hooks/use-user-goal";
import { publishEvent } from "@/lib/events";
import { getCurrentVerticalId } from "@/contexts/VerticalContext";
import { WhatJustHappenedPanel } from "@/components/tower/WhatJustHappenedPanel";
import { useResultsPanel } from "@/contexts/ResultsPanelContext";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";
import UserResultsView from "@/components/results/UserResultsView";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload, LeadVerificationEntry } from "@/components/results/CvlArtefactViews";
import RunResultBubble from "@/components/results/RunResultBubble";
import type { PolicySnapshot } from "@/components/results/RunResultBubble";
import { resolveCanonicalStatus, STATUS_CONFIG } from "@/utils/deliveryStatus";

type Message = ChatMessage & {
  id: string;
  timestamp: Date;
  source?: 'user' | 'assistant' | 'supervisor';
  deliverySummary?: DeliverySummary | null;
  verificationSummary?: VerificationSummaryPayload | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  leadVerifications?: LeadVerificationEntry[] | null;
  policySnapshot?: PolicySnapshot | null;
  runId?: string | null;
  hidden?: boolean;
  provisional?: boolean;
};

type SystemMessage = {
  id: string;
  type: "system";
  content: string;
  timestamp: Date;
  searchResults?: Array<{
    place_id: string;
    name: string;
    address?: string;
    phone?: string;
    rating?: number;
  }>;
};

type DisplayMessage = Message | SystemMessage;

interface ChatPageProps {
  defaultCountry?: string;
  onInjectSystemMessage?: (fn: (msg: string) => void) => void;
  addRun?: (run: any) => string;
  updateRun?: (runId: string, updates: any) => void;
  getActiveRunId?: () => string | null;
  onNewChat?: (fn: () => void) => void;
  onLoadConversation?: (fn: (conversationId: string) => void) => void;
}

export default function ChatPage({ defaultCountry = 'GB', onInjectSystemMessage, addRun, updateRun, getActiveRunId, onNewChat, onLoadConversation }: ChatPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const { trigger: triggerSidebarFlash } = useSidebarFlash();
  const { goal, hasGoal, isLoading: isLoadingGoal } = useUserGoal();
  const { openResults } = useResultsPanel();
  const { setCurrentClientRequestId, setPinnedClientRequestId, setLastCompletedClientRequestId, addRecentRun, userPinned, clearRecentRuns } = useCurrentRequest();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(() => {
    // Load conversationId from localStorage on mount
    return localStorage.getItem('currentConversationId') || undefined;
  });
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const deliverySummaryRunIdsRef = useRef<Set<string>>(new Set());
  const processedRealtimeMsgIdsRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedHistoryRef = useRef(false);
  const hasShownGreetingRef = useRef(false); // Track if we've shown the auto-greeting
  const [batchJobTracking, setBatchJobTracking] = useState<Map<string, string>>(new Map()); // messageId -> batchId
  const batchPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showXeroDialog, setShowXeroDialog] = useState(false);
  
  // Functions panel visibility control (default hidden to not interfere with agentic flow)
  const [showFunctionsPanel, setShowFunctionsPanel] = useState(false);
  
  // UI-18: "What just happened?" Tower log viewer
  const [isWhatJustHappenedOpen, setWhatJustHappenedOpen] = useState(false);
  
  // MEGA mode removed (tech debt cleanup). Always use Standard.
  const chatMode = "standard" as const;
  
  // Dev-only lane indicator state
  const [lastLane, setLastLane] = useState<"run" | "chat" | null>(null);
  
  // Dev-only debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Supervisor integration
  const [supervisorTaskId, setSupervisorTaskId] = useState<string | null>(null);
  const [isWaitingForSupervisor, setIsWaitingForSupervisor] = useState(false);
  const supervisorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const supervisorRunIdRef = useRef<string | null>(null);
  const supervisorClientRequestIdRef = useRef<string | null>(null);
  const supervisorPollRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightSupervisorRunsRef = useRef<Map<string, { runId: string | null; crid: string }>>(new Map());
  const pendingResultPersistsRef = useRef<Array<{ payload: any; ts: number }>>([]);

  // Progress stack for chat status events (Part 2 implementation)
  type ProgressStage = 'ack' | 'classifying' | 'planning' | 'executing' | 'finalising' | 'completed' | 'failed';
  interface ProgressEvent {
    stage: ProgressStage;
    message: string;
    ts: number;
    toolName?: string;
  }
  const [progressStack, setProgressStack] = useState<ProgressEvent[]>([]);
  const [activeClientRequestId, setActiveClientRequestId] = useState<string | null>(null);
  const [executedToolsSummary, setExecutedToolsSummary] = useState<{ tools: string[]; rejected: { tool: string; reason: string }[] } | null>(null);
  
  const inFlightRequestIdRef = useRef<string | null>(null);
  const pendingCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Queued message for soft lock (Part 3 implementation)
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const queuedMessageRef = useRef<string | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);

  const pendingMetadataRef = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    const handlePrefill = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === "string" && detail.trim()) {
        setInput(detail);
        textareaRef.current?.focus();
      } else if (detail && typeof detail === "object") {
        if (detail.message) setInput(detail.message);
        if (detail.metadata) pendingMetadataRef.current = detail.metadata;
        if (detail.autoSend && detail.message) {
          setTimeout(() => handleSendRef.current?.(detail.message), 100);
        } else {
          textareaRef.current?.focus();
        }
      }
    };
    window.addEventListener("wyshbone-prefill-chat", handlePrefill);
    return () => window.removeEventListener("wyshbone-prefill-chat", handlePrefill);
  }, []);

  // Helper to get stage icon and label
  const getStageDisplay = (stage: ProgressStage, toolName?: string): { icon: string; label: string } => {
    switch (stage) {
      case 'ack':
        return { icon: '\u2714', label: 'OK, working' };
      case 'classifying':
        return { icon: '\u{1F50D}', label: 'Classifying intent' };
      case 'planning':
        return { icon: '\u{1F50D}', label: 'Planning' };
      case 'executing':
        if (toolName) {
          const lower = toolName.toLowerCase();
          if (lower === 'search_places' || lower.includes('places') || lower.includes('google')) {
            return { icon: '\u{1F50E}', label: 'Running search' };
          }
          return { icon: '\u{1F527}', label: 'Running tool' };
        }
        return { icon: '\u{1F527}', label: 'Executing tools' };
      case 'finalising':
        return { icon: '\u270D', label: 'Finalising response' };
      case 'completed':
        return { icon: '\u2705', label: 'Done' };
      case 'failed':
        return { icon: '\u274C', label: 'Failed' };
      default:
        return { icon: '\u2022', label: stage };
    }
  };

  // chatMode persistence removed (always Standard)

  // Demo mode clean slate: Clear all state on EVERY page load for demo users
  useEffect(() => {
    const isDemoUser =
      user.email.includes('demo@') ||
      user.email.endsWith('@wyshbone.demo') ||
      user.id === 'temp-demo-user' ||
      user.id.startsWith('demo-');

    if (isDemoUser) {
      console.log('🎭 Demo mode detected: Resetting to clean slate on page load');

      // Clear all persisted state - runs on EVERY page load/refresh
      localStorage.removeItem('currentConversationId');
      localStorage.removeItem('chatMode');
      sessionStorage.removeItem(`labelsRegenerated_${user.id}`);

      // Clear any other conversation-related storage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('conversation_') || key.includes('_messages')) {
          localStorage.removeItem(key);
        }
      });

      // Clear React Query cache (goals, cached API data, etc.)
      queryClient.clear();

      // Reset component state
      setMessages([]);
      setConversationId(undefined);
      hasLoadedHistoryRef.current = false;
      hasShownGreetingRef.current = false;
      clearRecentRuns();

      console.log('✅ Demo mode clean slate applied - fresh "first time" experience ready');
    }
  }, [user.id, user.email, queryClient]);

  function parseSiblingArtefacts(rows: any[]): {
    vs: VerificationSummaryPayload | null;
    ce: ConstraintsExtractedPayload | null;
    policySnapshot: PolicySnapshot | null;
    leadVerifications: LeadVerificationEntry[] | null;
  } {
    let vs: VerificationSummaryPayload | null = null;
    let ce: ConstraintsExtractedPayload | null = null;
    let policySnapshot: PolicySnapshot | null = null;
    let fallbackRules: string[] | null = null;
    let leadVerifications: LeadVerificationEntry[] | null = null;
    if (!Array.isArray(rows)) return { vs, ce, policySnapshot, leadVerifications };
    for (const row of rows) {
      if (row.type === 'verification_summary') {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') vs = p as VerificationSummaryPayload;
      }
      if (row.type === 'constraints_extracted') {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') ce = p as ConstraintsExtractedPayload;
      }
      if (row.type === 'lead_verification') {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') {
          const entries = Array.isArray(p) ? p : Array.isArray((p as any).leads) ? (p as any).leads : null;
          if (entries) leadVerifications = entries as LeadVerificationEntry[];
        }
      }
      if ((row.type === 'policy_applications' || row.type === 'policy_application_snapshot') && !policySnapshot) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') {
          const paj = (p as any).policies_applied_json ?? p;
          if (paj && typeof paj === 'object' && typeof paj.why_short === 'string') {
            const stopPolicy = (p as any).stop_policy_v1 ?? (paj as any).stop_policy_v1;
            policySnapshot = {
              why_short: paj.why_short,
              applied_policies: Array.isArray(paj.applied_policies) ? paj.applied_policies : undefined,
              max_replans: stopPolicy?.max_replans ?? null,
              max_replans_evidence: stopPolicy?.evidence ?? paj.why_short_max_replans ?? null,
            };
          }
        }
      }
      if (row.type === 'plan_update' && !fallbackRules) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object' && Array.isArray((p as any).rules_applied)) {
          fallbackRules = (p as any).rules_applied;
        }
      }
    }
    if (!policySnapshot && fallbackRules && fallbackRules.length > 0) {
      policySnapshot = {
        why_short: fallbackRules.slice(0, 3).join('\n'),
        applied_policies: fallbackRules.map(r => ({ rule_text: r, source: 'plan' })),
      };
    }
    return { vs, ce, policySnapshot, leadVerifications };
  }

  function persistStructuredResult(payload: any) {
    const cid = conversationId;
    if (!cid) {
      pendingResultPersistsRef.current.push({ payload, ts: Date.now() });
      return;
    }
    try {
      const persistUrl = addDevAuthParams(buildApiUrl(`/api/conversations/${cid}/result-message`));
      void fetch(persistUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }

  const finalizeRunUIRef = useRef<(opts: { runId?: string | null; crid?: string | null; source: string }) => Promise<void>>();
  finalizeRunUIRef.current = async function finalizeRunUI(opts: { runId?: string | null; crid?: string | null; source: string }) {
    const { runId, crid, source } = opts;
    const effectiveRunId = runId || supervisorRunIdRef.current;
    const effectiveCrid = crid || supervisorClientRequestIdRef.current;
    const effectiveKey = effectiveRunId || effectiveCrid;

    if (!effectiveKey) {
      console.warn(`[Chat][finalizeRunUI] No runId or crid available (source=${source}), skipping`);
      return;
    }

    if (deliverySummaryRunIdsRef.current.has(effectiveKey)) {
      console.log(`[Chat][finalizeRunUI] Already finalized run=${effectiveKey} (source=${source}), skipping`);
      return;
    }

    console.log(`[Chat][finalizeRunUI] Finalizing run=${effectiveKey} (source=${source})`);

    try {
      const params = new URLSearchParams();
      if (effectiveRunId) params.set('runId', effectiveRunId);
      if (effectiveCrid) params.set('client_request_id', effectiveCrid);
      const url = addDevAuthParams(buildApiUrl(`/api/afr/artefacts?${params.toString()}`));
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        console.warn(`[Chat][finalizeRunUI] Artefact fetch failed: ${res.status} (source=${source})`);
        return;
      }
      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      const dsRow = rows.find((r: any) => r.type === 'delivery_summary');

      if (!dsRow) {
        const artefactTypes = rows.map((r: any) => r.type);
        const hasMissionTerminal = artefactTypes.includes('run_summary') ||
          artefactTypes.includes('outcome_log') ||
          artefactTypes.includes('policy_application_snapshot') ||
          artefactTypes.includes('verification_summary') ||
          artefactTypes.includes('run_halted') ||
          artefactTypes.some((t: string) => t === 'tower_judgement');

        if (!hasMissionTerminal) {
          console.log(`[Chat][finalizeRunUI] No delivery_summary or terminal artefacts yet for run=${effectiveKey} (source=${source}, count=${rows.length})`);
          return;
        }

        const leadsRows = rows.filter((r: any) => r.type === 'leads_list');
        const provisionalLeads: DeliveryLead[] = [];
        for (const lr of leadsRows) {
          let lp = lr.payload_json;
          if (typeof lp === 'string') { try { lp = JSON.parse(lp); } catch { continue; } }
          if (lp && typeof lp === 'object') {
            const items = Array.isArray(lp) ? lp : Array.isArray(lp.leads) ? lp.leads : Array.isArray(lp.results) ? lp.results : [];
            for (const item of items) {
              if (item && typeof item === 'object' && (item.name || item.location)) {
                provisionalLeads.push(item as DeliveryLead);
              }
            }
          }
        }

        const { vs: provVs, ce: provCe, policySnapshot: provPs, leadVerifications: provLv } = parseSiblingArtefacts(rows);
        const towerRow = rows.find((r: any) => r.type === 'tower_judgement');
        let towerVerdict: string | null = null;
        if (towerRow) {
          let tp = towerRow.payload_json;
          if (typeof tp === 'string') { try { tp = JSON.parse(tp); } catch {} }
          if (tp && typeof tp === 'object') towerVerdict = tp.verdict || null;
        }

        let synthesisedDs: DeliverySummary;
        if (provisionalLeads.length > 0) {
          const hasVs = provVs && typeof provVs === 'object' && (provVs as any).verified_exact_count > 0;
          synthesisedDs = {
            status: hasVs ? 'PASS' : 'STOP',
            delivered_exact: hasVs ? provisionalLeads : [],
            delivered_closest: hasVs ? [] : provisionalLeads,
            delivered_count: provisionalLeads.length,
            stop_reason: hasVs ? undefined : 'no_delivery_summary',
          };
        } else {
          const stopStatus = towerVerdict === 'stop' ? 'STOP' : (artefactTypes.includes('run_halted') ? 'STOP' : 'FAIL');
          synthesisedDs = {
            status: stopStatus,
            delivered_exact: [],
            delivered_closest: [],
            delivered_count: 0,
            stop_reason: towerVerdict === 'stop' ? 'tower_stopped' : (artefactTypes.includes('run_halted') ? 'run_halted' : 'no_results'),
          };
        }

        console.log(`[Chat][finalizeRunUI] Synthesised DS for run=${effectiveKey}: status=${synthesisedDs.status}, leads=${provisionalLeads.length}, leadVerifications=${provLv?.length ?? 'none'} (source=${source})`);
        deliverySummaryRunIdsRef.current.add(effectiveKey);
        if (effectiveRunId && effectiveRunId !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveRunId);
        if (effectiveCrid && effectiveCrid !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveCrid);

        window.dispatchEvent(new CustomEvent('wyshbone:results_final', {
          detail: { clientRequestId: effectiveCrid, runId: effectiveRunId || null },
        }));

        const finalMsg: Message = {
          id: `ds-${effectiveKey}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          source: 'supervisor',
          deliverySummary: synthesisedDs,
          verificationSummary: provVs,
          constraintsExtracted: provCe,
          leadVerifications: provLv,
          policySnapshot: provPs || undefined,
          runId: effectiveRunId || undefined,
          provisional: false,
        };
        upsertResultMessage(finalMsg);

        persistStructuredResult({
          messageId: finalMsg.id,
          runId: effectiveRunId || null,
          deliverySummary: synthesisedDs,
          verificationSummary: provVs || null,
          constraintsExtracted: provCe || null,
          leadVerifications: provLv || null,
          policySnapshot: provPs || null,
        });

        cleanupRunState(effectiveKey);
        return;
      }

      let parsed = dsRow.payload_json;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { return; }
      }
      if (!parsed || typeof parsed !== 'object') return;

      const { vs, ce, policySnapshot, leadVerifications } = parseSiblingArtefacts(rows);

      const dsExact = Array.isArray(parsed.delivered_exact) ? parsed.delivered_exact.length : 0;
      const dsClosest = Array.isArray(parsed.delivered_closest) ? parsed.delivered_closest.length : 0;
      console.log(`[Chat][finalizeRunUI] delivery_summary found for run=${effectiveKey}, status=${parsed.status}, verified_exact=${parsed.verified_exact_count ?? 'n/a'}, delivered_exact=${dsExact}, delivered_closest=${dsClosest}, leadVerifications=${leadVerifications?.length ?? 'none'} (source=${source})`);
      deliverySummaryRunIdsRef.current.add(effectiveKey);
      if (effectiveRunId && effectiveRunId !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveRunId);
      if (effectiveCrid && effectiveCrid !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveCrid);

      window.dispatchEvent(new CustomEvent('wyshbone:results_final', {
        detail: { clientRequestId: effectiveCrid, runId: effectiveRunId || null },
      }));

      const resultMessage: Message = {
        id: `ds-${effectiveKey}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        source: 'supervisor',
        deliverySummary: parsed as DeliverySummary,
        verificationSummary: vs,
        constraintsExtracted: ce,
        leadVerifications,
        policySnapshot: policySnapshot || undefined,
        runId: effectiveRunId || undefined,
        provisional: false,
      };
      upsertResultMessage(resultMessage);

      persistStructuredResult({
        messageId: resultMessage.id,
        runId: effectiveRunId || null,
        deliverySummary: parsed,
        verificationSummary: vs || null,
        constraintsExtracted: ce || null,
        leadVerifications: leadVerifications || null,
        policySnapshot: policySnapshot || null,
      });

      cleanupRunState(effectiveKey);

      toast({
        title: "Results ready",
        description: "Your results are now available in the chat.",
      });
    } catch (err) {
      console.warn(`[Chat][finalizeRunUI] Error (source=${source}):`, err);
    }
  };

  function upsertResultMessage(msg: Message) {
    setMessages((prev) => {
      const existingIdx = prev.findIndex(m => m.id === msg.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = msg;
        return updated;
      }
      const provisionalIdx = prev.findIndex(m => {
        if ('type' in m) return false;
        const cm = m as Message;
        return cm.provisional === true && cm.deliverySummary && cm.id?.startsWith('ds-');
      });
      if (provisionalIdx >= 0) {
        const updated = [...prev];
        updated[provisionalIdx] = msg;
        return updated;
      }
      return [...prev, msg];
    });
  }

  function cleanupRunState(effectiveKey: string) {
    const runsMap = inFlightSupervisorRunsRef.current;
    const mapEntries = Array.from(runsMap.entries());
    for (const [key, run] of mapEntries) {
      if (run.runId === effectiveKey || run.crid === effectiveKey || key === effectiveKey) {
        runsMap.delete(key);
        break;
      }
    }
    if (runsMap.size === 0) {
      setIsWaitingForSupervisor(false);
      setSupervisorTaskId(null);
      supervisorRunIdRef.current = null;
      supervisorClientRequestIdRef.current = null;
      if (supervisorTimeoutRef.current) {
        clearTimeout(supervisorTimeoutRef.current);
        supervisorTimeoutRef.current = null;
      }
      if (supervisorPollRef.current) {
        clearInterval(supervisorPollRef.current);
        supervisorPollRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (!conversationId) return;
    const pending = pendingResultPersistsRef.current;
    if (pending.length === 0) return;
    const now = Date.now();
    const items = pending.splice(0, pending.length);
    for (const item of items) {
      if (now - item.ts > 60_000) continue;
      try {
        const persistUrl = addDevAuthParams(buildApiUrl(`/api/conversations/${conversationId}/result-message`));
        void fetch(persistUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(item.payload),
        }).catch(() => {});
      } catch {}
    }
  }, [conversationId]);

  useEffect(() => {
    if (!isWaitingForSupervisor) {
      if (supervisorPollRef.current) {
        clearInterval(supervisorPollRef.current);
        supervisorPollRef.current = null;
      }
      return;
    }

    const runsMap = inFlightSupervisorRunsRef.current;
    console.log('[Chat][AFR-Poll] Phase 1 activated — polling /api/afr/stream, inFlightRuns:', Array.from(runsMap.keys()));

    let stopped = false;
    const terminalDetected = new Set<string>();

    async function fetchArtefactsWithRetry(runId: string | null, crid: string | null, maxRetries: number = 10): Promise<boolean> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (stopped) return false;
        const success = await finalizeRunUIRef.current?.({ runId, crid, source: `afr-poll-retry-${attempt}` });
        const effectiveKey = runId || crid;
        if (effectiveKey && deliverySummaryRunIdsRef.current.has(effectiveKey)) {
          console.log(`[Chat][AFR-Poll] Phase 2 success: artefacts finalized for ${effectiveKey} on attempt ${attempt}`);
          return true;
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      return false;
    }

    const pollStream = async () => {
      const entries = Array.from(runsMap.entries());
      if (entries.length === 0) {
        const fallbackRunId = supervisorRunIdRef.current;
        const fallbackCrid = supervisorClientRequestIdRef.current;
        if (fallbackRunId || fallbackCrid) {
          entries.push([fallbackCrid || fallbackRunId || 'fallback', { runId: fallbackRunId, crid: fallbackCrid || '' }]);
        } else {
          return;
        }
      }

      for (const [key, run] of entries) {
        const { runId, crid } = run;
        if (!runId && !crid) continue;
        const effectiveKey = runId || crid || key;

        if (deliverySummaryRunIdsRef.current.has(effectiveKey)) continue;
        if (terminalDetected.has(effectiveKey)) continue;

        try {
          const params = new URLSearchParams();
          if (crid) params.set('client_request_id', crid);
          if (runId) params.set('runId', runId);
          const streamUrl = addDevAuthParams(buildApiUrl(`/api/afr/stream?${params.toString()}`));
          const res = await fetch(streamUrl, { credentials: 'include', cache: 'no-store' });
          if (!res.ok) continue;
          const data = await res.json();

          const isTerminal = data.is_terminal === true;
          const status = data.status;
          const terminalState = data.terminal_state;

          if (isTerminal || status === 'completed' || status === 'failed' || 
              terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP') {
            console.log(`[Chat][AFR-Poll] Phase 1 terminal detected for ${effectiveKey}: status=${status}, terminal_state=${terminalState}, is_terminal=${isTerminal}`);
            terminalDetected.add(effectiveKey);

            const finalized = await fetchArtefactsWithRetry(runId, crid);
            if (!finalized) {
              console.warn(`[Chat][AFR-Poll] Phase 2 exhausted retries for ${effectiveKey}. Showing error bubble.`);
              const errorMsg: Message = {
                id: `ds-${effectiveKey}`,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                source: 'supervisor',
                deliverySummary: {
                  status: 'FAIL',
                  delivered_exact: [],
                  delivered_closest: [],
                  delivered_count: 0,
                  stop_reason: 'artefacts_unavailable',
                } as DeliverySummary,
                provisional: false,
              };
              upsertResultMessage(errorMsg);
              deliverySummaryRunIdsRef.current.add(effectiveKey);
              cleanupRunState(effectiveKey);
            }
          }
        } catch (err) {
          console.warn(`[Chat][AFR-Poll] Stream poll error for ${effectiveKey}:`, err);
        }
      }
    };

    const initialDelay = setTimeout(() => {
      pollStream();
      supervisorPollRef.current = setInterval(pollStream, 1500);
    }, 1500);

    return () => {
      stopped = true;
      clearTimeout(initialDelay);
      if (supervisorPollRef.current) {
        clearInterval(supervisorPollRef.current);
        supervisorPollRef.current = null;
      }
    };
  }, [isWaitingForSupervisor]);

  // Subscribe to Supervisor responses via Supabase realtime
  useEffect(() => {
    if (!conversationId) return;

    console.log('🔔 Setting up Supervisor subscription for conversation:', conversationId);
    
    const channel = subscribeSupervisorMessages(conversationId, async (supervisorMessage: SupervisorMessage) => {
      if (processedRealtimeMsgIdsRef.current.has(supervisorMessage.id)) {
        console.log('[Chat] Skipping already-processed realtime message:', supervisorMessage.id);
        return;
      }
      processedRealtimeMsgIdsRef.current.add(supervisorMessage.id);

      console.log('🤖 Received Supervisor message:', supervisorMessage);

      const msgRunId = supervisorMessage.metadata?.run_id || supervisorMessage.metadata?.runId || null;

      const effectiveRunKey = msgRunId || supervisorRunIdRef.current || supervisorClientRequestIdRef.current;

      const runIsInFlight = effectiveRunKey
        ? Array.from(inFlightSupervisorRunsRef.current.values()).some(
            r => r.runId === effectiveRunKey || r.crid === effectiveRunKey
          )
        : false;
      const hasDeliverySummary = effectiveRunKey
        ? deliverySummaryRunIdsRef.current.has(effectiveRunKey)
        : false;

      if (runIsInFlight || hasDeliverySummary) {
        console.log(`🛡️ Supervisor bubble suppressed (inFlight=${runIsInFlight}, hasDS=${hasDeliverySummary}, runKey=${effectiveRunKey}): "${supervisorMessage.content.slice(0, 80)}…"`);
        setMessages((prev) => {
          if (prev.some(m => m.id === `debug-${supervisorMessage.id}`)) return prev;
          const debugNote: Message = {
            id: `debug-${supervisorMessage.id}`,
            role: 'assistant',
            content: supervisorMessage.content,
            timestamp: new Date(supervisorMessage.created_at),
            source: 'supervisor',
            runId: msgRunId,
            hidden: true,
          };
          return [...prev, debugNote];
        });
      } else {
        const displayMessage: Message = {
          id: supervisorMessage.id,
          role: 'assistant',
          content: supervisorMessage.content,
          timestamp: new Date(supervisorMessage.created_at),
          source: 'supervisor',
          runId: msgRunId,
        };

        setMessages((prev) => {
          if (prev.some(m => m.id === displayMessage.id)) {
            return prev;
          }
          return [...prev, displayMessage];
        });
      }

      publishEvent("CHAT_MESSAGE_RECEIVED", {
        conversationId: supervisorMessage.conversation_id,
        messageId: supervisorMessage.id,
        content: supervisorMessage.content,
        source: "supervisor",
      });
      
      setSupervisorTaskId(null);
      if (supervisorTimeoutRef.current) {
        clearTimeout(supervisorTimeoutRef.current);
        supervisorTimeoutRef.current = null;
      }

      console.log('[Chat][Realtime] Supervisor message received — AFR poller handles finalization, not realtime');
    });

    // Cleanup subscription on unmount or conversation change
    return () => {
      if (channel) {
        console.log('🔕 Cleaning up Supervisor subscription');
        channel.unsubscribe();
      }
    };
  }, [conversationId, toast]);


  const startDeepResearch = async (request: DeepResearchCreateRequest) => {
    try {
      // UI-16: Include current vertical in deep research request
      const verticalId = getCurrentVerticalId();
      console.log(`🔬 Starting deep research with vertical: ${verticalId}`);
      
      const response = await apiRequest("POST", "/api/deep-research", {
        ...request,
        conversationId,
        userId: user.id,
        verticalId,
      });

      const data = await response.json();
      const run = data.run;
      
      // Add to sidebar immediately
      if (addRun) {
        addRun({
          id: run.id,
          label: run.label,
          startedAt: new Date(run.createdAt).toISOString(),
          status: run.status,
          runType: "deep_research",
          outputPreview: run.outputPreview,
        });
        triggerSidebarFlash('deepResearch');
      }
      
      const systemMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `🔬 Deep research started: "${request.label || request.prompt}". Check the sidebar for progress.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
      
      return run;
    } catch (error: any) {
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to start deep research: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation history ONCE on mount from localStorage
  useEffect(() => {
    const loadHistory = async () => {
      // Only run once on mount
      if (hasLoadedHistoryRef.current) return;
      hasLoadedHistoryRef.current = true;
      
      // Get conversationId from localStorage
      const storedConversationId = localStorage.getItem('currentConversationId');
      if (!storedConversationId) return;
      
      setIsLoadingHistory(true);
      try {
        const response = await authedFetch(`/api/debug/conversations/${storedConversationId}/messages`);
        if (response.ok) {
          const data = await response.json();
          const historicalMessages: Message[] = data.messages.map((msg: any) => {
            const base: Message = {
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.createdAt),
            };
            const meta = msg.metadata;
            if (meta && typeof meta === 'object' && meta.type === 'structured_result' && meta.deliverySummary) {
              base.source = 'supervisor';
              base.deliverySummary = meta.deliverySummary;
              base.verificationSummary = meta.verificationSummary || null;
              base.constraintsExtracted = meta.constraintsExtracted || null;
              base.policySnapshot = meta.policySnapshot || null;
              base.runId = meta.runId || null;
            }
            return base;
          });
          if (historicalMessages.length > 0) {
            historicalMessages.forEach((m) => {
              if (m.id?.startsWith('ds-')) {
                const runKey = m.id.slice(3);
                if (runKey) deliverySummaryRunIdsRef.current.add(runKey);
              }
              if (m.deliverySummary && m.runId) {
                deliverySummaryRunIdsRef.current.add(m.runId);
              }
            });
            setMessages(historicalMessages);
            const dsCount = historicalMessages.filter(m => m.deliverySummary).length;
            console.log(`📜 Loaded ${historicalMessages.length} messages (${dsCount} with deliverySummary) from conversation ${storedConversationId}`);
          }
        }
      } catch (error) {
        handleApiError(error, "load conversation history");
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, []); // Empty deps - only run ONCE on mount

  useEffect(() => {
    if (!conversationId || isLoadingHistory) return;

    const recoverOrphanedRuns = async () => {
      try {
        const runsUrl = addDevAuthParams(buildApiUrl(`/api/afr/runs?limit=20&conversation_id=${encodeURIComponent(conversationId)}`));
        const runsRes = await fetch(runsUrl, { credentials: 'include' });
        if (!runsRes.ok) {
          console.warn('[Chat][Recovery] Failed to fetch runs:', runsRes.status);
          return;
        }
        const runs = await runsRes.json();
        if (!Array.isArray(runs)) return;

        const completedRuns = runs.filter(
          (r: any) => (r.status === 'completed' || r.status === 'success') && r.id && r.client_request_id
        );

        if (completedRuns.length === 0) {
          console.log('[Chat][Recovery] No completed runs found');
          return;
        }

        const orphaned = completedRuns
          .filter((r: any) => !deliverySummaryRunIdsRef.current.has(r.id) && !deliverySummaryRunIdsRef.current.has(r.client_request_id))
          .slice(0, 3);

        if (orphaned.length === 0) {
          console.log('[Chat][Recovery] All completed runs already have bubbles');
          return;
        }

        console.log(`[Chat][Recovery] Found ${orphaned.length} orphaned completed runs (capped at 3), attempting recovery`);

        for (const run of orphaned) {
          try {
            await finalizeRunUIRef.current?.({
              runId: run.id,
              crid: run.client_request_id || null,
              source: 'recovery',
            });
          } catch (err) {
            console.warn(`[Chat][Recovery] Error recovering run ${run.id}:`, err);
          }
        }
      } catch (err) {
        console.warn('[Chat][Recovery] Error:', err);
      }
    };

    const timer = setTimeout(recoverOrphanedRuns, 2000);
    return () => clearTimeout(timer);
  }, [conversationId, isLoadingHistory]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { runId, clientRequestId } = detail;
      console.log('[Chat][ActivityBridge] wyshbone:activity_terminal received', { runId, clientRequestId });
      finalizeRunUIRef.current?.({
        runId: runId || null,
        crid: clientRequestId || null,
        source: 'activity-panel-bridge',
      });
    };
    window.addEventListener('wyshbone:activity_terminal', handler);
    return () => window.removeEventListener('wyshbone:activity_terminal', handler);
  }, []);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const retryRunId = detail.runId || supervisorRunIdRef.current;
      const retryCrid = supervisorClientRequestIdRef.current;
      console.log('[Chat][Retry] wyshbone:retry_artefacts received, runId:', retryRunId, 'crid:', retryCrid);
      if (retryRunId) deliverySummaryRunIdsRef.current.delete(retryRunId);
      if (retryCrid) deliverySummaryRunIdsRef.current.delete(retryCrid);
      for (let attempt = 1; attempt <= 10; attempt++) {
        await finalizeRunUIRef.current?.({ runId: retryRunId, crid: retryCrid, source: `retry-click-${attempt}` });
        const effectiveKey = retryRunId || retryCrid;
        if (effectiveKey && deliverySummaryRunIdsRef.current.has(effectiveKey)) {
          console.log(`[Chat][Retry] Success on attempt ${attempt}`);
          return;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      console.warn('[Chat][Retry] All 10 retry attempts exhausted');
    };
    window.addEventListener('wyshbone:retry_artefacts', handler);
    return () => window.removeEventListener('wyshbone:retry_artefacts', handler);
  }, []);

  // Persist conversationId to localStorage
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem('currentConversationId', conversationId);
    }
  }, [conversationId]);

  // REMOVED: Goal prompt blocking logic
  // Micro goals like "find pubs in Devon" must execute immediately
  // Long-term goal capture is optional and accessed via the "My Goal" panel in sidebar

  // Poll batch job statuses and update messages when complete
  useEffect(() => {
    const pollBatchJobs = async () => {
      if (batchJobTracking.size === 0) return;

      for (const [messageId, batchId] of Array.from(batchJobTracking.entries())) {
        try {
          const response = await authedFetch(`/api/batch/${batchId}`);
          if (response.ok) {
            const job = await response.json();
            
            if (job.status === 'completed') {
              // Update message to show completion
              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id === messageId && 'content' in msg) {
                    const updatedContent = msg.content
                      .replace(/⏳ Running/g, '✅ Completed')
                      .replace(/⏳/g, '✅');
                    return { ...msg, content: updatedContent };
                  }
                  return msg;
                })
              );
              
              // Remove from tracking
              setBatchJobTracking((prev) => {
                const newMap = new Map(prev);
                newMap.delete(messageId);
                return newMap;
              });

              console.log(`✅ Batch job ${batchId} completed`);
            }
          }
        } catch (error) {
          console.error(`Error polling batch job ${batchId}:`, error);
        }
      }
    };

    // Start polling if we have batch jobs to track
    if (batchJobTracking.size > 0 && !batchPollIntervalRef.current) {
      batchPollIntervalRef.current = setInterval(pollBatchJobs, 5000); // Poll every 5 seconds
    }

    // Stop polling if no more batch jobs
    if (batchJobTracking.size === 0 && batchPollIntervalRef.current) {
      clearInterval(batchPollIntervalRef.current);
      batchPollIntervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (batchPollIntervalRef.current) {
        clearInterval(batchPollIntervalRef.current);
        batchPollIntervalRef.current = null;
      }
    };
  }, [batchJobTracking]);

  // Expose send message function to parent (use ref to avoid dependency issues)
  const handleSendRef = useRef<((content?: string) => void) | null>(null);
  const setMessagesRef = useRef<React.Dispatch<React.SetStateAction<DisplayMessage[]>> | null>(null);

  useEffect(() => {
    handleSendRef.current = handleSend;
    setMessagesRef.current = setMessages;
  });

  useEffect(() => {
    if (onInjectSystemMessage) {
      const injectMessage = (content: string, asUser: boolean = true) => {
        if (asUser) {
          // Send to AI
          handleSendRef.current?.(content);
        } else {
          // Add as assistant message directly
          const message: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content,
            timestamp: new Date(),
          };
          setMessagesRef.current?.((prev) => [...prev, message]);
        }
      };
      onInjectSystemMessage(injectMessage);
    }
  }, [onInjectSystemMessage]);

  // Expose new chat function to parent
  useEffect(() => {
    if (onNewChat) {
      const handleNewChat = () => {
        // Abort any active stream first
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        
        // IMPORTANT: Set history loading ref to true FIRST to prevent auto-loading
        hasLoadedHistoryRef.current = true;
        
        // Reset greeting ref so it shows for new chat
        hasShownGreetingRef.current = false;
        
        // Generate a fresh conversation ID for the new chat
        const newConversationId = crypto.randomUUID();
        
        // Clear old conversationId from localStorage and set new one
        localStorage.setItem('currentConversationId', newConversationId);
        
        // Clear all state and set new conversation ID
        setMessages([]);
        setInput("");
        setIsStreaming(false);
        setShowLocationSuggestions(false);
        clearRecentRuns();
        setConversationId(newConversationId);
        
        console.log(`🆕 Started new chat with ID: ${newConversationId}`);
      };
      onNewChat(handleNewChat);
    }
  }, [onNewChat]);

  // Expose load conversation function to parent
  useEffect(() => {
    if (onLoadConversation) {
      const handleLoadConversation = async (newConversationId: string) => {
        // Abort any active stream first
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        setIsStreaming(false);
        setInput("");
        setShowLocationSuggestions(false);
        clearRecentRuns();
        
        // Update conversationId
        setConversationId(newConversationId);
        localStorage.setItem('currentConversationId', newConversationId);
        
        // Load conversation messages
        setIsLoadingHistory(true);
        try {
          const response = await authedFetch(`/api/conversations/${newConversationId}/messages`);
          if (response.ok) {
            const messages = await response.json();
            const loadedMessages: DisplayMessage[] = messages.map((msg: any) => {
              const base: any = {
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content,
                timestamp: new Date(msg.createdAt),
              };
              const meta = msg.metadata;
              if (meta && typeof meta === 'object' && meta.type === 'structured_result' && meta.deliverySummary) {
                base.source = 'supervisor';
                base.deliverySummary = meta.deliverySummary;
                base.verificationSummary = meta.verificationSummary || null;
                base.constraintsExtracted = meta.constraintsExtracted || null;
                base.leadVerifications = meta.leadVerifications || null;
                base.policySnapshot = meta.policySnapshot || null;
                base.runId = meta.runId || null;
              }
              return base;
            });
            deliverySummaryRunIdsRef.current = new Set();
            loadedMessages.forEach((m: any) => {
              if (m.id?.startsWith('ds-')) {
                const runKey = m.id.slice(3);
                if (runKey) deliverySummaryRunIdsRef.current.add(runKey);
              }
              if (m.deliverySummary && m.runId) {
                deliverySummaryRunIdsRef.current.add(m.runId);
              }
            });
            setMessages(loadedMessages);
            hasLoadedHistoryRef.current = true;
            const dsCount = loadedMessages.filter((m: any) => m.deliverySummary).length;
            console.log(`📜 Loaded ${loadedMessages.length} messages (${dsCount} with deliverySummary) from conversation ${newConversationId}`);
          } else {
            console.error("Failed to load conversation history");
          }
        } catch (error) {
          handleApiError(error, "load conversation");
        } finally {
          setIsLoadingHistory(false);
        }
      };
      onLoadConversation(handleLoadConversation);
    }
  }, [onLoadConversation]);

  const streamChatResponse = async (conversationMessages: ChatMessage[]) => {
    if (inFlightRequestIdRef.current) {
      return;
    }
    
    if (pendingCleanupRef.current) {
      clearTimeout(pendingCleanupRef.current);
      pendingCleanupRef.current = null;
    }
    
    setIsStreaming(true);
    
    const clientRequestId = crypto.randomUUID();
    inFlightRequestIdRef.current = clientRequestId;
    
    setProgressStack([]);
    setExecutedToolsSummary(null);
    setActiveClientRequestId(clientRequestId);
    
    setCurrentClientRequestId(clientRequestId);
    const lastUserMsg = conversationMessages.filter(m => m.role === 'user').pop();
    const runLabel = lastUserMsg?.content ? (lastUserMsg.content.length > 25 ? lastUserMsg.content.slice(0, 25) + '…' : lastUserMsg.content) : undefined;
    addRecentRun(clientRequestId, runLabel);
    if (!userPinned) {
      setPinnedClientRequestId(clientRequestId);
    }
    setLastCompletedClientRequestId(null);
    
    const assistantMessageId = crypto.randomUUID();
    let isRunLane = false;

    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Send conversation to /api/chat endpoint (GPT-5 with web search)
      const sessionId = localStorage.getItem('wyshbone_sid');
      const response = await fetch(buildApiUrl(addDevAuthParams("/api/chat")), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "x-session-id": sessionId } : {}),
        },
        body: JSON.stringify({
          messages: conversationMessages,
          user: { id: user.id, email: user.email },
          defaultCountry: defaultCountry,
          conversationId: conversationId,
          clientRequestId: clientRequestId,
          ...(pendingMetadataRef.current ? { metadata: pendingMetadataRef.current } : {}),
          ...(pendingMetadataRef.current?.follow_up ? { follow_up: pendingMetadataRef.current.follow_up } : {}),
        }),
        signal: abortControllerRef.current.signal,
        credentials: "include",
      });

      pendingMetadataRef.current = null;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      // Handle SSE streaming response from /api/chat
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let streamHasSupervisorTask = false;

      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            
            if (data === '[DONE]') {
              // Stream complete
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              
              // Handle conversationId from backend
              if (parsed.conversationId) {
                console.log('💬 Received conversationId:', parsed.conversationId);
                setConversationId(parsed.conversationId);
              }
              
              // Handle ACK event (immediate acknowledgment)
              if (parsed.type === 'ack') {
                console.log('✓ ACK received:', parsed.message);
                setActiveClientRequestId(parsed.clientRequestId || clientRequestId);
                setProgressStack([{
                  stage: 'ack',
                  message: parsed.message || 'OK, working',
                  ts: parsed.ts || Date.now(),
                }]);
              }
              
              // Handle run_id event (early canonical run ID from agent_runs)
              if (parsed.type === 'run_id' && parsed.runId) {
                console.log('🔗 Run ID received:', parsed.runId);
                supervisorRunIdRef.current = parsed.runId;
                window.dispatchEvent(new CustomEvent('wyshbone:run_id', {
                  detail: { runId: parsed.runId, clientRequestId: parsed.clientRequestId || clientRequestId },
                }));
              }
              
              // Handle STATUS events (progress updates)
              if (parsed.type === 'status' && parsed.stage) {
                console.log(`📊 Status: ${parsed.stage} - ${parsed.message}`);
                setProgressStack((prev) => {
                  const existingIndex = prev.findIndex(p => p.stage === parsed.stage);
                  const newEvent: ProgressEvent = {
                    stage: parsed.stage,
                    message: parsed.message || parsed.stage,
                    ts: parsed.ts || Date.now(),
                    toolName: parsed.toolName,
                  };
                  if (existingIndex >= 0) {
                    const updated = [...prev];
                    updated[existingIndex] = newEvent;
                    return updated;
                  }
                  return [...prev, newEvent];
                });
                
                // If completed or failed, build tools summary and clear active request
                if (parsed.stage === 'completed' || parsed.stage === 'failed') {
                  setProgressStack((prev) => {
                    const toolNames = prev
                      .filter(p => p.stage === 'executing' && p.toolName)
                      .map(p => p.toolName!);
                    if (toolNames.length > 0) {
                      setExecutedToolsSummary({ tools: toolNames, rejected: [] });
                    }
                    return prev;
                  });
                  pendingCleanupRef.current = setTimeout(() => {
                    pendingCleanupRef.current = null;
                    if (inFlightRequestIdRef.current === clientRequestId) {
                      inFlightRequestIdRef.current = null;
                    }
                    setLastCompletedClientRequestId(clientRequestId);
                    setActiveClientRequestId((current) => current === clientRequestId ? null : current);
                    setExecutedToolsSummary(null);
                    if (queuedMessageRef.current) {
                      const messageToSend = queuedMessageRef.current;
                      setQueuedMessage(null);
                      handleSendRef.current?.(messageToSend);
                    }
                  }, 1200);
                }
              }
              
              if (parsed.supervisorTaskId) {
                streamHasSupervisorTask = true;
                isRunLane = true;
                setLastLane("run");
                console.log('🤖 Supervisor task created:', parsed.supervisorTaskId, 'runId=', supervisorRunIdRef.current, 'crid=', clientRequestId);
                inFlightSupervisorRunsRef.current.set(clientRequestId, {
                  runId: supervisorRunIdRef.current,
                  crid: clientRequestId,
                });
                setSupervisorTaskId(parsed.supervisorTaskId);
                supervisorClientRequestIdRef.current = clientRequestId;
                setIsWaitingForSupervisor(true);

                const provisionalKey = supervisorRunIdRef.current || clientRequestId;
                if (!deliverySummaryRunIdsRef.current.has(provisionalKey)) {
                  const provisionalBubble: Message = {
                    id: `ds-${provisionalKey}`,
                    role: 'assistant',
                    content: '',
                    timestamp: new Date(),
                    source: 'supervisor',
                    deliverySummary: {
                      status: 'UNAVAILABLE',
                      delivered_exact: [],
                      delivered_closest: [],
                      delivered_count: 0,
                    } as DeliverySummary,
                    runId: supervisorRunIdRef.current || undefined,
                    provisional: true,
                  };
                  upsertResultMessage(provisionalBubble);
                  console.log(`[Chat][AFR-Poll] Provisional bubble inserted for ${provisionalKey}`);
                }
              }
              
              // Handle batch job ID
              if (parsed.batchId) {
                console.log('🔗 Received batch job ID:', parsed.batchId);
                setBatchJobTracking((prev) => new Map(prev).set(assistantMessageId, parsed.batchId));
                triggerSidebarFlash('emailFinder');
              }
              
              if (parsed.content && !isRunLane) {
                if (!streamHasSupervisorTask) {
                  setLastLane("chat");
                }
                accumulatedContent += parsed.content;
                setMessages((prev) => {
                  const exists = prev.some(m => m.id === assistantMessageId);
                  if (!exists) {
                    return [...prev, { id: assistantMessageId, role: 'assistant' as const, content: accumulatedContent, timestamp: new Date() }];
                  }
                  return prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  );
                });
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              // Skip invalid JSON lines
              if (data !== '[DONE]') {
                console.warn('Failed to parse SSE data:', data);
              }
            }
          }
        }
      }

      // After streaming completes, check if this was a successful batch execution
      if ((addRun || updateRun) && (accumulatedContent.includes("Batch sent to Smartlead") || accumulatedContent.includes("contact queued"))) {
        console.log("Extracting run details from AI response:", accumulatedContent);
        
        // Extract details from the AI's response which contains the batch preview
        // Pattern: "- {role} @ {businessType} in {location}, {country}"
        let businessType = "";
        let location = "";
        let targetPosition = "";
        let country = defaultCountry;
        
        // Primary pattern: Look for bullet points like "- ceo @ pubs [Atlanta, US]:"
        const bulletMatch = accumulatedContent.match(/-\s*([^@]+?)\s*@\s*([^\[]+?)\s*\[([^,\]]+?)(?:,\s*([A-Z]{2}))?\]/i);
        if (bulletMatch) {
          targetPosition = bulletMatch[1].trim();
          businessType = bulletMatch[2].trim();
          location = bulletMatch[3].trim();
          country = bulletMatch[4]?.trim() || defaultCountry;
          console.log("Matched bullet pattern:", { targetPosition, businessType, location, country });
        } else {
          // Fallback patterns
          console.log("Trying fallback patterns...");
          
          // Look for business type
          const businessMatch = accumulatedContent.match(/(?:Business|business_type):\s*([^\n]+)/i) || 
                               accumulatedContent.match(/@ ([^in]+?)\s+in\s+/i);
          if (businessMatch) {
            businessType = businessMatch[1].trim();
          }
          
          // Look for location
          const locationMatch = accumulatedContent.match(/(?:Location|location):\s*([^\n]+)/i) ||
                               accumulatedContent.match(/in\s+\*\*([^\*,]+)\*\*/i) ||
                               accumulatedContent.match(/in\s+([^,\n]+?)(?:,|\s+[A-Z]{2})/i);
          if (locationMatch) {
            location = locationMatch[1].trim();
          }
          
          // Look for target position/role
          const positionMatch = accumulatedContent.match(/(?:Target|target_position|Position|Role):\s*([^\n]+)/i) ||
                               accumulatedContent.match(/-\s*([^@]+?)\s*@/i);
          if (positionMatch) {
            targetPosition = positionMatch[1].trim();
          }
          
          // Look for country code
          const countryMatch = accumulatedContent.match(/(?:Country|country):\s*([A-Z]{2})/i) ||
                              accumulatedContent.match(/,\s*([A-Z]{2})\s*\*\*/i);
          if (countryMatch) {
            country = countryMatch[1].trim();
          }
          
          console.log("Fallback extraction:", { businessType, location, targetPosition, country });
        }
        
        // Create a readable label
        const label = businessType && location 
          ? `${businessType.charAt(0).toUpperCase() + businessType.slice(1)} in ${location}${targetPosition ? ' - ' + targetPosition.charAt(0).toUpperCase() + targetPosition.slice(1) : ''}`
          : `${targetPosition || "Contact"} @ ${businessType || "businesses"} in ${location || "location"}`;
        
        // Check if this is updating an existing run (from clicking "Run" button) or creating a new one
        const activeRunId = getActiveRunId?.();
        
        if (activeRunId && updateRun) {
          // Update existing run - keep the same unique ID
          console.log("Updating existing run:", activeRunId, "with data:", { label, status: "completed", businessType, location, country, targetPosition });
          updateRun(activeRunId, {
            label,
            status: "completed",
            businessType,
            location,
            country,
            targetPosition,
            // Don't update uniqueId - it stays the same
          });
          console.log("Updated run in history - UI should now show completed status");
        } else if (addRun) {
          // Create new run with new unique ID
          // Generate unique ID (20 chars lowercase alphanumeric)
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          let uniqueId = '';
          for (let i = 0; i < 20; i++) {
            uniqueId += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          
          console.log("Creating new run");
          addRun({
            label,
            status: "completed",
            businessType,
            location,
            country,
            targetPosition,
            uniqueId,
          });
          console.log("Added run to history:", { label, businessType, location, country, targetPosition, uniqueId });
        }
      }
      
      setIsStreaming(false);
      
      if (!pendingCleanupRef.current) {
        pendingCleanupRef.current = setTimeout(() => {
          pendingCleanupRef.current = null;
          if (inFlightRequestIdRef.current === clientRequestId) {
            inFlightRequestIdRef.current = null;
          }
          setActiveClientRequestId((current) => current === clientRequestId ? null : current);
          if (queuedMessageRef.current) {
            const messageToSend = queuedMessageRef.current;
            setQueuedMessage(null);
            setTimeout(() => handleSendRef.current?.(messageToSend), 100);
          }
        }, 1200);
      }
      
    } catch (error: any) {
      setIsStreaming(false);
      inFlightRequestIdRef.current = null;
      
      // ROBUST CLEANUP: Clear soft lock state on error
      setActiveClientRequestId(null);
      setProgressStack((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.stage !== 'completed' && last.stage !== 'failed') {
          return [...prev, { stage: 'failed' as ProgressStage, message: error.message || 'Request failed', ts: Date.now() }];
        }
        return prev;
      });
      
      // Check for queued message and auto-submit even on error
      if (queuedMessageRef.current) {
        const messageToSend = queuedMessageRef.current;
        setQueuedMessage(null);
        console.log('📤 Auto-submitting queued message after error:', messageToSend.slice(0, 50));
        setTimeout(() => handleSendRef.current?.(messageToSend), 500);
      }
      
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
      
      // Add error message
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to get response: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const addNoteMutation = useMutation<AddNoteResponse, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tool/add_note", {
        userToken: "demo-token-123",
        leadId: "lead-456",
        note: "This is a demo note from the Wyshbone AI chat interface",
      });
      return await response.json();
    },
    onSuccess: () => {
      const systemMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: "Note successfully added to Bubble",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
    },
    onError: (error) => {
      const errorMessage: SystemMessage = {
        id: crypto.randomUUID(),
        type: "system",
        content: `Failed to add note: ${error.message}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  // MEGA sendMegaMessage removed (tech debt cleanup - MEGA mode is defunct).
  // All messages now go through Standard streaming via handleSend -> streamChatResponse.


  // Intent classification: Determines if user wants to start fresh or continue
  const classifyIntent = (newMessage: string, history: Message[]): 'NEW_REPLACE' | 'CONTINUE' | 'MODIFY' | 'NEW_UNRELATED' => {
    const lowerMsg = newMessage.toLowerCase();

    // No history = always NEW
    if (history.length === 0) return 'NEW_REPLACE';

    // Strong NEW_REPLACE signals (explicit goal change)
    const newReplacePatterns = [
      /^(find|search for|look for|get me|show me).+in [a-z]/i,  // "Find pubs in Manchester" (new location/topic)
      /^(i want to|i need to|let's|can you).+(instead|now)/i,   // "I want to search Leeds instead"
      /^(actually|wait|no|forget that)/i,                       // "Actually, let's do Birmingham"
      /^(new search|start over|different)/i,                    // "New search for..."
    ];

    if (newReplacePatterns.some(p => p.test(newMessage))) {
      // Check if it's truly different from last user message
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const oldLocation = lastUserMsg.content.match(/in ([a-z\s]+)/i)?.[1];
        const newLocation = newMessage.match(/in ([a-z\s]+)/i)?.[1];
        if (oldLocation && newLocation && oldLocation.toLowerCase() !== newLocation.toLowerCase()) {
          return 'NEW_REPLACE';
        }
      }
    }

    // MODIFY signals (tweaking existing request)
    const modifyPatterns = [
      /^(make that|change (?:that|it) to|actually|instead of)/i,  // "Make that 100 instead of 60"
      /^(increase|decrease|more|less|fewer|add|remove)/i,          // "Increase to 100"
      /\b(not|instead of|rather than)\b/i,                         // "Not 60, 100"
    ];

    if (modifyPatterns.some(p => p.test(newMessage)) && history.length > 0) {
      return 'MODIFY';
    }

    // NEW_UNRELATED signals (completely different task)
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      const wasResearching = /find|search|look|show|get/i.test(lastUserMsg.content);
      const nowDrafting = /draft|write|compose|create.*email/i.test(lowerMsg);
      const nowAnalyzing = /analyze|review|check/i.test(lowerMsg);

      if ((wasResearching && nowDrafting) || (wasResearching && nowAnalyzing)) {
        return 'NEW_UNRELATED';
      }
    }

    // Default: CONTINUE (follow-up questions, clarifications)
    return 'CONTINUE';
  };

  // Check if a run is currently active (soft lock check)
  const isRunActive = !!activeClientRequestId;

  const handleSend = async (promptOverride?: string) => {
    const messageContent = promptOverride || input.trim();
    if (!messageContent) return;
    
    // SOFT LOCK: If a run is active, don't submit - this is handled by handleKeyDown
    // This check is here as a safety net for direct calls
    if (isStreaming || isRunActive) {
      console.log('⏸️ Run active, cannot submit new message');
      return;
    }

    // Hide location suggestions
    setShowLocationSuggestions(false);

    // INTENT CLASSIFICATION: Determine if this is a new goal or continuation
    const currentHistory = messages.filter((msg): msg is Message => !("type" in msg));
    const intent = classifyIntent(messageContent, currentHistory);

    console.log(`🎯 Intent classified: ${intent} for message: "${messageContent.slice(0, 50)}..."`);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    // Handle intent-based context management
    if (intent === 'NEW_REPLACE') {
      console.log('🔄 NEW_REPLACE: Clearing old context and starting fresh');
      setMessages((prev) => {
        const dsMessages = prev.filter(m => m.id.startsWith('ds-'));
        return [...dsMessages, userMessage];
      });
    } else if (intent === 'NEW_UNRELATED') {
      console.log('🆕 NEW_UNRELATED: Starting new thread');
      setMessages((prev) => {
        const dsMessages = prev.filter(m => m.id.startsWith('ds-'));
        return [...dsMessages, userMessage];
      });
    } else {
      // CONTINUE or MODIFY: Keep existing context
      setMessages((prev) => [...prev, userMessage]);
    }

    setInput("");

    // Publish event for message sent
    publishEvent("CHAT_MESSAGE_SENT", {
      conversationId: conversationId || "pending",
      messageId: userMessage.id,
      content: messageContent,
      mode: chatMode,
    });

    // Build conversation history based on intent
    let conversationHistory: ChatMessage[];

    if (intent === 'NEW_REPLACE' || intent === 'NEW_UNRELATED') {
      // For new goals, only send the current message (no old context)
      conversationHistory = [{ role: userMessage.role, content: userMessage.content }];
    } else {
      // For CONTINUE/MODIFY, send recent history
      const allHistory = messages
        .filter((msg): msg is Message => !("type" in msg))
        .map(({ role, content }) => ({ role, content }));

      // LIMIT TO LAST 6 MESSAGES (3 exchanges) to prevent old context pollution
      const recentHistory = allHistory.slice(-6);
      conversationHistory = [...recentHistory, { role: userMessage.role, content: userMessage.content }];
    }

    // Send conversation to backend
    streamChatResponse(conversationHistory);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    
    // Show location suggestions if user is typing and not streaming
    if (newValue.length >= 3 && !isStreaming) {
      setShowLocationSuggestions(true);
    } else {
      setShowLocationSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.repeat) {
      e.preventDefault();
      setShowLocationSuggestions(false);
      
      // SOFT LOCK: If run is active, show toast and don't submit
      if (isRunActive || isStreaming) {
        toast({
          title: "Wyshbone is working",
          description: "Press Queue to run this next, or wait for the current request to finish.",
        });
        return;
      }
      
      handleSend();
    } else if (e.key === "Escape") {
      setShowLocationSuggestions(false);
    }
  };
  
  // Queue handler: Save message for later execution
  const handleQueue = () => {
    const messageContent = input.trim();
    if (!messageContent) return;
    
    setQueuedMessage(messageContent);
    setInput("");
    toast({
      title: "Message queued",
      description: "Your message will run automatically when the current request finishes.",
    });
  };
  
  // Cancel handler: Abort current request and optionally run queued message
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    inFlightRequestIdRef.current = null;
    setActiveClientRequestId(null);
    setProgressStack((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.stage !== 'completed' && last.stage !== 'failed') {
        return [...prev.slice(0, -1), { ...last, stage: 'failed' as ProgressStage, message: 'Cancelled' }];
      }
      return prev;
    });
    
    toast({
      title: "Request cancelled",
      description: queuedMessage ? "Running queued message..." : "Request has been stopped.",
    });
    
    // If there's a queued message, submit it after a brief delay
    if (queuedMessageRef.current) {
      const messageToSend = queuedMessageRef.current;
      setQueuedMessage(null);
      setTimeout(() => {
        handleSendRef.current?.(messageToSend);
      }, 300);
    }
  };

  const handleSelectLocation = (newValue: string) => {
    setInput(newValue);
    setShowLocationSuggestions(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-nowrap h-full w-full bg-background overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto py-8">
        <div className="w-full space-y-4 px-6">
          {messages.length === 0 && isLoadingGoal ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
              <div className="w-16 h-16 rounded-full overflow-hidden mb-4">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-xl font-semibold mb-6">Loading...</h2>
            </div>
          ) : messages.length === 0 && !isLoadingHistory ? (
            /* UI-19: Welcome state with sample prompts */
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-4">
              <div className="w-20 h-20 rounded-full overflow-hidden mb-6 shadow-lg">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">What can I help you with?</h2>
              <p className="text-muted-foreground mb-8 max-w-md">
                Tell me what you need — I can find leads, research markets, draft emails, and more.
              </p>
              
              {/* Sample prompt chips */}
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {[
                  "Find 30 pubs in Yorkshire that serve cask ale",
                  "Deep research on the micropub market in Manchester",
                  "Find decision-makers at breweries in Wales",
                  "Draft an intro email for a new pub contact",
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                    className="px-3 py-2 text-sm rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages
              .filter((message, _idx, arr) => {
                if ("type" in message && message.type === "system") {
                  return true;
                }
                const chatMessage = message as Message;
                if (chatMessage.hidden) return false;
                if ((chatMessage as any).deliverySummary) return true;
                if (chatMessage.content.trim().length === 0) return false;
                const content = chatMessage.content.trim();
                if (chatMessage.role === 'assistant') {
                  if (content === 'Run complete. Results are available.') return false;
                  if (content.startsWith('Task delegated to Supervisor')) return false;
                }
                return true;
              })
              .map((message) => {
              if ("type" in message && message.type === "system") {
                // Check if this is a deep research confirmation message
                try {
                  const parsed = JSON.parse(message.content);
                  if (parsed.type === "deep_research_confirm") {
                    return (
                      <div
                        key={message.id}
                        className="flex justify-center gap-2"
                        data-testid={`message-system-${message.id}`}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            startDeepResearch(parsed.data);
                            // Remove this confirmation message
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                          }}
                          data-testid="button-start-research"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Start Deep Research
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-gradient-to-r from-primary to-chart-2 hover:from-primary/90 hover:to-chart-2/90"
                          onClick={async () => {
                            // Start Very Deep Program (multi-iteration)
                            try {
                              await apiRequest("POST", "/api/very-deep-program", {
                                ...parsed.data,
                                conversationId,
                                userId: user.id
                              });
                              
                              // Remove confirmation message and show notification
                              setMessages((prev) => prev.filter((m) => m.id !== message.id));
                              
                              toast({
                                title: "Very Deep Dive Started",
                                description: "Running 3 sequential research passes. This will take several minutes...",
                              });
                            } catch (error) {
                              const message = handleApiError(error, "start Very Deep Dive");
                              toast({
                                title: "Error",
                                description: message,
                                variant: "destructive",
                              });
                            }
                          }}
                          data-testid="button-very-deep-dive"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Very Deep Dive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Remove this confirmation message
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                          }}
                          data-testid="button-cancel-research"
                        >
                          Cancel
                        </Button>
                      </div>
                    );
                  }
                } catch (e) {
                  // Not a JSON message, fall through to regular display
                }

                // Check if this is an email draft message
                if (message.content.startsWith('✉️ Email draft:')) {
                  const emailContent = message.content.replace('✉️ Email draft:\n\n', '').trim();
                  return (
                    <div
                      key={message.id}
                      className="flex flex-col gap-3 w-full max-w-3xl mx-auto"
                      data-testid={`message-system-${message.id}`}
                    >
                      <div className="flex justify-center">
                        <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                          ✉️ Email Draft Ready
                        </div>
                      </div>

                      {/* Email Draft Card */}
                      <div className="bg-card border border-card-border rounded-lg p-4">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed mb-4">
                          {emailContent}
                        </div>
                        <div className="flex gap-2 justify-end border-t border-border pt-3">
                          <CopyButton
                            text={emailContent}
                            label="Copy Email"
                            variant="default"
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Check if this system message has search results to display
                if (message.searchResults && Array.isArray(message.searchResults)) {
                  const totalResults = message.searchResults.length;
                  const previewResults = message.searchResults.slice(0, 5);
                  const hasMore = totalResults > 5;

                  return (
                    <div
                      key={message.id}
                      className="flex flex-col gap-3 w-full max-w-3xl mx-auto"
                      data-testid={`message-system-${message.id}`}
                    >
                      <div className="flex justify-center">
                        <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                          {message.content}
                        </div>
                      </div>

                      {/* Search Results Preview Card */}
                      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                        <div className="p-4">
                          <div className="space-y-3">
                            {previewResults.map((place: any, index: number) => (
                              <div
                                key={place.place_id || index}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border hover-elevate cursor-pointer"
                                data-testid={`search-result-${index}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm mb-1">{place.name}</div>
                                  <div className="text-xs text-muted-foreground space-y-0.5">
                                    {place.address && (
                                      <div className="flex items-start gap-1">
                                        <span>📍</span>
                                        <span>{place.address}</span>
                                      </div>
                                    )}
                                    {place.phone && (
                                      <div className="flex items-center gap-1">
                                        <span>📞</span>
                                        <span>{place.phone}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {place.rating && (
                                  <div className="flex-shrink-0">
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-50 dark:bg-yellow-950/30">
                                      <span className="text-yellow-600 dark:text-yellow-400">⭐</span>
                                      <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
                                        {place.rating}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="border-t border-border bg-muted/30 px-4 py-3 flex gap-2 justify-between flex-wrap">
                          <div className="flex gap-2">
                            {hasMore && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  // TODO: Open side panel or full results view
                                  toast({
                                    title: "View All Results",
                                    description: `Showing all ${totalResults} results (coming soon)`,
                                  });
                                }}
                              >
                                View All {totalResults} Results →
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Convert results to CSV
                                const csv = [
                                  ['Name', 'Address', 'Phone', 'Rating'].join(','),
                                  ...(message.searchResults || []).map((p: any) =>
                                    [p.name, p.address || '', p.phone || '', p.rating || ''].join(',')
                                  )
                                ].join('\n');

                                const blob = new Blob([csv], { type: 'text/csv' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `search-results-${Date.now()}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);

                                toast({
                                  title: "Exported",
                                  description: `Downloaded ${totalResults} results as CSV`,
                                });
                              }}
                            >
                              📥 Export CSV
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div
                    key={message.id}
                    className="flex justify-center"
                    data-testid={`message-system-${message.id}`}
                  >
                    <div className="bg-chart-2/20 text-chart-2 px-4 py-2 rounded-lg text-sm font-medium">
                      {message.content}
                    </div>
                  </div>
                );
              }

              const chatMessage = message as Message;
              const isUser = chatMessage.role === "user";
              const isSupervisor = chatMessage.source === 'supervisor';

              if (chatMessage.deliverySummary) {
                return (
                  <div
                    key={chatMessage.id}
                    className="flex gap-3 flex-row"
                    data-testid={`message-delivery-${chatMessage.id}`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col items-start max-w-3xl lg:max-w-none w-full">
                      <div className="rounded-lg px-4 py-4 bg-card border border-card-border w-full">
                        <RunResultBubble
                          deliverySummary={chatMessage.deliverySummary}
                          verificationSummary={chatMessage.verificationSummary}
                          constraintsExtracted={chatMessage.constraintsExtracted}
                          leadVerifications={chatMessage.leadVerifications}
                          runId={chatMessage.runId}
                          policySnapshot={chatMessage.policySnapshot}
                          provisional={chatMessage.provisional}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {chatMessage.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              }

              // Check if this is a monitor creation notification
              if (!isUser && chatMessage.content.startsWith('🔔 MONITOR_CREATED')) {
                const lines = chatMessage.content.split('\n');
                const monitorData: Record<string, string> = {};
                lines.forEach(line => {
                  const [key, ...valueParts] = line.split(': ');
                  if (valueParts.length > 0) {
                    monitorData[key] = valueParts.join(': ');
                  }
                });

                return (
                  <div
                    key={chatMessage.id}
                    className="flex gap-3 flex-row"
                    data-testid={`message-monitor-${chatMessage.id}`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                      <div className="bg-chart-2/20 border border-chart-2/30 rounded-lg px-4 py-3 w-full">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 className="w-5 h-5 text-chart-2" />
                          <span className="font-semibold text-chart-2">Monitor Created Successfully</span>
                        </div>
                        <div className="space-y-2 text-sm mb-4">
                          <div>
                            <span className="font-medium">Name:</span> {monitorData['LABEL']}
                          </div>
                          <div>
                            <span className="font-medium">Description:</span> {monitorData['DESCRIPTION']}
                          </div>
                          <div>
                            <span className="font-medium">Schedule:</span> {monitorData['SCHEDULE']}
                          </div>
                          <div>
                            <span className="font-medium">Type:</span> {monitorData['TYPE']}
                          </div>
                          <div>
                            <span className="font-medium">Next Run:</span> {monitorData['NEXT_RUN']}
                          </div>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            // Navigate to monitors section - you may need to implement this navigation
                            window.location.hash = '#monitors';
                          }}
                        >
                          Go to Monitors →
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {chatMessage.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={chatMessage.id}
                  className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  data-testid={`message-${chatMessage.role}-${chatMessage.id}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isUser ? "bg-primary" : isSupervisor ? "bg-gradient-to-br from-blue-500 to-blue-600" : "overflow-hidden"
                    }`}
                  >
                    {isUser ? (
                      <User className="w-4 h-4 text-primary-foreground" />
                    ) : isSupervisor ? (
                      <Building2 className="w-4 h-4 text-white" />
                    ) : (
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-3xl lg:max-w-none`}>
                    {isSupervisor && (
                      <div className="mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                          <Building2 className="w-3 h-3" />
                          Supervisor
                        </span>
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : isSupervisor
                          ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800"
                          : "bg-card border border-card-border"
                      }`}
                    >
                      {!isUser && (chatMessage.content.includes('# 📊') || chatMessage.content.includes('[') && chatMessage.content.includes('](')) ? (
                        <div className="text-[15px] leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a {...props} className="text-primary hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer" />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul {...props} className="list-disc list-inside my-2 space-y-1" />
                              ),
                              ol: ({ node, ...props }) => (
                                <ol {...props} className="list-decimal list-inside my-2 space-y-1" />
                              ),
                              h1: ({ node, ...props }) => (
                                <h1 {...props} className="text-xl font-bold mt-4 mb-2" />
                              ),
                              h2: ({ node, ...props }) => (
                                <h2 {...props} className="text-lg font-semibold mt-3 mb-2" />
                              ),
                              h3: ({ node, ...props }) => (
                                <h3 {...props} className="text-base font-semibold mt-2 mb-1" />
                              ),
                              p: ({ node, ...props }) => (
                                <p {...props} className="my-2" />
                              ),
                              table: ({ node, ...props }) => (
                                <div className="overflow-x-auto my-2">
                                  <table {...props} className="border-collapse border border-border w-full" />
                                </div>
                              ),
                              th: ({ node, ...props }) => (
                                <th {...props} className="border border-border px-2 py-1 bg-muted font-semibold text-left" />
                              ),
                              td: ({ node, ...props }) => (
                                <td {...props} className="border border-border px-2 py-1" />
                              ),
                            }}
                          >
                            {chatMessage.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{chatMessage.content}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground mt-1">
                      {chatMessage.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* Progress Stack - shows only user-facing status updates during request */}
          {(() => {
            const HIDDEN_STAGES = new Set(['ack', 'classifying', 'planning', 'completed']);
            const visibleEvents = progressStack.filter(e => !HIDDEN_STAGES.has(e.stage));
            if (visibleEvents.length === 0) return null;
            return (
              <div className="flex gap-3 flex-row mb-2" data-testid="progress-stack">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                </div>
                <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                  <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
                    <div className="space-y-1">
                      {visibleEvents.map((event, idx) => {
                        const display = getStageDisplay(event.stage, event.toolName);
                        const isLast = idx === visibleEvents.length - 1;
                        const isTerminal = event.stage === 'completed' || event.stage === 'failed';
                        return (
                          <div 
                            key={`${event.stage}-${idx}`} 
                            className={`flex items-center gap-2 text-sm ${isLast && !isTerminal ? 'text-foreground' : 'text-muted-foreground'}`}
                          >
                            <span>{display.icon}</span>
                            <span>{display.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Supervisor thinking indicator */}
          {isWaitingForSupervisor && (
            <div className="flex gap-3 flex-row" data-testid="supervisor-loading">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && (
            <div className="flex gap-3 flex-row" data-testid="thinking-indicator">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="rounded-lg px-4 py-3 bg-card border border-card-border">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div className="border-t border-dashed border-yellow-500/40 bg-yellow-50/5">
          <button
            onClick={() => setShowDebugPanel(p => !p)}
            className="w-full text-left px-4 py-1 text-[10px] font-mono text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10"
          >
            {showDebugPanel ? '▼' : '▶'} Debug: {messages.length} messages | {messages.filter(m => 'deliverySummary' in m && (m as Message).deliverySummary).length} result bubbles | convId: {conversationId?.slice(0, 8) || 'none'}
          </button>
          {showDebugPanel && (
            <div className="px-4 pb-2 text-[10px] font-mono text-yellow-600/80 dark:text-yellow-400/80 max-h-48 overflow-y-auto space-y-0.5">
              {messages.length === 0 && <div>No messages loaded</div>}
              {messages.slice(-10).map((msg, i) => {
                const m = msg as Message;
                const hasDS = !!m.deliverySummary;
                const hasMeta = hasDS ? 'structured_result' : (m as any).type === 'system' ? 'system' : 'text';
                const status = hasDS ? `DS:${(m.deliverySummary as any)?.status || '?'}` : '';
                const runRef = m.runId ? `run:${m.runId.slice(0, 8)}` : '';
                const dbFlag = m.id?.startsWith('ds-') ? '💾persisted' : '';
                return (
                  <div key={m.id || i} className={`${hasDS ? 'text-green-500' : ''}`}>
                    [{messages.length - 10 + i < 0 ? '' : ''}{m.role || (msg as SystemMessage).type}] id={m.id?.slice(0, 12)}.. type={hasMeta} {status} {runRef} {dbFlag}
                  </div>
                );
              })}
              {(() => {
                const latestResultMsg = [...messages].reverse().find(m => (m as Message).id?.startsWith('ds-') || (m as Message).deliverySummary);
                const hasDS = latestResultMsg ? !!(latestResultMsg as Message).deliverySummary : false;
                return (
                  <div className={`font-bold ${hasDS ? 'text-green-500' : 'text-red-400'}`}>
                    Latest result message has deliverySummary in metadata: {hasDS ? 'YES' : 'NO'}
                    {latestResultMsg ? ` (id: ${(latestResultMsg as Message).id?.slice(0, 16)})` : ' (no result messages found)'}
                  </div>
                );
              })()}
              <div className="mt-1 border-t border-yellow-500/20 pt-1">
                deliverySummaryRunIds: [{Array.from(deliverySummaryRunIdsRef.current).map(id => id.slice(0, 8)).join(', ')}]
                {' | '}waiting={String(isWaitingForSupervisor)}
                {' | '}inFlight={inFlightSupervisorRunsRef.current.size}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border bg-background py-6">
        <div className="w-full relative px-6">
          {/* Action bar (MEGA toggle removed) */}
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {lastLane && window.WYSHBONE_DEV_LANE && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold select-none ${
                    lastLane === "run"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200"
                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                  }`}
                  title={lastLane === "run" ? "Last message used Supervisor (RUN lane)" : "Last message used direct GPT streaming (CHAT lane)"}
                  data-testid="lane-indicator"
                >
                  {lastLane === "run" ? "RUN (Supervisor)" : "CHAT (Direct)"}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWhatJustHappenedOpen(true)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                data-testid="button-what-just-happened"
                title="View recent Wyshbone activity"
              >
                <Activity className="h-3 w-3" />
                <span className="hidden sm:inline">Activity log</span>
              </Button>
              
              {!showFunctionsPanel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFunctionsPanel(true)}
                  className="flex items-center gap-1"
                  data-testid="button-show-functions"
                  title="Show quick action buttons"
                >
                  <HelpCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Quick actions</span>
                </Button>
              )}
            </div>
          </div>

          {/* Location Suggestions */}
          {showLocationSuggestions && (
            <LocationSuggestions
              inputValue={input}
              onSelectLocation={handleSelectLocation}
              isVisible={showLocationSuggestions}
              inputRef={textareaRef}
              defaultCountry={defaultCountry}
            />
          )}
          
          {/* Queued Message Indicator */}
          {queuedMessage && (
            <div className="mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                📋 Queued: "{queuedMessage.slice(0, 40)}{queuedMessage.length > 40 ? '...' : ''}"
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQueuedMessage(null)}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Clear
              </Button>
            </div>
          )}
          
          <div className="bg-card border border-card-border rounded-xl p-2 flex items-end gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Tell Wyshbone what you need — find leads, research a market, draft an email..."
              className="resize-none border-0 bg-transparent text-[15px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 min-h-[48px] max-h-[200px]"
              rows={1}
              data-testid="input-message"
            />
            
            {/* Show Queue/Cancel buttons when run is active */}
            {isRunActive && (
              <>
                {input.trim() && !queuedMessage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleQueue}
                    className="flex-shrink-0"
                    data-testid="button-queue"
                  >
                    Queue
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  className="flex-shrink-0"
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </>
            )}
            
            {/* Show Send button when no run is active */}
            {!isRunActive && (
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                size="icon"
                className="flex-shrink-0 p-0 overflow-hidden"
                data-testid="button-send"
              >
                <img src={wyshboneLogo} alt="Send" className="w-full h-full object-cover" />
              </Button>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Right Sidebar - Functions Panel */}
      <WishboneSidebar 
        onPrompt={handleSend}
        isVisible={showFunctionsPanel}
        onHide={() => setShowFunctionsPanel(false)}
      />
      
      {/* Add to Xero features temporarily removed for layout debugging */}
      
      {/* UI-18: What just happened? Tower log viewer */}
      <WhatJustHappenedPanel
        isOpen={isWhatJustHappenedOpen}
        onClose={() => setWhatJustHappenedOpen(false)}
        conversationId={conversationId}
      />
    </div>
  );
}
