/**
 * MobileAgentLayout - Mobile-first agent-centric layout
 * 
 * Main view: Agent chat (full screen)
 * Bottom navigation for key sections
 * CRM accessible but simplified
 */

import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, Activity, Briefcase, Settings } from "lucide-react";
import { AgentStatusBadge } from "@/components/AgentStatusBadge";
import { useAgentStatus } from "@/contexts/AgentStatusContext";
import { cn } from "@/lib/utils";
import wyshboneLogo from "@assets/wyshbone-logo_1759667581806.png";

interface MobileAgentLayoutProps {
  children: ReactNode;
}

export function MobileAgentLayout({ children }: MobileAgentLayoutProps) {
  const [location] = useLocation();
  const { status } = useAgentStatus();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/crm-preview", icon: Briefcase, label: "CRM" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="mobile-agent-layout h-full flex flex-col">
      {/* Mobile Header */}
      <header className="mobile-header flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20">
            <img src={wyshboneLogo} alt="Wyshbone" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Wyshbone Agent</h1>
          </div>
        </div>
        <AgentStatusBadge status={status} />
      </header>

      {/* Main Content */}
      <main className="mobile-content flex-1 overflow-hidden">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="mobile-nav bg-card border-t border-border flex justify-around p-2 safe-area-inset-bottom">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = location === href || 
            (href === "/" && location === "/");
          
          return (
            <Link key={href} href={href}>
              <button
                className={cn(
                  "nav-item flex flex-col items-center p-2 rounded-lg transition-colors",
                  isActive 
                    ? "text-primary bg-primary/10" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{label}</span>
              </button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default MobileAgentLayout;

