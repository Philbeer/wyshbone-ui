/**
 * Events Calendar Page
 * 
 * Displays upcoming events, festivals, and opportunities for brewery sales.
 * Uses AI-discovered events from the sleeper agent.
 */

import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { 
  Calendar, 
  MapPin, 
  Building2, 
  Clock, 
  Users, 
  Star, 
  Heart, 
  HeartOff,
  Check,
  ExternalLink,
  Ticket,
  Filter,
  CalendarDays,
  List,
  Sparkles,
  Beer,
  Coffee,
  Music,
  PartyPopper,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  useUpcomingEvents, 
  useMarkEventInterested, 
  useMarkEventAttended,
  type Thing 
} from '@/hooks/useEntityResolution';

// ============================================
// TYPES
// ============================================

type EventTab = 'upcoming' | 'interested' | 'attended' | 'past';
type ViewMode = 'list' | 'calendar';

type EventTypeFilter = 
  | 'all' 
  | 'beer_festival' 
  | 'beer_tasting' 
  | 'trade_show' 
  | 'brewery_open_day' 
  | 'tap_takeover' 
  | 'meet_the_brewer'
  | 'food_festival'
  | 'pub_event'
  | 'market'
  | 'live_music';

// ============================================
// CONSTANTS
// ============================================

const EVENT_TYPE_LABELS: Record<string, string> = {
  beer_festival: 'Beer Festival',
  beer_tasting: 'Beer Tasting',
  trade_show: 'Trade Show',
  brewery_open_day: 'Brewery Open Day',
  tap_takeover: 'Tap Takeover',
  meet_the_brewer: 'Meet the Brewer',
  food_festival: 'Food Festival',
  pub_event: 'Pub Event',
  market: 'Market',
  live_music: 'Live Music',
  pub_quiz: 'Pub Quiz',
  other: 'Other',
};

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  beer_festival: <Beer className="h-4 w-4" />,
  beer_tasting: <Beer className="h-4 w-4" />,
  trade_show: <Building2 className="h-4 w-4" />,
  brewery_open_day: <Building2 className="h-4 w-4" />,
  tap_takeover: <Beer className="h-4 w-4" />,
  meet_the_brewer: <Users className="h-4 w-4" />,
  food_festival: <PartyPopper className="h-4 w-4" />,
  pub_event: <Beer className="h-4 w-4" />,
  market: <Building2 className="h-4 w-4" />,
  live_music: <Music className="h-4 w-4" />,
  pub_quiz: <Coffee className="h-4 w-4" />,
  other: <Calendar className="h-4 w-4" />,
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  beer_festival: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  beer_tasting: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  trade_show: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  brewery_open_day: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  tap_takeover: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  meet_the_brewer: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  food_festival: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  pub_event: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  market: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  live_music: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatEventDate(startDate?: string | null, endDate?: string | null): string {
  if (!startDate) return 'Date TBC';
  
  const start = new Date(startDate);
  const formatOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  };
  
  if (endDate && endDate !== startDate) {
    const end = new Date(endDate);
    // Same month
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-GB', formatOptions)}`;
    }
    return `${start.toLocaleDateString('en-GB', formatOptions)} - ${end.toLocaleDateString('en-GB', formatOptions)}`;
  }
  
  return start.toLocaleDateString('en-GB', formatOptions);
}

function getRelevanceLevel(score?: number | null): 'high' | 'medium' | 'low' {
  if (!score || score < 0.5) return 'low';
  if (score < 0.75) return 'medium';
  return 'high';
}

function getRelevanceColor(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high':
      return 'text-green-600 dark:text-green-400';
    case 'medium':
      return 'text-amber-600 dark:text-amber-400';
    case 'low':
      return 'text-gray-400 dark:text-gray-500';
  }
}

function isEventPast(startDate?: string | null): boolean {
  if (!startDate) return false;
  return new Date(startDate) < new Date();
}

function isEventToday(startDate?: string | null): boolean {
  if (!startDate) return false;
  const today = new Date();
  const eventDate = new Date(startDate);
  return (
    eventDate.getDate() === today.getDate() &&
    eventDate.getMonth() === today.getMonth() &&
    eventDate.getFullYear() === today.getFullYear()
  );
}

