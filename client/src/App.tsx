import { Switch, Route, useLocation } from "wouter";
import { queryClient, authedFetch } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, type RunItem } from "@/components/app-sidebar";
import { HeaderCountrySelector } from "@/components/HeaderCountrySelector";
import { Moon, Sun, FilePlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatPage from "@/pages/chat";
import DebugPage from "@/pages/debug";
import BatchPipeline from "@/pages/BatchPipeline";
import BatchHistoryPage from "@/pages/batch-history";
import AuthPage from "@/pages/auth";
import PricingPage from "@/pages/pricing";
import AccountPage from "@/pages/account";
import CrmLayout from "@/pages/crm";
import LeadsPage from "@/pages/leads";
import NudgesPage from "@/pages/nudges";
import RedditPage from "@/pages/reddit";
import HackerNewsPage from "@/pages/hackernews";
import NotFound from "@/pages/not-found";
import { BreweryOnboardingWizard } from "@/features/onboarding";
import { GeneralOnboardingWizard } from "@/features/onboarding/GeneralOnboardingWizard";
import CountryHint from "@/components/CountryHint";
import { LoginDialog } from "@/components/LoginDialog";
import { useState, useEffect, useRef, useCallback } from "react";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { SidebarFlashProvider } from "@/contexts/SidebarFlashContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { PlanExecutionProvider } from "@/contexts/PlanExecutionController";
import { AgentStatusProvider, useAgentStatus } from "@/contexts/AgentStatusContext";
import { VerticalProvider } from "@/contexts/VerticalContext";
import { CapabilitiesProvider } from "@/contexts/CapabilitiesContext";
import { VerticalIndicator } from "@/components/VerticalSelector";
import { OnboardingTourProvider } from "@/contexts/OnboardingTourContext";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { OnboardingWizardProvider, useOnboardingWizard } from "@/contexts/OnboardingWizardContext";
import { DemoModeBanner } from "@/components/DemoModeBanner";
import { DevBanner } from "@/components/DevBanner";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { LiveActivityPanel } from "@/components/live-activity-panel";
import { PlanApprovalPanel } from "@/components/plan-approval-panel";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { XeroStatusBadge } from "@/components/XeroStatusBadge";
// Results Panel imports
import { ResultsPanelProvider, useResultsPanel } from "@/contexts/ResultsPanelContext";
import { ResultsPanel } from "@/components/results/ResultsPanel";
// Agent-First UI imports
import { AgentFirstProvider, useAgentFirst } from "@/contexts/AgentFirstContext";
import { DesktopSplitLayout } from "@/layouts/DesktopSplitLayout";
import { MobileAgentLayout } from "@/layouts/MobileAgentLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import ActivityPage from "@/pages/activity";
import SettingsPage from "@/pages/settings";
import CrmPreviewPage from "@/pages/crm-preview";
import EventsPage from "@/pages/events";
import EntityReviewPage from "@/pages/entity-review";
import SleeperAgentMonitor from "@/pages/dev/sleeper-agent-monitor";
import DevProgressPage from "@/pages/dev/progress";
import DatabaseMaintenance from "@/pages/admin/database-maintenance";
import InspectorPage from "@/pages/dev/inspector";
import WorkflowPage from "@/pages/workflow";
import { LayoutToggle } from "@/components/LayoutToggle";
import DriverTodayPage from "@/pages/driver/today";
import DriverStopPage from "@/pages/driver/stop";
import UserManagementPage from "@/pages/admin/user-management";
import TeamPage from "@/pages/settings/team";

// No demo runs - users only see their own data
const DEMO_RUNS: RunItem[] = [];

/**
 * Agent-First Router - Routes for the new split-screen layout
 * Left panel: Chat (handled by DesktopSplitLayout)
 * Right panel: These routes
 */
function AgentFirstRouter({ 
  defaultCountry, 
  onInjectSystemMessage,
  addRunFn,
  updateRunFn,
  getActiveRunId,
  onNewChat,
  onLoadConversation
}: { 
  defaultCountry: string;
  onInjectSystemMessage: (fn: (msg: string, asUser?: boolean) => void) => void;
  addRunFn: (run: Partial<RunItem>) => string;
  updateRunFn: (runId: string, updates: Partial<RunItem>) => void;
  getActiveRunId: () => string | null;
  onNewChat: (fn: () => void) => void;
  onLoadConversation: (fn: (conversationId: string) => void) => void;
}) {
  return (
    <Switch>
      {/* Default home shows Agent Workspace with activity */}
      <Route path="/" component={AgentWorkspace} />
      
      {/* Activity page for mobile */}
      <Route path="/activity" component={ActivityPage} />
      
      {/* Settings page */}
      <Route path="/settings" component={SettingsPage} />
      <Route path="/settings/team" component={TeamPage} />
      <Route path="/settings/users" component={UserManagementPage} />

      {/* Workflow dashboard */}
      <Route path="/workflow" component={WorkflowPage} />

      {/* CRM Preview for mobile */}
      <Route path="/crm-preview" component={CrmPreviewPage} />
      
      {/* Full chat page (for dedicated chat view) */}
      <Route path="/chat">
        {() => <ChatPage 
          defaultCountry={defaultCountry} 
          onInjectSystemMessage={onInjectSystemMessage} 
          addRun={addRunFn} 
          updateRun={updateRunFn}
          getActiveRunId={getActiveRunId}
          onNewChat={onNewChat}
          onLoadConversation={onLoadConversation}
        />}
      </Route>
      
      {/* CRM routes */}
      <Route path="/auth/crm" nest component={CrmLayout} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/nudges" component={NudgesPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/reddit" component={RedditPage} />
      <Route path="/hackernews" component={HackerNewsPage} />
      <Route path="/entity-review" component={EntityReviewPage} />
      <Route path="/dev/sleeper-agent" component={SleeperAgentMonitor} />
      <Route path="/dev/progress" component={DevProgressPage} />
      <Route path="/dev/inspector" component={InspectorPage} />
      <Route path="/admin/database-maintenance" component={DatabaseMaintenance} />
      <Route path="/admin/users" component={UserManagementPage} />

      {/* Driver routes */}
      <Route path="/driver/today" component={DriverTodayPage} />
      <Route path="/driver/stop/:id" component={DriverStopPage} />

      {/* Other routes */}
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/debug" component={DebugPage} />
      <Route path="/batch-history" component={BatchHistoryPage} />
      <Route path="/batch/:id" component={BatchPipeline} />
      <Route path="/onboarding/brewery" component={BreweryOnboardingWizard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Router({ 
  defaultCountry, 
  onInjectSystemMessage,
  addRunFn,
  updateRunFn,
  getActiveRunId,
  onNewChat,
  onLoadConversation
}: { 
  defaultCountry: string;
  onInjectSystemMessage: (fn: (msg: string, asUser?: boolean) => void) => void;
  addRunFn: (run: Partial<RunItem>) => string;
  updateRunFn: (runId: string, updates: Partial<RunItem>) => void;
  getActiveRunId: () => string | null;
  onNewChat: (fn: () => void) => void;
  onLoadConversation: (fn: (conversationId: string) => void) => void;
}) {
  return (
    <Switch>
      <Route path="/">
        {() => <ChatPage 
          defaultCountry={defaultCountry} 
          onInjectSystemMessage={onInjectSystemMessage} 
          addRun={addRunFn} 
          updateRun={updateRunFn}
          getActiveRunId={getActiveRunId}
          onNewChat={onNewChat}
          onLoadConversation={onLoadConversation}
        />}
      </Route>
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/workflow" component={WorkflowPage} />
      <Route path="/debug" component={DebugPage} />
      <Route path="/batch-history" component={BatchHistoryPage} />
      <Route path="/batch/:id" component={BatchPipeline} />
      <Route path="/auth/crm" nest component={CrmLayout} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/nudges" component={NudgesPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/reddit" component={RedditPage} />
      <Route path="/hackernews" component={HackerNewsPage} />
      <Route path="/entity-review" component={EntityReviewPage} />
      <Route path="/dev/sleeper-agent" component={SleeperAgentMonitor} />
      <Route path="/dev/progress" component={DevProgressPage} />
      <Route path="/dev/inspector" component={InspectorPage} />
      <Route path="/admin/database-maintenance" component={DatabaseMaintenance} />
      <Route path="/admin/users" component={UserManagementPage} />
      <Route path="/settings/users" component={UserManagementPage} />
      <Route path="/settings/team" component={TeamPage} />
      <Route path="/driver/today" component={DriverTodayPage} />
      <Route path="/driver/stop/:id" component={DriverStopPage} />
      <Route path="/onboarding/brewery" component={BreweryOnboardingWizard} />
      <Route component={NotFound} />
    </Switch>
  );
}

export type ConversationItem = {
  id: string;
  userId: string;
  label: string;
  createdAt: number;
};

/**
 * Onboarding Wizards Component - Auto-opens wizards for new users
 */
function OnboardingWizards() {
  const { user } = useUser();
  const {
    isGeneralWizardOpen,
    isBreweryWizardOpen,
    openGeneralWizard,
    closeGeneralWizard,
    openBreweryWizard,
    closeBreweryWizard,
  } = useOnboardingWizard();

  // Auto-open general wizard for new users (after 1s delay)
  // TEMPORARILY DISABLED - Remove comments below to re-enable
  /*
  useEffect(() => {
    const hasCompletedOnboarding = user?.preferences?.generalOnboardingCompleted;
    if (!hasCompletedOnboarding && user?.id) {
      const timer = setTimeout(() => {
        openGeneralWizard();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.preferences?.generalOnboardingCompleted, openGeneralWizard]);
  */

  return (
    <>
      {isGeneralWizardOpen && (
        <GeneralOnboardingWizard
          onComplete={closeGeneralWizard}
          onOpenBreweryWizard={openBreweryWizard}
        />
      )}
      {isBreweryWizardOpen && (
        <BreweryOnboardingWizard
          isSequential={true}
          onComplete={closeBreweryWizard}
        />
      )}
    </>
  );
}

function AppContent() {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const { openResults } = useResultsPanel();
  const [runs, setRuns] = useState<RunItem[]>(DEMO_RUNS);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const prevUserIdRef = useRef<string>(user.id);
  
  const [defaultCountry, setDefaultCountry] = useState<string>(() => {
    // V1: Default to GB (United Kingdom) instead of US
    const stored = localStorage.getItem('defaultCountry') || 'GB';
    console.log(`🌍 Initializing default country: ${stored}`);
    return stored;
  });
  
  // Clear React Query cache when user changes
  useEffect(() => {
    if (prevUserIdRef.current !== user.id && prevUserIdRef.current !== "temp-demo-user") {
      console.log(`🧹 USER CHANGED: Clearing React Query cache (${prevUserIdRef.current} → ${user.id})`);
      queryClient.clear();
      // Also clear local state
      setRuns([]);
      setConversations([]);
    }
    prevUserIdRef.current = user.id;
  }, [user.id]);
  
  // Update defaultCountry when user changes (e.g., after session validation)
  useEffect(() => {
    const storedCountry = localStorage.getItem('defaultCountry');
    if (storedCountry) {
      console.log(`🌍 Loading default country from localStorage: ${storedCountry}`);
      setDefaultCountry(storedCountry);
    }
  }, [user.id]); // Only re-run when user changes (removed defaultCountry to prevent loop)
  
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem('theme') as "light" | "dark") || "light";
  });
  const [searchParams, setSearchParams] = useState(window.location.search);

  const systemMessageInjectorRef = useRef<((msg: string, asUser?: boolean) => void) | null>(null);
  const addRunCallbackRef = useRef<((run: Partial<RunItem>) => string) | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const newChatCallbackRef = useRef<(() => void) | null>(null);
  const loadConversationCallbackRef = useRef<((conversationId: string) => void) | null>(null);

  // Fetch conversations
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await authedFetch(`/api/conversations/${user.id}`);
        if (response.ok) {
          const data = await response.json();
          setConversations(data);
        }
      } catch (error) {
        console.error("Failed to fetch conversations:", error);
      }
    };

    // Regenerate labels on first load (one-time)
    const regenerateLabels = async () => {
      try {
        const response = await authedFetch("/api/conversations/regenerate-labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id })
        });
        if (response.ok) {
          const data = await response.json();
          console.log(`📝 Regenerated ${data.updated} conversation labels`);
        } else if (response.status === 401) {
          // Silently ignore auth errors - user needs to authenticate
          return;
        }
      } catch (error) {
        console.error("Failed to regenerate labels:", error);
      }
    };

    // Only regenerate once per user
    const hasRegenerated = sessionStorage.getItem(`labelsRegenerated_${user.id}`);
    if (!hasRegenerated) {
      regenerateLabels().then(() => {
        sessionStorage.setItem(`labelsRegenerated_${user.id}`, "true");
        fetchConversations();
      });
    } else {
      fetchConversations();
    }
    
    // Refresh conversations every 10 seconds
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Poll for deep research runs
  useEffect(() => {
    const fetchDeepResearchRuns = async () => {
      try {
        const response = await authedFetch(`/api/deep-research?userId=${encodeURIComponent(user.id)}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const researchRuns = data.runs || [];
          
          // Convert research runs to RunItem format
          const convertedRuns: RunItem[] = researchRuns.map((r: any) => ({
            id: r.id,
            label: r.label,
            startedAt: new Date(r.createdAt).toISOString(),
            finishedAt: r.status === "completed" || r.status === "failed" ? new Date(r.updatedAt).toISOString() : null,
            status: r.status,
            runType: "deep_research" as const,
            outputPreview: r.outputPreview,
          }));
          
          // Merge with existing runs (keep business runs, replace research runs)
          setRuns((prev) => {
            const businessRuns = prev.filter((r) => r.runType !== "deep_research");
            return [...convertedRuns, ...businessRuns];
          });
        } else if (response.status === 401) {
          // Silently ignore auth errors - user needs to authenticate
          return;
        }
      } catch (error) {
        console.error("Failed to fetch deep research runs:", error);
      }
    };

    // Initial fetch
    fetchDeepResearchRuns();

    // Poll every 5 seconds
    const interval = setInterval(fetchDeepResearchRuns, 5000);

    return () => clearInterval(interval);
  }, [user.id]);

  useEffect(() => {
    localStorage.setItem('defaultCountry', defaultCountry);
  }, [defaultCountry]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Update search params when location changes
  useEffect(() => {
    setSearchParams(window.location.search);
  }, [location]);

  // No longer using URL parameters for navigation - using direct callbacks instead

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "3rem",
  };

  const getActiveRunId = useCallback(() => activeRunIdRef.current, []);

  const handleInjectSystemMessage = useCallback((fn: (msg: string, asUser?: boolean) => void) => {
    systemMessageInjectorRef.current = fn;
  }, []);

  const handleNewChat = useCallback((fn: () => void) => {
    newChatCallbackRef.current = fn;
  }, []);

  const handleLoadConversation = useCallback((fn: (conversationId: string) => void) => {
    loadConversationCallbackRef.current = fn;
  }, []);

  const handleSelectConversation = useCallback((conversationId: string) => {
    // Navigate to home page first, then trigger load conversation
    setLocation('/');
    // Use setTimeout to ensure we're on the home page before loading conversation
    setTimeout(() => {
      if (loadConversationCallbackRef.current) {
        console.log("🔗 Loading conversation:", conversationId);
        loadConversationCallbackRef.current(conversationId);
      }
    }, 100);
  }, [setLocation]);

  const handleNewChatClick = useCallback(() => {
    // Navigate to home page first, then trigger new chat
    setLocation('/');
    // Use setTimeout to ensure we're on the home page before triggering new chat
    setTimeout(() => {
      if (newChatCallbackRef.current) {
        newChatCallbackRef.current();
      }
    }, 100);
  }, [setLocation]);

  const addRun = useCallback((runData: Partial<RunItem>): string => {
    const newId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const newRun: RunItem = {
      id: newId,
      label: runData.label || "New run",
      startedAt: new Date().toISOString(),
      status: runData.status || "running",
      businessType: runData.businessType,
      location: runData.location,
      country: runData.country,
      targetPosition: runData.targetPosition,
      uniqueId: runData.uniqueId,
      ...runData,
    };
    
    setRuns(prev => [newRun, ...prev]);
    console.log("Added new run to history:", newRun);
    return newId;
  }, []);

  const updateRun = useCallback((runId: string, updates: Partial<RunItem>) => {
    console.log("updateRun called for:", runId, "with updates:", updates);
    setRuns(prev => {
      const updated = prev.map(r => {
        if (r.id === runId) {
          console.log("Found run to update:", r.id, "Current status:", r.status, "New status:", updates.status);
          return { ...r, ...updates };
        }
        return r;
      });
      console.log("Updated runs state");
      return updated;
    });
    
    // Clear the active run ID after updating
    activeRunIdRef.current = null;
    console.log("Cleared activeRunIdRef");
  }, []);

  const handleRunRun = (run: RunItem) => {
    if (!systemMessageInjectorRef.current) {
      console.error("Send message function not ready");
      return;
    }

    // Store the run ID so we can update it when the batch completes
    activeRunIdRef.current = run.id;
    console.log("Starting run for ID:", run.id, "with uniqueId:", run.uniqueId);

    // Send the search query to the AI - it will generate the preview via tool calling
    const message = `${run.targetPosition || "Contact"} @ ${run.businessType || "businesses"} in ${run.location || "location"}, ${run.country || "country"}`;

    systemMessageInjectorRef.current(message);
  };

  const handleSelectRun = async (id: string) => {
    const run = runs.find(r => r.id === id);
    if (!run) {
      console.log("Run not found:", id);
      return;
    }

    // Handle deep research runs - fetch and display output in ResultsPanel
    if (run.runType === "deep_research") {
      try {
        console.log(`📊 Fetching deep research: ${id}`);
        const response = await authedFetch(`/api/deep-research/${id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch research output");
        }
        const data = await response.json();
        console.log(`📊 Received data:`, {
          hasRun: !!data.run,
          status: data.run?.status,
          outputTextLength: data.run?.outputText?.length || 0,
          outputTextPreview: data.run?.outputText?.substring(0, 100) || '(none)'
        });

        const output = data.run?.outputText || "Research in progress...";

        // Open results in the right panel
        openResults('deep_research', {
          run: {
            id: run.id,
            label: run.label,
            status: run.status,
            outputText: output,
          },
          topic: run.label,
          outputText: output,
        }, run.label);

        console.log(`✅ Opened deep research in ResultsPanel: ${run.label}, output length: ${output.length}`);
      } catch (error) {
        console.error("Failed to display research output:", error);
        // Still open the panel with error state
        openResults('deep_research', {
          run: {
            id: run.id,
            label: run.label,
            status: run.status,
          },
          topic: run.label,
          error: 'Failed to load research results',
        }, run.label);
      }
      return;
    }

    // For other runs, just log
    console.log("Selected run:", id);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <CapabilitiesProvider>
        <PlanProvider>
          <PlanExecutionProvider>
            <TooltipProvider>
              <LayoutSwitcher
                defaultCountry={defaultCountry}
                setDefaultCountry={setDefaultCountry}
                runs={runs}
                conversations={conversations}
                handleSelectRun={handleSelectRun}
                handleSelectConversation={handleSelectConversation}
                handleRunRun={handleRunRun}
                handleNewChatClick={handleNewChatClick}
                newChatCallbackRef={newChatCallbackRef}
                theme={theme}
                toggleTheme={toggleTheme}
                handleInjectSystemMessage={handleInjectSystemMessage}
                addRun={addRun}
                updateRun={updateRun}
                getActiveRunId={getActiveRunId}
                handleNewChat={handleNewChat}
                handleLoadConversation={handleLoadConversation}
                style={style}
              />
              <Toaster />
              <OnboardingWizards />
            </TooltipProvider>
          </PlanExecutionProvider>
        </PlanProvider>
      </CapabilitiesProvider>
    </QueryClientProvider>
  );
}

/**
 * LayoutSwitcher - Switches between Agent-First and Classic layouts
 * based on the feature flag in AgentFirstContext
 */
function LayoutSwitcher(props: any) {
  const { isAgentFirstEnabled } = useAgentFirst();
  
  if (isAgentFirstEnabled) {
    // Use the new Agent-First split-screen layout
    return (
      <>
        <AgentFirstAppLayout
          defaultCountry={props.defaultCountry}
          setDefaultCountry={props.setDefaultCountry}
          runs={props.runs}
          conversations={props.conversations}
          handleSelectRun={props.handleSelectRun}
          handleSelectConversation={props.handleSelectConversation}
          handleRunRun={props.handleRunRun}
          handleNewChatClick={props.handleNewChatClick}
          theme={props.theme}
          toggleTheme={props.toggleTheme}
          handleInjectSystemMessage={props.handleInjectSystemMessage}
          addRun={props.addRun}
          updateRun={props.updateRun}
          getActiveRunId={props.getActiveRunId}
          handleNewChat={props.handleNewChat}
          handleLoadConversation={props.handleLoadConversation}
        />
        <LayoutToggle />
      </>
    );
  }

  // Use the classic sidebar + main content layout
  return (
    <>
      <SidebarProvider style={props.style as React.CSSProperties}>
        <AppLayout
          defaultCountry={props.defaultCountry}
          setDefaultCountry={props.setDefaultCountry}
          runs={props.runs}
          conversations={props.conversations}
          handleSelectRun={props.handleSelectRun}
          handleSelectConversation={props.handleSelectConversation}
          handleRunRun={props.handleRunRun}
          handleNewChatClick={props.handleNewChatClick}
          newChatCallbackRef={props.newChatCallbackRef}
          theme={props.theme}
          toggleTheme={props.toggleTheme}
          handleInjectSystemMessage={props.handleInjectSystemMessage}
          addRun={props.addRun}
          updateRun={props.updateRun}
          getActiveRunId={props.getActiveRunId}
          handleNewChat={props.handleNewChat}
          handleLoadConversation={props.handleLoadConversation}
        />
        <CountryHint />
      </SidebarProvider>
      <LayoutToggle />
    </>
  );
}

/**
 * Wrapper component that connects AgentStatusBadge to context
 */
function AgentStatusBadgeWrapper() {
  const { status } = useAgentStatus();
  return <AgentStatusBadge status={status} className="mr-2" />;
}

/**
 * Dev info badge showing user ID and workspace ID for debugging
 */
function DevInfoBadge() {
  const { user } = useUser();
  
  // Only show in development
  if (import.meta.env.PROD) return null;
  
  // Parse numeric workspace ID (falls back to 1 for UUIDs in dev)
  const numericId = parseInt(user.id);
  const workspaceId = isNaN(numericId) ? 1 : numericId;
  const isUuid = isNaN(parseInt(user.id));
  
  return (
    <div 
      className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-[10px] font-mono mr-2"
      title={`User ID: ${user.id}\nWorkspace ID: ${workspaceId}${isUuid ? ' (UUID → 1)' : ''}`}
    >
      <span className="opacity-70">WS:</span>
      <span className="font-semibold">{workspaceId}</span>
      {isUuid && <span className="opacity-50">(dev)</span>}
    </div>
  );
}

/**
 * Right Panel Content - Shows ResultsPanel when active, otherwise MostRecentRunPanel
 * Conditionally renders based on results context
 */
function RightPanelContent() {
  const { isOpen, currentResult } = useResultsPanel();
  
  // If results panel is open, show it
  if (isOpen && currentResult) {
    return (
      <div className="h-full">
        <ResultsPanel />
      </div>
    );
  }
  
  // Otherwise show the default run/progress panels
  // NOTE: PlanApprovalPanel removed per user request - only Live Activity + Stop button
  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto h-full">
      <LiveActivityPanel />
    </div>
  );
}

