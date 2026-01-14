/**
 * "Recent Activity" Panel - Local Wyshbone System Activity
 * 
 * Shows background jobs, syncs, AI discoveries, and user actions
 * from Wyshbone's local activity log instead of Tower.
 */

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Clock, AlertCircle, Database, Bot, User, Zap, Calendar, PoundSterling, Package, Building2, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { isDemoMode } from '@/hooks/useDemoMode';

interface ActivityItem {
  id: number;
  workspaceId: number;
  activityType: string;
  category: 'system' | 'ai' | 'sync' | 'user';
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  userId?: string;
  createdAt: string;
}

interface WhatJustHappenedPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
}

/**
 * Get icon for activity category
 */
function getCategoryIcon(category: string, activityType?: string) {
  // First check activity type for more specific icons
  switch (activityType) {
    case 'xero_sync':
    case 'xero_export':
      return <PoundSterling className="h-4 w-4 text-blue-500" />;
    case 'event_found':
      return <Calendar className="h-4 w-4 text-purple-500" />;
    case 'entity_match':
    case 'ai_discovery':
      return <Bot className="h-4 w-4 text-purple-500" />;
    case 'database_update':
      return <Database className="h-4 w-4 text-gray-500" />;
    case 'supplier_sync':
      return <Package className="h-4 w-4 text-orange-500" />;
    case 'freehouse_research':
      return <Building2 className="h-4 w-4 text-teal-500" />;
  }
  
  // Fall back to category
  switch (category) {
    case 'ai':
      return <Bot className="h-4 w-4 text-purple-500" />;
    case 'sync':
      return <RefreshCw className="h-4 w-4 text-blue-500" />;
    case 'system':
      return <Database className="h-4 w-4 text-gray-500" />;
    case 'user':
      return <User className="h-4 w-4 text-green-500" />;
    default:
      return <Activity className="h-4 w-4 text-gray-400" />;
  }
}

/**
 * Get badge variant for category
 */
function getCategoryBadge(category: string): { label: string; className: string } {
  switch (category) {
    case 'ai':
      return { label: '🤖 AI', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' };
    case 'sync':
      return { label: '🔄 Sync', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
    case 'system':
      return { label: '⚙️ System', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
    case 'user':
      return { label: '👤 User', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    default:
      return { label: category, className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' };
  }
}

/**
 * Single activity item in the list
 */
function ActivityItemComponent({ activity }: { activity: ActivityItem }) {
  const categoryBadge = getCategoryBadge(activity.category);
  const timeAgo = formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true });
  
  return (
    <div className="border-b pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {getCategoryIcon(activity.category, activity.activityType)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm">{activity.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${categoryBadge.className}`}>
              {categoryBadge.label}
            </span>
          </div>
          
          {activity.description && (
            <p className="text-xs text-muted-foreground mb-1">
              {activity.description}
            </p>
          )}
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{timeAgo}</span>
            {activity.entityType && (
              <>
                <span>•</span>
                <span className="capitalize">{activity.entityType}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Demo data for when no real activities exist
 */
const demoActivities: ActivityItem[] = [
  {
    id: 1,
    workspaceId: 1,
    activityType: 'xero_sync',
    category: 'sync',
    title: 'Imported 5 new orders from Xero',
    description: 'Total value: £1,250.00',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 2,
    workspaceId: 1,
    activityType: 'ai_discovery',
    category: 'ai',
    title: 'Discovered 3 new pubs in Brighton',
    description: 'AI Sleeper Agent found new prospects',
    entityType: 'pub',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 3,
    workspaceId: 1,
    activityType: 'database_update',
    category: 'system',
    title: 'Verified 1,000 pubs overnight',
    description: 'Found 3 closed pubs, 5 new managers',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 4,
    workspaceId: 1,
    activityType: 'entity_match',
    category: 'ai',
    title: 'Matched "The Red Lion" to existing record',
    description: 'AI confidence: 94%',
    entityType: 'pub',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
];

export function WhatJustHappenedPanel({ isOpen, onClose }: WhatJustHappenedPanelProps) {
  const [filter, setFilter] = useState<string>('all');
  const inDemoMode = isDemoMode();

  // Fetch activities from local API
  const { data, isLoading, error, refetch } = useQuery<{ activities: ActivityItem[] }>({
    queryKey: ['activity-log', filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (filter !== 'all') {
        params.append('category', filter);
      }
      
      const res = await fetch(`/api/activity-log?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch activities');
      }
      return res.json();
    },
    enabled: isOpen && !inDemoMode,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000
  });

  const activities = inDemoMode ? demoActivities : (data?.activities || []);
  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.category === filter);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[450px]">
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Recent Activity
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 px-2"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <SheetDescription>
            Background jobs, syncs, and AI discoveries
          </SheetDescription>
          
          {/* Demo mode indicator */}
          {inDemoMode && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded">
              <Database className="h-3 w-3" />
              Showing demo activity data
            </div>
          )}
        </SheetHeader>

        {/* Category filter buttons */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <Button 
            size="sm" 
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            className="h-7 text-xs"
          >
            All
          </Button>
          <Button 
            size="sm" 
            variant={filter === 'ai' ? 'default' : 'outline'}
            onClick={() => setFilter('ai')}
            className="h-7 text-xs"
          >
            🤖 AI
          </Button>
          <Button 
            size="sm" 
            variant={filter === 'sync' ? 'default' : 'outline'}
            onClick={() => setFilter('sync')}
            className="h-7 text-xs"
          >
            🔄 Syncs
          </Button>
          <Button 
            size="sm" 
            variant={filter === 'system' ? 'default' : 'outline'}
            onClick={() => setFilter('system')}
            className="h-7 text-xs"
          >
            ⚙️ System
          </Button>
          <Button 
            size="sm" 
            variant={filter === 'user' ? 'default' : 'outline'}
            onClick={() => setFilter('user')}
            className="h-7 text-xs"
          >
            👤 User
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 max-h-[calc(100vh-280px)]">
          {isLoading && activities.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading activity…
            </div>
          )}

          {error && !inDemoMode && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">Couldn't load activity</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="mt-3"
              >
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !error && filteredActivities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter === 'all' ? 'No activity yet' : `No ${filter} activity`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {filter === 'all' 
                  ? 'Background jobs and syncs will show up here.'
                  : `Try a different filter to see more activity.`
                }
              </p>
            </div>
          )}

          {filteredActivities.length > 0 && (
            <div className="space-y-0">
              {filteredActivities.map((activity) => (
                <ActivityItemComponent key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
        
        {/* Footer with count */}
        {filteredActivities.length > 0 && (
          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground text-center">
            Showing {filteredActivities.length} {filteredActivities.length === 1 ? 'activity' : 'activities'}
            {filter !== 'all' && ` in ${filter}`}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
