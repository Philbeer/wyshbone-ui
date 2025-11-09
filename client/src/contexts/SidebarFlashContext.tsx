import { createContext, useContext, useState, ReactNode } from 'react';

export type SidebarSection = 'emailFinder' | 'scheduledMonitors' | 'deepResearch';

type SidebarFlashContextType = {
  lastTriggerBySection: Map<SidebarSection, number>;
  trigger: (section: SidebarSection) => void;
};

const SidebarFlashContext = createContext<SidebarFlashContextType | undefined>(undefined);

export function SidebarFlashProvider({ children }: { children: ReactNode }) {
  const [lastTriggerBySection, setLastTriggerBySection] = useState<Map<SidebarSection, number>>(
    new Map()
  );

  const trigger = (section: SidebarSection) => {
    setLastTriggerBySection((prev) => {
      const next = new Map(prev);
      next.set(section, Date.now());
      return next;
    });
  };

  return (
    <SidebarFlashContext.Provider value={{ lastTriggerBySection, trigger }}>
      {children}
    </SidebarFlashContext.Provider>
  );
}

export function useSidebarFlash() {
  const context = useContext(SidebarFlashContext);
  if (!context) {
    throw new Error('useSidebarFlash must be used within a SidebarFlashProvider');
  }
  return context;
}
