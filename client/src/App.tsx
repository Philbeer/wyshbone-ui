import { Switch, Route, useLocation } from "wouter";
import { queryClient, authedFetch } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar, type RunItem } from "@/components/app-sidebar";
import { HeaderCountrySelector } from "@/components/HeaderCountrySelector";
import { Moon, Sun, FilePlus, ExternalLink, Play, FileText, Loader2, Copy, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { addDevAuthParams, buildApiUrl } from "@/lib/queryClient";
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
import { isDemoMode } from "@/hooks/useDemoMode";
import { DevBanner } from "@/components/DevBanner";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { LiveActivityPanel } from "@/components/live-activity-panel";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { XeroStatusBadge } from "@/components/XeroStatusBadge";
// Results Panel imports
import { ResultsPanelProvider, useResultsPanel } from "@/contexts/ResultsPanelContext";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { CurrentRequestProvider, useCurrentRequest } from "@/contexts/CurrentRequestContext";
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
import AfrPage from "@/pages/dev/afr";
import LearningPage from "@/pages/learning";
import RunTracePage from "@/pages/dev/run-trace";
import InjectionMouldingPage from "@/pages/dev/injection-moulding";
import QaTestRunnerPage from "@/pages/dev/qa-test-runner";
import QaProgressPage from "@/pages/dev/qa-progress";
import WorkflowPage from "@/pages/workflow";
import { LayoutToggle } from "@/components/LayoutToggle";
import { GoogleQueryModeToggle } from "@/components/GoogleQueryModeToggle";
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
      {/* Default home shows chat - consistent with classic layout */}
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
      
      {/* Activity page */}
      <Route path="/activity" component={AgentWorkspace} />
      
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
      <Route path="/dev/afr" component={AfrPage} />
      <Route path="/dev/qa" component={QaTestRunnerPage} />
      <Route path="/dev/qa-progress" component={QaProgressPage} />
      <Route path="/dev/run-trace" component={RunTracePage} />
      <Route path="/dev/injection-moulding" component={InjectionMouldingPage} />
      <Route path="/admin/database-maintenance" component={DatabaseMaintenance} />
      <Route path="/admin/users" component={UserManagementPage} />

      {/* Learning Dashboard */}
      <Route path="/learning" component={LearningPage} />

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
      <Route path="/dev/afr" component={AfrPage} />
      <Route path="/dev/qa" component={QaTestRunnerPage} />
      <Route path="/dev/qa-progress" component={QaProgressPage} />
      <Route path="/dev/run-trace" component={RunTracePage} />
      <Route path="/dev/injection-moulding" component={InjectionMouldingPage} />
      <Route path="/admin/database-maintenance" component={DatabaseMaintenance} />
      <Route path="/admin/users" component={UserManagementPage} />
      <Route path="/settings/users" component={UserManagementPage} />
      <Route path="/settings/team" component={TeamPage} />
      <Route path="/learning" component={LearningPage} />
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
function TowerChatModeBadge() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('TOWER_LOOP_CHAT_MODE') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    const handler = (e: Event) => setOn((e as CustomEvent).detail === true);
    window.addEventListener('tower-chat-mode-changed', handler);
    return () => window.removeEventListener('tower-chat-mode-changed', handler);
  }, []);
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200 select-none" title="Tower Loop Chat Mode is active">
      Tower
    </span>
  );
}

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
  const { currentClientRequestId, setCurrentClientRequestId, pinnedClientRequestId, setPinnedClientRequestId, lastCompletedClientRequestId, recentRuns, setUserPinned } = useCurrentRequest();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoStatus, setDemoStatus] = useState<string | null>(null);

  const [proofLoading, setProofLoading] = useState(false);
  const [proofV2Loading, setProofV2Loading] = useState(false);
  const [proofV2Ids, setProofV2Ids] = useState<{ crid: string; runId: string } | null>(null);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainReport, setExplainReport] = useState<string | null>(null);
  const [explainRunId, setExplainRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resolvedId = pinnedClientRequestId ?? currentClientRequestId ?? lastCompletedClientRequestId;

  const handleExplainRun = useCallback(async () => {
    setExplainOpen(true);
    setExplainLoading(true);
    setExplainError(null);
    setExplainReport(null);
    setExplainRunId(null);
    setCopied(false);
    try {
      const body: Record<string, string> = {};
      if (resolvedId) {
        body.client_request_id = resolvedId;
      } else {
        body.latest = "true";
      }
      const url = addDevAuthParams(buildApiUrl("/api/dev/explain-run"));
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `Server responded ${res.status}`);
      }
      const data = await res.json();
      setExplainRunId(data.runId || null);
      setExplainReport(data.report_markdown || "No report generated.");
    } catch (err: any) {
      setExplainError(err.message || "Failed to generate explanation");
    } finally {
      setExplainLoading(false);
    }
  }, [resolvedId]);

  const handleCopy = useCallback(() => {
    if (!explainReport) return;
    navigator.clipboard.writeText(explainReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [explainReport]);

  async function handleRunSupervisorDemo() {
    setDemoLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/debug/demo-plan-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Following ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleProofTowerLoop() {
    setProofLoading(true);
    setDemoStatus(null);
    try {
      const res = await fetch("/api/proof/tower-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Proof run: ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setProofLoading(false);
    }
  }

  async function handleProofTowerLoopV2() {
    setProofV2Loading(true);
    setDemoStatus(null);
    setProofV2Ids(null);
    try {
      const res = await fetch("/api/proof/tower-loop-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded ${res.status}`);
      }
      const data = await res.json();
      const id = data.clientRequestId;
      if (!id) throw new Error("No clientRequestId in response");
      setProofV2Ids({ crid: id, runId: data.runId });
      setCurrentClientRequestId(id);
      setPinnedClientRequestId(id);
      setDemoStatus(`Proof v2 run: ${id.slice(0, 8)}…`);
    } catch (err: any) {
      setDemoStatus(`Error: ${err.message}`);
    } finally {
      setProofV2Loading(false);
    }
  }
  
  // If results panel is open, show it
  if (isOpen && currentResult) {
    return (
      <div className="h-full">
        <ResultsPanel />
      </div>
    );
  }
  
  return (
    <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExplainRun}
          disabled={explainLoading}
          title="Generate a plain-English explanation of the last run"
          className="border-2 border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 disabled:opacity-60"
        >
          {explainLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FileText className="w-3 h-3 mr-1" />}
          {explainLoading ? "Explaining…" : "Explain last run"}
        </Button>
      </div>
      {import.meta.env.DEV && isDemoMode() && (
        <>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSupervisorDemo}
              disabled={demoLoading}
            >
              <Play className="w-3 h-3 mr-1" />
              {demoLoading ? "Starting…" : "Run Supervisor Demo"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleProofTowerLoop}
              disabled={proofLoading}
              className="border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300"
            >
              <Play className="w-3 h-3 mr-1" />
              {proofLoading ? "Starting…" : "Proof: Tower Loop"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleProofTowerLoopV2}
              disabled={proofV2Loading}
              className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
            >
              <Play className="w-3 h-3 mr-1" />
              {proofV2Loading ? "Starting…" : "Proof: Tower Loop v2 (REAL)"}
            </Button>
            {demoStatus && (
              <span className="text-xs text-muted-foreground">{demoStatus}</span>
            )}
          </div>
          {proofV2Ids && (
            <div className="text-[10px] font-mono bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1 shrink-0">
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">v2 IDs</span>
              {" "}crid=<span className="select-all">{proofV2Ids.crid}</span>
              {" "}runId=<span className="select-all">{proofV2Ids.runId}</span>
            </div>
          )}
        </>
      )}
      <div className="flex-1 min-h-0 flex flex-col">
        {(() => {
          return <LiveActivityPanel key={resolvedId ?? 'none'} activeClientRequestId={resolvedId} />;
        })()}
      </div>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Run Explanation
              {explainRunId && (
                <span className="text-xs font-mono text-muted-foreground ml-2">
                  {explainRunId.slice(0, 8)}…
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              AI-generated summary of the last agent run
            </DialogDescription>
          </DialogHeader>

          {explainLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <span className="ml-3 text-muted-foreground">Analysing run data…</span>
            </div>
          )}

          {explainError && (
            <div className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 rounded-lg p-4">
              <p className="text-red-700 dark:text-red-300 text-sm">{explainError}</p>
            </div>
          )}

          {explainReport && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {explainReport.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(3)}</h2>;
                  if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{line.slice(2)}</h1>;
                  if (line.startsWith('- **')) {
                    const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
                    if (match) return <p key={i} className="ml-4 my-1"><strong>{match[1]}:</strong> {match[2]}</p>;
                  }
                  if (line.startsWith('- ')) return <p key={i} className="ml-4 my-1">• {line.slice(2)}</p>;
                  if (/^\d+\.\s/.test(line)) return <p key={i} className="ml-4 my-1">{line}</p>;
                  if (line.trim() === '') return <br key={i} />;
                  return <p key={i} className="my-1">{line}</p>;
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
            window.WYSHBONE_DEV_LANE ? (
              <AgentChatPanel 
                defaultCountry={defaultCountry}
              />
            ) : (
              <div className="flex flex-col h-full items-center justify-center p-6 bg-sidebar text-muted-foreground text-center gap-2">
                <span className="text-sm font-medium">Agent Panel (deprecated)</span>
                <span className="text-xs">Enable via console: window.WYSHBONE_DEV_LANE = true</span>
              </div>
            )
          }
        >
          {/* Right panel content - routes */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

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
            <GoogleQueryModeToggle />
            <LayoutToggle variant="inline" />
            {import.meta.env.DEV && <TowerChatModeBadge />}
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
          <div
            className="hidden lg:flex flex-col overflow-hidden border-l transition-all duration-300 ease-in-out"
            style={{ width: rightPanelExpanded ? "20rem" : "2.5rem", flexShrink: 0 }}
            data-tour-id="actions"
          >
            <div className="flex flex-col items-center pt-3 shrink-0">
              <button
                onClick={() => setRightPanelExpanded((v) => !v)}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={rightPanelExpanded ? "Collapse Live Activity" : "Expand Live Activity"}
              >
                {rightPanelExpanded ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
            </div>
            <div
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
              style={{ opacity: rightPanelExpanded ? 1 : 0, pointerEvents: rightPanelExpanded ? "auto" : "none", transition: "opacity 0.2s ease-in-out" }}
            >
              <RightPanelContent />
            </div>
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
                  <CurrentRequestProvider>
                    <ResultsPanelProvider>
                      <AgentFirstProvider>
                        <AppContent />
                        <OnboardingTour />
                      </AgentFirstProvider>
                    </ResultsPanelProvider>
                  </CurrentRequestProvider>
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
