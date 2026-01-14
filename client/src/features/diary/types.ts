/**
 * Sales Diary Types
 * 
 * TypeScript interfaces for the Call Diary feature.
 */

export type EntityType = 'customer' | 'lead';

export type CallOutcome = 'connected' | 'voicemail' | 'no-answer' | 'rescheduled' | 'cancelled';

export interface CallDiaryEntry {
  id: number;
  workspaceId: string;
  entityType: EntityType;
  entityId: string;
  scheduledDate: number; // Unix timestamp
  completed: number; // 0 or 1
  completedDate: number | null;
  notes: string | null;
  outcome: CallOutcome | string | null;
  createdAt: number;
  createdBy: string | null;
  updatedAt: number;
}

// Extended entry with entity details (from joined query)
export interface CallDiaryEntryWithEntity extends CallDiaryEntry {
  entityName?: string;
  entityCompany?: string;
  entityCounty?: string;
  entityStatus?: string;
  entityEmail?: string;
  entityPhone?: string;
}

export interface DiaryFilters {
  entityType?: EntityType;
  startDate?: number;
  endDate?: number;
  completed?: boolean;
  county?: string;
  limit?: number;
  offset?: number;
}

export interface NewCallDiaryEntry {
  entityType: EntityType;
  entityId: string;
  scheduledDate: number;
  notes?: string;
}

export interface CompleteCallData {
  id: number;
  outcome: CallOutcome;
  notes?: string;
}

export interface RescheduleCallData {
  id: number;
  scheduledDate: number;
}

// Helper function to format scheduled date
export function formatScheduledDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Helper function to format relative date
export function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  const absDiff = Math.abs(diff);
  
  const minutes = Math.floor(absDiff / (1000 * 60));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  
  const isPast = diff < 0;
  
  if (days > 7) {
    return formatScheduledDate(timestamp);
  }
  
  if (days >= 1) {
    return isPast ? `${days} day${days > 1 ? 's' : ''} ago` : `in ${days} day${days > 1 ? 's' : ''}`;
  }
  
  if (hours >= 1) {
    return isPast ? `${hours} hour${hours > 1 ? 's' : ''} ago` : `in ${hours} hour${hours > 1 ? 's' : ''}`;
  }
  
  if (minutes >= 1) {
    return isPast ? `${minutes} minute${minutes > 1 ? 's' : ''} ago` : `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  
  return 'now';
}

// Check if a date is today
export function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// Check if a date is in the past
export function isPast(timestamp: number): boolean {
  return timestamp < Date.now();
}

// Outcome display labels
export const outcomeLabels: Record<CallOutcome, string> = {
  'connected': 'Connected',
  'voicemail': 'Left Voicemail',
  'no-answer': 'No Answer',
  'rescheduled': 'Rescheduled',
  'cancelled': 'Cancelled',
};

// Outcome colors for badges
export const outcomeColors: Record<CallOutcome, string> = {
  'connected': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'voicemail': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'no-answer': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'rescheduled': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'cancelled': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

