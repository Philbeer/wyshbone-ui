/**
 * SafetyBadge Component
 *
 * Displays safety level indicator for tasks to show whether testing is required
 * before continuing to next tasks.
 */

import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Shield } from 'lucide-react';

export type SafetyLevel = 'MUST_TEST_NOW' | 'QUICK_CHECK_RECOMMENDED' | 'CAN_TEST_LATER';

interface SafetyBadgeProps {
  level: SafetyLevel;
  className?: string;
}

export function SafetyBadge({ level, className = '' }: SafetyBadgeProps) {
  switch (level) {
    case 'MUST_TEST_NOW':
      return (
        <Badge
          variant="destructive"
          className={`text-xs flex items-center gap-1 animate-pulse ${className}`}
        >
          <AlertTriangle className="h-3 w-3" />
          Must Test Now
        </Badge>
      );

    case 'QUICK_CHECK_RECOMMENDED':
      return (
        <Badge
          variant="default"
          className={`text-xs flex items-center gap-1 bg-orange-500 hover:bg-orange-600 ${className}`}
        >
          <Shield className="h-3 w-3" />
          Quick Check Recommended
        </Badge>
      );

    case 'CAN_TEST_LATER':
      return (
        <Badge
          variant="outline"
          className={`text-xs flex items-center gap-1 border-green-500 text-green-700 ${className}`}
        >
          <CheckCircle className="h-3 w-3" />
          Can Test Later
        </Badge>
      );

    default:
      return null;
  }
}

/**
 * Get a description of what the safety level means
 */
export function getSafetyLevelDescription(level: SafetyLevel): string {
  switch (level) {
    case 'MUST_TEST_NOW':
      return 'This task blocks other tasks. You MUST verify it works before continuing.';

    case 'QUICK_CHECK_RECOMMENDED':
      return 'A quick verification (1-3 minutes) is recommended to catch issues early.';

    case 'CAN_TEST_LATER':
      return 'This task is safe to test later. It doesn\'t block other work.';

    default:
      return '';
  }
}
