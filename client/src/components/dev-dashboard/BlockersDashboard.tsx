/**
 * Blockers Dashboard Component
 * Displays current blockers and issues blocking development progress
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, FileCode } from 'lucide-react';
import { Blocker } from '@/services/devProgressService';

interface Props {
  blockers: Blocker[];
}

export function BlockersDashboard({ blockers }: Props) {
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive" className="text-xs">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-xs">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'high':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const criticalBlockers = blockers.filter((b) => b.severity === 'critical');
  const highBlockers = blockers.filter((b) => b.severity === 'high');
  const otherBlockers = blockers.filter((b) => b.severity !== 'critical' && b.severity !== 'high');

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="bg-destructive/10 border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Blockers Summary
          </CardTitle>
          <CardDescription>
            {criticalBlockers.length} critical • {highBlockers.length} high • {otherBlockers.length} medium/low
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Critical Blockers */}
      {criticalBlockers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 text-destructive">Critical Blockers</h3>
          <div className="space-y-3">
            {criticalBlockers.map((blocker) => (
              <Card key={blocker.id} className="border-destructive">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(blocker.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{blocker.title}</CardTitle>
                        {getSeverityBadge(blocker.severity)}
                      </div>
                      <CardDescription className="text-sm">
                        {blocker.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium mb-2">Affected Components:</h5>
                    <div className="flex flex-wrap gap-2">
                      {blocker.affectedComponents.map((component) => (
                        <Badge key={component} variant="outline" className="text-xs">
                          {component}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {blocker.location && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <FileCode className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{blocker.location}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* High Priority Blockers */}
      {highBlockers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">High Priority Blockers</h3>
          <div className="space-y-3">
            {highBlockers.map((blocker) => (
              <Card key={blocker.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(blocker.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{blocker.title}</CardTitle>
                        {getSeverityBadge(blocker.severity)}
                      </div>
                      <CardDescription className="text-sm">
                        {blocker.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium mb-2">Affected Components:</h5>
                    <div className="flex flex-wrap gap-2">
                      {blocker.affectedComponents.map((component) => (
                        <Badge key={component} variant="outline" className="text-xs">
                          {component}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {blocker.location && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <FileCode className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{blocker.location}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Other Blockers */}
      {otherBlockers.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Other Blockers</h3>
          <div className="space-y-3">
            {otherBlockers.map((blocker) => (
              <Card key={blocker.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(blocker.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{blocker.title}</CardTitle>
                        {getSeverityBadge(blocker.severity)}
                      </div>
                      <CardDescription className="text-sm">
                        {blocker.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium mb-2">Affected Components:</h5>
                    <div className="flex flex-wrap gap-2">
                      {blocker.affectedComponents.map((component) => (
                        <Badge key={component} variant="outline" className="text-xs">
                          {component}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {blocker.location && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <FileCode className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{blocker.location}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {blockers.length === 0 && (
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-900 dark:text-green-200 mb-2">
              No Blockers!
            </h3>
            <p className="text-sm text-green-800 dark:text-green-300">
              All systems are clear. Great work!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