function getDaysUntil(startDate?: string | null): number | null {
  if (!startDate) return null;
  const today = new Date();
  const eventDate = new Date(startDate);
  const diffTime = eventDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ============================================
// EVENT CARD COMPONENT
// ============================================

interface EventCardProps {
  event: Thing;
  onMarkInterested?: (interested: boolean) => void;
  onMarkAttended?: (attended: boolean) => void;
  isUpdating?: boolean;
}

function EventCard({ event, onMarkInterested, onMarkAttended, isUpdating }: EventCardProps) {
  const eventType = event.thingType || 'other';
  const relevanceLevel = getRelevanceLevel(event.relevanceScore);
  const daysUntil = getDaysUntil(event.startDate);
  const isPast = isEventPast(event.startDate);
  const isToday = isEventToday(event.startDate);
  
  const location = event.outlet?.name || event.standaloneLocation || 'Location TBC';
  const postcode = event.outlet?.postcode || event.standalonePostcode;
  
  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-md ${isPast ? 'opacity-75' : ''}`}>
      {/* Relevance indicator bar */}
      <div 
        className={`absolute top-0 left-0 right-0 h-1 ${
          relevanceLevel === 'high' ? 'bg-green-500' :
          relevanceLevel === 'medium' ? 'bg-amber-500' :
          'bg-gray-300'
        }`}
      />
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge 
                variant="secondary" 
                className={`${EVENT_TYPE_COLORS[eventType] || EVENT_TYPE_COLORS.other} flex items-center gap-1`}
              >
                {EVENT_TYPE_ICONS[eventType] || EVENT_TYPE_ICONS.other}
                <span>{EVENT_TYPE_LABELS[eventType] || eventType}</span>
              </Badge>
              
              {event.outlet && (
                <Badge variant="outline" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  Venue
                </Badge>
              )}
            </div>
            
            <CardTitle className="text-lg line-clamp-2">{event.name}</CardTitle>
          </div>
          
          {/* Relevance indicator */}
          <div className="flex flex-col items-end gap-1">
            <div className={`flex items-center gap-1 ${getRelevanceColor(relevanceLevel)}`}>
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-medium capitalize">{relevanceLevel}</span>
            </div>
            
            {/* Days until badge */}
            {!isPast && daysUntil !== null && (
              <Badge 
                variant={isToday ? 'destructive' : daysUntil <= 7 ? 'default' : 'secondary'}
                className="text-xs"
              >
                {isToday ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
              </Badge>
            )}
            
            {isPast && (
              <Badge variant="secondary" className="text-xs">
                Finished
              </Badge>
            )}
          </div>
        </div>
        
        <CardDescription className="flex flex-col gap-1 mt-2">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 flex-shrink-0" />
            <span>{formatEventDate(event.startDate, event.endDate)}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">
              {location}
              {postcode && ` (${postcode})`}
            </span>
          </div>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pb-2">
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {event.description}
          </p>
        )}
        
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {event.organizer && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {event.organizer}
            </span>
          )}
          
          {event.expectedAttendance && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              ~{event.expectedAttendance.toLocaleString()} expected
            </span>
          )}
          
          {event.ticketPrice && (
            <span className="flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              £{parseFloat(event.ticketPrice).toFixed(2)}
            </span>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="pt-2 pb-4 flex flex-wrap gap-2">
        {/* Interest button */}
        <Button
          variant={event.userInterested ? 'default' : 'outline'}
          size="sm"
          onClick={() => onMarkInterested?.(!event.userInterested)}
          disabled={isUpdating}
          className={event.userInterested ? 'bg-pink-600 hover:bg-pink-700' : ''}
        >
          {event.userInterested ? (
            <>
              <Heart className="h-4 w-4 mr-1 fill-current" />
              Interested
            </>
          ) : (
            <>
              <HeartOff className="h-4 w-4 mr-1" />
              Mark Interested
            </>
          )}
        </Button>
        
        {/* Attended button (only for past or today events) */}
        {(isPast || isToday) && (
          <Button
            variant={event.userAttended ? 'default' : 'outline'}
            size="sm"
            onClick={() => onMarkAttended?.(!event.userAttended)}
            disabled={isUpdating}
            className={event.userAttended ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {event.userAttended ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Attended
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                Mark Attended
              </>
            )}
          </Button>
        )}
        
        {/* View Details / External Link */}
        {event.url && (
          <Button variant="ghost" size="sm" asChild>
            <a href={event.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Website
            </a>
          </Button>
        )}
        
        {/* Link to outlet */}
        {event.outlet && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/crm/customers/${event.outlet.id}`}>
              <Building2 className="h-4 w-4 mr-1" />
              View Outlet
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// ============================================
// EMPTY STATE COMPONENT
// ============================================

interface EmptyStateProps {
  tab: EventTab;
  hasTypeFilter: boolean;
}

function EmptyState({ tab, hasTypeFilter }: EmptyStateProps) {
  const messages: Record<EventTab, { title: string; description: string; icon: React.ReactNode }> = {
    upcoming: {
      title: 'No Upcoming Events',
      description: hasTypeFilter 
        ? 'No events match your current filter. Try selecting a different event type.'
        : 'The AI sleeper agent hasn\'t discovered any upcoming events yet. Check back soon or start a discovery search.',
      icon: <Calendar className="h-12 w-12 text-muted-foreground" />,
    },
    interested: {
      title: 'No Events Marked',
      description: 'Mark events as "Interested" to track them here.',
      icon: <Heart className="h-12 w-12 text-muted-foreground" />,
    },
    attended: {
      title: 'No Events Attended',
      description: 'Mark events you\'ve attended to build your history.',
      icon: <Check className="h-12 w-12 text-muted-foreground" />,
    },
    past: {
      title: 'No Past Events',
      description: 'Past events will appear here after they\'ve ended.',
      icon: <Clock className="h-12 w-12 text-muted-foreground" />,
    },
  };
  
  const { title, description, icon } = messages[tab];
  
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon}
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md">{description}</p>
      
      {tab === 'upcoming' && (
        <Button className="mt-4" asChild>
          <Link href="/crm/settings">
            <Sparkles className="h-4 w-4 mr-2" />
            Configure Discovery
          </Link>
        </Button>
      )}
    </div>
  );
}

