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
import { Send, User, CheckCircle2, Search, Building2, HelpCircle, Activity, Loader2, ChevronDown, ChevronUp, MapPin, Target, Lightbulb, Gauge, MessageSquare } from "lucide-react";
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
import { getCurrentVerticalId, AVAILABLE_VERTICALS } from "@/contexts/VerticalContext";
import { detectVerticalMismatch, getVerticalLabel } from "@/lib/verticalMismatch";
import type { VerticalId } from "@/lib/verticals/types";
import { WhatJustHappenedPanel } from "@/components/tower/WhatJustHappenedPanel";
import { resolveAuthoritativeTowerVerdict, isTowerTrustFailure, type ResolvedTowerVerdict } from "@/utils/towerVerdictResolver";
import { useResultsPanel } from "@/contexts/ResultsPanelContext";
import { useCurrentRequest } from "@/contexts/CurrentRequestContext";
import UserResultsView from "@/components/results/UserResultsView";
import type { DeliverySummary, DeliveryLead } from "@/components/results/UserResultsView";
import type { VerificationSummaryPayload, ConstraintsExtractedPayload, LeadVerificationEntry, SemanticJudgementEntry } from "@/components/results/CvlArtefactViews";
import RunResultBubble from "@/components/results/RunResultBubble";
import type { PolicySnapshot, ContactCounts, RunReceipt } from "@/components/results/RunResultBubble";
import { BehaviourInspectContent } from "@/pages/dev/qa-progress";
import { resolveCanonicalStatus, STATUS_CONFIG } from "@/utils/deliveryStatus";
import { getGoogleQueryMode } from "@/components/GoogleQueryModeToggle";
import { PreRunBanner } from "@/components/results/PreRunBanner";
import { RunConfigOverridesPanel, type RunConfigOverrides } from "@/components/results/RunConfigOverridesPanel";
import type { PolicyApplied, LearningUpdate } from "@/utils/policyFormatters";
import { parsePolicyApplied, parseLearningUpdate, parseSearchQueryCompiled, buildCleanConfidenceText } from "@/utils/policyFormatters";
import type { SearchQueryCompiled } from "@/utils/policyFormatters";

