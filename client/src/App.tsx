import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { HeaderCountrySelector } from "@/components/HeaderCountrySelector";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChatPage from "@/pages/chat";
import NotFound from "@/pages/not-found";
import CountryHint from "@/components/CountryHint";
import { useState, useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [defaultCountry, setDefaultCountry] = useState<string>(() => {
    return localStorage.getItem('defaultCountry') || 'GB';
  });
  
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem('theme') as "light" | "dark") || "light";
  });

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
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar defaultCountry={defaultCountry} onCountryChange={setDefaultCountry} />
            <div className="flex flex-col flex-1">
              <header className="relative flex items-center justify-between p-2 border-b gap-2">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                
                {/* Mobile country selector - centered on mobile */}
                <div className="md:hidden absolute left-1/2 -translate-x-1/2">
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
                <Router />
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
