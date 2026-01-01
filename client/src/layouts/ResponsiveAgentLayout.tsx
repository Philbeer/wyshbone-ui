/**
 * ResponsiveAgentLayout - Automatically switches between desktop and mobile layouts
 * 
 * Desktop (>768px): Split-screen with agent chat + workspace
 * Mobile (<=768px): Full-screen agent-first with bottom nav
 */

import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopSplitLayout } from "./DesktopSplitLayout";
import { MobileAgentLayout } from "./MobileAgentLayout";

interface ResponsiveAgentLayoutProps {
  children: ReactNode;
  onSendMessage?: (message: string) => void;
}

export function ResponsiveAgentLayout({ 
  children, 
  onSendMessage 
}: ResponsiveAgentLayoutProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileAgentLayout>
        {children}
      </MobileAgentLayout>
    );
  }

  return (
    <DesktopSplitLayout onSendMessage={onSendMessage}>
      {children}
    </DesktopSplitLayout>
  );
}

export default ResponsiveAgentLayout;


