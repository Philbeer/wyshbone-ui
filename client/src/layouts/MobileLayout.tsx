/**
 * MobileLayout - Mobile-first agent-centric layout
 * 
 * Primary view is the agent chat interface.
 * CRM features are accessible via bottom navigation.
 * Agent status widget always visible at top.
 */

import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Activity, Settings, Briefcase } from "lucide-react";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { useAgentStatus } from "@/contexts/AgentStatusContext";
import { cn } from "@/lib/utils";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";

interface MobileLayoutProps {
  children: ReactNode;
  className?: string;
}

export function MobileLayout({ children, className }: MobileLayoutProps) {
  const [location] = useLocation();
  const { status } = useAgentStatus();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/crm-preview", icon: Briefcase, label: "CRM" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className={cn("flex flex-col h-full w-full bg-background", className)}>
      {/* Mobile Header with Agent Status */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden">
            <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Your AI Agent</h1>
            <p className="text-xs text-muted-foreground">Always working for you</p>
          </div>
        </div>
        <AgentStatusBadge status={status} />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-border bg-card px-2 py-2 safe-area-inset-bottom">
        <div className="flex items-center justify-around">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = location === href || 
              (href === "/" && location === "/") ||
              (href !== "/" && location.startsWith(href));
            
            return (
              <Link key={href} href={href}>
                <button
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors",
                    isActive 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default MobileLayout;


