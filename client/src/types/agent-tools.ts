/**
 * Agent Tools TypeScript Types
 * 
 * Type definitions for all Wyshbone tools based on TOOL_ANALYSIS.md
 * These types match the executeAction() interface in server/lib/actions.ts
 */

// =============================================================================
// TOOL TYPES
// =============================================================================

export type ToolName = 
  | 'quick_search'
  | 'deep_research'
  | 'email_finder'
  | 'scheduled_monitor'
  | 'nudges';

export type ToolStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

// =============================================================================
// QUICK SEARCH (Google Places)
// =============================================================================

export interface QuickSearchParams {
  query: string;           // Business type (e.g., "breweries", "pubs")
  location?: string;       // Location text (e.g., "Manchester")
  country?: string;        // ISO country code (default: "GB")
  maxResults?: number;     // Max results (default: 30)
}

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  lat?: number;
  lng?: number;
}

export interface QuickSearchResult {
  places: PlaceResult[];
  count: number;
  query: string;
  location?: string;
  country: string;
}

// =============================================================================
// DEEP RESEARCH
// =============================================================================

export interface DeepResearchParams {
  prompt: string;          // Research topic/query
  label?: string;          // Display name
  intensity?: 'standard' | 'ultra'; // Research depth
  counties?: string[];     // Geographic focus
  windowMonths?: number;   // Time window for dated evidence
}

export interface DeepResearchResult {
  run: {
    id: string;
    label: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
  };
  topic: string;
}

// =============================================================================
// EMAIL FINDER (Batch Contact Finder)
// =============================================================================

export interface EmailFinderParams {
  query: string;           // Business type
  location: string;        // Location
  country?: string;        // ISO country code (default: "GB")
  targetRole?: string;     // Job title to find (default: "General Manager")
  limit?: number;          // Max businesses (default: 30)
}

export interface EmailFinderResult {
  batchId: string;
  status: 'running' | 'completed' | 'failed';
  viewUrl: string;
}

// =============================================================================
// SCHEDULED MONITOR
// =============================================================================

export type MonitorSchedule = 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type MonitorType = 'deep_research' | 'business_search' | 'place_search';

export interface ScheduledMonitorParams {
  label: string;           // Monitor name
  description?: string;    // What to monitor (becomes research prompt)
  schedule?: MonitorSchedule; // Default: 'weekly'
  scheduleDay?: number;    // Day of week (0-6, 0=Sunday)
  scheduleTime?: string;   // Time in HH:MM format (default: '09:00')
  monitorType?: MonitorType; // Default: 'deep_research'
  config?: Record<string, unknown>;
  emailAddress?: string;   // Email for notifications
}

export interface ScheduledMonitorResult {
  monitor: {
    id: string;
    label: string;
    schedule: MonitorSchedule;
    nextRunAt: number;
  };
}

// =============================================================================
// NUDGES
// =============================================================================

export interface NudgesParams {
  limit?: number;          // Max nudges to return (default: 10)
}

export interface NudgesResult {
  nudges: Array<{
    id?: string;
    message?: string;
    type?: string;
    priority?: string;
  }>;
  count: number;
  message?: string;
}

// =============================================================================
// INTENT DETECTION
// =============================================================================

export interface DetectedIntent {
  tool: ToolName;
  params: QuickSearchParams | DeepResearchParams | EmailFinderParams | ScheduledMonitorParams;
  confidence: number;      // 0-1 confidence score
  reasoning?: string;      // Explanation of why this tool was chosen
  needsClarification?: boolean;
  clarificationQuestion?: string;
  suggestedFollowUps?: string[];
}

export interface IntentDetectionRequest {
  message: string;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  context?: {
    defaultCountry?: string;
    industry?: string;
    lastToolUsed?: ToolName;
    lastSearchResults?: PlaceResult[];
  };
}

// =============================================================================
// TOOL EXECUTION
// =============================================================================

export interface ToolExecutionRequest {
  tool: ToolName;
  params: Record<string, unknown>;
  userId?: string;
}

export interface ToolExecutionResult {
  ok: boolean;
  data?: QuickSearchResult | DeepResearchResult | EmailFinderResult | ScheduledMonitorResult | NudgesResult;
  note?: string;
  error?: string;
}

// =============================================================================
// CHAT MESSAGE TYPES
// =============================================================================

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCall?: {
    tool: ToolName;
    params: Record<string, unknown>;
    status: ToolStatus;
    result?: ToolExecutionResult;
  };
}

export interface ToolCallDisplay {
  id: string;
  tool: ToolName;
  status: ToolStatus;
  params: Record<string, unknown>;
  startTime: Date;
  endTime?: Date;
  result?: ToolExecutionResult;
  error?: string;
}

// =============================================================================
// TOOL METADATA (for UI display)
// =============================================================================

export interface ToolMetadata {
  name: ToolName;
  displayName: string;
  description: string;
  icon: string;  // Lucide icon name
  color: string; // Tailwind color class
  estimatedDuration: string;
  isAsync: boolean;
}

export const TOOL_METADATA: Record<ToolName, ToolMetadata> = {
  quick_search: {
    name: 'quick_search',
    displayName: 'Quick Search',
    description: 'Fast business search from Wyshbone Global Database',
    icon: 'Search',
    color: 'text-blue-600',
    estimatedDuration: '1-5 seconds',
    isAsync: false,
  },
  deep_research: {
    name: 'deep_research',
    displayName: 'Deep Research',
    description: 'Comprehensive web research with detailed reports',
    icon: 'Microscope',
    color: 'text-purple-600',
    estimatedDuration: '30 seconds - 8 minutes',
    isAsync: true,
  },
  email_finder: {
    name: 'email_finder',
    displayName: 'Email Finder',
    description: 'Find verified contact emails for businesses',
    icon: 'Mail',
    color: 'text-green-600',
    estimatedDuration: '30 seconds - 5 minutes',
    isAsync: true,
  },
  scheduled_monitor: {
    name: 'scheduled_monitor',
    displayName: 'Scheduled Monitor',
    description: 'Set up recurring automated monitoring',
    icon: 'Clock',
    color: 'text-orange-600',
    estimatedDuration: 'Instant setup',
    isAsync: false,
  },
  nudges: {
    name: 'nudges',
    displayName: 'Nudges',
    description: 'AI-generated suggestions for follow-ups',
    icon: 'Bell',
    color: 'text-amber-600',
    estimatedDuration: 'Instant',
    isAsync: false,
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getToolMetadata(tool: ToolName): ToolMetadata {
  return TOOL_METADATA[tool];
}

export function formatToolParams(tool: ToolName, params: Record<string, unknown>): string {
  switch (tool) {
    case 'quick_search':
      return `${params.query} in ${params.location || 'your area'}`;
    case 'deep_research':
      return `Research: ${params.prompt || params.topic}`;
    case 'email_finder':
      return `Find emails for ${params.query} in ${params.location}`;
    case 'scheduled_monitor':
      return `Monitor: ${params.label}`;
    case 'nudges':
      return 'Getting suggestions...';
    default:
      return JSON.stringify(params);
  }
}


