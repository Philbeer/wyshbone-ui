/**
 * ToolResultsView - Inline result previews in chat
 * 
 * Shows:
 * - Summary of results
 * - Top 3-5 preview items
 * - [View Full Results →] button to open right panel
 * 
 * NO MORE "check sidebar" messages!
 */

import { useState } from 'react';
import { 
  Building2, 
  Phone, 
  Globe, 
  Star, 
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  FileText,
  Clock,
  Mail,
  ArrowRight,
  Sparkles,
  Search,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { 
  ToolName, 
  QuickSearchResult, 
  DeepResearchResult, 
  EmailFinderResult,
  ScheduledMonitorResult,
  PlaceResult,
} from '@/types/agent-tools';

interface ToolResultsViewProps {
  tool: ToolName;
  result: QuickSearchResult | DeepResearchResult | EmailFinderResult | ScheduledMonitorResult;
  onAction?: (action: string, data?: unknown) => void;
  onViewFullResults?: (tool: ToolName, data: unknown) => void;
  className?: string;
}

// =============================================================================
// QUICK SEARCH RESULTS - Inline Preview
// =============================================================================

function QuickSearchResults({ 
  result, 
  onAction,
  onViewFullResults,
}: { 
  result: QuickSearchResult; 
  onAction?: (action: string, data?: unknown) => void;
  onViewFullResults?: (tool: ToolName, data: unknown) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Show top 3 results inline
  const previewPlaces = result.places.slice(0, 3);
  const hasMore = result.places.length > 3;

  const copyPlaceId = (placeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(placeId);
    setCopiedId(placeId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Success header */}
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">
          Found {result.count} businesses
          {result.location && <span className="font-normal"> in {result.location}</span>}
        </span>
      </div>

      {/* Preview list */}
      <div className="space-y-2">
        {previewPlaces.map((place, index) => (
          <div 
            key={place.place_id}
            className="bg-white dark:bg-gray-800 rounded-lg border p-3 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center justify-center">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm truncate">{place.name}</h4>
                  {place.rating && (
                    <div className="flex items-center gap-0.5 text-amber-500 flex-shrink-0">
                      <Star className="h-3 w-3 fill-current" />
                      <span className="text-xs">{place.rating}</span>
                    </div>
                  )}
                </div>
                {place.address && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    {place.address}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs">
                  {place.phone && (
                    <span className="text-muted-foreground">{place.phone}</span>
                  )}
                  {place.website && (
                    <a 
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="h-3 w-3" />
                      Website
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View all button */}
      {hasMore && (
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onViewFullResults?.('quick_search', result)}
        >
          View all {result.count} results
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction?.('Find emails for these businesses')}
          className="text-xs"
        >
          <Mail className="h-3 w-3 mr-1" />
          Find emails
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction?.(`Research ${result.query} in ${result.location} in detail`)}
          className="text-xs"
        >
          <FileText className="h-3 w-3 mr-1" />
          Deep research
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// DEEP RESEARCH RESULTS - Inline Preview (NO MORE "check sidebar")
// =============================================================================

function DeepResearchResults({ 
  result,
  onAction,
  onViewFullResults,
}: { 
  result: DeepResearchResult;
  onAction?: (action: string, data?: unknown) => void;
  onViewFullResults?: (tool: ToolName, data: unknown) => void;
}) {
  const isRunning = result.run.status === 'running' || result.run.status === 'in_progress';
  const isComplete = result.run.status === 'completed';
  
  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className={cn(
        "flex items-center gap-2",
        isComplete ? "text-green-700 dark:text-green-400" : "text-purple-700 dark:text-purple-400"
      )}>
        {isRunning ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        <span className="font-medium">
          {isRunning ? 'Research in progress...' : 'Research complete!'}
        </span>
      </div>

      {/* Research card */}
      <div className={cn(
        "rounded-lg border p-4",
        isRunning 
          ? "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800" 
          : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-lg",
            isRunning ? "bg-purple-100 dark:bg-purple-900" : "bg-green-100 dark:bg-green-900"
          )}>
            <FileText className={cn(
              "h-5 w-5",
              isRunning ? "text-purple-600 dark:text-purple-400" : "text-green-600 dark:text-green-400"
            )} />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">
              {result.topic}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {isRunning 
                ? 'Analyzing data, searching web sources, compiling report...'
                : 'Full report ready with sources and insights.'
              }
            </p>
            {result.run.id && (
              <p className="text-xs text-muted-foreground mt-2">
                Research ID: {result.run.id}
              </p>
            )}
          </div>
        </div>

        {isRunning && (
          <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
            <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              This typically takes 1-2 minutes. Results will appear here when ready.
            </div>
          </div>
        )}
      </div>

      {/* View full results button (when complete) */}
      {isComplete && (
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onViewFullResults?.('deep_research', result)}
        >
          <FileText className="h-4 w-4 mr-2" />
          View Full Report
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction?.(`Monitor ${result.topic} weekly`)}
          className="text-xs"
        >
          <Clock className="h-3 w-3 mr-1" />
          Monitor this topic
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// EMAIL FINDER RESULTS - Inline Preview
// =============================================================================

function EmailFinderResults({ 
  result,
  onAction,
  onViewFullResults,
}: { 
  result: EmailFinderResult;
  onAction?: (action: string, data?: unknown) => void;
  onViewFullResults?: (tool: ToolName, data: unknown) => void;
}) {
  const isRunning = result.status === 'running';
  
  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className={cn(
        "flex items-center gap-2",
        isRunning ? "text-blue-700 dark:text-blue-400" : "text-green-700 dark:text-green-400"
      )}>
        {isRunning ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-5 w-5" />
        )}
        <span className="font-medium">
          {isRunning ? 'Finding emails...' : 'Email finder complete!'}
        </span>
      </div>

      {/* Pipeline card */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">Email Pipeline</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {isRunning
                ? 'Searching domains, verifying emails, generating personalized outreach...'
                : 'Emails found and verified. Ready for outreach!'
              }
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Batch ID: {result.batchId}
            </p>
          </div>
        </div>

        {/* Pipeline steps */}
        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700 space-y-1 text-xs">
          <p className="text-green-600">✅ Searching businesses</p>
          <p className={isRunning ? "text-blue-600" : "text-green-600"}>
            {isRunning ? "🔄" : "✅"} Finding website domains
          </p>
          <p className={isRunning ? "text-muted-foreground" : "text-green-600"}>
            {isRunning ? "⏳" : "✅"} Discovering emails via Hunter.io
          </p>
          <p className={isRunning ? "text-muted-foreground" : "text-green-600"}>
            {isRunning ? "⏳" : "✅"} Generating personalized outreach
          </p>
        </div>
      </div>

      {/* View results button */}
      <Button
        variant="default"
        size="sm"
        className="w-full"
        onClick={() => onViewFullResults?.('email_finder', result)}
      >
        <Mail className="h-4 w-4 mr-2" />
        {isRunning ? 'View Progress' : 'View Contacts'}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}

// =============================================================================
// SCHEDULED MONITOR RESULTS - Inline Preview
// =============================================================================

function ScheduledMonitorResults({ 
  result,
  onAction,
  onViewFullResults,
}: { 
  result: ScheduledMonitorResult;
  onAction?: (action: string, data?: unknown) => void;
  onViewFullResults?: (tool: ToolName, data: unknown) => void;
}) {
  const nextRun = result.monitor.nextRunAt ? new Date(result.monitor.nextRunAt) : null;
  
  return (
    <div className="space-y-3">
      {/* Success header */}
      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">Monitor created!</span>
      </div>

      {/* Monitor card */}
      <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
            <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">{result.monitor.label}</h4>
            <div className="space-y-1 text-sm text-muted-foreground mt-2">
              <p>📅 Schedule: <span className="font-medium capitalize">{result.monitor.schedule}</span></p>
              {nextRun && (
                <p>⏰ Next run: <span className="font-medium">{nextRun.toLocaleDateString()} at {nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewFullResults?.('scheduled_monitor', result)}
          className="text-xs"
        >
          View all monitors
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ToolResultsView({
  tool,
  result,
  onAction,
  onViewFullResults,
  className,
}: ToolResultsViewProps) {
  return (
    <div className={cn('', className)}>
      {tool === 'quick_search' && (
        <QuickSearchResults 
          result={result as QuickSearchResult} 
          onAction={onAction}
          onViewFullResults={onViewFullResults}
        />
      )}
      {tool === 'deep_research' && (
        <DeepResearchResults 
          result={result as DeepResearchResult}
          onAction={onAction}
          onViewFullResults={onViewFullResults}
        />
      )}
      {tool === 'email_finder' && (
        <EmailFinderResults 
          result={result as EmailFinderResult}
          onAction={onAction}
          onViewFullResults={onViewFullResults}
        />
      )}
      {tool === 'scheduled_monitor' && (
        <ScheduledMonitorResults 
          result={result as ScheduledMonitorResult}
          onAction={onAction}
          onViewFullResults={onViewFullResults}
        />
      )}
    </div>
  );
}

export default ToolResultsView;