// ============================================
// LOADING STATE COMPONENT
// ============================================

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-24 mb-2" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-28 mr-2" />
            <Skeleton className="h-9 w-20" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// MAIN EVENTS PAGE COMPONENT
// ============================================

export default function EventsPage() {
  const [activeTab, setActiveTab] = useState<EventTab>('upcoming');
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // Fetch events
  const { data: allEvents, isLoading, error } = useUpcomingEvents(undefined, 100);
  
  // Mutations
  const markInterested = useMarkEventInterested();
  const markAttended = useMarkEventAttended();
  
  // Filter and sort events
  const filteredEvents = useMemo(() => {
    if (!allEvents) return [];
    
    let events = [...allEvents];
    
    // Filter by type
    if (typeFilter !== 'all') {
      events = events.filter(e => e.thingType === typeFilter);
    }
    
    // Filter by tab
    switch (activeTab) {
      case 'upcoming':
        events = events.filter(e => !isEventPast(e.startDate));
        break;
      case 'interested':
        events = events.filter(e => e.userInterested);
        break;
      case 'attended':
        events = events.filter(e => e.userAttended);
        break;
      case 'past':
        events = events.filter(e => isEventPast(e.startDate));
        break;
    }
    
    // Sort by relevance score (high first) then by date
    events.sort((a, b) => {
      // Relevance first
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      // Then by date
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return dateA - dateB;
    });
    
    return events;
  }, [allEvents, typeFilter, activeTab]);
  
  // Count events for tabs
  const tabCounts = useMemo(() => {
    if (!allEvents) return { upcoming: 0, interested: 0, attended: 0, past: 0 };
    
    return {
      upcoming: allEvents.filter(e => !isEventPast(e.startDate)).length,
      interested: allEvents.filter(e => e.userInterested).length,
      attended: allEvents.filter(e => e.userAttended).length,
      past: allEvents.filter(e => isEventPast(e.startDate)).length,
    };
  }, [allEvents]);
  
  // Handlers
  const handleMarkInterested = (event: Thing, interested: boolean) => {
    markInterested.mutate({ thingId: event.id, interested });
  };
  
  const handleMarkAttended = (event: Thing, attended: boolean) => {
    markAttended.mutate({ thingId: event.id, attended });
  };
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-8 w-8" />
            Events
          </h1>
          <p className="text-muted-foreground">
            Discover and track beer festivals, trade shows, and more
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              className="rounded-l-none"
              disabled
              title="Calendar view coming soon"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Type filter */}
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EventTypeFilter)}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="beer_festival">Beer Festivals</SelectItem>
              <SelectItem value="trade_show">Trade Shows</SelectItem>
              <SelectItem value="brewery_open_day">Brewery Open Days</SelectItem>
              <SelectItem value="meet_the_brewer">Meet the Brewer</SelectItem>
              <SelectItem value="tap_takeover">Tap Takeovers</SelectItem>
              <SelectItem value="beer_tasting">Beer Tastings</SelectItem>
              <SelectItem value="food_festival">Food Festivals</SelectItem>
              <SelectItem value="pub_event">Pub Events</SelectItem>
              <SelectItem value="live_music">Live Music</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-destructive">Failed to load events. Please try again.</p>
          </CardContent>
        </Card>
      )}
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EventTab)}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="upcoming" className="relative">
            Upcoming
            {tabCounts.upcoming > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {tabCounts.upcoming}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interested">
            Interested
            {tabCounts.interested > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {tabCounts.interested}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="attended">
            Attended
            {tabCounts.attended > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {tabCounts.attended}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">
            Past
            {tabCounts.past > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {tabCounts.past}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        {/* Tab Content */}
        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <LoadingState />
          ) : filteredEvents.length === 0 ? (
            <EmptyState tab={activeTab} hasTypeFilter={typeFilter !== 'all'} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onMarkInterested={(interested) => handleMarkInterested(event, interested)}
                  onMarkAttended={(attended) => handleMarkAttended(event, attended)}
                  isUpdating={markInterested.isPending || markAttended.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Summary Footer */}
      {!isLoading && filteredEvents.length > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-4">
          Showing {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}
          {typeFilter !== 'all' && ` (filtered by ${EVENT_TYPE_LABELS[typeFilter]})`}
        </div>
      )}
    </div>
  );
}


