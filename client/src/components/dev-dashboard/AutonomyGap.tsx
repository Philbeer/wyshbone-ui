/**
 * Autonomy Gap Component
 * Visualizes the gap between current "Plan Execution" and target "Autonomous Agent"
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  gap: {
    current: string;
    target: string;
    gapPercentage: number;
    missingFeatures: string[];
  };
}

export function AutonomyGap({ gap }: Props) {
  const achievedPercentage = 100 - gap.gapPercentage;

  return (
    <Card>
      <CardHeader>
        <CardTitle>The Path to Autonomous Operation</CardTitle>
        <CardDescription>
          Bridging the gap between user-led execution and true autonomous agent behavior
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visual Flow */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-muted rounded-lg">
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h4 className="font-semibold">Current State</h4>
            </div>
            <p className="text-sm text-muted-foreground">{gap.current}</p>
            <p className="text-xs text-muted-foreground mt-1">User → Sets Goal → Approve → Execute</p>
          </div>

          <ArrowRight className="h-8 w-8 text-muted-foreground flex-shrink-0 rotate-90 sm:rotate-0" />

          <div className="flex-1 text-center sm:text-right">
            <div className="flex items-center justify-center sm:justify-end gap-2 mb-2">
              <h4 className="font-semibold">Target State</h4>
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">{gap.target}</p>
            <p className="text-xs text-muted-foreground mt-1">Agent → Decides → Plans → Executes → Notifies</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">Progress to Full Autonomy</span>
            <span className="text-sm font-medium">{achievedPercentage}%</span>
          </div>
          <Progress value={achievedPercentage} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {gap.gapPercentage}% gap remaining to achieve autonomous operation
          </p>
        </div>

        {/* Missing Features */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Missing Features for Full Autonomy:</h4>
          <ul className="space-y-2">
            {gap.missingFeatures.map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Key Insight */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
          <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
            Critical Insight
          </h4>
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            The current system implements <strong>plan execution</strong> (user-initiated, approval-gated) but not
            <strong> autonomous agency</strong> (self-directed, continuous operation). This is the fundamental
            gap that Phase 2 and 3 will address.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
