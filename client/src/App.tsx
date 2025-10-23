import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, type RunItem } from "@/components/app-sidebar";
import { HeaderCountrySelector } from "@/components/HeaderCountrySelector";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatPage from "@/pages/chat";
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
  },
];

function Router({ 
  defaultCountry, 
  onInjectSystemMessage 
}: { 
  defaultCountry: string;
  onInjectSystemMessage: (fn: (msg: string) => void) => void;
}) {
  return (
    <Switch>
      <Route path="/">
        {() => <ChatPage defaultCountry={defaultCountry} onInjectSystemMessage={onInjectSystemMessage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [defaultCountry, setDefaultCountry] = useState<string>(() => {
    return localStorage.getItem('defaultCountry') || 'US';
  });
  
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem('theme') as "light" | "dark") || "light";
  });

  const systemMessageInjectorRef = useRef<((msg: string) => void) | null>(null);

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

  const handleRunRun = (run: RunItem) => {
    if (!systemMessageInjectorRef.current) {
      console.error("Send message function not ready");
      return;
    }

    // Send the search query to the AI - it will generate the preview via tool calling
    const message = `${run.targetPosition || "Contact"} @ ${run.businessType || "businesses"} in ${run.location || "location"}, ${run.country || "country"}`;

    systemMessageInjectorRef.current(message);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar 
              defaultCountry={defaultCountry} 
              onCountryChange={setDefaultCountry}
              runs={DEMO_RUNS}
              onSelectRun={(id) => console.log("Selected run:", id)}
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
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  data-testid="button-theme-toggle"
                >
                  {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                </Button>
              </header>
              <main className="flex-1 overflow-hidden">
                <Router 
                  defaultCountry={defaultCountry} 
                  onInjectSystemMessage={(fn: (msg: string) => void) => {
                    systemMessageInjectorRef.current = fn;
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
