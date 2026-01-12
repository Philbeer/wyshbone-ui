import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, PlayCircle, AlertCircle } from 'lucide-react';

interface Task {
  id: string;
  description: string;
  status: 'not-started' | 'in-progress' | 'complete' | 'blocked';
  outcome?: string;
  verification?: string;
  evidence?: string;
}

interface Epic {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'complete' | 'blocked';
  targetRepo?: string;
  lastUpdated?: string;
  tasks: Task[];
}

interface Phase {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'complete';
  epics: Epic[];
}

export default function WorkflowPage() {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    fetchWorkflowLedger();
  }, []);

  const fetchWorkflowLedger = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/workflow/ledger');

      if (!response.ok) {
        throw new Error('Failed to fetch workflow ledger');
      }

      const markdown = await response.text();
      const parsed = parseWorkflowLedger(markdown);
      setPhases(parsed.phases);
      setLastUpdated(parsed.lastUpdated);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const parseWorkflowLedger = (markdown: string): { phases: Phase[], lastUpdated: string } => {
    const phases: Phase[] = [];
    let currentPhase: Phase | null = null;
    let currentEpic: Epic | null = null;
    let currentTask: Task | null = null;
    let lastUpdated = '';

    const lines = markdown.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Extract last_updated from frontmatter
      if (line.startsWith('last_updated:')) {
        lastUpdated = line.replace('last_updated:', '').trim();
      }

      // Phase (## Phase X: Name)
      if (line.match(/^## Phase \d+:/)) {
        if (currentPhase) {
          if (currentEpic) {
            if (currentTask) currentEpic.tasks.push(currentTask);
            currentPhase.epics.push(currentEpic);
          }
          phases.push(currentPhase);
        }

        const phaseName = line.replace(/^## Phase \d+: /, '');
        currentPhase = {
          id: `phase-${phases.length + 1}`,
          name: phaseName,
          status: 'not-started',
          epics: []
        };
        currentEpic = null;
        currentTask = null;
      }

      // Epic (### Epic X.Y: Name)
      else if (line.match(/^### Epic \d+\.\d+:/)) {
        if (currentEpic && currentPhase) {
          if (currentTask) currentEpic.tasks.push(currentTask);
          currentPhase.epics.push(currentEpic);
        }

        const epicName = line.replace(/^### Epic \d+\.\d+: /, '');
        currentEpic = {
          id: `epic-${currentPhase?.epics.length || 0}`,
          name: epicName,
          status: 'not-started',
          tasks: []
        };
        currentTask = null;
      }

      // Status line
      else if (line.match(/^Status:/)) {
        const status = line.replace(/^Status: /, '').trim() as any;
        if (currentEpic) {
          currentEpic.status = status;
        } else if (currentPhase) {
          currentPhase.status = status;
        }
      }

      // Target Repo
      else if (line.match(/^Target Repo:/)) {
        if (currentEpic) {
          currentEpic.targetRepo = line.replace(/^Target Repo: /, '').trim();
        }
      }

      // Last Updated
      else if (line.match(/^Last Updated:/)) {
        if (currentEpic) {
          currentEpic.lastUpdated = line.replace(/^Last Updated: /, '').trim();
        }
      }

      // Task
      else if (line.match(/^- \[([ →x!])\] Task \d+:/)) {
        if (currentTask && currentEpic) {
          currentEpic.tasks.push(currentTask);
        }

        const statusMatch = line.match(/\[([ →x!])\]/);
        const taskDesc = line.replace(/^- \[[ →x!]\] Task \d+: /, '');

        let status: 'not-started' | 'in-progress' | 'complete' | 'blocked' = 'not-started';
        if (statusMatch) {
          const marker = statusMatch[1];
          if (marker === '→') status = 'in-progress';
          else if (marker === 'x') status = 'complete';
          else if (marker === '!') status = 'blocked';
        }

        currentTask = {
          id: `task-${currentEpic?.tasks.length || 0}`,
          description: taskDesc,
          status
        };
      }

      // Task metadata
      else if (line.match(/^\s+- Outcome:/)) {
        if (currentTask) currentTask.outcome = line.replace(/^\s+- Outcome: /, '').trim();
      }
      else if (line.match(/^\s+- Verification:/)) {
        if (currentTask) currentTask.verification = line.replace(/^\s+- Verification: /, '').trim();
      }
      else if (line.match(/^\s+- Evidence:/)) {
        if (currentTask) currentTask.evidence = line.replace(/^\s+- Evidence: /, '').trim();
      }
    }

    // Push final phase/epic/task
    if (currentTask && currentEpic) currentEpic.tasks.push(currentTask);
    if (currentEpic && currentPhase) currentPhase.epics.push(currentEpic);
    if (currentPhase) phases.push(currentPhase);

    return { phases, lastUpdated };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'in-progress': return <PlayCircle className="h-4 w-4 text-blue-600" />;
      case 'blocked': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'complete': 'bg-green-100 text-green-800',
      'in-progress': 'bg-blue-100 text-blue-800',
      'blocked': 'bg-red-100 text-red-800',
      'not-started': 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={variants[status] || variants['not-started']}>
        {status.replace('-', ' ')}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Loading workflow...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-destructive">Error: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflow Dashboard</h1>
          <p className="text-muted-foreground">Autonomous development progress</p>
        </div>
        {lastUpdated && (
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {phases.map((phase) => (
          <Card key={phase.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {getStatusIcon(phase.status)}
                  {phase.name}
                </CardTitle>
                {getStatusBadge(phase.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {phase.epics.map((epic) => (
                <Card key={epic.id} className="border-l-4"
                      style={{
                        borderLeftColor:
                          epic.status === 'complete' ? '#16a34a' :
                          epic.status === 'in-progress' ? '#2563eb' :
                          epic.status === 'blocked' ? '#dc2626' : '#9ca3af'
                      }}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getStatusIcon(epic.status)}
                        {epic.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {epic.targetRepo && (
                          <Badge variant="outline" className="text-xs">
                            {epic.targetRepo}
                          </Badge>
                        )}
                        {getStatusBadge(epic.status)}
                      </div>
                    </div>
                    {epic.lastUpdated && (
                      <CardDescription className="text-xs">
                        Updated: {new Date(epic.lastUpdated).toLocaleString()}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {epic.tasks.length > 0 ? (
                      <div className="space-y-2">
                        {epic.tasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2 text-sm">
                            {getStatusIcon(task.status)}
                            <div className="flex-1">
                              <p className={task.status === 'complete' ? 'line-through text-muted-foreground' : ''}>
                                {task.description}
                              </p>
                              {task.evidence && task.evidence !== '[Not started]' && task.evidence !== '[In progress]' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Evidence: {task.evidence}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No tasks defined</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {phases.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No workflow data available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
