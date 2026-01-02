/**
 * Sleeper Agent Monitor
 * 
 * Developer-only dashboard for monitoring overnight database maintenance.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Bot,
  CheckCircle2, 
  XCircle, 
  Clock, 
  Play,
  RefreshCw,
  Plus,
  Calendar,
  Ban,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Building2,
  MapPin,
} from 'lucide-react';
import { authedFetch, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

// ============================================
// TYPES
// ============================================

interface SleeperAgentSummary {
  lastRun: {
    timestamp: string | null;
    status: 'success' | 'failed' | 'running' | 'never';
    durationMinutes: number | null;
  };
  nextRun: string;
  totals: {
    totalPubs: number;
    pubsVerifiedToday: number;
    newPubsToday: number;
    eventsDiscovered: number;
    closedPubs: number;
  };
  recentActivity: Array<{
    id: number;
    timestamp: string;
    activity: string;
    details: string;
    results: string;
  }>;
}

interface VerifiedPub {
  id: number;
  name: string;
  postcode: string | null;
  city: string | null;
  updatedAt: string | null;
  verifiedAt: string | null;
}

interface NewPub {
  id: number;
  name: string;
  postcode: string | null;
  city: string | null;
  addressLine1: string | null;
  createdAt: string | null;
}

interface DiscoveredEvent {
  id: number;
  name: string;
  thingType: string;
  startDate: string | null;
  endDate: string | null;
  standaloneLocation: string | null;
  standaloneAddress: string | null;
  createdAt: string | null;
}

// ============================================
// HOOKS
// ============================================

function useSleeperAgentSummary() {
  return useQuery({
    queryKey: ['/api/dev/sleeper-agent/summary'],
    queryFn: async (): Promise<SleeperAgentSummary> => {
      const response = await authedFetch('/api/dev/sleeper-agent/summary');
      if (!response.ok) {
        throw new Error(`Failed to fetch summary: ${response.statusText}`);
      }
      const data = await response.json();
      return data.summary;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });
}

function useVerifiedPubs(date?: string) {
  return useQuery({
    queryKey: ['/api/dev/sleeper-agent/verified-pubs', date],
    queryFn: async (): Promise<{ count: number; pubs: VerifiedPub[] }> => {
      const params = date ? `?date=${date}` : '';
      const response = await authedFetch(`/api/dev/sleeper-agent/verified-pubs${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch verified pubs: ${response.statusText}`);
      }
      const data = await response.json();
      return { count: data.count, pubs: data.pubs };
    },
    enabled: false, // Only fetch when expanded
  });
}

function useNewPubs(date?: string) {
  return useQuery({
    queryKey: ['/api/dev/sleeper-agent/new-pubs', date],
    queryFn: async (): Promise<{ count: number; pubs: NewPub[] }> => {
      const params = date ? `?date=${date}` : '';
      const response = await authedFetch(`/api/dev/sleeper-agent/new-pubs${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch new pubs: ${response.statusText}`);
      }
      const data = await response.json();
      return { count: data.count, pubs: data.pubs };
    },
    enabled: false,
  });
}

function useDiscoveredEvents(date?: string) {
  return useQuery({
    queryKey: ['/api/dev/sleeper-agent/events', date],
    queryFn: async (): Promise<{ count: number; events: DiscoveredEvent[] }> => {
      const params = date ? `?date=${date}` : '';
      const response = await authedFetch(`/api/dev/sleeper-agent/events${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }
      const data = await response.json();
      return { count: data.count, events: data.events };
    },
    enabled: false,
  });
}

function useTriggerRun() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/dev/sleeper-agent/run-now');
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: 'Sleeper Agent Started',
        description: `Job ID: ${data.jobId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dev/sleeper-agent/summary'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to start job',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });
}

// ============================================
// COMPONENTS
// ============================================

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Success
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <XCircle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case 'running':
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="w-3 h-3 mr-1" />
          Never Run
        </Badge>
      );
  }
}

function StatCard({ 
  title, 
  value, 
  subtext, 
  icon: Icon, 
  iconColor = 'text-muted-foreground' 
}: { 
  title: string;
  value: number | string;
  subtext: string;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
          </div>
          <Icon className={`w-8 h-8 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ExpandableSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
  isLoading,
  onExpand,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isLoading?: boolean;
  onExpand?: () => void;
}) {
  const handleToggle = () => {
    if (!isOpen && onExpand) {
      onExpand();
    }
    onToggle();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between h-auto py-3">
          <span className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {title}
          </span>
          <Badge variant="secondary">{count}</Badge>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function SleeperAgentMonitor() {
  const { toast } = useToast();
  const { data: summary, isLoading, error, refetch, dataUpdatedAt } = useSleeperAgentSummary();
  const triggerRun = useTriggerRun();
  
  const [verifiedOpen, setVerifiedOpen] = useState(false);
  const [newPubsOpen, setNewPubsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const verifiedPubs = useVerifiedPubs();
  const newPubs = useNewPubs();
  const discoveredEvents = useDiscoveredEvents();

  // Format "updated X ago" text
  const updatedAgo = dataUpdatedAt 
    ? formatDistanceToNow(dataUpdatedAt, { addSuffix: true })
    : 'never';

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Access Denied or Error
            </CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'Failed to load sleeper agent data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bot className="w-8 h-8" />
            Sleeper Agent Monitor
          </h1>
          <p className="text-muted-foreground">
            Overnight database maintenance activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Updated {updatedAgo}
          </span>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Last Run Summary */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <StatusBadge status={summary?.lastRun.status || 'never'} />
                  {summary?.lastRun.durationMinutes && (
                    <span className="text-sm text-muted-foreground">
                      Completed in {summary.lastRun.durationMinutes} minutes
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Last run: </span>
                  <span className="font-medium">
                    {summary?.lastRun.timestamp 
                      ? new Date(summary.lastRun.timestamp).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Next scheduled: </span>
                  <span className="font-medium">
                    {summary?.nextRun 
                      ? new Date(summary.nextRun).toLocaleString()
                      : 'Tonight at 2:00 AM'}
                  </span>
                </div>
              </div>
              <Button 
                onClick={() => triggerRun.mutate()}
                disabled={triggerRun.isPending}
                className="gap-2"
              >
                {triggerRun.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Run Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title="Pubs Verified"
              value={summary?.totals.pubsVerifiedToday || 0}
              subtext={`from ${(summary?.totals.totalPubs || 0).toLocaleString()} total`}
              icon={CheckCircle2}
              iconColor="text-green-500"
            />
            <StatCard
              title="New Pubs Found"
              value={summary?.totals.newPubsToday || 0}
              subtext="added to database"
              icon={Plus}
              iconColor="text-blue-500"
            />
            <StatCard
              title="Events Discovered"
              value={summary?.totals.eventsDiscovered || 0}
              subtext="beer festivals, expos"
              icon={Calendar}
              iconColor="text-purple-500"
            />
            <StatCard
              title="Closed Pubs"
              value={summary?.totals.closedPubs || 0}
              subtext="marked as closed"
              icon={Ban}
              iconColor="text-red-500"
            />
          </>
        )}
      </div>

      {/* Recent Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Last 20 search operations</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : summary?.recentActivity && summary.recentActivity.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Results</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recentActivity.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {activity.timestamp 
                          ? new Date(activity.timestamp).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{activity.activity}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{activity.details || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {activity.results}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm">The sleeper agent hasn't run yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Breakdowns */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Breakdowns</CardTitle>
          <CardDescription>Expand to see specifics from today's run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* Pubs Verified */}
          <ExpandableSection
            title="Pubs Verified Today"
            count={summary?.totals.pubsVerifiedToday || 0}
            isOpen={verifiedOpen}
            onToggle={() => setVerifiedOpen(!verifiedOpen)}
            isLoading={verifiedPubs.isLoading}
            onExpand={() => verifiedPubs.refetch()}
          >
            {verifiedPubs.data?.pubs && verifiedPubs.data.pubs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {verifiedPubs.data.pubs.map((pub) => (
                  <div key={pub.id} className="flex items-center justify-between p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{pub.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {pub.city || pub.postcode || 'Unknown'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pubs verified today</p>
            )}
          </ExpandableSection>

          {/* New Pubs Added */}
          <ExpandableSection
            title="New Pubs Added"
            count={summary?.totals.newPubsToday || 0}
            isOpen={newPubsOpen}
            onToggle={() => setNewPubsOpen(!newPubsOpen)}
            isLoading={newPubs.isLoading}
            onExpand={() => newPubs.refetch()}
          >
            {newPubs.data?.pubs && newPubs.data.pubs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {newPubs.data.pubs.map((pub) => (
                  <div key={pub.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-green-500" />
                        <span className="font-medium">{pub.name}</span>
                      </div>
                      {pub.addressLine1 && (
                        <p className="text-xs text-muted-foreground ml-6">{pub.addressLine1}</p>
                      )}
                    </div>
                    <Badge variant="outline">{pub.postcode || 'No postcode'}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No new pubs added today</p>
            )}
          </ExpandableSection>

          {/* Events Found */}
          <ExpandableSection
            title="Events Found"
            count={summary?.totals.eventsDiscovered || 0}
            isOpen={eventsOpen}
            onToggle={() => setEventsOpen(!eventsOpen)}
            isLoading={discoveredEvents.isLoading}
            onExpand={() => discoveredEvents.refetch()}
          >
            {discoveredEvents.data?.events && discoveredEvents.data.events.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {discoveredEvents.data.events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between p-2 rounded border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        <span className="font-medium">{event.name}</span>
                      </div>
                      {event.standaloneLocation && (
                        <p className="text-xs text-muted-foreground ml-6">{event.standaloneLocation}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">{event.thingType}</Badge>
                      {event.startDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(event.startDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No events discovered today</p>
            )}
          </ExpandableSection>

          {/* Errors */}
          <ExpandableSection
            title="Errors"
            count={0}
            isOpen={errorsOpen}
            onToggle={() => setErrorsOpen(!errorsOpen)}
          >
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm">No errors reported</span>
            </div>
          </ExpandableSection>
        </CardContent>
      </Card>
    </div>
  );
}

