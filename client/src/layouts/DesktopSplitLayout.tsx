/**
 * DesktopSplitLayout - Desktop split-screen layout (Agent First Architecture)
 * 
 * Left Panel (40%): Agent chat interface - always visible
 * Right Panel (60%): Workspace content (changes based on route)
 * 
 * This uses wouter's nested routing pattern.
 */

import { ReactNode } from "react";

interface DesktopSplitLayoutProps {
  children: ReactNode;
  leftPanel: ReactNode;
}

export function DesktopSplitLayout({ 
  children, 
  leftPanel
}: DesktopSplitLayoutProps) {
  return (
    <div className="desktop-split-layout h-full flex overflow-hidden">
      {/* Left Panel - Agent Chat (Fixed 40%) */}
      <div className="left-panel w-2/5 min-w-[320px] max-w-[500px] border-r border-border flex flex-col bg-sidebar overflow-hidden">
        {leftPanel}
      </div>
      
      {/* Right Panel - Workspace (Dynamic 60%) */}
      <div className="right-panel flex-1 min-w-0 flex flex-col bg-background overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export default DesktopSplitLayout;

