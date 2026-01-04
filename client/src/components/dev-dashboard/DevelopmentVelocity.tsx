/**
 * Development Velocity Component
 * Shows development activity, TODO counts, and active vs stale areas
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitCommit, TrendingUp, AlertCircle, FileCode } from 'lucide-react';

interface Props {
  velocity: {
    recentActivity: string[];
    activeAreas: string[];
    staleAreas: string[];
    todosByFile: { file: string; count: number }[];
  };
}

export function DevelopmentVelocity({ velocity }: Props) {
  return (
    <div className="space-y-6">
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest commits and changes</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {velocity.recentActivity.map((activity, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <span>{activity}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Active vs Stale Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Areas */}
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-200">
              <TrendingUp className="h-5 w-5" />
              Active Development
            </CardTitle>
            <CardDescription>Recently updated areas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {velocity.activeAreas.map((area, index) => (
                <Badge
                  key={index}
                  className="bg-green-500 text-white mr-2 mb-2"
                >
                  {area}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stale Areas */}
        <Card className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-900 dark:text-yellow-200">
              <AlertCircle className="h-5 w-5" />
              Stale Areas
            </CardTitle>
            <CardDescription>Not recently updated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {velocity.staleAreas.map((area, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="mr-2 mb-2"
                >
                  {area}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TODO/FIXME Hotspots */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            TODO/FIXME Hotspots
          </CardTitle>
          <CardDescription>Files with most TODO comments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {velocity.todosByFile.map((item, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono text-muted-foreground truncate flex-1">
                    {item.file}
                  </span>
                  <Badge variant="outline" className="ml-2">
                    {item.count} TODO{item.count !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-yellow-500 h-1.5 rounded-full"
                    style={{ width: `${Math.min(item.count * 10, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Total: 102 TODO/FIXME comments across 53 files
          </p>
        </CardContent>
      </Card>

      {/* Development Insights */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-base text-blue-900 dark:text-blue-200">
            Development Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900 dark:text-blue-200">
          <p>
            <strong>Active development:</strong> CRM features, route planner, and agent chat are seeing
            frequent updates.
          </p>
          <p>
            <strong>Attention needed:</strong> Learning system and WABS integration haven't been started.
            These are critical for Phase 2/3.
          </p>
          <p>
            <strong>Technical debt:</strong> 102 TODO comments suggest areas needing cleanup or completion.
            Consider a dedicated tech debt sprint.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
