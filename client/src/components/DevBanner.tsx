/**
 * DevBanner - Shows backend connection status in development mode
 * 
 * Only visible in development mode. Shows as a small badge in the bottom-left corner:
 * - Backend URL being used
 * - Connection status (✅ reachable / ❌ unreachable)
 * - Expandable for more details if needed
 */

import { useState, useEffect } from 'react';
import { Server, CheckCircle2, XCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const BACKEND_URL = 'http://localhost:5001';
const isDev = import.meta.env.DEV;

export function DevBanner() {
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const checkBackend = async () => {
    setChecking(true);
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
      });
      setBackendReachable(response.ok);
    } catch {
      setBackendReachable(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!isDev) return;
    
    // Check immediately
    checkBackend();
    
    // Re-check every 10 seconds (less frequent to reduce noise)
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Don't show in production
  if (!isDev) {
    return null;
  }

  // Compact badge in bottom-left corner
  return (
    <div 
      className={cn(
        "fixed bottom-4 left-4 z-40 transition-all duration-200",
        "rounded-lg shadow-lg border backdrop-blur-sm",
        backendReachable === true 
          ? "bg-emerald-50/95 border-emerald-200" 
          : backendReachable === false 
            ? "bg-red-50/95 border-red-300"
            : "bg-slate-100/95 border-slate-200"
      )}
    >
      {/* Collapsed badge view */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-xs font-medium",
          backendReachable === true 
            ? "text-emerald-700" 
            : backendReachable === false 
              ? "text-red-700"
              : "text-slate-600"
        )}
      >
        {backendReachable === null ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
        ) : backendReachable ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        ) : (
          <XCircle className="h-3 w-3 text-red-600" />
        )}
        <span>DEV</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 opacity-50" />
        ) : (
          <ChevronUp className="h-3 w-3 opacity-50" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className={cn(
          "px-3 pb-2 pt-1 border-t text-xs",
          backendReachable === true 
            ? "border-emerald-200" 
            : backendReachable === false 
              ? "border-red-200"
              : "border-slate-200"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-3 w-3 opacity-60" />
            <code className="font-mono text-[10px] bg-white/50 px-1.5 py-0.5 rounded">
              {BACKEND_URL}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                checkBackend();
              }}
              disabled={checking}
              className="h-5 w-5 p-0 hover:bg-white/50"
              title="Check backend status"
            >
              <RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
            </Button>
          </div>
          
          {backendReachable === false && (
            <div className="bg-red-100 rounded px-2 py-1.5 text-[10px] space-y-1">
              <div className="font-medium">Start the dev server:</div>
              <code className="bg-white px-1.5 py-0.5 rounded font-mono text-red-700 block">
                npm run dev:all
              </code>
            </div>
          )}
          
          {backendReachable === true && (
            <div className="text-emerald-600/70 text-[10px]">
              Backend connected ✓
            </div>
          )}
          
          {/* Dev Tools Links */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/50">
            <span className="text-[10px] text-slate-500">Dev:</span>
            <a 
              href="/inspector" 
              className="text-[10px] text-blue-600 hover:text-blue-800 underline"
              onClick={(e) => e.stopPropagation()}
            >
              Inspector (AFR)
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
