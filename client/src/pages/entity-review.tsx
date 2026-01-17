/**
 * Entity Review Queue Page
 * 
 * Manual review interface for entity resolution matches.
 * Users can review potential duplicate businesses and approve/reject merges.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  SkipForward,
  AlertTriangle,
  ArrowRight,
  Building2,
  MapPin,
  Phone,
  FileText,
  ChevronDown,
  ChevronUp,
  Filter,
  Inbox,
  Loader2,
  Keyboard,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  useManualReviewQueue, 
  useApproveReview, 
  useRejectReview,
  useReviewQueueStats,
  type ReviewQueueItem,
  type ReviewQueueFilters
} from '@/hooks/useEntityResolution';

// ============================================
// TYPES
// ============================================

type SourceTypeFilter = 'all' | 'xero' | 'google' | 'manual' | 'web_scrape';
type ConfidenceLevel = 'all' | 'high' | 'medium' | 'low';

interface ConfirmDialogState {
  open: boolean;
  reviewId: number | null;
  decision: 'match' | 'new' | 'reject' | null;
  itemName?: string;
}

// ============================================
// CONSTANTS
// ============================================

const SOURCE_TYPE_LABELS: Record<string, string> = {
  xero: 'Xero',
  google: 'Google Places',
  manual: 'Manual Entry',
  web_scrape: 'Web Scrape',
  import: 'Import',
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  xero: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  google: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  manual: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  web_scrape: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  import: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence);
  switch (level) {
    case 'high':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'medium':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'low':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  }
}

function normalizeValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || '';
}

function valuesMatch(value1: string | null | undefined, value2: string | null | undefined): boolean {
  return normalizeValue(value1) === normalizeValue(value2);
}

// ============================================
// FIELD COMPARISON COMPONENT
// ============================================

interface FieldComparisonProps {
  label: string;
  icon: React.ReactNode;
  newValue: string | null | undefined;
  existingValue: string | null | undefined;
}

function FieldComparison({ label, icon, newValue, existingValue }: FieldComparisonProps) {
  const isMatch = valuesMatch(newValue, existingValue);
  const newDisplay = newValue || '—';
  const existingDisplay = existingValue || '—';
  
  return (
    <div className="grid grid-cols-[100px_1fr_1fr] gap-2 py-2 border-b border-border/50 last:border-0">
      {/* Label */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      
      {/* New value */}
      <div className={`text-sm font-medium px-2 py-1 rounded ${
        !isMatch && newValue ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : ''
      }`}>
        {newDisplay}
      </div>
      
      {/* Existing value */}
      <div className={`text-sm font-medium px-2 py-1 rounded ${
        !isMatch && existingValue ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : ''
      }`}>
        {existingDisplay}
      </div>
    </div>
  );
}

// ============================================
// REVIEW CARD COMPONENT
// ============================================

interface ReviewCardProps {
  review: ReviewQueueItem;
  isSelected: boolean;
  onApprove: (decision: 'match' | 'new') => void;
  onReject: () => void;
  onSkip: () => void;
  isUpdating: boolean;
}

