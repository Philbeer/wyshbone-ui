/**
 * UI-20: Demo Mode Banner
 * 
 * Displays a small badge when demo mode is active.
 * Fixed positioned at bottom-right to avoid affecting main layout.
 */

import { X, FlaskConical, ChevronUp, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDemoModeContext } from '@/contexts/DemoModeContext';
import { cn } from '@/lib/utils';

export function DemoModeBanner() {
  const { demoMode, disableDemoMode } = useDemoModeContext();
  const [expanded, setExpanded] = useState(false);

  if (!demoMode) {
    return null;
  }

  return (
    <>
      <div 
        className={cn(
          "fixed top-0 left-0 right-0 z-50",
          "bg-red-600 text-white text-center py-1.5 text-sm font-bold tracking-wide shadow-lg"
        )}
      >
        DEMO DATA — This is not real customer data
      </div>
      <div 
        className={cn(
          "fixed bottom-4 right-20 z-40 transition-all duration-200",
          "rounded-lg shadow-lg border backdrop-blur-sm",
          "bg-amber-50/95 border-amber-300"
        )}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-800"
        >
          <FlaskConical className="h-3 w-3 text-amber-600" />
          <span>Demo Mode Active</span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 opacity-50" />
          ) : (
            <ChevronUp className="h-3 w-3 opacity-50" />
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-2 pt-1 border-t border-amber-200 text-xs">
            <p className="text-amber-700 mb-2 text-[10px]">
              Exploring with sample brewery data.
              <br />
              Nothing here is real customer data.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                disableDemoMode();
              }}
              className="h-6 px-2 w-full justify-center bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px]"
            >
              <X className="h-3 w-3 mr-1" />
              Exit Demo
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
