/**
 * UI-20: Demo Mode Banner
 * 
 * Displays a prominent banner when demo mode is active.
 * Includes a button to exit demo mode.
 */

import { X, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDemoModeContext } from '@/contexts/DemoModeContext';

export function DemoModeBanner() {
  const { demoMode, disableDemoMode } = useDemoModeContext();

  if (!demoMode) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4" />
        <span className="font-medium">Demo Mode</span>
        <span className="hidden sm:inline">
          — You're exploring Wyshbone with sample brewery data. Nothing here is real customer data.
        </span>
        <span className="sm:hidden">
          — Sample data only
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={disableDemoMode}
        className="h-6 px-2 hover:bg-amber-600 hover:text-amber-950"
        title="Exit demo mode"
      >
        <X className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">Exit Demo</span>
      </Button>
    </div>
  );
}

