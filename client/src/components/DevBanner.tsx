/**
 * DevBanner - Shows backend connection status in development mode
 * 
 * Only visible in development mode. Shows:
 * - Backend URL being used
 * - Connection status (✅ reachable / ❌ unreachable)
 * - Instructions if backend is down
 */

import { useState, useEffect } from 'react';
import { Server, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BACKEND_URL = 'http://localhost:5001';
const isDev = import.meta.env.DEV;

export function DevBanner() {
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

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
      setCheckCount(c => c + 1);
    }
  };

  useEffect(() => {
    if (!isDev) return;
    
    // Check immediately
    checkBackend();
    
    // Re-check every 5 seconds
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  // Don't show in production
  if (!isDev) {
    return null;
  }

  // When backend is reachable, show a minimal green bar
  if (backendReachable === true) {
    return (
      <div className="px-4 py-1.5 flex items-center justify-between gap-4 text-xs bg-emerald-50 text-emerald-700 border-b border-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-medium">DEV</span>
          <span className="hidden sm:inline text-emerald-600/70">Backend: {BACKEND_URL}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkBackend}
          disabled={checking}
          className="h-5 px-1.5 text-emerald-600 hover:bg-emerald-100"
          title="Check backend status"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    );
  }

  // When backend is unreachable or checking, show full banner with instructions
  return (
    <div className={`px-4 py-3 flex flex-col gap-2 text-sm border-b ${
      backendReachable === null
        ? 'bg-slate-100 text-slate-700 border-slate-200'
        : 'bg-red-50 text-red-800 border-red-300'
    }`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Server className="h-4 w-4" />
          <span className="font-mono text-xs bg-white/50 px-2 py-0.5 rounded">{BACKEND_URL}</span>
          
          {backendReachable === null ? (
            <span className="text-slate-500 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Checking backend...
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="font-semibold">Backend unreachable</span>
            </span>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={checkBackend}
          disabled={checking}
          className="h-6 px-2 hover:bg-white/50"
          title="Check backend status"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {backendReachable === false && (
        <div className="bg-red-100 rounded px-3 py-2 text-xs">
          <div className="font-medium mb-1">Start the development server:</div>
          <code className="bg-white px-2 py-1 rounded font-mono text-red-700 block">
            npm run dev:all
          </code>
          <div className="mt-1.5 text-red-600/80">
            Or just the backend: <code className="bg-white/70 px-1 rounded">npm run dev:backend</code>
          </div>
        </div>
      )}
    </div>
  );
}