/**
 * Agent-First App Layout - The new split-screen layout
 * Desktop: Left panel (40%) = Chat, Right panel (60%) = Workspace
 * Mobile: Full-screen agent chat with bottom nav
 */
function AgentFirstAppLayout({
  defaultCountry,
  setDefaultCountry,
  runs,
  conversations,
  handleSelectRun,
  handleSelectConversation,
  handleRunRun,
  handleNewChatClick,
  theme,
  toggleTheme,
  handleInjectSystemMessage,
  addRun,
  updateRun,
  getActiveRunId,
  handleNewChat,
  handleLoadConversation
}: any) {
  const isMobile = useIsMobile();

  // For mobile, use the mobile layout
  if (isMobile) {
    return (
      <>
        <div className="h-screen w-full overflow-hidden">
          <MobileAgentLayout>
            <AgentFirstRouter
              defaultCountry={defaultCountry}
              onInjectSystemMessage={handleInjectSystemMessage}
              addRunFn={addRun}
              updateRunFn={updateRun}
              getActiveRunId={getActiveRunId}
              onNewChat={handleNewChat}
              onLoadConversation={handleLoadConversation}
            />
          </MobileAgentLayout>
        </div>
        {/* Fixed position badges - don't affect layout */}
        <DevBanner />
        <DemoModeBanner />
      </>
    );
  }

  // For desktop, use the split layout with chat on left and workspace on right
  return (
    <>
      <div className="h-screen w-full overflow-hidden">
        <DesktopSplitLayout
          leftPanel={
            /* Left panel: Direct Claude API chat with tool support */
            <AgentChatPanel 
              defaultCountry={defaultCountry}
            />
          }
        >
          {/* Right panel content - routes */}
          <div className="h-full overflow-y-auto">
            <AgentFirstRouter
              defaultCountry={defaultCountry}
              onInjectSystemMessage={handleInjectSystemMessage}
              addRunFn={addRun}
              updateRunFn={updateRun}
              getActiveRunId={getActiveRunId}
              onNewChat={handleNewChat}
              onLoadConversation={handleLoadConversation}
            />
          </div>
        </DesktopSplitLayout>
      </div>
      {/* Fixed position badges - don't affect layout */}
      <DevBanner />
      <DemoModeBanner />
    </>
  );
}

