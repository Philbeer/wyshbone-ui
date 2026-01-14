/**
 * VerificationDetails Component
 *
 * Expandable section showing detailed "What to Check" verification steps
 * for human testing of task implementation.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Clock, Eye, AlertTriangle } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';

interface VerificationDetailsProps {
  task: PhaseTask;
}

export function VerificationDetails({ task }: VerificationDetailsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!task.humanVerification) {
    return null;
  }

  const { whatToCheck, successLooksLike, commonIssues, whereToCheck, timeNeeded } = task.humanVerification;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardContent className="p-0">
        <Button
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          className="w-full justify-between p-4 h-auto hover:bg-blue-500/10"
        >
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="text-2xl">👤</span>
            <div className="text-left">
              <h4 className="font-semibold text-base">What You Need to Check as a Human</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detailed verification steps ({timeNeeded})
              </p>
            </div>
          </div>
        </Button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4">
            {/* Where to Check */}
            <div className="flex items-center gap-2 text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <Eye className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div>
                <strong className="text-blue-700">Where to look:</strong>{' '}
                <span className="text-muted-foreground">{whereToCheck}</span>
              </div>
            </div>

            {/* Time Estimate */}
            <div className="flex items-center gap-2 text-sm bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
              <Clock className="h-4 w-4 text-purple-600 flex-shrink-0" />
              <div>
                <strong className="text-purple-700">Time needed:</strong>{' '}
                <span className="text-muted-foreground">{timeNeeded}</span>
              </div>
            </div>

            {/* Verification Steps */}
            <div className="verification-steps">
              <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="text-lg">✅</span>
                Verification Steps:
              </h5>
              <ol className="space-y-2 ml-7">
                {whatToCheck.map((step, i) => (
                  <li key={i} className="text-sm text-muted-foreground leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Success Looks Like */}
            <div className="success-criteria bg-green-500/10 border-l-4 border-green-500 rounded p-4">
              <h5 className="font-semibold text-sm mb-2 text-green-700">
                ✅ Success Looks Like:
              </h5>
              <pre className="text-xs text-green-900 dark:text-green-100 whitespace-pre-wrap font-mono leading-relaxed">
                {successLooksLike}
              </pre>
            </div>

            {/* Common Issues */}
            {commonIssues.length > 0 && (
              <details className="common-issues group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center gap-2 text-sm font-semibold bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 hover:bg-orange-500/20 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <span>⚠️ Common Issues (if something goes wrong)</span>
                    <ChevronRight className="h-4 w-4 ml-auto group-open:rotate-90 transition-transform" />
                  </div>
                </summary>
                <ul className="mt-2 space-y-2 ml-7">
                  {commonIssues.map((issue, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      {issue}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