interface IntentNarrativePayload {
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

type Message = ChatMessage & {
  id: string;
  timestamp: Date;
  source?: 'user' | 'assistant' | 'supervisor';
  deliverySummary?: DeliverySummary | null;
  verificationSummary?: VerificationSummaryPayload | null;
  constraintsExtracted?: ConstraintsExtractedPayload | null;
  leadVerifications?: LeadVerificationEntry[] | null;
  policySnapshot?: PolicySnapshot | null;
  policyApplied?: PolicyApplied | null;
  learningUpdate?: LearningUpdate | null;
  searchQueryCompiled?: SearchQueryCompiled | null;
  runId?: string | null;
  hidden?: boolean;
  provisional?: boolean;
  isConfidence?: boolean;
  isIntentNarrative?: boolean;
  intentNarrativePayload?: IntentNarrativePayload | null;
  towerVerdict?: string | null;
  towerLabel?: string | null;
  towerProxyUsed?: string | null;
  towerStopTimePredicate?: boolean;
  contactCounts?: ContactCounts | null;
  runReceipt?: RunReceipt | null;
  semanticJudgements?: SemanticJudgementEntry[] | null;
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

function RunDiagnosticPanel({
  conversationId,
  messages,
  isWaitingForSupervisor,
  inFlightSupervisorRunsRef,
  deliverySummaryRunIdsRef,
  supervisorRunIdRef,
  supervisorClientRequestIdRef,
  showDebugPanel,
  setShowDebugPanel,
  lastSentQueryRef,
  lastRunFinalVerdictRef,
}: {
  conversationId: string | undefined;
  messages: DisplayMessage[];
  isWaitingForSupervisor: boolean;
  inFlightSupervisorRunsRef: React.MutableRefObject<Map<string, { runId: string | null; crid: string }>>;
  deliverySummaryRunIdsRef: React.MutableRefObject<Set<string>>;
  supervisorRunIdRef: React.MutableRefObject<string | null>;
  supervisorClientRequestIdRef: React.MutableRefObject<string | null>;
  showDebugPanel: boolean;
  setShowDebugPanel: (fn: (p: boolean) => boolean) => void;
  lastSentQueryRef: React.MutableRefObject<string | null>;
  lastRunFinalVerdictRef: React.MutableRefObject<string | null>;
}) {
  const [diagData, setDiagData] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const prevWaitingRef = useRef(isWaitingForSupervisor);

  const fetchDiag = async (reason?: string) => {
    setDiagLoading(true);
    setDiagError(null);
    try {
      const params = new URLSearchParams();
      if (conversationId) params.set('conversation_id', conversationId);
      const url = addDevAuthParams(buildApiUrl(`/api/afr/run-diagnostic?${params.toString()}`));
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiagData(data);
      if (reason) {
        console.log(`[DIAGNOSTIC] Auto-fetched (${reason}):`, JSON.stringify(data, null, 2));
      }
    } catch (e: any) {
      setDiagError(e.message);
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    if (prevWaitingRef.current && !isWaitingForSupervisor) {
      setTimeout(() => {
        const resultBubbles = messages.filter(m => 'deliverySummary' in m && (m as any).deliverySummary).length;
        console.log(`[DIAGNOSTIC] Run completed. resultBubbles=${resultBubbles}, msgs=${messages.length}, convId=${conversationId}`);
        console.log(`[DIAGNOSTIC] Client state: supervisorRunIdRef=${supervisorRunIdRef.current}, crid=${supervisorClientRequestIdRef.current}, deliverySummaryRunIds=[${Array.from(deliverySummaryRunIdsRef.current).join(',')}], inFlight=${inFlightSupervisorRunsRef.current.size}`);
        fetchDiag('run-completed');
      }, 2000);
    }
    prevWaitingRef.current = isWaitingForSupervisor;
  }, [isWaitingForSupervisor]);

  const resultBubbleCount = messages.filter(m => 'deliverySummary' in m && (m as any).deliverySummary).length;
  const inFlightEntries = Array.from(inFlightSupervisorRunsRef.current.entries());

  return (
    <div className="border-t-2 border-dashed border-red-500/60 bg-red-50/10">
      <button
        onClick={() => setShowDebugPanel((p: boolean) => !p)}
        className="w-full text-left px-4 py-1.5 text-[11px] font-mono text-red-600 dark:text-red-400 hover:bg-red-500/10 font-bold"
      >
        {showDebugPanel ? '▼' : '▶'} DIAGNOSTIC PANEL | convId={conversationId?.slice(0, 12) || 'none'} | msgs={messages.length} | resultBubbles={resultBubbleCount} | waiting={String(isWaitingForSupervisor)} | inFlight={inFlightSupervisorRunsRef.current.size} | google_query_mode={getGoogleQueryMode()}
      </button>
      {showDebugPanel && (
        <div className="px-4 pb-3 text-[10px] font-mono text-red-600/90 dark:text-red-400/90 max-h-[400px] overflow-y-auto space-y-1">
          <div className="border-b border-red-500/20 pb-1 mb-1">
            <b>CLIENT STATE:</b><br/>
            supervisorRunIdRef: {supervisorRunIdRef.current || 'null'}<br/>
            supervisorClientRequestIdRef: {supervisorClientRequestIdRef.current || 'null'}<br/>
            deliverySummaryRunIds: [{Array.from(deliverySummaryRunIdsRef.current).join(', ')}]<br/>
            inFlightRuns: {inFlightEntries.length === 0 ? 'none' : inFlightEntries.map(([k, v]) => `[crid=${k.slice(0, 12)} runId=${v.runId?.slice(0, 12) || 'null'}]`).join(' ')}<br/>
            lastSentQuery: {lastSentQueryRef.current ? lastSentQueryRef.current.slice(0, 60) + (lastSentQueryRef.current.length > 60 ? '...' : '') : 'null'}<br/>
            lastRunFinalVerdict: {lastRunFinalVerdictRef.current || 'UNKNOWN'}
          </div>

          <div className="border-b border-red-500/20 pb-1 mb-1">
            <b>MESSAGES (last 8):</b><br/>
            {messages.slice(-8).map((msg, i) => {
              const m = msg as any;
              const hasDS = !!m.deliverySummary;
              const dsStatus = hasDS ? m.deliverySummary?.status : null;
              const dsLeadCount = hasDS ? (m.deliverySummary?.delivered_exact?.length || 0) + (m.deliverySummary?.delivered_closest?.length || 0) : 0;
              return (
                <div key={m.id || i} className={hasDS ? 'text-green-500 font-bold' : ''}>
                  [{m.role || m.type}] id={m.id?.slice(0, 16) || '?'} {hasDS ? `DS:${dsStatus} leads=${dsLeadCount}` : m.content?.slice(0, 40)} {m.id?.startsWith('ds-') ? 'PERSISTED' : ''} {m.provisional ? 'PROVISIONAL' : ''}
                </div>
              );
            })}
          </div>

          <div className="border-b border-red-500/20 pb-1 mb-1">
            <b>DB DIAGNOSTIC:</b>{' '}
            <button onClick={fetchDiag} className="underline text-blue-500 hover:text-blue-300" disabled={diagLoading}>
              {diagLoading ? 'Loading...' : 'Fetch from DB'}
            </button>
            {diagError && <span className="text-red-500 ml-2">Error: {diagError}</span>}
          </div>

          {diagData && diagData.diagnostics?.map((d: any, i: number) => (
            <div key={i} className={`border border-red-500/30 rounded p-2 mb-1 ${d.has_delivery_summary_artefact && d.result_message_persisted ? 'bg-green-900/20' : 'bg-red-900/20'}`}>
              <div><b>RUN {i + 1}:</b> {d.run_id}</div>
              <div>conversation_id: {d.conversation_id || 'NULL'}</div>
              <div>client_request_id: {d.client_request_id}</div>
              <div>supervisor_run_id: {d.supervisor_run_id || 'NULL'}</div>
              <div>status: {d.status} | terminal_state: {d.terminal_state || 'null'} | ui_ready: {String(d.ui_ready)}</div>
              <div>created: {d.created_at} | updated: {d.updated_at}</div>
              <div>artefacts: {d.total_artefacts} total | has delivery_summary: <b className={d.has_delivery_summary_artefact ? 'text-green-400' : 'text-red-400'}>{String(d.has_delivery_summary_artefact)}</b></div>
              <div>types: {d.artefact_types?.map((a: any) => `${a.type}(${a.count})`).join(', ') || 'none'}</div>
              <div>result msg persisted: <b className={d.result_message_persisted ? 'text-green-400' : 'text-red-400'}>{String(d.result_message_persisted)}</b> {d.result_message_id ? `id=${d.result_message_id}` : ''}</div>
              <div className={`font-bold mt-1 ${d.has_delivery_summary_artefact && d.result_message_persisted ? 'text-green-400' : 'text-red-400'}`}>
                VERDICT: {
                  !d.conversation_id ? 'A) CONV_ID NULL - run/conversation linkage bug' :
                  d.total_artefacts === 0 ? 'B) NO ARTEFACTS - supervisor produced nothing' :
                  d.has_delivery_summary_artefact && !d.result_message_persisted ? 'C) ARTEFACTS EXIST BUT NO UI MESSAGE - fetch/render/polling bug' :
                  d.has_delivery_summary_artefact && d.result_message_persisted ? 'OK - artefacts + message both exist' :
                  !d.has_delivery_summary_artefact && d.total_artefacts > 0 ? 'C) ARTEFACTS EXIST BUT NO delivery_summary - supervisor incomplete' :
                  'UNKNOWN'
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPage({ defaultCountry = 'GB', onInjectSystemMessage, addRun, updateRun, getActiveRunId, onNewChat, onLoadConversation }: ChatPageProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const { trigger: triggerSidebarFlash } = useSidebarFlash();
  const { goal, hasGoal, isLoading: isLoadingGoal, error: goalError } = useUserGoal();
  const { openResults } = useResultsPanel();
  const { setCurrentClientRequestId, setPinnedClientRequestId, setLastCompletedClientRequestId, addRecentRun, userPinned, clearRecentRuns } = useCurrentRequest();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inFlightBlockMessage, setInFlightBlockMessage] = useState<string | null>(null);
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
  const intentNarrativeSeenRef = useRef<Set<string>>(new Set());
  const [collapsedIntentNarrativeIds, setCollapsedIntentNarrativeIds] = useState<Set<string>>(new Set());

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

  const [runConfigOverrides, setRunConfigOverrides] = useState<RunConfigOverrides>({
    speed_mode: "balanced",
    replan_ceiling: undefined,
    ignore_learned_policy: false,
  });
  const [preRunPolicySnapshot, setPreRunPolicySnapshot] = useState<PolicySnapshot | null>(null);
  const [preRunPolicyApplied, setPreRunPolicyApplied] = useState<PolicyApplied | null>(null);
  const [showPreRunBanner, setShowPreRunBanner] = useState(false);

  const lastSentQueryRef = useRef<string | null>(null);
  const handleNewChatRef = useRef<(() => void) | null>(null);
  const skipMismatchOnceRef = useRef(false);
  const lastRunFinalVerdictRef = useRef<string | null>(null);

  const [concatenationError, setConcatenationError] = useState<string | null>(null);

  interface VerticalMismatchPrompt {
    query: string;
    currentVertical: VerticalId;
    matchedTerms: string[];
  }
  const [verticalMismatchPrompt, setVerticalMismatchPrompt] = useState<VerticalMismatchPrompt | null>(null);

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
      lastSentQueryRef.current = null;
      setConcatenationError(null);

      console.log('✅ Demo mode clean slate applied - fresh "first time" experience ready');
    }
  }, [user.id, user.email, queryClient]);

  function resolveAuthoritativeTower(rows: any[]): ResolvedTowerVerdict {
    return resolveAuthoritativeTowerVerdict(rows);
  }

  const EMAIL_RE = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;

  function extractValidEmail(raw: string): string | null {
    const trimmed = (raw || '').trim();
    if (!trimmed || trimmed.includes(' ') || trimmed.length > 254) return null;
    const match = trimmed.match(EMAIL_RE);
    if (!match) return null;
    const email = match[0].toLowerCase();
    if ((email.match(/@/g) || []).length !== 1) return null;
    return email;
  }

  function extractValidPhone(raw: string): string | null {
    const stripped = (raw || '').replace(/[\s\-()]/g, '');
    if (!stripped) return null;
    const digitsOnly = stripped.replace(/[^\d]/g, '');
    if (digitsOnly.length < 8) return null;
    return stripped.startsWith('+') ? '+' + digitsOnly : digitsOnly;
  }

  function makeLeadKey(lead: { name?: string; address?: string; entity_id?: string; place_id?: string }): string {
    const id = lead.entity_id || lead.place_id;
    if (id) return `id:${id}`;
    const name = (lead.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const addr = (lead.address || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    return `na:${name}|${addr}`;
  }

  function extractContactCounts(rows: any[], deliverySummary?: any): ContactCounts | null {
    const delivered = [
      ...(deliverySummary?.delivered_exact || []),
      ...(deliverySummary?.delivered_closest || []),
    ];
    const deliveredKeys = new Set(delivered.map((l: any) => makeLeadKey(l)));
    const deliveredNames = new Set(delivered.map((l: any) => (l.name || '').trim().toLowerCase()).filter(Boolean));

    let leadPackTotal = 0;
    let contactExtractTotal = 0;
    let leadPackMatched = 0;
    let contactExtractMatched = 0;

    const emails = new Set<string>();
    const phones = new Set<string>();
    let leadsWithEmail = 0;
    let leadsWithPhone = 0;
    const usedArtefactIds: string[] = [];
    const emailList: string[] = [];
    const phoneList: string[] = [];
    let usedLeadPack = false;
    let usedContactExtract = false;

    for (const row of rows) {
      let p = row.payload_json;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch { continue; } }
      if (!p || typeof p !== 'object') continue;

      if (row.type === 'lead_pack') {
        leadPackTotal++;
        const pack = p?.outputs?.lead_pack;
        if (!pack || typeof pack !== 'object') continue;

        const identity = pack.identity;
        const placeId = identity?.place_id;
        const packName = (identity?.name || p?.inputs?.entity_name || '').trim().toLowerCase();

        let isDelivered = false;
        if (placeId && deliveredKeys.has(`id:${placeId}`)) {
          isDelivered = true;
        } else if (packName && deliveredNames.has(packName)) {
          isDelivered = true;
        }
        if (!isDelivered) continue;

        leadPackMatched++;
        usedLeadPack = true;
        if (row.id) usedArtefactIds.push(row.id);

        let hasEmail = false;
        let hasPhone = false;

        const contactBlock = pack.contacts;
        if (contactBlock && typeof contactBlock === 'object') {
          if (Array.isArray(contactBlock.emails)) {
            for (const entry of contactBlock.emails) {
              const raw = typeof entry === 'object' && entry !== null ? entry.value : typeof entry === 'string' ? entry : null;
              if (!raw) continue;
              const valid = extractValidEmail(raw);
              if (valid && !emails.has(valid)) {
                emails.add(valid);
                emailList.push(valid);
                hasEmail = true;
              }
            }
          }
          if (Array.isArray(contactBlock.phones)) {
            for (const entry of contactBlock.phones) {
              const raw = typeof entry === 'object' && entry !== null ? entry.value : typeof entry === 'string' ? entry : null;
              if (!raw) continue;
              const valid = extractValidPhone(raw);
              if (valid && !phones.has(valid)) {
                phones.add(valid);
                phoneList.push(valid);
                hasPhone = true;
              }
            }
          }
        }

        if (hasEmail) leadsWithEmail++;
        if (hasPhone) leadsWithPhone++;
      }

      if (row.type === 'contact_extract') {
        contactExtractTotal++;
        const entityName = (p?.inputs?.entity_name || '').trim().toLowerCase();
        if (!entityName || !deliveredNames.has(entityName)) continue;

        const contactBlock = p?.outputs?.contacts;
        if (!contactBlock || typeof contactBlock !== 'object') continue;

        contactExtractMatched++;
        usedContactExtract = true;
        if (row.id) usedArtefactIds.push(row.id);

        if (Array.isArray(contactBlock.emails)) {
          for (const raw of contactBlock.emails) {
            if (typeof raw !== 'string') continue;
            const valid = extractValidEmail(raw);
            if (valid && !emails.has(valid)) {
              emails.add(valid);
              emailList.push(valid);
            }
          }
        }
        if (Array.isArray(contactBlock.phones)) {
          for (const raw of contactBlock.phones) {
            if (typeof raw !== 'string') continue;
            const valid = extractValidPhone(raw);
            if (valid && !phones.has(valid)) {
              phones.add(valid);
              phoneList.push(valid);
            }
          }
        }
      }
    }

    const debugInfo = {
      leadPackTotal,
      contactExtractTotal,
      leadPackMatched,
      contactExtractMatched,
      deliveredLeadCount: delivered.length,
      usedArtefactIds,
      mappingNote: (!usedLeadPack && !usedContactExtract && (leadPackTotal > 0 || contactExtractTotal > 0))
        ? `Counts unknown: could not map ${leadPackTotal} lead_pack + ${contactExtractTotal} contact_extract artefacts to ${delivered.length} delivered leads`
        : undefined,
    };

    if (usedLeadPack) {
      return { source: 'lead_pack', emailCount: emails.size, phoneCount: phones.size, leadsWithEmail, leadsWithPhone, emails: emailList, phones: phoneList, debugInfo };
    }

    if (usedContactExtract) {
      return { source: 'contact_extract', emailCount: emails.size, phoneCount: phones.size, leadsWithEmail: emails.size, leadsWithPhone: phones.size, emails: emailList, phones: phoneList, debugInfo };
    }

    if (leadPackTotal > 0 || contactExtractTotal > 0) {
      return { source: 'unknown', emailCount: 0, phoneCount: 0, leadsWithEmail: 0, leadsWithPhone: 0, emails: [], phones: [], debugInfo };
    }

    return null;
  }

  function parseSiblingArtefacts(rows: any[]): {
    vs: VerificationSummaryPayload | null;
    ce: ConstraintsExtractedPayload | null;
    policySnapshot: PolicySnapshot | null;
    policyApplied: PolicyApplied | null;
    learningUpdate: LearningUpdate | null;
    searchQueryCompiled: SearchQueryCompiled | null;
    leadVerifications: LeadVerificationEntry[] | null;
    runReceipt: RunReceipt | null;
    semanticJudgements: SemanticJudgementEntry[] | null;
  } {
    let vs: VerificationSummaryPayload | null = null;
    let ce: ConstraintsExtractedPayload | null = null;
    let policySnapshot: PolicySnapshot | null = null;
    let policyApplied: PolicyApplied | null = null;
    let learningUpdate: LearningUpdate | null = null;
    let searchQueryCompiled: SearchQueryCompiled | null = null;
    let fallbackRules: string[] | null = null;
    let leadVerifications: LeadVerificationEntry[] | null = null;
    let runReceipt: RunReceipt | null = null;
    const semanticJudgements: SemanticJudgementEntry[] = [];
    if (!Array.isArray(rows)) return { vs, ce, policySnapshot, policyApplied, learningUpdate, searchQueryCompiled, leadVerifications, runReceipt, semanticJudgements: null };
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
          if (Array.isArray(p)) {
            if (!leadVerifications) leadVerifications = [];
            for (const entry of p) {
              if (entry && typeof entry === 'object') {
                leadVerifications.push({
                  lead_id: (entry as any).lead_place_id || (entry as any).lead_id || (entry as any).place_id || '',
                  lead_place_id: (entry as any).lead_place_id || (entry as any).place_id,
                  lead_name: (entry as any).lead_name,
                  lead_index: (entry as any).lead_index,
                  verified_exact: (entry as any).verified_exact,
                  all_hard_satisfied: (entry as any).all_hard_satisfied,
                  location_confidence: (entry as any).location_confidence,
                  constraint_checks: Array.isArray((entry as any).constraint_checks) ? (entry as any).constraint_checks : undefined,
                });
              }
            }
          } else if (Array.isArray((p as any).leads)) {
            if (!leadVerifications) leadVerifications = [];
            for (const entry of (p as any).leads) {
              if (entry && typeof entry === 'object') {
                leadVerifications.push({
                  lead_id: (entry as any).lead_place_id || (entry as any).lead_id || (entry as any).place_id || '',
                  lead_place_id: (entry as any).lead_place_id || (entry as any).place_id,
                  lead_name: (entry as any).lead_name,
                  lead_index: (entry as any).lead_index,
                  verified_exact: (entry as any).verified_exact,
                  all_hard_satisfied: (entry as any).all_hard_satisfied,
                  location_confidence: (entry as any).location_confidence,
                  constraint_checks: Array.isArray((entry as any).constraint_checks) ? (entry as any).constraint_checks : undefined,
                });
              }
            }
          } else {
            if (!leadVerifications) leadVerifications = [];
            const placeId = (p as any).lead_place_id || (p as any).lead_id || (p as any).place_id || '';
            leadVerifications.push({
              lead_id: placeId,
              lead_place_id: (p as any).lead_place_id || (p as any).place_id,
              lead_name: (p as any).lead_name,
              lead_index: (p as any).lead_index,
              verified_exact: (p as any).verified_exact,
              all_hard_satisfied: (p as any).all_hard_satisfied,
              location_confidence: (p as any).location_confidence,
              constraint_checks: Array.isArray((p as any).constraint_checks) ? (p as any).constraint_checks : undefined,
            });
          }
        }
      }
      if (row.type === 'tower_semantic_judgement') {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') {
          const leadId = (p as any).lead_place_id || (p as any).lead_id || (p as any).place_id || (p as any).entity_id;
          const leadName = (p as any).lead_name || (p as any).name || (p as any).entity_name;
          const towerStatus = (p as any).tower_status || (p as any).status || '';
          const confidence = typeof (p as any).tower_confidence === 'number' ? (p as any).tower_confidence : (typeof (p as any).confidence === 'number' ? (p as any).confidence : 0);
          const matchedSnippets = Array.isArray((p as any).tower_matched_snippets) ? (p as any).tower_matched_snippets : undefined;
          if (leadId && towerStatus) {
            semanticJudgements.push({
              lead_id: leadId,
              lead_name: leadName || undefined,
              tower_status: towerStatus,
              confidence,
              source_url: (p as any).source_url || undefined,
              constraint_to_check: (p as any).constraint_to_check || undefined,
              matched_snippets: matchedSnippets,
            });
          }
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
      if (row.type === 'policy_applied' && !policyApplied) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        policyApplied = parsePolicyApplied(p);
      }
      if (row.type === 'learning_update' && !learningUpdate) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        learningUpdate = parseLearningUpdate(p);
      }
      if (row.type === 'search_query_compiled' && !searchQueryCompiled) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        searchQueryCompiled = parseSearchQueryCompiled(p);
      }
      if (row.type === 'plan_update' && !fallbackRules) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object' && Array.isArray((p as any).rules_applied)) {
          fallbackRules = (p as any).rules_applied;
        }
      }
      if (row.type === 'run_receipt' && !runReceipt) {
        let p = row.payload_json;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
        if (p && typeof p === 'object') {
          runReceipt = {
            unique_email_count: (p as any).unique_email_count ?? null,
            unique_phone_count: (p as any).unique_phone_count ?? null,
            contacts_proven: (p as any).contacts_proven ?? null,
            requested_count: (p as any).requested_count ?? null,
            delivered_count: (p as any).delivered_count ?? null,
            narrative_lines: Array.isArray((p as any).narrative_lines) ? (p as any).narrative_lines : null,
            outcomes: (p as any).outcomes && typeof (p as any).outcomes === 'object' ? (p as any).outcomes : null,
          };
        }
      }
    }
    if (runReceipt) {
      for (const row of rows) {
        if (row.type === 'tower_judgement') {
          let p = row.payload_json;
          if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
          if (p && typeof p === 'object' && (p as any).artefact_type === 'run_receipt') {
            runReceipt.tower_verdict = (p as any).verdict || (p as any).result || null;
          }
        }
      }
    }
    if (!policySnapshot && fallbackRules && fallbackRules.length > 0) {
      policySnapshot = {
        why_short: fallbackRules.slice(0, 3).join('\n'),
        applied_policies: fallbackRules.map(r => ({ rule_text: r, source: 'plan' })),
      };
    }
    return { vs, ce, policySnapshot, policyApplied, learningUpdate, searchQueryCompiled, leadVerifications, runReceipt, semanticJudgements: semanticJudgements.length > 0 ? semanticJudgements : null };
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

  function rewriteConfidenceMessages(sqc: SearchQueryCompiled) {
    const cleanText = buildCleanConfidenceText(sqc);
    setMessages(prev => prev.map(m => {
      if (!m.isConfidence) return m;
      if (m.content === cleanText) return m;
      return { ...m, content: cleanText };
    }));
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

    try {
      const params = new URLSearchParams();
      if (effectiveRunId) params.set('runId', effectiveRunId);
      if (effectiveCrid) params.set('client_request_id', effectiveCrid);
      const url = addDevAuthParams(buildApiUrl(`/api/afr/artefacts?${params.toString()}`));
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        console.warn(`[finalizeRunUI] Artefact fetch failed: ${res.status} (source=${source})`);
        return;
      }
      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      // ── intent_narrative injection (finalization path) ──────────────────────────
      // This runs every time finalizeRunUI is called so the card is guaranteed to
      // appear even if the polling-time check raced with the Supervisor writing it.
      const inRowFinal = rows.find((r: any) => r.type === 'intent_narrative');
      if (inRowFinal && !intentNarrativeSeenRef.current.has(effectiveKey)) {
        intentNarrativeSeenRef.current.add(effectiveKey);
        let inPayloadFinal: IntentNarrativePayload | null = inRowFinal.payload_json;
        if (typeof inPayloadFinal === 'string') {
          try { inPayloadFinal = JSON.parse(inPayloadFinal); } catch { inPayloadFinal = null; }
        }
        if (inPayloadFinal) {
          const inMsgId = `in-${effectiveKey}`;
          setMessages((prev) => {
            if (prev.some(m => m.id === inMsgId)) return prev;
            const dsIdx = prev.findIndex(m => m.id === `ds-${effectiveKey}`);
            const newMsg: Message = {
              id: inMsgId,
              role: 'assistant' as const,
              content: '',
              timestamp: new Date(),
              isIntentNarrative: true,
              intentNarrativePayload: inPayloadFinal,
            };
            if (dsIdx !== -1) {
              const next = [...prev];
              next.splice(dsIdx, 0, newMsg);
              return next;
            }
            return [...prev, newMsg];
          });
          console.log(`[Chat][finalizeRunUI] intent_narrative injected for run=${effectiveKey}, findability=${inPayloadFinal.findability} (source=${source})`);
        }
      }

      const artefactTypes = rows.map((r: any) => r.type);

      const dsRow = rows.find((r: any) => r.type === 'delivery_summary');

      if (!dsRow) {
        const hasMissionTerminal = artefactTypes.includes('run_summary') ||
          artefactTypes.includes('outcome_log') ||
          artefactTypes.includes('policy_application_snapshot') ||
          artefactTypes.includes('verification_summary') ||
          artefactTypes.includes('run_halted') ||
          artefactTypes.some((t: string) => t === 'tower_judgement');

        if (!hasMissionTerminal) {
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

        const { vs: provVs, ce: provCe, policySnapshot: provPs, policyApplied: provPa, learningUpdate: provLu, searchQueryCompiled: provSqc, leadVerifications: provLv, runReceipt: provRR, semanticJudgements: provSJ } = parseSiblingArtefacts(rows);
        const tower = resolveAuthoritativeTower(rows);
        const towerVerdict = tower.verdict;
        const towerLabel = tower.label;
        const towerProxyUsed = tower.proxyUsed;
        const towerStopTimePredicate = tower.stopTimePredicate;

        let synthesisedDs: DeliverySummary;
        const towerVerdictLower = (towerVerdict || '').toLowerCase();
        if (provisionalLeads.length > 0) {
          const verifiedLeads: DeliveryLead[] = [];
          const unverifiedLeads: DeliveryLead[] = [];

          const hasVerificationData = (provLv && provLv.length > 0) ||
            (provSJ && provSJ.length > 0) ||
            (provRR?.outcomes?.attributes && provRR.outcomes.attributes.length > 0);

          if (hasVerificationData) {
            const verifiedIds = new Set<string>();

            if (provLv) {
              for (const entry of provLv) {
                let isVerified = false;
                if (entry.verified_exact === true || entry.all_hard_satisfied === true) {
                  isVerified = true;
                } else if (Array.isArray(entry.constraint_checks) && entry.constraint_checks.length > 0) {
                  const hardChecks = entry.constraint_checks.filter((c: any) => c.hard === true);
                  if (hardChecks.length > 0) {
                    isVerified = hardChecks.every((c: any) => c.status === 'yes');
                  } else {
                    isVerified = entry.constraint_checks.every((c: any) => c.status === 'yes' || c.status === 'search_bounded');
                  }
                }
                if (isVerified) {
                  const id = entry.lead_place_id || entry.lead_id || '';
                  if (id) verifiedIds.add(id);
                  if (entry.lead_name) verifiedIds.add(entry.lead_name.toLowerCase().trim());
                }
              }
            }

            if (provSJ) {
              for (const sj of provSJ) {
                const status = sj.tower_status?.toLowerCase();
                const hasSnippets = Array.isArray(sj.matched_snippets) && sj.matched_snippets.length > 0;
                if (status === 'strong_match' || status === 'match' || (status !== 'no_evidence' && status !== 'stubbed' && status !== 'weak_match' && hasSnippets)) {
                  verifiedIds.add(sj.lead_id);
                  if (sj.lead_name) verifiedIds.add(sj.lead_name.toLowerCase().trim());
                }
              }
            }

            if (provRR?.outcomes?.attributes) {
              for (const ra of provRR.outcomes.attributes) {
                if (Array.isArray(ra.matched_place_ids)) {
                  for (const pid of ra.matched_place_ids) verifiedIds.add(pid);
                }
              }
            }

            for (const lead of provisionalLeads) {
              const placeId = (lead as any).place_id || (lead as any).placeId || '';
              const name = lead.name?.toLowerCase().trim() || '';
              if ((placeId && verifiedIds.has(placeId)) || (name && verifiedIds.has(name))) {
                verifiedLeads.push(lead);
              } else {
                unverifiedLeads.push(lead);
              }
            }
          } else {
            unverifiedLeads.push(...provisionalLeads);
          }

          const hasVerified = verifiedLeads.length > 0;
          synthesisedDs = {
            status: hasVerified ? (unverifiedLeads.length > 0 ? 'PARTIAL' : 'PASS') : 'STOP',
            delivered_exact: verifiedLeads,
            delivered_closest: unverifiedLeads,
            delivered_count: verifiedLeads.length,
            verified_exact_count: verifiedLeads.length,
            stop_reason: hasVerified ? undefined : 'no_delivery_summary',
          };
        } else {
          const stopStatus = towerVerdictLower === 'stop' ? 'STOP' : (artefactTypes.includes('run_halted') ? 'STOP' : 'FAIL');
          synthesisedDs = {
            status: stopStatus,
            delivered_exact: [],
            delivered_closest: [],
            delivered_count: 0,
            stop_reason: towerVerdictLower === 'stop' ? 'tower_stopped' : (artefactTypes.includes('run_halted') ? 'run_halted' : 'no_results'),
          };
        }
        const provCC = extractContactCounts(rows, synthesisedDs);

        console.log(`[Chat][finalizeRunUI] Synthesised DS for run=${effectiveKey}: status=${synthesisedDs.status}, leads=${provisionalLeads.length}, leadVerifications=${provLv?.length ?? 'none'} (source=${source})`);
        deliverySummaryRunIdsRef.current.add(effectiveKey);
        if (effectiveRunId && effectiveRunId !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveRunId);
        if (effectiveCrid && effectiveCrid !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveCrid);

        window.dispatchEvent(new CustomEvent('wyshbone:results_final', {
          detail: { clientRequestId: effectiveCrid, runId: effectiveRunId || null },
        }));

        lastRunFinalVerdictRef.current = towerVerdict || synthesisedDs.status || 'UNKNOWN';

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
          policyApplied: provPa || undefined,
          learningUpdate: provLu || undefined,
          searchQueryCompiled: provSqc || undefined,
          runId: effectiveRunId || undefined,
          provisional: false,
          towerVerdict,
          towerLabel,
          towerProxyUsed: towerProxyUsed,
          towerStopTimePredicate,
          contactCounts: provCC,
          runReceipt: provRR,
          semanticJudgements: provSJ,
        };
        upsertResultMessage(finalMsg);

        if (provSqc) {
          rewriteConfidenceMessages(provSqc);
        }

        persistStructuredResult({
          messageId: finalMsg.id,
          runId: effectiveRunId || null,
          deliverySummary: synthesisedDs,
          verificationSummary: provVs || null,
          constraintsExtracted: provCe || null,
          leadVerifications: provLv || null,
          policySnapshot: provPs || null,
          policyApplied: provPa || null,
          learningUpdate: provLu || null,
          searchQueryCompiled: provSqc || null,
          contactCounts: provCC || null,
          runReceipt: provRR || null,
        });

        cleanupRunState(effectiveKey);
        return;
      }

      let parsed = dsRow.payload_json;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { return; }
      }
      if (!parsed || typeof parsed !== 'object') return;

      const { vs, ce, policySnapshot, policyApplied, learningUpdate, searchQueryCompiled, leadVerifications, runReceipt, semanticJudgements } = parseSiblingArtefacts(rows);

      const tower2 = resolveAuthoritativeTower(rows);
      const dsPathTowerVerdict = tower2.verdict;
      const dsPathTowerLabel = tower2.label;
      const dsPathProxyUsed = tower2.proxyUsed;
      const dsPathStopTimePredicate = tower2.stopTimePredicate;

      const contactCounts = extractContactCounts(rows, parsed);

      const dsExact = Array.isArray(parsed.delivered_exact) ? parsed.delivered_exact.length : 0;
      const dsClosest = Array.isArray(parsed.delivered_closest) ? parsed.delivered_closest.length : 0;
      console.log(`[Chat][finalizeRunUI] delivery_summary found for run=${effectiveKey}, status=${parsed.status}, verified_exact=${parsed.verified_exact_count ?? 'n/a'}, delivered_exact=${dsExact}, delivered_closest=${dsClosest}, leadVerifications=${leadVerifications?.length ?? 'none'}, towerVerdict=${dsPathTowerVerdict}, towerLabel=${dsPathTowerLabel} (source=${source})`);

      lastRunFinalVerdictRef.current = dsPathTowerVerdict || parsed.status || 'UNKNOWN';

      deliverySummaryRunIdsRef.current.add(effectiveKey);
      if (effectiveRunId && effectiveRunId !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveRunId);
      if (effectiveCrid && effectiveCrid !== effectiveKey) deliverySummaryRunIdsRef.current.add(effectiveCrid);

      window.dispatchEvent(new CustomEvent('wyshbone:results_final', {
        detail: { clientRequestId: effectiveCrid, runId: effectiveRunId || null },
      }));

      const isTrustFailure = isTowerTrustFailure(tower2) || (
        !dsPathTowerVerdict && parsed.status?.toUpperCase() === 'FAIL'
      );

      const resultMessage: Message = {
        id: `ds-${effectiveKey}`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        source: 'supervisor',
        deliverySummary: isTrustFailure ? { ...parsed, status: 'FAIL' } as DeliverySummary : parsed as DeliverySummary,
        verificationSummary: vs,
        constraintsExtracted: ce,
        leadVerifications,
        policySnapshot: policySnapshot || undefined,
        policyApplied: policyApplied || undefined,
        learningUpdate: learningUpdate || undefined,
        searchQueryCompiled: searchQueryCompiled || undefined,
        runId: effectiveRunId || undefined,
        provisional: false,
        towerVerdict: dsPathTowerVerdict,
        towerLabel: dsPathTowerLabel,
        towerProxyUsed: dsPathProxyUsed,
        towerStopTimePredicate: dsPathStopTimePredicate,
        contactCounts,
        runReceipt,
        semanticJudgements,
      };
      upsertResultMessage(resultMessage);

      if (searchQueryCompiled) {
        rewriteConfidenceMessages(searchQueryCompiled);
      }

      persistStructuredResult({
        messageId: resultMessage.id,
        runId: effectiveRunId || null,
        deliverySummary: isTrustFailure ? { ...parsed, status: 'FAIL' } : parsed,
        verificationSummary: vs || null,
        constraintsExtracted: ce || null,
        leadVerifications: leadVerifications || null,
        policySnapshot: policySnapshot || null,
        policyApplied: policyApplied || null,
        learningUpdate: learningUpdate || null,
        searchQueryCompiled: searchQueryCompiled || null,
        contactCounts: contactCounts || null,
        runReceipt: runReceipt || null,
      });

      cleanupRunState(effectiveKey);

      if (!isTrustFailure) {
        toast({
          title: "Results ready",
          description: "Your results are now available in the chat.",
        });
      }
    } catch (err) {
      console.warn(`[Chat][finalizeRunUI] Error (source=${source}):`, err);
    }
  };

  function upsertResultMessage(msg: Message) {
    if (!msg.provisional && msg.deliverySummary) {
      setShowPreRunBanner(false);
      if (msg.policySnapshot) {
        setPreRunPolicySnapshot(msg.policySnapshot);
      }
      if (msg.policyApplied) {
        setPreRunPolicyApplied(msg.policyApplied);
      }
    }
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
    const lastKnownStatus = new Map<string, string>();
    const runFirstSeen = new Map<string, number>();
    const SOFT_TIMEOUT_MS = 30_000;
    const HARD_TIMEOUT_MS = 90_000;
    const ABSOLUTE_TIMEOUT_MS = 600_000;
    const consecutiveFailures = new Map<string, number>();
    const MAX_CONSECUTIVE_FAILURES = 20;
    const softTimeoutEmitted = new Set<string>();
    const hardTimeoutEmitted = new Set<string>();

    async function fetchArtefactsWithRetry(runId: string | null, crid: string | null, maxRetries: number = 10): Promise<boolean> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (stopped) return false;
        const success = await finalizeRunUIRef.current?.({ runId, crid, source: `afr-poll-retry-${attempt}` });
        const effectiveKey = runId || crid;
        if (effectiveKey && deliverySummaryRunIdsRef.current.has(effectiveKey)) {
          return true;
        }
        if (runId && deliverySummaryRunIdsRef.current.has(runId)) return true;
        if (crid && deliverySummaryRunIdsRef.current.has(crid)) return true;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      return false;
    }

    function emitRunFailureBubble(effectiveKey: string, runId: string | null, stopReason: string) {
      if (deliverySummaryRunIdsRef.current.has(effectiveKey)) {
        console.log(`[Chat][AFR-Poll] Suppressed failure bubble for ${effectiveKey} (reason=${stopReason}) — results already delivered`);
        return;
      }
      const runsMap = inFlightSupervisorRunsRef.current;
      const runsEntries = Array.from(runsMap.entries());
      for (const [, run] of runsEntries) {
        if ((run.runId && deliverySummaryRunIdsRef.current.has(run.runId)) ||
            (run.crid && deliverySummaryRunIdsRef.current.has(run.crid))) {
          if (run.runId === effectiveKey || run.crid === effectiveKey) {
            console.log(`[Chat][AFR-Poll] Suppressed failure bubble for ${effectiveKey} (reason=${stopReason}) — results delivered under related key`);
            return;
          }
        }
      }
      console.warn(`[Chat][AFR-Poll] Emitting failure bubble for ${effectiveKey}, reason=${stopReason}`);
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
          stop_reason: stopReason,
        } as DeliverySummary,
        runId: runId || undefined,
        provisional: false,
      };
      upsertResultMessage(errorMsg);
      deliverySummaryRunIdsRef.current.add(effectiveKey);
      cleanupRunState(effectiveKey);
      setActiveClientRequestId(null);
      setIsStreaming(false);
      if (pendingCleanupRef.current) {
        clearTimeout(pendingCleanupRef.current);
        pendingCleanupRef.current = null;
      }
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

        if (!runFirstSeen.has(effectiveKey)) {
          runFirstSeen.set(effectiveKey, Date.now());
        }

        try {
          const params = new URLSearchParams();
          if (crid) params.set('client_request_id', crid);
          if (runId) params.set('runId', runId);
          const streamUrl = addDevAuthParams(buildApiUrl(`/api/afr/stream?${params.toString()}`));
          const res = await fetch(streamUrl, { credentials: 'include', cache: 'no-store' });
          if (!res.ok) {
            const failCount = (consecutiveFailures.get(effectiveKey) || 0) + 1;
            consecutiveFailures.set(effectiveKey, failCount);
            if (failCount >= MAX_CONSECUTIVE_FAILURES) {
              console.warn(`[Chat][AFR-Poll] ${MAX_CONSECUTIVE_FAILURES} consecutive API failures for ${effectiveKey}. Run likely not persisted.`);
              emitRunFailureBubble(effectiveKey, runId, 'run_not_persisted');
            }
            continue;
          }
          consecutiveFailures.set(effectiveKey, 0);
          const data = await res.json();

          const isTerminal = data.is_terminal === true;
          const status = data.status;
          const terminalState = data.terminal_state;
          if (status) lastKnownStatus.set(effectiveKey, status);

          const runElapsed = Date.now() - runFirstSeen.get(effectiveKey)!;
          const isClarifying = status === 'clarifying';
          if (runElapsed > ABSOLUTE_TIMEOUT_MS && !isClarifying) {
            console.warn(`[Chat][AFR-Poll] Absolute timeout (${Math.round(runElapsed / 1000)}s) for ${effectiveKey}. Giving up.`);
            emitRunFailureBubble(effectiveKey, runId, 'run_timeout');
            continue;
          }
          if (!isClarifying) {
            if (runElapsed > HARD_TIMEOUT_MS && !hardTimeoutEmitted.has(effectiveKey)) {
              hardTimeoutEmitted.add(effectiveKey);
              console.warn(`[Chat][AFR-Poll] Hard timeout banner for ${effectiveKey} (${Math.round(runElapsed / 1000)}s). Polling continues.`);
              const alreadyDelivered = deliverySummaryRunIdsRef.current.has(effectiveKey) ||
                (runId && deliverySummaryRunIdsRef.current.has(runId)) ||
                (crid && deliverySummaryRunIdsRef.current.has(crid));
              if (!alreadyDelivered) {
                const bannerMsg: Message = {
                  id: `ds-${effectiveKey}`,
                  role: 'assistant',
                  content: '',
                  timestamp: new Date(),
                  source: 'supervisor',
                  deliverySummary: {
                    status: 'PENDING',
                    delivered_exact: [],
                    delivered_closest: [],
                    delivered_count: 0,
                    stop_reason: 'still_working',
                  } as DeliverySummary,
                  runId: runId || undefined,
                  provisional: false,
                };
                upsertResultMessage(bannerMsg);
              }
            }
            const failCount = consecutiveFailures.get(effectiveKey) || 0;
            if (runElapsed > SOFT_TIMEOUT_MS && failCount >= 5 && !softTimeoutEmitted.has(effectiveKey)) {
              softTimeoutEmitted.add(effectiveKey);
              console.log(`[Chat][AFR-Poll] Soft timeout for ${effectiveKey} (${Math.round(runElapsed / 1000)}s, ${failCount} failures). Showing retrying bubble.`);
              const alreadyDelivered2 = deliverySummaryRunIdsRef.current.has(effectiveKey) ||
                (runId && deliverySummaryRunIdsRef.current.has(runId)) ||
                (crid && deliverySummaryRunIdsRef.current.has(crid));
              if (!alreadyDelivered2) {
                const softMsg: Message = {
                  id: `ds-${effectiveKey}`,
                  role: 'assistant',
                  content: '',
                  timestamp: new Date(),
                  source: 'supervisor',
                  deliverySummary: {
                    status: 'PENDING',
                    delivered_exact: [],
                    delivered_closest: [],
                    delivered_count: 0,
                    stop_reason: 'still_working',
                  } as DeliverySummary,
                  runId: runId || undefined,
                  provisional: false,
                };
                upsertResultMessage(softMsg);
              }
            }
          }


          // ── intent_narrative artefact check ────────────────────────────────────────
          if (!intentNarrativeSeenRef.current.has(effectiveKey)) {
            try {
              const inParams = new URLSearchParams();
              if (crid) inParams.set('client_request_id', crid);
              if (runId) inParams.set('runId', runId);
              const inUrl = addDevAuthParams(buildApiUrl(`/api/afr/artefacts?${inParams.toString()}`));
              const inRes = await fetch(inUrl, { credentials: 'include', cache: 'no-store' });
              if (inRes.ok) {
                const inRows = await inRes.json();
                if (Array.isArray(inRows)) {
                  const inRow = inRows.find((r: any) => r.type === 'intent_narrative');
                  if (inRow) {
                    intentNarrativeSeenRef.current.add(effectiveKey);
                    let inPayload: IntentNarrativePayload | null = inRow.payload_json;
                    if (typeof inPayload === 'string') {
                      try { inPayload = JSON.parse(inPayload); } catch { inPayload = null; }
                    }
                    if (inPayload) {
                      const inMsgId = `in-${effectiveKey}`;
                      setMessages((prev) => {
                        if (prev.some(m => m.id === inMsgId)) return prev;
                        const dsIdx = prev.findIndex(m => m.id === `ds-${effectiveKey}`);
                        const newMsg: Message = {
                          id: inMsgId,
                          role: 'assistant' as const,
                          content: '',
                          timestamp: new Date(),
                          isIntentNarrative: true,
                          intentNarrativePayload: inPayload,
                        };
                        if (dsIdx !== -1) {
                          const next = [...prev];
                          next.splice(dsIdx, 0, newMsg);
                          return next;
                        }
                        return [...prev, newMsg];
                      });
                      console.log(`[Chat][AFR-Poll] intent_narrative injected for ${effectiveKey}, findability=${inPayload.findability}, clarification_needed=${inPayload.clarification_needed}`);
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`[Chat][AFR-Poll] Error fetching intent_narrative for ${effectiveKey}:`, err);
            }
          }

          if (isTerminal || status === 'completed' || status === 'failed' || 
              terminalState === 'PASS' || terminalState === 'FAIL' || terminalState === 'STOP') {
            terminalDetected.add(effectiveKey);

            const finalized = await fetchArtefactsWithRetry(runId, crid);
            if (!finalized) {
              const alreadyDeliveredFinal = deliverySummaryRunIdsRef.current.has(effectiveKey) ||
                (runId && deliverySummaryRunIdsRef.current.has(runId)) ||
                (crid && deliverySummaryRunIdsRef.current.has(crid));
              if (alreadyDeliveredFinal) {
                console.log(`[Chat][AFR-Poll] Suppressed artefacts_unavailable for ${effectiveKey} — results already delivered under a related key`);
              } else {
                console.warn(`[Chat][AFR-Poll] Phase 2 exhausted retries for ${effectiveKey}. Showing error bubble.`);
                console.warn(`[DIAGNOSTIC][FAILURE] artefacts_unavailable for key=${effectiveKey}, runId=${runId}, crid=${crid}, convId=${conversationId}`);
                try {
                  const diagParams = new URLSearchParams();
                  if (conversationId) diagParams.set('conversation_id', conversationId);
                  const diagUrl = addDevAuthParams(buildApiUrl(`/api/afr/run-diagnostic?${diagParams.toString()}`));
                  fetch(diagUrl, { credentials: 'include' }).then(r => r.json()).then(d => {
                    console.warn(`[DIAGNOSTIC][FAILURE] DB snapshot:`, JSON.stringify(d, null, 2));
                  }).catch(() => {});
                } catch {}
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
                  runId: runId || undefined,
                  provisional: false,
                };
                upsertResultMessage(errorMsg);
                deliverySummaryRunIdsRef.current.add(effectiveKey);
                cleanupRunState(effectiveKey);
                setActiveClientRequestId(null);
                setIsStreaming(false);
              }
            }
          }
        } catch (err) {
          console.warn(`[Chat][AFR-Poll] Stream poll error for ${effectiveKey}:`, err);
          const failCount = (consecutiveFailures.get(effectiveKey) || 0) + 1;
          consecutiveFailures.set(effectiveKey, failCount);
          if (failCount >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`[Chat][AFR-Poll] ${MAX_CONSECUTIVE_FAILURES} consecutive poll exceptions for ${effectiveKey}. Bailing.`);
            emitRunFailureBubble(effectiveKey, runId, 'run_not_persisted');
          }
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
              base.policyApplied = meta.policyApplied ? parsePolicyApplied(meta.policyApplied) : null;
              base.learningUpdate = meta.learningUpdate ? parseLearningUpdate(meta.learningUpdate) : null;
              base.searchQueryCompiled = meta.searchQueryCompiled ? parseSearchQueryCompiled(meta.searchQueryCompiled) : null;
              base.runId = meta.runId || null;
              base.contactCounts = meta.contactCounts || null;
            }
            if (base.role === 'assistant' && /^Searching for .+\.$/.test(base.content)) {
              base.isConfidence = true;
              base.content = base.content
                .replace(/\s+and\s+return\s+exactly\b[^.]*/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
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

    const handleRefetchHistory = () => {
      hasLoadedHistoryRef.current = false;
      loadHistory();
    };
    window.addEventListener('wyshbone:refetch_history', handleRefetchHistory);
    return () => {
      window.removeEventListener('wyshbone:refetch_history', handleRefetchHistory);
    };
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
      const retryCrid = detail.clientRequestId || supervisorClientRequestIdRef.current;
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

  useEffect(() => {
    const handler = () => {
      const lastQuery = lastSentQueryRef.current;
      if (!lastQuery) {
        console.warn('[Chat][Retry] No previous message to retry');
        return;
      }
      console.log('[Chat][Retry] wyshbone:retry_last_message received, resending:', lastQuery.slice(0, 60));
      setTimeout(() => handleSendRef.current?.(lastQuery), 200);
    };
    window.addEventListener('wyshbone:retry_last_message', handler);
    return () => window.removeEventListener('wyshbone:retry_last_message', handler);
  }, []);

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
        
        // Clear supervisor timers
        if (supervisorTimeoutRef.current) {
          clearTimeout(supervisorTimeoutRef.current);
          supervisorTimeoutRef.current = null;
        }
        if (supervisorPollRef.current) {
          clearInterval(supervisorPollRef.current);
          supervisorPollRef.current = null;
        }

        // Clear in-flight request tracking
        inFlightRequestIdRef.current = null;
        if (pendingCleanupRef.current) {
          clearTimeout(pendingCleanupRef.current);
          pendingCleanupRef.current = null;
        }
        inFlightSupervisorRunsRef.current.clear();
        supervisorRunIdRef.current = null;
        supervisorClientRequestIdRef.current = null;
        processedRealtimeMsgIdsRef.current.clear();
        deliverySummaryRunIdsRef.current = new Set();
        pendingResultPersistsRef.current = [];
        pendingMetadataRef.current = null;
        
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
        setActiveClientRequestId(null);
        setSupervisorTaskId(null);
        setIsWaitingForSupervisor(false);
        setCurrentClientRequestId(null);
        setPinnedClientRequestId(null);
        setLastCompletedClientRequestId(null);
        clearRecentRuns();
        lastSentQueryRef.current = null;
        setConcatenationError(null);
        setQueuedMessage(null);
        setInFlightBlockMessage(null);
        setConversationId(newConversationId);
        
        console.log(`🆕 Started new chat with ID: ${newConversationId}`);
      };
      handleNewChatRef.current = handleNewChat;
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
        
        if (supervisorTimeoutRef.current) {
          clearTimeout(supervisorTimeoutRef.current);
          supervisorTimeoutRef.current = null;
        }
        if (supervisorPollRef.current) {
          clearInterval(supervisorPollRef.current);
          supervisorPollRef.current = null;
        }

        // Clear in-flight request tracking
        inFlightRequestIdRef.current = null;
        if (pendingCleanupRef.current) {
          clearTimeout(pendingCleanupRef.current);
          pendingCleanupRef.current = null;
        }
        inFlightSupervisorRunsRef.current.clear();
        supervisorRunIdRef.current = null;
        supervisorClientRequestIdRef.current = null;
        processedRealtimeMsgIdsRef.current.clear();
        deliverySummaryRunIdsRef.current = new Set();
        pendingResultPersistsRef.current = [];
        pendingMetadataRef.current = null;

        setIsStreaming(false);
        setInput("");
        setShowLocationSuggestions(false);
        setActiveClientRequestId(null);
        setSupervisorTaskId(null);
        setIsWaitingForSupervisor(false);
        setCurrentClientRequestId(null);
        setPinnedClientRequestId(null);
        setLastCompletedClientRequestId(null);
        clearRecentRuns();
        lastSentQueryRef.current = null;
        setConcatenationError(null);
        setQueuedMessage(null);
        setInFlightBlockMessage(null);
        
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
                base.policyApplied = meta.policyApplied ? parsePolicyApplied(meta.policyApplied) : null;
                base.learningUpdate = meta.learningUpdate ? parseLearningUpdate(meta.learningUpdate) : null;
                base.searchQueryCompiled = meta.searchQueryCompiled ? parseSearchQueryCompiled(meta.searchQueryCompiled) : null;
                base.runId = meta.runId || null;
                base.contactCounts = meta.contactCounts || null;
              }
              if (base.role === 'assistant' && /^Searching for .+\.$/.test(base.content)) {
                base.isConfidence = true;
                base.content = base.content
                  .replace(/\s+and\s+return\s+exactly\b[^.]*/gi, '')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
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
          google_query_mode: getGoogleQueryMode(),
          run_config_overrides: (runConfigOverrides.speed_mode !== "balanced" || runConfigOverrides.replan_ceiling !== undefined || runConfigOverrides.ignore_learned_policy) ? runConfigOverrides : undefined,
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

      let sseLineBuffer = '';
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        sseLineBuffer += chunk;
        const parts = sseLineBuffer.split('\n');
        sseLineBuffer = parts.pop() || '';
        
        for (const line of parts) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix
            
            if (data === '[DONE]') {
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
              
              if (parsed.type === 'confidence' && parsed.content) {
                const confidenceId = `confidence-${Date.now()}`;
                const sanitisedContent = parsed.content
                  .replace(/\s+and\s+return\s+exactly\b[^.]*/gi, '')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
                const normalizedIncoming = sanitisedContent.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
                setMessages((prev) => {
                  const now = Date.now();
                  const lastConfidence = [...prev].reverse().find(m => m.isConfidence);
                  if (lastConfidence && (now - lastConfidence.timestamp.getTime()) < 10000) {
                    const normalizedExisting = lastConfidence.content.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
                    if (normalizedExisting === normalizedIncoming) {
                      return prev;
                    }
                  }
                  return [
                    ...prev,
                    {
                      id: confidenceId,
                      role: 'assistant' as const,
                      content: sanitisedContent,
                      timestamp: new Date(),
                      isConfidence: true,
                    },
                  ];
                });
              }

              if (parsed.supervisorTaskId) {
                streamHasSupervisorTask = true;
                isRunLane = true;
                setLastLane("run");
                setShowPreRunBanner(true);
                setPreRunPolicySnapshot(null);
                setPreRunPolicyApplied(null);
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
              
              if (parsed.content && !isRunLane && parsed.type !== 'confidence') {
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

      if (sseLineBuffer.trim()) {
        const remainingLine = sseLineBuffer.trim();
        if (remainingLine.startsWith('data: ')) {
          const data = remainingLine.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'run_id' && parsed.runId) {
                supervisorRunIdRef.current = parsed.runId;
                window.dispatchEvent(new CustomEvent('wyshbone:run_id', {
                  detail: { runId: parsed.runId, clientRequestId: parsed.clientRequestId || clientRequestId },
                }));
              }
              if (parsed.supervisorTaskId) {
                inFlightSupervisorRunsRef.current.set(clientRequestId, {
                  runId: supervisorRunIdRef.current,
                  crid: clientRequestId,
                });
              }
            } catch {}
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
    
    if (isStreaming || isRunActive) {
      console.log('[Chat] Run active, cannot submit new message');
      setInput("");
      setInFlightBlockMessage("Run in progress. Start a new chat to run another test.");
      return;
    }

    setInFlightBlockMessage(null);

    setConcatenationError(null);

    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length > 0 && lastSentQueryRef.current && messageContent !== lastSentQueryRef.current && messageContent.length > lastSentQueryRef.current.length) {
      const prevLower = lastSentQueryRef.current.toLowerCase();
      const newLower = messageContent.toLowerCase();
      if (newLower.includes(prevLower) && prevLower.length > 10) {
        setConcatenationError("This looks like it may include your previous request. Start a fresh chat for a clean test, or clear to send anyway.");
        console.warn('[Chat][ConcatGuard] Warned: new query contains previous query as substring');
        return;
      }
    }

    const verticalId = getCurrentVerticalId();
    if (verticalId !== 'generic' && !skipMismatchOnceRef.current) {
      const { mismatch, matchedTerms } = detectVerticalMismatch(verticalId, messageContent);
      if (mismatch) {
        console.log(`[Chat][SanityGate] Vertical mismatch detected: vertical=${verticalId}, terms=${matchedTerms.join(', ')}`);
        setVerticalMismatchPrompt({ query: messageContent, currentVertical: verticalId, matchedTerms });
        setInput("");
        return;
      }
    }
    skipMismatchOnceRef.current = false;

    setShowLocationSuggestions(false);

    const currentHistory = messages.filter((msg): msg is Message => !("type" in msg));
    const intent = classifyIntent(messageContent, currentHistory);

    console.log(`[Chat] Intent classified: ${intent} for message: "${messageContent.slice(0, 50)}..."`);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent,
      timestamp: new Date(),
    };

    if (intent === 'NEW_REPLACE') {
      setMessages((prev) => {
        const dsMessages = prev.filter(m => m.id.startsWith('ds-'));
        return [...dsMessages, userMessage];
      });
    } else if (intent === 'NEW_UNRELATED') {
      setMessages((prev) => {
        const dsMessages = prev.filter(m => m.id.startsWith('ds-'));
        return [...dsMessages, userMessage];
      });
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    setInput("");
    lastSentQueryRef.current = messageContent;

    publishEvent("CHAT_MESSAGE_SENT", {
      conversationId: conversationId || "pending",
      messageId: userMessage.id,
      content: messageContent,
      mode: chatMode,
    });

    let conversationHistory: ChatMessage[];

    if (intent === 'NEW_REPLACE' || intent === 'NEW_UNRELATED') {
      conversationHistory = [{ role: userMessage.role, content: userMessage.content }];
    } else {
      const allHistory = messages
        .filter((msg): msg is Message => !("type" in msg))
        .map(({ role, content }) => ({ role, content }));

      const recentHistory = allHistory.slice(-6);
      conversationHistory = [...recentHistory, { role: userMessage.role, content: userMessage.content }];
    }

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
    setInFlightBlockMessage(null);
    inFlightRequestIdRef.current = null;
    if (pendingCleanupRef.current) {
      clearTimeout(pendingCleanupRef.current);
      pendingCleanupRef.current = null;
    }
    inFlightSupervisorRunsRef.current.clear();
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
    setActiveClientRequestId(null);
    setSupervisorTaskId(null);
    setIsWaitingForSupervisor(false);
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
          {messages.length === 0 && isLoadingGoal && !goalError ? (
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
                // NOTE: isClarifySuperseded messages are kept visible (append-only chat transcript).
                // Previously these were hidden, but the conversation must never visually delete bubbles.
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
                if (chatMessage.provisional) return null;
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
                        {chatMessage.runId ? (
                          <BehaviourInspectContent
                            runId={chatMessage.runId}
                            query={chatMessage.content || undefined}
                            timestamp={chatMessage.timestamp}
                          />
                        ) : (
                          <RunResultBubble
                            deliverySummary={chatMessage.deliverySummary}
                            verificationSummary={chatMessage.verificationSummary}
                            constraintsExtracted={chatMessage.constraintsExtracted}
                            leadVerifications={chatMessage.leadVerifications}
                            runId={chatMessage.runId}
                            policySnapshot={chatMessage.policySnapshot}
                            policyApplied={chatMessage.policyApplied}
                            learningUpdate={chatMessage.learningUpdate}
                            searchQueryCompiled={chatMessage.searchQueryCompiled}
                            provisional={chatMessage.provisional}
                            towerVerdict={chatMessage.towerVerdict}
                            towerLabel={chatMessage.towerLabel}
                            towerProxyUsed={chatMessage.towerProxyUsed}
                            towerStopTimePredicate={chatMessage.towerStopTimePredicate}
                            contactCounts={chatMessage.contactCounts}
                            runReceipt={chatMessage.runReceipt}
                            semanticJudgements={chatMessage.semanticJudgements}
                          />
                        )}
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

              if (chatMessage.isIntentNarrative && chatMessage.intentNarrativePayload) {
                const payload = chatMessage.intentNarrativePayload;
                const allMsgs = Array.isArray(messages) ? messages : [];
                const myIndex = allMsgs.findIndex(m => m.id === chatMessage.id);
                const hasResultAfter = allMsgs.slice(myIndex + 1).some(m => (m as Message).deliverySummary && !(m as Message).provisional);
                const isRunComplete = hasResultAfter;
                const isCollapsed = collapsedIntentNarrativeIds.has(chatMessage.id);
                const showCollapsed = isRunComplete && isCollapsed;
                const isClarifyPause = payload.findability === 'very_hard' && payload.clarification_needed;

                const findabilityLabel = {
                  easy: 'Easy to find',
                  moderate: 'Moderately findable',
                  hard: 'Hard to find',
                  very_hard: 'Very hard to find',
                }[payload.findability ?? 'moderate'] ?? 'Unknown';

                const findabilityColor = {
                  easy: 'text-green-600 dark:text-green-400',
                  moderate: 'text-blue-600 dark:text-blue-400',
                  hard: 'text-amber-600 dark:text-amber-400',
                  very_hard: 'text-red-600 dark:text-red-400',
                }[payload.findability ?? 'moderate'] ?? 'text-muted-foreground';

                return (
                  <div key={chatMessage.id} className="flex gap-3 flex-row" data-testid={`message-intent-narrative-${chatMessage.id}`}>
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col items-start max-w-2xl">
                      <div className={`rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 w-full overflow-hidden transition-all ${isClarifyPause ? 'border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2">
                            <Target className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                              {isClarifyPause ? 'One quick check before I search' : "Here's what I understood"}
                            </span>
                          </div>
                          {isRunComplete && (
                            <button
                              onClick={() => setCollapsedIntentNarrativeIds(prev => {
                                const next = new Set(prev);
                                next.has(chatMessage.id) ? next.delete(chatMessage.id) : next.add(chatMessage.id);
                                return next;
                              })}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                            >
                              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>

                        {!showCollapsed && (
                          <div className="px-4 py-3 space-y-3 text-[13px]">
                            {/* Clarification question (prominent when pausing) */}
                            {isClarifyPause && payload.clarification_question && (
                              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                                <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="font-medium text-amber-800 dark:text-amber-200 leading-snug">
                                    {payload.clarification_question}
                                  </p>
                                  {!isRunComplete && (
                                    <div className="flex gap-2 mt-2.5">
                                      <Button
                                        size="sm"
                                        className="h-7 text-[12px] bg-amber-600 hover:bg-amber-700 text-white border-0"
                                        onClick={() => {
                                          setInput('Looks right, go ahead');
                                          setTimeout(() => textareaRef.current?.focus(), 50);
                                        }}
                                      >
                                        Looks right, go ahead
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[12px] border-amber-300 text-amber-700 hover:bg-amber-50"
                                        onClick={() => {
                                          setInput('Let me clarify: ');
                                          setTimeout(() => textareaRef.current?.focus(), 50);
                                        }}
                                      >
                                        Let me clarify
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Looking for */}
                            {payload.entity_description && (
                              <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Looking for</p>
                                <p className="text-slate-800 dark:text-slate-200 leading-snug">{payload.entity_description}</p>
                              </div>
                            )}

                            {/* Not */}
                            {payload.entity_exclusions && payload.entity_exclusions.length > 0 && (
                              <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Not</p>
                                <ul className="space-y-0.5">
                                  {payload.entity_exclusions.map((exc, i) => (
                                    <li key={i} className="text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                                      <span className="text-slate-400 mt-0.5 flex-shrink-0">•</span>
                                      <span>{exc}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Commercial context */}
                            {payload.commercial_context && (
                              <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Why you likely want this</p>
                                <p className="text-slate-600 dark:text-slate-400 leading-snug">{payload.commercial_context}</p>
                              </div>
                            )}

                            {/* Findability + scarcity */}
                            <div className="flex items-center gap-4">
                              {payload.findability && (
                                <div className="flex items-center gap-1.5">
                                  <Gauge className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">How findable:</span>
                                  <span className={`text-[11px] font-semibold ${findabilityColor}`}>{findabilityLabel}</span>
                                </div>
                              )}
                              {payload.scarcity_expectation && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Availability:</span>
                                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{payload.scarcity_expectation}</span>
                                </div>
                              )}
                            </div>

                            {/* Suggested approaches */}
                            {payload.suggested_approaches && payload.suggested_approaches.length > 0 && (
                              <div>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Lightbulb className="w-3.5 h-3.5 text-slate-400" />
                                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">My approach</p>
                                </div>
                                <ol className="space-y-0.5">
                                  {payload.suggested_approaches.map((approach, i) => (
                                    <li key={i} className="text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                                      <span className="text-slate-400 flex-shrink-0 text-[11px] mt-0.5">{i + 1}.</span>
                                      <span>{approach}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {/* Non-pause clarification (subtle) */}
                            {payload.clarification_needed && !isClarifyPause && payload.clarification_question && (
                              <div className="flex items-start gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                <p className="text-slate-500 dark:text-slate-400 leading-snug text-[12px] italic">
                                  {payload.clarification_question}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {showCollapsed && (
                          <div className="px-4 py-2 text-[12px] text-slate-500 dark:text-slate-400">
                            {payload.entity_description ? `Looking for: ${payload.entity_description}` : 'Intent understood'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (chatMessage.isConfidence) {
                const allMsgs = Array.isArray(messages) ? messages : [];
                const myIndex = allMsgs.findIndex(m => m.id === chatMessage.id);
                const hasResultAfter = allMsgs.slice(myIndex + 1).some(m => (m as Message).deliverySummary && !(m as Message).provisional);
                if (hasResultAfter) return null;
                const allConfidenceMessages = allMsgs.filter(m => 'isConfidence' in m && (m as Message).isConfidence);
                const confidenceIndex = allConfidenceMessages.findIndex(m => m.id === chatMessage.id);
                const totalConfidence = allConfidenceMessages.length;
                const stepLabel = totalConfidence > 1 ? `Verification step ${confidenceIndex + 1}/${totalConfidence}` : null;
                return (
                  <div
                    key={chatMessage.id}
                    className="flex gap-3 flex-row"
                    data-testid={`message-confidence-${chatMessage.id}`}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                      <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                      <div className="rounded-lg px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                          <div>
                            {stepLabel && (
                              <p className="text-[10px] text-blue-500 dark:text-blue-400 font-medium mb-0.5">{stepLabel}</p>
                            )}
                            <p className="text-[14px] leading-relaxed text-blue-700 dark:text-blue-300 font-medium">{chatMessage.content}</p>
                          </div>
                        </div>
                      </div>
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
                    {(() => {
                      const isQuestion = !isUser && !isSupervisor && chatMessage.content.trimEnd().endsWith('?');
                      return (
                    <div
                      className={`rounded-lg px-4 py-3 ${
                        isUser
                          ? "bg-primary text-primary-foreground"
                          : isQuestion
                          ? "bg-card border-2 border-primary/30 dark:border-primary/40"
                          : isSupervisor
                          ? "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border border-blue-200 dark:border-blue-800"
                          : "bg-card border border-card-border"
                      }`}
                    >
                      {isQuestion && (
                        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-primary/70">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Question from Wyshbone</span>
                        </div>
                      )}
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
                      );
                    })()}
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

          {false && showPreRunBanner && isWaitingForSupervisor && (
            <div className="flex gap-3 flex-row mb-2" data-testid="pre-run-banner">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none w-full">
                <PreRunBanner
                  policySnapshot={preRunPolicySnapshot}
                  policyApplied={preRunPolicyApplied}
                  loading={!preRunPolicySnapshot && !preRunPolicyApplied}
                />
              </div>
            </div>
          )}

          {verticalMismatchPrompt && (
            <div className="flex gap-3 flex-row mb-2" data-testid="vertical-mismatch">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col items-start max-w-3xl lg:max-w-none">
                <div className="rounded-lg px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                    That looks like a different type of search than {getVerticalLabel(verticalMismatchPrompt.currentVertical)}. Do you want me to switch to General and run it, or keep {getVerticalLabel(verticalMismatchPrompt.currentVertical)}?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const q = verticalMismatchPrompt.query;
                        setVerticalMismatchPrompt(null);
                        try {
                          localStorage.setItem('wyshbone.currentVerticalId', 'generic');
                          window.dispatchEvent(new CustomEvent('wyshbone:vertical_changed', { detail: { verticalId: 'generic' } }));
                        } catch {}
                        handleSendRef.current?.(q);
                      }}
                    >
                      Switch to General and run
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        const q = verticalMismatchPrompt.query;
                        setVerticalMismatchPrompt(null);
                        skipMismatchOnceRef.current = true;
                        handleSendRef.current?.(q);
                      }}
                    >
                      Keep {getVerticalLabel(verticalMismatchPrompt.currentVertical)}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

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

          {/* Thinking indicator — hidden when supervisor banner is active */}
          {isStreaming && !isWaitingForSupervisor && (
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
        <RunDiagnosticPanel
          conversationId={conversationId}
          messages={messages}
          isWaitingForSupervisor={isWaitingForSupervisor}
          inFlightSupervisorRunsRef={inFlightSupervisorRunsRef}
          deliverySummaryRunIdsRef={deliverySummaryRunIdsRef}
          supervisorRunIdRef={supervisorRunIdRef}
          supervisorClientRequestIdRef={supervisorClientRequestIdRef}
          showDebugPanel={showDebugPanel}
          setShowDebugPanel={setShowDebugPanel}
          lastSentQueryRef={lastSentQueryRef}
          lastRunFinalVerdictRef={lastRunFinalVerdictRef}
        />
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
          
          {concatenationError && (
            <div className="mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-amber-700 dark:text-amber-300">{concatenationError}</span>
              <div className="flex gap-1.5 shrink-0">
                {handleNewChatRef.current && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setConcatenationError(null); handleNewChatRef.current?.(); }}
                    className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900"
                  >
                    Start fresh
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setConcatenationError(null); lastSentQueryRef.current = null; }}
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
                >
                  Send anyway
                </Button>
              </div>
            </div>
          )}

          {inFlightBlockMessage && (
            <div className="mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
              <span className="text-sm text-amber-700 dark:text-amber-300">
                {inFlightBlockMessage}
              </span>
              <div className="flex gap-1.5 shrink-0">
                {handleNewChatRef.current && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setInFlightBlockMessage(null); handleNewChatRef.current?.(); }}
                    className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900"
                  >
                    Start fresh test
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInFlightBlockMessage(null)}
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

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
          
          <RunConfigOverridesPanel
            overrides={runConfigOverrides}
            onChange={setRunConfigOverrides}
          />
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