function AppLayout({
  defaultCountry,
  setDefaultCountry,
  runs,
  conversations,
  handleSelectRun,
  handleSelectConversation,
  handleRunRun,
  handleNewChatClick,
  newChatCallbackRef,
  theme,
  toggleTheme,
  handleInjectSystemMessage,
  addRun,
  updateRun,
  getActiveRunId,
  handleNewChat,
  handleLoadConversation
}: any) {
  const { state } = useSidebar();
  const [userMenuMargin, setUserMenuMargin] = useState('0px');
  const [showNewTabButton, setShowNewTabButton] = useState(false);

  useEffect(() => {
    const updateMargin = () => {
      const width = window.innerWidth;
      if (width >= 500 && width < 925) {
        setUserMenuMargin('80px');
        setShowNewTabButton(true);
      } else {
        setUserMenuMargin('0px');
        setShowNewTabButton(false);
      }
    };

    updateMargin();
    window.addEventListener('resize', updateMargin);
    return () => window.removeEventListener('resize', updateMargin);
  }, []);

  const handleOpenInNewTab = () => {
    // Get current conversation ID from localStorage
    const currentConversationId = localStorage.getItem('currentConversationId');
    
    // Build URL with conversation parameter if available
    const baseUrl = window.location.origin + window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    if (currentConversationId) {
      params.set('conversation', currentConversationId);
    }
    
    const newUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    window.open(newUrl, '_blank');
  };

  return (
    <>
      <div className="flex flex-col h-screen w-full overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
        <AppSidebar 
        defaultCountry={defaultCountry} 
        onCountryChange={setDefaultCountry}
        runs={runs}
        conversations={conversations}
        onSelectRun={handleSelectRun}
        onSelectConversation={handleSelectConversation}
        onRetryRun={(id: string) => console.log("Retry run:", id)}
        onDuplicateRun={(id: string, newId: string) => console.log("Duplicate run:", id, "→", newId)}
        onStopRun={(id: string) => console.log("Stop run:", id)}
        onArchiveRun={(id: string, archived: boolean) => console.log("Archive run:", id, archived)}
        onRunRun={handleRunRun}
        onNewChat={handleNewChatClick}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="relative flex items-center py-2 border-b gap-2">
          <SidebarTrigger data-testid="button-sidebar-toggle" className="hidden sidebar:flex" />
          
          {/* Mobile: toggle + country selector centered */}
          <div 
            className="sidebar:hidden absolute flex items-center gap-1.5 max-w-[50%]"
            style={{
              left: 'calc(50% - 20px)',
              transform: 'translateX(-50%)'
            }}
          >
            <SidebarTrigger 
              data-testid="button-sidebar-toggle-mobile" 
              className={state === "expanded" ? "font-bold" : "font-normal"}
            />
            <HeaderCountrySelector 
              defaultCountry={defaultCountry} 
              onCountryChange={setDefaultCountry} 
            />
          </div>
          
          <div 
            className="flex items-center gap-0.5 sidebar:gap-1 ml-auto"
            style={{ marginRight: userMenuMargin }}
          >
            <VerticalIndicator />
            <XeroStatusBadge className="mr-1" />
            <DevInfoBadge />
            <AgentStatusBadgeWrapper />
            <LoginDialog />
            {showNewTabButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleOpenInNewTab}
                data-testid="button-open-new-tab"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              className="hidden sidebar:flex"
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-hidden flex">
          <div className="flex-1 min-w-0" data-tour-id="chat">
            <Router 
              defaultCountry={defaultCountry} 
              onInjectSystemMessage={handleInjectSystemMessage}
              addRunFn={addRun}
              updateRunFn={updateRun}
              getActiveRunId={getActiveRunId}
              onNewChat={handleNewChat}
              onLoadConversation={handleLoadConversation}
            />
          </div>
          <div className="hidden lg:flex w-80 border-l flex-col overflow-hidden" data-tour-id="actions">
            <RightPanelContent />
          </div>
        </main>
        </div>
      </div>
    </div>
      {/* Fixed position badges - don't affect layout */}
      <DevBanner />
      <DemoModeBanner />
    </>
  );
}

function App() {
  return (
    <UserProvider>
      <VerticalProvider>
        <DemoModeProvider>
          <OnboardingWizardProvider>
            <OnboardingTourProvider>
              <SidebarFlashProvider>
                <AgentStatusProvider>
                  <ResultsPanelProvider>
                    <AgentFirstProvider>
                      <AppContent />
                      <OnboardingTour />
                    </AgentFirstProvider>
                  </ResultsPanelProvider>
                </AgentStatusProvider>
              </SidebarFlashProvider>
            </OnboardingTourProvider>
          </OnboardingWizardProvider>
        </DemoModeProvider>
      </VerticalProvider>
    </UserProvider>
  );
}

export default App;
