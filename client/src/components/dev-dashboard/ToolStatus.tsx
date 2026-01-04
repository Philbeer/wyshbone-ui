/**
 * Tool Status Component
 * Shows status of all 5 tools in the system
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, HelpCircle, Wrench, FileCode } from 'lucide-react';
import { Tool } from '@/services/devProgressService';

interface Props {
  tools: Tool[];
}

export function ToolStatus({ tools }: Props) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />;
      case 'broken':
        return <XCircle className="h-6 w-6 text-destructive" />;
      case 'stubbed':
        return <Wrench className="h-6 w-6 text-yellow-500" />;
      case 'unknown':
        return <HelpCircle className="h-6 w-6 text-muted-foreground" />;
      default:
        return <HelpCircle className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'working':
        return <Badge className="bg-green-500">Working</Badge>;
      case 'broken':
        return <Badge variant="destructive">Broken</Badge>;
      case 'stubbed':
        return <Badge variant="secondary">Stubbed</Badge>;
      case 'unknown':
        return <Badge variant="outline">Unknown</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const workingTools = tools.filter((t) => t.status === 'working');
  const brokenTools = tools.filter((t) => t.status === 'broken');
  const stubbedTools = tools.filter((t) => t.status === 'stubbed');
  const unknownTools = tools.filter((t) => t.status === 'unknown');

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Tools Overview</CardTitle>
          <CardDescription>
            {workingTools.length} working • {stubbedTools.length} stubbed • {brokenTools.length} broken •{' '}
            {unknownTools.length} unknown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{workingTools.length}</div>
              <p className="text-sm text-muted-foreground">Working</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500">{stubbedTools.length}</div>
              <p className="text-sm text-muted-foreground">Stubbed</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-destructive">{brokenTools.length}</div>
              <p className="text-sm text-muted-foreground">Broken</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-muted-foreground">{unknownTools.length}</div>
              <p className="text-sm text-muted-foreground">Unknown</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tool Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tools.map((tool) => (
          <Card key={tool.id} className={tool.status === 'broken' ? 'border-destructive' : ''}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(tool.status)}
                  <div>
                    <CardTitle className="text-lg font-mono">{tool.name}</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      {tool.description}
                    </CardDescription>
                  </div>
                </div>
                {getStatusBadge(tool.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono">
                <FileCode className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{tool.location}</span>
              </div>
              {tool.lastTested && (
                <p className="text-xs text-muted-foreground">Last tested: {tool.lastTested}</p>
              )}
              {tool.status === 'stubbed' && (
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded text-xs text-yellow-800 dark:text-yellow-300">
                  This tool returns mock data and needs full implementation
                </div>
              )}
              {tool.status === 'broken' && (
                <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-xs text-red-800 dark:text-red-300">
                  This tool is not functioning correctly and needs fixing
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Implementation Notes */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-base">Implementation Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-blue-900 dark:text-blue-200">
          <p>
            <strong>Working tools:</strong> Fully functional and tested
          </p>
          <p>
            <strong>Stubbed tools:</strong> Return mock data, need real implementation
          </p>
          <p>
            <strong>Broken tools:</strong> Have issues preventing execution
          </p>
          <p>
            <strong>Unknown tools:</strong> Status needs verification
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
