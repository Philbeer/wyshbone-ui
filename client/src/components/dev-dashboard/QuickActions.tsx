/**
 * Quick Actions Component
 * Provides quick links to important files, documentation, and resources
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileText, Code, BookOpen, FileCode, Bug } from 'lucide-react';

export function QuickActions() {
  const planDocs = [
    { name: 'Vision & Philosophy', path: '/Wyshbone-grand-plan/wyshbone-vision.md' },
    { name: 'Architecture (4 Repos)', path: '/Wyshbone-grand-plan/agent-architecture-4repos.md' },
    { name: 'Current State Audit', path: '/Wyshbone-grand-plan/agent-audit-consolidated.md' },
    { name: 'Learning System Target', path: '/Wyshbone-grand-plan/agent-learning-target.md' },
    { name: 'Safety & Scope', path: '/Wyshbone-grand-plan/Safety-&-Scope-Constraints' },
  ];

  const criticalFiles = [
    { name: 'ClaudeService.ts (401 errors)', path: 'client/src/services/ClaudeService.ts', icon: Bug },
    { name: 'routes.ts (Main API)', path: 'server/routes.ts', icon: FileCode },
    { name: 'anthropic-agent.ts (Tools)', path: 'server/anthropic-agent.ts', icon: Code },
    { name: 'schema.ts (Database)', path: 'shared/schema.ts', icon: FileText },
    { name: 'ResultsPanel.tsx (Display)', path: 'client/src/components/results/ResultsPanel.tsx', icon: FileCode },
  ];

  const externalLinks = [
    { name: 'Wyshbone UI Repo', url: 'https://github.com/yourusername/wyshbone-ui', icon: ExternalLink },
    { name: 'Supervisor Repo', url: 'https://github.com/yourusername/wyshbone-supervisor', icon: ExternalLink },
    { name: 'Tower Repo', url: 'https://github.com/yourusername/wyshbone-control-tower', icon: ExternalLink },
    { name: 'WABS Repo', url: 'https://github.com/yourusername/wyshbone-behaviour', icon: ExternalLink },
  ];

  const handleOpenFile = (path: string) => {
    // In a real implementation, this would open the file in the IDE/editor
    console.log('Open file:', path);
    // For now, we'll just show a message
    alert(`Open this file in your editor:\n${path}`);
  };

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Plan Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5" />
            Plan Documents
          </CardTitle>
          <CardDescription>Project vision and architecture docs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {planDocs.map((doc) => (
              <Button
                key={doc.path}
                variant="ghost"
                className="w-full justify-start text-sm h-auto py-2 px-3"
                onClick={() => handleOpenFile(doc.path)}
              >
                <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="text-left truncate">{doc.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Critical Files */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code className="h-5 w-5" />
            Critical Files
          </CardTitle>
          <CardDescription>Key files for Phase 1 work</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {criticalFiles.map((file) => {
              const Icon = file.icon;
              return (
                <Button
                  key={file.path}
                  variant="ghost"
                  className="w-full justify-start text-sm h-auto py-2 px-3"
                  onClick={() => handleOpenFile(file.path)}
                >
                  <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-left truncate">{file.name}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* External Links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ExternalLink className="h-5 w-5" />
            Repositories
          </CardTitle>
          <CardDescription>4-repo architecture links</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {externalLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Button
                  key={link.url}
                  variant="ghost"
                  className="w-full justify-start text-sm h-auto py-2 px-3"
                  onClick={() => handleOpenLink(link.url)}
                >
                  <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="text-left truncate">{link.name}</span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
