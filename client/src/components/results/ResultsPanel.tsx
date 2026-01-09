/**
 * ResultsPanel - Unified right panel for viewing full results
 * 
 * Replaces "My Goal" panel when results are active.
 * Shows full details for:
 * - Quick Search: All businesses with actions
 * - Deep Research: Full report with sources
 * - Email Finder: Contact list with export
 * - Scheduled Monitor: Details + schedule
 */

import { useState } from 'react';
import { 
  X, 
  ChevronLeft,
  FileText, 
  Mail, 
  Clock, 
  Search,
  Building2,
  Phone,
  Globe,
  MapPin,
  Star,
  Download,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useResultsPanel, ResultType } from '@/contexts/ResultsPanelContext';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  QuickSearchResult,
  DeepResearchResult,
  EmailFinderResult,
  ScheduledMonitorResult,
  NudgesResult,
  PlaceResult,
} from '@/types/agent-tools';

// =============================================================================
// QUICK SEARCH FULL VIEW
// =============================================================================

function QuickSearchFullView({ data }: { data: QuickSearchResult }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const copyPlaceId = (placeId: string) => {
    navigator.clipboard.writeText(placeId);
    setCopiedId(placeId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSelect = (placeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(data.places.map(p => p.place_id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const exportSelected = () => {
    const selected = data.places.filter(p => selectedIds.has(p.place_id));
    const csv = [
      ['Name', 'Address', 'Phone', 'Website', 'Rating'].join(','),
      ...selected.map(p => [
        `"${p.name}"`,
        `"${p.address || ''}"`,
        `"${p.phone || ''}"`,
        `"${p.website || ''}"`,
        p.rating || ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.query}_${data.location}_results.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-600" />
          {data.count} Results Found
        </h3>
        <p className="text-sm text-muted-foreground">
          {data.query} in {data.location}
        </p>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select all
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Deselect ({selectedIds.size})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={exportSelected}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button variant="default" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add to CRM
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {data.places.map((place, index) => (
          <div 
            key={place.place_id}
            className={cn(
              "bg-card rounded-lg border p-3 transition-colors cursor-pointer",
              selectedIds.has(place.place_id) 
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" 
                : "hover:border-blue-300"
            )}
            onClick={() => toggleSelect(place.place_id)}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div className={cn(
                "w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center mt-0.5",
                selectedIds.has(place.place_id) 
                  ? "border-blue-500 bg-blue-500 text-white" 
                  : "border-gray-300"
              )}>
                {selectedIds.has(place.place_id) && <Check className="h-3 w-3" />}
              </div>

              {/* Index */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium flex items-center justify-center">
                {index + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm">{place.name}</h4>
                  {place.rating && (
                    <div className="flex items-center gap-0.5 text-amber-500 flex-shrink-0">
                      <Star className="h-3 w-3 fill-current" />
                      <span className="text-xs">{place.rating}</span>
                    </div>
                  )}
                </div>

                {place.address && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{place.address}</span>
                  </p>
                )}

                <div className="flex items-center gap-4 mt-2 text-xs">
                  {place.phone && (
                    <a 
                      href={`tel:${place.phone}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone className="h-3 w-3" />
                      {place.phone}
                    </a>
                  )}
                  {place.website && (
                    <a 
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-muted-foreground hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="h-3 w-3" />
                      Website
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyPlaceId(place.place_id);
                    }}
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                    title="Copy Place ID"
                  >
                    {copiedId === place.place_id ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DEEP RESEARCH FULL VIEW
// =============================================================================

interface DeepResearchData {
  run: {
    id: string;
    label?: string;
    status: string;
    outputText?: string;
    createdAt?: string;
    completedAt?: string;
  };
  topic: string;
  outputText?: string;
  error?: string;
}

/**
 * Extract clean title from research query
 */
function extractResearchTitle(topic: string): string {
  // Try to extract "on [topic]" pattern
  const onMatch = topic.match(/(?:deep\s+research\s+)?on\s+(.+?)(?:\.|,|please|deliver|include|focus|in\s+the\s+format)/i);
  let title = onMatch ? onMatch[1].trim() : topic;
  
  // If still too long, take first part
  if (title.length > 80) {
    const firstPart = title.split(/[.,]/)[0];
    title = firstPart.length > 80 ? firstPart.slice(0, 77) + '...' : firstPart;
  }
  
  // Clean up common patterns
  title = title
    .replace(/^(deep\s+research\s+on\s+)/i, '')
    .replace(/\s+uk$/i, '')
    .trim();
  
  // Capitalize first letter
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Format date nicely
 */
function formatCompletedDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { 
    weekday: 'short',
    day: 'numeric', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function DeepResearchFullView({ data }: { data: DeepResearchData }) {
  const [copied, setCopied] = useState(false);
  const isRunning = data.run.status === 'running' || data.run.status === 'in_progress' || data.run.status === 'queued';
  const isComplete = data.run.status === 'completed';
  const isFailed = data.run.status === 'failed' || data.run.status === 'stopped';
  const outputText = data.outputText || data.run.outputText || '';
  const hasOutput = outputText && outputText.length > 0 && outputText !== 'Research in progress...';
  
  const cleanTitle = extractResearchTitle(data.topic);
  const completedDate = formatCompletedDate(data.run.completedAt || data.run.createdAt);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="space-y-4">
      {/* Header - Clean and informative */}
      <div className="border-b pb-4">
        <div className="flex items-center gap-2 mb-2">
          {isComplete && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          {isRunning && <Loader2 className="h-5 w-5 animate-spin text-purple-600" />}
          {isFailed && <X className="h-5 w-5 text-red-500" />}
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isComplete && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
            isRunning && "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
            isFailed && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
          )}>
            {isComplete ? '✅ Complete' : isRunning ? '🔄 In Progress' : '❌ Failed'}
          </span>
        </div>
        
        <h3 className="text-xl font-bold text-foreground leading-tight">
          {cleanTitle}
        </h3>
        
        {completedDate && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {completedDate}
          </p>
        )}
      </div>

      {data.error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{data.error}</p>
          </CardContent>
        </Card>
      )}

      {isRunning && !hasOutput ? (
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
                <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-purple-200 animate-pulse" />
              </div>
              <div>
                <h4 className="font-semibold text-purple-900 dark:text-purple-100">Research in Progress</h4>
                <p className="text-sm text-purple-600 dark:text-purple-300 mt-1">
                  Analyzing data, searching web sources, compiling report...
                </p>
                <p className="text-xs text-muted-foreground mt-3">
                  ⏱️ This typically takes 1-2 minutes
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : hasOutput ? (
        <>
          {/* Actions bar */}
          <div className="flex flex-wrap gap-2 pb-3 border-b">
            <Button variant="outline" size="sm" onClick={copyToClipboard}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Report
                </>
              )}
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add to CRM
            </Button>
          </div>
          
          {/* Report content - Markdown formatted */}
          <div className="prose prose-sm dark:prose-invert max-w-none 
            prose-headings:text-foreground prose-headings:font-semibold
            prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
            prose-h2:text-lg prose-h2:mt-5 prose-h2:mb-2
            prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
            prose-p:my-2 prose-p:text-muted-foreground
            prose-ul:my-2 prose-ul:list-disc prose-ul:list-inside
            prose-ol:my-2 prose-ol:list-decimal prose-ol:list-inside
            prose-li:my-0.5
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-strong:text-foreground
            prose-table:text-sm
            prose-th:bg-muted prose-th:px-3 prose-th:py-2
            prose-td:px-3 prose-td:py-2 prose-td:border-t
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a {...props} className="text-primary hover:underline cursor-pointer" target="_blank" rel="noopener noreferrer" />
                ),
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-4">
                    <table {...props} className="min-w-full border border-border rounded-lg" />
                  </div>
                ),
              }}
            >
              {outputText}
            </ReactMarkdown>
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <div>
                <h4 className="font-medium">No Output Available</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  The research may still be processing or hasn't generated output yet.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =============================================================================
// EMAIL FINDER FULL VIEW
// =============================================================================

function EmailFinderFullView({ data }: { data: EmailFinderResult }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5 text-green-600" />
          Email Finder Results
        </h3>
        <p className="text-sm text-muted-foreground">
          Batch ID: {data.batchId}
        </p>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <Check className="h-3 w-3" />
              </div>
              <span>Searching businesses</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                <Check className="h-3 w-3" />
              </div>
              <span>Finding website domains</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {data.status === 'running' ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <Check className="h-3 w-3" />
                </div>
              )}
              <span>Discovering emails via Hunter.io</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {data.status === 'running' ? (
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <Clock className="h-3 w-3" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                  <Check className="h-3 w-3" />
                </div>
              )}
              <span>Generating personalized outreach</span>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t">
            <Button 
              variant="default" 
              className="w-full"
              onClick={() => window.location.href = data.viewUrl}
            >
              View Full Pipeline
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// SCHEDULED MONITOR FULL VIEW
// =============================================================================

function ScheduledMonitorFullView({ data }: { data: ScheduledMonitorResult }) {
  const nextRun = data.monitor.nextRunAt ? new Date(data.monitor.nextRunAt) : null;
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-600" />
          Monitor Details
        </h3>
        <p className="text-sm text-muted-foreground">
          {data.monitor.label}
        </p>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Schedule</span>
              <span className="font-medium capitalize">{data.monitor.schedule}</span>
            </div>
            {nextRun && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Next Run</span>
                <span className="font-medium">
                  {nextRun.toLocaleDateString()} at {nextRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ID</span>
              <span className="font-mono text-xs">{data.monitor.id}</span>
            </div>
          </div>
          
          <div className="pt-4 border-t space-y-2">
            <Button variant="outline" className="w-full" size="sm">
              Edit Schedule
            </Button>
            <Button variant="outline" className="w-full text-destructive hover:text-destructive" size="sm">
              Delete Monitor
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// NUDGES FULL VIEW
// =============================================================================

function NudgesFullView({ data }: { data: NudgesResult }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-amber-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          Nudges & Suggestions
        </h3>
        <p className="text-sm text-muted-foreground">
          {data.count} suggestion{data.count === 1 ? '' : 's'}
        </p>
      </div>

      {data.count === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-muted-foreground">
              <p className="text-sm">{data.message || 'No pending nudges at the moment'}</p>
              <p className="text-xs mt-2">Check back later for AI-generated follow-up suggestions</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.nudges.map((nudge, index) => (
            <Card key={nudge.id || index}>
              <CardContent className="py-4">
                <div className="space-y-2">
                  {nudge.type && (
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {nudge.type}
                    </div>
                  )}
                  <p className="text-sm">{nudge.message}</p>
                  {nudge.priority && (
                    <div className={cn(
                      "text-xs font-medium inline-block px-2 py-0.5 rounded",
                      nudge.priority === 'high' && "bg-red-100 text-red-700",
                      nudge.priority === 'medium' && "bg-amber-100 text-amber-700",
                      nudge.priority === 'low' && "bg-blue-100 text-blue-700"
                    )}>
                      {nudge.priority} priority
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN RESULTS PANEL
// =============================================================================

export function ResultsPanel() {
  const { isOpen, currentResult, closeResults } = useResultsPanel();

  if (!isOpen || !currentResult) {
    return null;
  }

  const getIcon = () => {
    switch (currentResult.type) {
      case 'quick_search': return <Search className="h-5 w-5" />;
      case 'deep_research': return <FileText className="h-5 w-5" />;
      case 'email_finder': return <Mail className="h-5 w-5" />;
      case 'scheduled_monitor': return <Clock className="h-5 w-5" />;
      case 'nudges': return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
      );
      default: return null;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="flex-shrink-0 pb-2 border-b">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeResults}
            className="flex items-center gap-1 -ml-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Goal
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeResults}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-4">
            {currentResult.type === 'quick_search' && (
              <QuickSearchFullView data={currentResult.data as QuickSearchResult} />
            )}
            {currentResult.type === 'deep_research' && (
              <DeepResearchFullView data={currentResult.data as DeepResearchData} />
            )}
            {currentResult.type === 'email_finder' && (
              <EmailFinderFullView data={currentResult.data as EmailFinderResult} />
            )}
            {currentResult.type === 'scheduled_monitor' && (
              <ScheduledMonitorFullView data={currentResult.data as ScheduledMonitorResult} />
            )}
            {currentResult.type === 'nudges' && (
              <NudgesFullView data={currentResult.data as NudgesResult} />
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ResultsPanel;

