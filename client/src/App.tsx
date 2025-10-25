import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
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
import { useState, useEffect, useRef } from "react";

// Demo runs data
const DEMO_RUNS: RunItem[] = [
  {
    id: "run_1",
    label: "Coffee shops in Brooklyn - Owner, Manager",
    startedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    status: "completed",
    externalUrl: "https://wyshbone.bubbleapps.io",
    businessType: "Coffee shops",
    location: "Brooklyn",
    country: "US",
    targetPosition: "Owner, Manager",
    uniqueId: "abcd1234efgh5678ijkl",
  },
  {
    id: "run_2",
    label: "Gyms in Toronto - Operations Manager",
    startedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    status: "running",
    businessType: "Gyms",
    location: "Toronto",
    country: "CA",
    targetPosition: "Operations Manager",
    uniqueId: "xyz9876mnop5432qrst",
  },
  {
    id: "run_3",
    label: "Tech startups in San Francisco - CTO, CEO",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    status: "completed",
    archived: true,
    externalUrl: "https://wyshbone.bubbleapps.io",
    businessType: "Tech startups",
    location: "San Francisco",
    country: "US",
    targetPosition: "CTO, CEO",
    uniqueId: "uvwx9012stuv3456yzab",
  },
];

function Router({ 
  defaultCountry, 
  onInjectSystemMessage,
  onAddRun,
  onUpdateRun,
  getActiveRunId,
  onNewChat
}: { 
  defaultCountry: string;
  onInjectSystemMessage: (fn: (msg: string, asUser?: boolean) => void) => void;
  onAddRun: () => (run: Partial<RunItem>) => string;
  onUpdateRun: () => (runId: string, updates: Partial<RunItem>) => void;
  getActiveRunId: () => string | null;
  onNewChat: (fn: () => void) => void;
}) {
  return (
    <Switch>
      <Route path="/">
        {() => <ChatPage 
          defaultCountry={defaultCountry} 
          onInjectSystemMessage={onInjectSystemMessage} 
          addRun={onAddRun()} 
          updateRun={onUpdateRun()}
          getActiveRunId={getActiveRunId}
          onNewChat={onNewChat}
        />}
      </Route>
      <Route path="/debug" component={DebugPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [runs, setRuns] = useState<RunItem[]>(DEMO_RUNS);
  
  const [defaultCountry, setDefaultCountry] = useState<string>(() => {
    return localStorage.getItem('defaultCountry') || 'US';
  });
  
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem('theme') as "light" | "dark") || "light";
  });

  const systemMessageInjectorRef = useRef<((msg: string, asUser?: boolean) => void) | null>(null);
  const addRunCallbackRef = useRef<((run: Partial<RunItem>) => string) | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const newChatCallbackRef = useRef<(() => void) | null>(null);

  // Poll for deep research runs
  useEffect(() => {
    const fetchDeepResearchRuns = async () => {
      try {
        const response = await fetch("/api/deep-research", {
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
  }, []);

  useEffect(() => {
    localStorage.setItem('defaultCountry', defaultCountry);
  }, [defaultCountry]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "light" ? "dark" : "light");
  };

  const style = {
    "--sidebar-width": "20rem",
    "--sidebar-width-icon": "3rem",
  };

  const addRun = (runData: Partial<RunItem>): string => {
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
  };

  const updateRun = (runId: string, updates: Partial<RunItem>) => {
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
  };

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
        const response = await fetch(`/api/deep-research/${id}`);
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
              onSelectRun={handleSelectRun}
              onRetryRun={(id) => console.log("Retry run:", id)}
              onDuplicateRun={(id, newId) => console.log("Duplicate run:", id, "→", newId)}
              onStopRun={(id) => console.log("Stop run:", id)}
              onArchiveRun={(id, archived) => console.log("Archive run:", id, archived)}
              onRunRun={handleRunRun}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => newChatCallbackRef.current?.()}
                    data-testid="button-new-chat"
                    title="Start new chat"
                  >
                    <FilePlus className="h-5 w-5" />
                  </Button>
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
                  onInjectSystemMessage={(fn: (msg: string) => void) => {
                    systemMessageInjectorRef.current = fn;
                  }}
                  onAddRun={() => {
                    // Pass the addRun function to chat page
                    return addRun;
                  }}
                  onUpdateRun={() => {
                    // Pass the updateRun function to chat page
                    return updateRun;
                  }}
                  getActiveRunId={() => activeRunIdRef.current}
                  onNewChat={(fn: () => void) => {
                    newChatCallbackRef.current = fn;
                  }}
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

export default App;