function ReviewCard({ 
  review, 
  isSelected, 
  onApprove, 
  onReject, 
  onSkip,
  isUpdating 
}: ReviewCardProps) {
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const confidence = review.confidence;
  const confidencePercent = Math.round(confidence * 100);
  const hasMatch = !!review.possibleMatch;
  
  return (
    <Card className={`relative overflow-hidden transition-all ${
      isSelected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
    }`}>
      {/* Confidence indicator bar */}
      <div 
        className={`absolute top-0 left-0 h-1 transition-all ${
          confidence >= 0.8 ? 'bg-green-500' :
          confidence >= 0.5 ? 'bg-amber-500' :
          'bg-red-500'
        }`}
        style={{ width: `${confidencePercent}%` }}
      />
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge 
                variant="secondary" 
                className={SOURCE_TYPE_COLORS[review.sourceType] || SOURCE_TYPE_COLORS.import}
              >
                {SOURCE_TYPE_LABELS[review.sourceType] || review.sourceType}
              </Badge>
              
              <Badge 
                variant="secondary" 
                className={getConfidenceColor(confidence)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {confidencePercent}% match
              </Badge>
              
              {isSelected && (
                <Badge variant="default" className="bg-primary">
                  <Keyboard className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
            
            <CardTitle className="text-lg">
              {review.newPubData.name}
            </CardTitle>
            
            {review.sourceId && (
              <CardDescription className="text-xs mt-1">
                Source ID: {review.sourceId}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Comparison header */}
        <div className="grid grid-cols-[100px_1fr_1fr] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div>Field</div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            New Record
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Existing Match
          </div>
        </div>
        
        {/* Field comparisons */}
        <div className="bg-muted/30 rounded-lg p-3">
          <FieldComparison
            label="Name"
            icon={<Building2 className="h-4 w-4" />}
            newValue={review.newPubData.name}
            existingValue={review.possibleMatch?.name}
          />
          
          <FieldComparison
            label="Address"
            icon={<MapPin className="h-4 w-4" />}
            newValue={review.newPubData.address}
            existingValue={review.possibleMatch?.addressLine1}
          />
          
          <FieldComparison
            label="Postcode"
            icon={<MapPin className="h-4 w-4" />}
            newValue={review.newPubData.postcode}
            existingValue={review.possibleMatch?.postcode}
          />
          
          <FieldComparison
            label="Phone"
            icon={<Phone className="h-4 w-4" />}
            newValue={review.newPubData.phone}
            existingValue={null} // Existing pub might not have phone in the match data
          />
        </div>
        
        {/* AI Reasoning */}
        {review.reasoning && (
          <Collapsible open={isReasoningOpen} onOpenChange={setIsReasoningOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Reasoning
                </span>
                {isReasoningOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-muted/50 rounded-lg p-3 mt-2 text-sm text-muted-foreground italic">
                "{review.reasoning}"
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      
      <CardFooter className="pt-2 pb-4 flex flex-wrap gap-2 border-t">
        {hasMatch ? (
          <>
            {/* Same Business - Merge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onApprove('match')}
                    disabled={isUpdating}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    )}
                    Same Business
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Merge with existing record (Enter)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Different Business - Create New */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReject()}
                    disabled={isUpdating}
                    className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    {isUpdating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Different Business
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mark as different, remove from queue</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        ) : (
          /* No match found - create new */
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onApprove('new')}
                  disabled={isUpdating}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Create New Pub
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>No match found, create as new (Enter)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Skip */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                disabled={isUpdating}
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Skip
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Skip for now (Esc)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}

// ============================================
// EMPTY STATE COMPONENT
// ============================================

interface EmptyStateProps {
  hasFilter: boolean;
}

function EmptyState({ hasFilter }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
        <Inbox className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <h3 className="text-lg font-semibold">All Caught Up!</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">
        {hasFilter 
          ? 'No reviews match your current filters. Try adjusting your filters or check back later.'
          : 'There are no pending reviews at the moment. New items will appear here when entities need manual verification.'}
      </p>
    </div>
  );
}

// ============================================
// LOADING STATE COMPONENT
// ============================================

function LoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-32 mr-2" />
            <Skeleton className="h-9 w-32 mr-2" />
            <Skeleton className="h-9 w-16" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// MAIN REVIEW QUEUE PAGE
// ============================================

export default function EntityReviewPage() {
  // State
  const [sourceFilter, setSourceFilter] = useState<SourceTypeFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceLevel>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    reviewId: null,
    decision: null,
  });
  
  // Build filters
  const filters: ReviewQueueFilters = useMemo(() => {
    const f: ReviewQueueFilters = { status: 'pending' };
    if (sourceFilter !== 'all') f.sourceType = sourceFilter;
    if (confidenceFilter === 'high') {
      f.minConfidence = 0.8;
    } else if (confidenceFilter === 'medium') {
      f.minConfidence = 0.5;
      f.maxConfidence = 0.79;
    } else if (confidenceFilter === 'low') {
      f.maxConfidence = 0.49;
    }
    return f;
  }, [sourceFilter, confidenceFilter]);
  
  // Fetch data
  const { data: reviews, isLoading, error, refetch } = useManualReviewQueue(undefined, filters);
  const { data: stats } = useReviewQueueStats();
  
  // Mutations
  const approveReview = useApproveReview();
  const rejectReview = useRejectReview();
  
  const isUpdating = approveReview.isPending || rejectReview.isPending;
  
  // Ensure selected index is valid
  useEffect(() => {
    if (reviews && selectedIndex >= reviews.length) {
      setSelectedIndex(Math.max(0, reviews.length - 1));
    }
  }, [reviews, selectedIndex]);
  
  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!reviews || reviews.length === 0) return;
    if (confirmDialog.open) return; // Don't handle when dialog is open
    
    const currentReview = reviews[selectedIndex];
    if (!currentReview) return;
    
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (currentReview.possibleMatch) {
          // Show confirm dialog for merge
          setConfirmDialog({
            open: true,
            reviewId: currentReview.id,
            decision: 'match',
            itemName: currentReview.newPubData.name,
          });
        } else {
          // No match, create new directly
          handleApprove(currentReview.id, 'new');
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleSkip();
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min((reviews?.length || 1) - 1, prev + 1));
        break;
    }
  }, [reviews, selectedIndex, confirmDialog.open]);
  
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  // Handlers
  const handleApprove = (reviewId: number, decision: 'match' | 'new') => {
    approveReview.mutate({ reviewId, decision }, {
      onSuccess: () => {
        setConfirmDialog({ open: false, reviewId: null, decision: null });
      }
    });
  };
  
  const handleReject = (reviewId: number) => {
    rejectReview.mutate({ reviewId });
  };
  
  const handleSkip = () => {
    if (reviews && selectedIndex < reviews.length - 1) {
      setSelectedIndex(prev => prev + 1);
    }
  };
  
  const showConfirmDialog = (reviewId: number, decision: 'match' | 'new' | 'reject', itemName: string) => {
    setConfirmDialog({
      open: true,
      reviewId,
      decision,
      itemName,
    });
  };
  
  const handleConfirmAction = () => {
    if (!confirmDialog.reviewId || !confirmDialog.decision) return;
    
    if (confirmDialog.decision === 'reject') {
      handleReject(confirmDialog.reviewId);
    } else {
      handleApprove(confirmDialog.reviewId, confirmDialog.decision);
    }
  };
  
  const hasFilters = sourceFilter !== 'all' || confidenceFilter !== 'all';
  const pendingCount = reviews?.length || 0;
  
  return (
    <div className="p-6 space-y-6 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Entity Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            Review and verify potential duplicate businesses
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Stats badge */}
          <Badge 
            variant={pendingCount > 0 ? 'default' : 'secondary'} 
            className={`text-base px-3 py-1 ${pendingCount > 10 ? 'bg-amber-600' : ''}`}
          >
            {pendingCount} pending
          </Badge>
          
          {/* Refresh button */}
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      
      {/* Keyboard shortcuts hint */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
        <Keyboard className="h-4 w-4" />
        <span>Keyboard shortcuts:</span>
        <kbd className="px-2 py-1 bg-background rounded border text-xs font-mono">Enter</kbd>
        <span>Approve</span>
        <kbd className="px-2 py-1 bg-background rounded border text-xs font-mono">Esc</kbd>
        <span>Skip</span>
        <kbd className="px-2 py-1 bg-background rounded border text-xs font-mono">↑↓</kbd>
        <span>Navigate</span>
      </div>
      
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        
        {/* Source type filter */}
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceTypeFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="xero">Xero</SelectItem>
            <SelectItem value="google">Google Places</SelectItem>
            <SelectItem value="manual">Manual Entry</SelectItem>
            <SelectItem value="web_scrape">Web Scrape</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Confidence filter */}
        <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as ConfidenceLevel)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Confidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Confidence</SelectItem>
            <SelectItem value="high">High (80%+)</SelectItem>
            <SelectItem value="medium">Medium (50-79%)</SelectItem>
            <SelectItem value="low">Low (&lt;50%)</SelectItem>
          </SelectContent>
        </Select>
        
        {hasFilters && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setSourceFilter('all');
              setConfidenceFilter('all');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      
      {/* Error state */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-destructive">Failed to load review queue. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Review list - scrollable container */}
      <div className="flex-1 min-h-0 overflow-y-auto max-h-[calc(100vh-320px)] pr-2">
        {isLoading ? (
          <LoadingState />
        ) : !reviews || reviews.length === 0 ? (
          <EmptyState hasFilter={hasFilters} />
        ) : (
          <div className="space-y-4 pb-4">
            {reviews.map((review, index) => (
              <ReviewCard
                key={review.id}
                review={review}
                isSelected={index === selectedIndex}
                onApprove={(decision) => showConfirmDialog(review.id, decision, review.newPubData.name)}
                onReject={() => showConfirmDialog(review.id, 'reject', review.newPubData.name)}
                onSkip={handleSkip}
                isUpdating={isUpdating}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Summary footer */}
      {!isLoading && reviews && reviews.length > 0 && (
        <div className="text-center text-sm text-muted-foreground py-2 border-t">
          Showing {reviews.length} pending review{reviews.length !== 1 ? 's' : ''}
          {hasFilters && ' (filtered)'}
        </div>
      )}
      
      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ open: false, reviewId: null, decision: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.decision === 'match' && 'Confirm Merge'}
              {confirmDialog.decision === 'new' && 'Create New Record'}
              {confirmDialog.decision === 'reject' && 'Mark as Different'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.decision === 'match' && (
                <>
                  This will merge <strong>"{confirmDialog.itemName}"</strong> with the existing business record.
                  The data from the new source will be linked to the existing pub.
                </>
              )}
              {confirmDialog.decision === 'new' && (
                <>
                  This will create a new pub record for <strong>"{confirmDialog.itemName}"</strong>.
                </>
              )}
              {confirmDialog.decision === 'reject' && (
                <>
                  This will mark <strong>"{confirmDialog.itemName}"</strong> as a different business 
                  and remove it from the review queue.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmAction}
              disabled={isUpdating}
              className={
                confirmDialog.decision === 'match' ? 'bg-green-600 hover:bg-green-700' :
                confirmDialog.decision === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                ''
              }
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : confirmDialog.decision === 'match' ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : confirmDialog.decision === 'reject' ? (
                <XCircle className="h-4 w-4 mr-2" />
              ) : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

