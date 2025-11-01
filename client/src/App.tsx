import { Switch, Route, useLocation } from "wouter";
import { queryClient, addDevAuthParams } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type RunItem } from "@/components/app-sidebar";
import { HeaderCountrySelector } from "@/components/HeaderCountrySelector";
import { Moon, Sun, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatPage from "@/pages/chat";
import DebugPage from "@/pages/debug";
import NotFound from "@/pages/not-found";
import CountryHint from "@/components/CountryHint";
import { LoginDialog } from "@/components/LoginDialog";
import { useState, useEffect, useRef, useCallback } from "react";
import { UserProvider, useUser } from "@/contexts/UserContext";

// No demo runs - users only see their own data
const DEMO_RUNS: RunItem[] = [];

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
      <Route path="/debug" component={DebugPage} />
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

function AppContent() {
  const { user } = useUser();
  const [location] = useLocation();
  const [runs, setRuns] = useState<RunItem[]>(DEMO_RUNS);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  
  const [defaultCountry, setDefaultCountry] = useState<string>(() => {
    return localStorage.getItem('defaultCountry') || 'US';
  });
  
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
        const response = await fetch(`/api/conversations/${user.id}`);
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
        const response = await fetch("/api/conversations/regenerate-labels", {
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
        const url = addDevAuthParams(`/api/deep-research?userId=${encodeURIComponent(user.id)}`);
        const response = await fetch(url, {
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

  // Handle URL query parameters to load specific conversation
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const conversationParam = params.get('conversation');
    
    if (conversationParam && loadConversationCallbackRef.current) {
      console.log("🔗 Loading conversation from URL:", conversationParam);
      // Load the conversation from URL parameter
      loadConversationCallbackRef.current(conversationParam);
      
      // Clean up the URL parameter (optional - makes URL cleaner)
      window.history.replaceState({}, '', window.location.pathname);
      setSearchParams(''); // Clear search params after loading
    }
  }, [searchParams]); // Re-run when search params change

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
    loadConversationCallbackRef.current?.(conversationId);
  }, []);

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

    // Handle deep research runs - fetch and display output
    if (run.runType === "deep_research" && run.status === "completed") {
      try {
        const url = addDevAuthParams(`/api/deep-research/${id}`);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch research output");
        }
        const data = await response.json();
        const output = data.run?.outputText || "No output available";
        
        // Inject the research output into the chat as assistant message
        if (systemMessageInjectorRef.current) {
          const formattedOutput = `# 📊 ${run.label}\n\n${output}`;
          systemMessageInjectorRef.current(formattedOutput, false);
        }
      } catch (error) {
        console.error("Failed to display research output:", error);
      }
      return;
    }

    // For other runs, just log
    console.log("Selected run:", id);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar 
              defaultCountry={defaultCountry} 
              onCountryChange={setDefaultCountry}
              runs={runs}
              conversations={conversations}
              onSelectRun={handleSelectRun}
              onSelectConversation={handleSelectConversation}
              onRetryRun={(id) => console.log("Retry run:", id)}
              onDuplicateRun={(id, newId) => console.log("Duplicate run:", id, "→", newId)}
              onStopRun={(id) => console.log("Stop run:", id)}
              onArchiveRun={(id, archived) => console.log("Archive run:", id, archived)}
              onRunRun={handleRunRun}
              onNewChat={() => newChatCallbackRef.current?.()}
            />
            <div className="flex flex-col flex-1">
              <header className="relative flex items-center justify-between p-2 border-b gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                
                {/* Mobile country selector - dropdown box centered on mobile */}
                <div 
                  className="md:hidden absolute"
                  style={{
                    left: '50%',
                    transform: 'translateX(calc(-50% - 12px))'
                  }}
                >
                  <HeaderCountrySelector 
                    defaultCountry={defaultCountry} 
                    onCountryChange={setDefaultCountry} 
                  />
                </div>
                
                <div className="flex items-center gap-1">
                  <LoginDialog />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    data-testid="button-theme-toggle"
                  >
                    {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  </Button>
                </div>
              </header>
              <main className="flex-1 overflow-hidden">
                <Router 
                  defaultCountry={defaultCountry} 
                  onInjectSystemMessage={handleInjectSystemMessage}
                  addRunFn={addRun}
                  updateRunFn={updateRun}
                  getActiveRunId={getActiveRunId}
                  onNewChat={handleNewChat}
                  onLoadConversation={handleLoadConversation}
                />
              </main>
            </div>
          </div>
          <CountryHint />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;
