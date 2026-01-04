/**
 * Architecture Health Component
 * Displays the health status of all 4 repos in the Wyshbone architecture
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { RepoStatus } from '@/services/devProgressService';

interface Props {
  repos: RepoStatus[];
}

export function ArchitectureHealth({ repos }: Props) {
  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'partial':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <HelpCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'bg-green-500';
      case 'partial':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getIntegrationBadgeVariant = (status: string) => {
    switch (status) {
      case 'working':
        return 'default' as const;
      case 'partial':
        return 'secondary' as const;
      case 'missing':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {repos.map((repo) => (
        <Card key={repo.name} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  {getHealthIcon(repo.health)}
                  {repo.displayName}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {repo.name}
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{repo.completion}%</div>
                <p className="text-xs text-muted-foreground">Complete</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div>
              <Progress
                value={repo.completion}
                className="h-2"
                style={{
                  backgroundColor: 'hsl(var(--muted))',
                }}
              />
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {repo.description}
            </p>

            {/* Integrations */}
            <div>
              <h4 className="text-sm font-medium mb-2">Integrations:</h4>
              <div className="flex flex-wrap gap-2">
                {repo.integrations.map((integration) => (
                  <Badge
                    key={integration.name}
                    variant={getIntegrationBadgeVariant(integration.status)}
                    className="text-xs"
                  >
                    {integration.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Key Files */}
            {repo.keyFiles.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Key Files:</h4>
                <div className="space-y-1">
                  {repo.keyFiles.slice(0, 3).map((file) => (
                    <div key={file} className="text-xs font-mono text-muted-foreground truncate">
                      {file}
                    </div>
                  ))}
                  {repo.keyFiles.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      + {repo.keyFiles.length - 3} more...
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
