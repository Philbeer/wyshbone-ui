/**
 * ToolStatusCard - Shows the status of a running tool
 * 
 * Displays:
 * - Tool name and icon
 * - Current status (searching, processing, etc.)
 * - Progress indicator for long operations
 * - Elapsed time
 * - Error state if failed
 */

import { useState, useEffect } from 'react';
import { 
  Search, 
  Microscope, 
  Mail, 
  Clock, 
  Bell,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolName, ToolStatus, ToolMetadata } from '@/types/agent-tools';
import { TOOL_METADATA } from '@/types/agent-tools';

interface ToolStatusCardProps {
  tool: ToolName;
  status: ToolStatus;
  params: Record<string, unknown>;
  startTime?: Date;
  error?: string;
  className?: string;
}

// Icon mapping
const TOOL_ICONS: Record<ToolName, React.ComponentType<{ className?: string }>> = {
  quick_search: Search,
  deep_research: Microscope,
  email_finder: Mail,
  scheduled_monitor: Clock,
  nudges: Bell,
};

// Status messages
const STATUS_MESSAGES: Record<ToolName, Record<ToolStatus, string>> = {
  quick_search: {
    idle: 'Ready to search',
    pending: 'Preparing search...',
    running: 'Searching businesses...',
    completed: 'Search complete',
    failed: 'Search failed',
  },
  deep_research: {
    idle: 'Ready to research',
    pending: 'Starting research...',
    running: 'Researching...',
    completed: 'Research complete',
    failed: 'Research failed',
  },
  email_finder: {
    idle: 'Ready to find emails',
    pending: 'Starting email finder...',
    running: 'Finding emails...',
    completed: 'Emails found',
    failed: 'Email finder failed',
  },
  scheduled_monitor: {
    idle: 'Ready to set up',
    pending: 'Creating monitor...',
    running: 'Setting up...',
    completed: 'Monitor created',
    failed: 'Monitor creation failed',
  },
  nudges: {
    idle: 'Ready',
    pending: 'Loading...',
    running: 'Fetching nudges...',
    completed: 'Nudges loaded',
    failed: 'Failed to load nudges',
  },
};

export function ToolStatusCard({
  tool,
  status,
  params,
  startTime,
  error,
  className,
}: ToolStatusCardProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const metadata = TOOL_METADATA[tool];
  const Icon = TOOL_ICONS[tool];
  const statusMessage = STATUS_MESSAGES[tool][status];

  // Update elapsed time while running
  useEffect(() => {
    if (status !== 'running' || !startTime) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startTime]);

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Get status icon
  const StatusIcon = () => {
    switch (status) {
      case 'pending':
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  // Get background color based on status
  const getBgColor = () => {
    switch (status) {
      case 'pending':
      case 'running':
        return 'bg-blue-50 border-blue-200';
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  // Format params for display
  const formatParams = (): string => {
    if (tool === 'quick_search') {
      const { query, location } = params as { query?: string; location?: string };
      return `${query || 'businesses'}${location ? ` in ${location}` : ''}`;
    }
    if (tool === 'deep_research') {
      const { prompt } = params as { prompt?: string };
      return prompt?.slice(0, 50) + (prompt && prompt.length > 50 ? '...' : '') || 'Research';
    }
    if (tool === 'email_finder') {
      const { query, location } = params as { query?: string; location?: string };
      return `${query || 'businesses'} in ${location || 'your area'}`;
    }
    if (tool === 'scheduled_monitor') {
      const { label } = params as { label?: string };
      return label || 'New monitor';
    }
    return '';
  };

  return (
    <div className={cn(
      'rounded-lg border p-3 transition-all duration-200',
      getBgColor(),
      className
    )}>
      <div className="flex items-start gap-3">
        {/* Tool Icon */}
        <div className={cn(
          'flex-shrink-0 p-2 rounded-lg',
          status === 'running' ? 'bg-blue-100' : 
          status === 'completed' ? 'bg-green-100' :
          status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
        )}>
          <Icon className={cn('h-5 w-5', metadata.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm text-gray-900">
              {metadata.displayName}
            </h4>
            <StatusIcon />
          </div>

          {/* Status message */}
          <p className={cn(
            'text-xs mt-0.5',
            status === 'failed' ? 'text-red-600' : 'text-gray-600'
          )}>
            {error || statusMessage}
          </p>

          {/* Params */}
          <p className="text-xs text-gray-500 mt-1 truncate">
            {formatParams()}
          </p>

          {/* Progress bar for async operations */}
          {(status === 'pending' || status === 'running') && metadata.isAsync && (
            <div className="mt-2">
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full animate-pulse"
                  style={{ 
                    width: status === 'pending' ? '10%' : 
                           elapsedTime < 10 ? '30%' :
                           elapsedTime < 30 ? '50%' :
                           elapsedTime < 60 ? '70%' : '90%'
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-gray-400">
                <span>{formatTime(elapsedTime)}</span>
                <span>{metadata.estimatedDuration}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ToolStatusCard;


