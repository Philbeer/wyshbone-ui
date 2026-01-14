/**
 * Phase Progress Component - Collapsible Tree UI
 * Clean autonomous progress tracker with Phase → Epic → Task → Microtask hierarchy
 *
 * See docs/ralph-wiggum-dev-progress.md for architecture and planned ladder.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, ChevronRight, Loader2, Play, CheckCircle2, Eye } from 'lucide-react';
import { Phase, PhaseTask } from '@/services/devProgressService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  phases: Phase[];
}

// Microtask UI-only type with success criteria, evidence, and verification
interface Microtask {
  id: string;
  description: string;
  status: 'idle' | 'running' | 'pending_verify' | 'verified';
  successCriteria?: string;
  evidence?: string;
}

// Microtask guidance for Start modal
interface MicrotaskGuidance {
  explanation: string;
  suggestedSuccessCriteria: string;
}

// Task name to microtasks mapping - Wyshbone-relevant content
const TASK_MICROTASK_TEMPLATES: Record<string, string[]> = {
  'Order fulfillment dashboard': [
    'Build order status widget showing pending/in-progress/completed counts',
    'Add order timeline visualization with fulfillment stages',
    'Implement real-time order updates via WebSocket',
    'Create order filtering by date range and brewery',
    'Add export orders to CSV functionality',
  ],
  'Customer engagement A/B testing': [
    'Design experiment configuration form for email variants',
    'Implement customer cohort assignment logic',
    'Build conversion tracking dashboard (open rate, click rate, orders)',
    'Add statistical significance calculator for experiment results',
    'Create experiment start/stop/rollback controls',
    'Implement winner auto-promotion workflow',
  ],
  'Brewery pricing calculator': [
    'Build ingredient cost input form (grains, hops, yeast)',
    'Implement overhead cost allocation (utilities, labor, packaging)',
    'Create price recommendation engine based on target margin',
    'Add scenario comparison view (different batch sizes)',
    'Build export pricing sheet to PDF',
  ],
  'Multi-brewery analytics dashboard': [
    'Design brewery selector dropdown with tenant filtering',
    'Create aggregated metrics cards (total orders, revenue, inventory)',
    'Build comparative performance chart (brewery vs brewery)',
    'Implement drill-down view by individual brewery',
    'Add low-inventory alerts per brewery',
    'Create consolidated CSV export across all breweries',
  ],
  // Legacy names (for backward compatibility if data source still uses old names)
  'Strategy performance tracking': [
    'Build order status widget showing pending/in-progress/completed counts',
    'Add order timeline visualization with fulfillment stages',
    'Implement real-time order updates via WebSocket',
    'Create order filtering by date range and brewery',
    'Add export orders to CSV functionality',
  ],
  'A/B testing framework': [
    'Design experiment configuration form for email variants',
    'Implement customer cohort assignment logic',
    'Build conversion tracking dashboard (open rate, click rate, orders)',
    'Add statistical significance calculator for experiment results',
    'Create experiment start/stop/rollback controls',
    'Implement winner auto-promotion workflow',
  ],
  'ROI calculator': [
    'Build ingredient cost input form (grains, hops, yeast)',
    'Implement overhead cost allocation (utilities, labor, packaging)',
    'Create price recommendation engine based on target margin',
    'Add scenario comparison view (different batch sizes)',
    'Build export pricing sheet to PDF',
  ],
  'Multi-tenant performance analytics': [
    'Design brewery selector dropdown with tenant filtering',
    'Create aggregated metrics cards (total orders, revenue, inventory)',
    'Build comparative performance chart (brewery vs brewery)',
    'Implement drill-down view by individual brewery',
    'Add low-inventory alerts per brewery',
    'Create consolidated CSV export across all breweries',
  ],
};

// Microtask-specific guidance mapping
const MICROTASK_GUIDANCE: Record<string, MicrotaskGuidance> = {
  // Order fulfillment dashboard microtasks
  'Build order status widget showing pending/in-progress/completed counts': {
    explanation: 'Create a dashboard widget that shows how many orders are pending, in progress, and completed so staff can see order progress at a glance.',
    suggestedSuccessCriteria: 'I can see a widget on the dashboard showing three counts: pending, in-progress, and completed orders.',
  },
  'Add order timeline visualization with fulfillment stages': {
    explanation: 'Add a visual timeline that shows each order moving through stages like received, processing, ready, and shipped.',
    suggestedSuccessCriteria: 'I can see a timeline chart for an order showing stages like "Received", "Processing", "Ready", and "Shipped" with dates.',
  },
  'Implement real-time order updates via WebSocket': {
    explanation: 'Make the order dashboard update automatically when orders change, without needing to refresh the page.',
    suggestedSuccessCriteria: 'When an order status changes in the database, I can see the dashboard update automatically within 2 seconds without refreshing.',
  },
  'Create order filtering by date range and brewery': {
    explanation: 'Add filters so users can view only orders from a specific date range or from a particular brewery.',
    suggestedSuccessCriteria: 'I can select a date range and brewery from dropdown filters, and the order list updates to show only matching orders.',
  },
  'Add export orders to CSV functionality': {
    explanation: 'Add a button that lets users download the current order list as a spreadsheet file they can open in Excel.',
    suggestedSuccessCriteria: 'I can click an "Export to CSV" button and download a file containing the order list with all visible columns.',
  },

  // Customer engagement A/B testing microtasks
  'Design experiment configuration form for email variants': {
    explanation: 'Create a form where users can set up an A/B test by defining different email versions to test against each other.',
    suggestedSuccessCriteria: 'I can see a form where I can enter two email subject lines and body text for variant A and variant B.',
  },
  'Implement customer cohort assignment logic': {
    explanation: 'Write code that automatically splits customers into groups (A or B) so they receive different email variants.',
    suggestedSuccessCriteria: 'When I create an experiment, customers are automatically split 50/50 into variant A and B groups visible in the database.',
  },
  'Build conversion tracking dashboard (open rate, click rate, orders)': {
    explanation: 'Create a dashboard showing how well each email variant performed: how many people opened it, clicked it, and placed orders.',
    suggestedSuccessCriteria: 'I can see a dashboard showing open rate %, click rate %, and order count for both variant A and variant B.',
  },
  'Add statistical significance calculator for experiment results': {
    explanation: 'Add a calculator that shows if the difference between variants is meaningful or just random chance.',
    suggestedSuccessCriteria: 'I can see a p-value and confidence level displayed next to each metric, indicating if results are statistically significant.',
  },
  'Create experiment start/stop/rollback controls': {
    explanation: 'Add buttons that let users start, pause, or completely undo an A/B test experiment.',
    suggestedSuccessCriteria: 'I can see Start, Pause, and Rollback buttons on the experiment page, and clicking them changes the experiment status.',
  },
  'Implement winner auto-promotion workflow': {
    explanation: 'Automatically make the winning email variant the default for all customers once the test concludes.',
    suggestedSuccessCriteria: 'When an experiment ends, the variant with better performance is automatically set as the default email template.',
  },

  // Brewery pricing calculator microtasks
  'Build ingredient cost input form (grains, hops, yeast)': {
    explanation: 'Create a form where brewers can enter the costs of their ingredients like grains, hops, and yeast.',
    suggestedSuccessCriteria: 'I can see input fields for grain cost, hop cost, and yeast cost with labels and a "Calculate" button.',
  },
  'Implement overhead cost allocation (utilities, labor, packaging)': {
    explanation: 'Add fields for fixed costs like electricity, employee wages, and packaging materials that apply to each batch.',
    suggestedSuccessCriteria: 'I can see input fields for utilities, labor hours, and packaging costs, and they are included in the total cost calculation.',
  },
  'Create price recommendation engine based on target margin': {
    explanation: 'Calculate and suggest a selling price based on total costs plus the desired profit margin percentage.',
    suggestedSuccessCriteria: 'When I enter a target margin of 40%, I see a recommended selling price that includes costs plus the margin.',
  },
  'Add scenario comparison view (different batch sizes)': {
    explanation: 'Show side-by-side pricing for small, medium, and large batch sizes so brewers can compare economics.',
    suggestedSuccessCriteria: 'I can see a table showing cost per unit and recommended price for batch sizes of 10, 50, and 100 barrels.',
  },
  'Build export pricing sheet to PDF': {
    explanation: 'Add a button that creates a downloadable PDF with the pricing breakdown and recommendations.',
    suggestedSuccessCriteria: 'I can click "Export to PDF" and download a file showing all costs, margins, and recommended prices.',
  },

  // Multi-brewery analytics dashboard microtasks
  'Design brewery selector dropdown with tenant filtering': {
    explanation: 'Add a dropdown menu that lets users choose which brewery data they want to view.',
    suggestedSuccessCriteria: 'I can see a dropdown at the top of the page listing all breweries, and selecting one filters all data to that brewery.',
  },
  'Create aggregated metrics cards (total orders, revenue, inventory)': {
    explanation: 'Show summary cards at the top of the dashboard displaying key numbers like total orders, total revenue, and inventory levels.',
    suggestedSuccessCriteria: 'I can see three cards at the top showing: total orders count, total revenue amount, and current inventory units.',
  },
  'Build comparative performance chart (brewery vs brewery)': {
    explanation: 'Create a chart that shows how different breweries compare to each other in terms of sales or orders.',
    suggestedSuccessCriteria: 'I can see a bar chart comparing monthly revenue across all breweries side by side.',
  },
  'Implement drill-down view by individual brewery': {
    explanation: 'Allow users to click on a brewery to see detailed information just for that brewery.',
    suggestedSuccessCriteria: 'When I click on a brewery name, I see a detail page showing that brewery orders, revenue, and inventory.',
  },
  'Add low-inventory alerts per brewery': {
    explanation: 'Show warnings when any brewery inventory drops below a safe level.',
    suggestedSuccessCriteria: 'I can see a red alert badge next to any brewery with inventory below 10 units.',
  },
  'Create consolidated CSV export across all breweries': {
    explanation: 'Add a button to download a single spreadsheet containing data from all breweries combined.',
    suggestedSuccessCriteria: 'I can click "Export All Breweries" and download a CSV file with rows for each brewery showing key metrics.',
  },
};

// Helper to get guidance for a microtask
function getMicrotaskGuidance(microtaskTitle: string): MicrotaskGuidance {
  const specific = MICROTASK_GUIDANCE[microtaskTitle];
  if (specific) {
    return specific;
  }

  // Fallback to generic guidance
  return {
    explanation: `This microtask involves implementing and validating: ${microtaskTitle}`,
    suggestedSuccessCriteria: `I can verify that the following is complete and working: ${microtaskTitle.toLowerCase()}`,
  };
}

// Repo color mapping
const repoColors = {
  'wyshbone-ui': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'wyshbone-supervisor': 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  'wyshbone-tower': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'WABS': 'bg-green-500/10 text-green-700 border-green-500/20',
};

// Status badge styling
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
          QUEUED
        </Badge>
      );
    case 'in-progress':
      return (
        <Badge className="bg-blue-500 text-white flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          IN PROGRESS
        </Badge>
      );
    case 'testing':
      return (
        <Badge className="bg-yellow-500 text-white flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          TESTING
        </Badge>
      );
    case 'fixing':
      return (
        <Badge className="bg-red-500 text-white">
          FIXING
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-green-500 text-white">
          COMPLETE
        </Badge>
      );
    default:
      return <Badge variant="outline">{status.toUpperCase()}</Badge>;
  }
};

// Microtask status badge
const getMicrotaskStatusBadge = (status: 'idle' | 'running' | 'pending_verify' | 'verified') => {
  switch (status) {
    case 'idle':
      return <Badge variant="outline" className="text-xs">Idle</Badge>;
    case 'running':
      return (
        <Badge className="bg-blue-500 text-white text-xs flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'pending_verify':
      return (
        <Badge className="bg-yellow-500 text-white text-xs flex items-center gap-1">
          <Eye className="h-3 w-3" />
          Pending Verify
        </Badge>
      );
    case 'verified':
      return (
        <Badge className="bg-green-500 text-white text-xs flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Verified
        </Badge>
      );
  }
};

export function PhaseProgress({ phases }: Props) {
  // Track expanded/collapsed state for each level
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Track generated microtasks per task (keyed by taskId)
  const [microtasksByTask, setMicrotasksByTask] = useState<Record<string, Microtask[]>>({});

  // Modal state
  const [showSuccessCriteriaModal, setShowSuccessCriteriaModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [currentMicrotaskContext, setCurrentMicrotaskContext] = useState<{
    taskId: string;
    microtaskId: string;
    microtaskTitle: string;
  } | null>(null);
  const [successCriteriaInput, setSuccessCriteriaInput] = useState('');
  const [evidenceInput, setEvidenceInput] = useState('');
  const [verifyCheckbox, setVerifyCheckbox] = useState(false);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const toggleEpic = (epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicId)) {
        next.delete(epicId);
      } else {
        next.add(epicId);
      }
      return next;
    });
  };

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const createMicrotasks = (taskId: string, taskTitle: string) => {
    // Try to find matching template
    const template = TASK_MICROTASK_TEMPLATES[taskTitle];

    let microtaskDescriptions: string[];

    if (template) {
      // Use template if available
      microtaskDescriptions = template;
    } else {
      // Generate generic microtasks based on task title
      microtaskDescriptions = [
        `Design ${taskTitle.toLowerCase()} interface`,
        `Implement core ${taskTitle.toLowerCase()} logic`,
        `Add data validation and error handling`,
        `Create unit tests for ${taskTitle.toLowerCase()}`,
        `Integrate with existing components`,
        `Test end-to-end user flow`,
      ];
    }

    const newMicrotasks: Microtask[] = microtaskDescriptions.map((desc, i) => ({
      id: `${taskId}-micro-${i}`,
      description: desc,
      status: 'idle',
      successCriteria: undefined,
      evidence: undefined,
    }));

    setMicrotasksByTask((prev) => ({
      ...prev,
      [taskId]: newMicrotasks,
    }));

    // Auto-expand the task to show microtasks
    setExpandedTasks((prev) => new Set(prev).add(taskId));
  };

  // Check if any microtask is running or pending verification
  const hasRunningMicrotask = () => {
    for (const microtasks of Object.values(microtasksByTask)) {
      if (microtasks.some((m) => m.status === 'running' || m.status === 'pending_verify')) {
        return true;
      }
    }
    return false;
  };

  const handleStartMicrotask = (taskId: string, microtaskId: string) => {
    const microtask = microtasksByTask[taskId]?.find((m) => m.id === microtaskId);

    if (!microtask) return;

    // If no success criteria, prompt for it with guidance
    if (!microtask.successCriteria) {
      const guidance = getMicrotaskGuidance(microtask.description);
      setCurrentMicrotaskContext({ taskId, microtaskId, microtaskTitle: microtask.description });
      setSuccessCriteriaInput(guidance.suggestedSuccessCriteria);
      setShowSuccessCriteriaModal(true);
      return;
    }

    // Otherwise, start the microtask
    updateMicrotaskStatus(taskId, microtaskId, 'running');
  };

  const handleSaveSuccessCriteria = () => {
    if (!currentMicrotaskContext || !successCriteriaInput.trim()) return;

    const { taskId, microtaskId } = currentMicrotaskContext;

    // Save success criteria and set status to running
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, successCriteria: successCriteriaInput.trim(), status: 'running' as const };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });

    setShowSuccessCriteriaModal(false);
    setCurrentMicrotaskContext(null);
    setSuccessCriteriaInput('');
  };

  const handleSubmitEvidence = (taskId: string, microtaskId: string) => {
    const microtask = microtasksByTask[taskId]?.find((m) => m.id === microtaskId);

    if (!microtask) return;

    // Prompt for evidence
    setCurrentMicrotaskContext({ taskId, microtaskId, microtaskTitle: microtask.description });
    setEvidenceInput('');
    setShowEvidenceModal(true);
  };

  const handleSaveEvidence = () => {
    if (!currentMicrotaskContext || !evidenceInput.trim()) return;

    const { taskId, microtaskId } = currentMicrotaskContext;

    // Save evidence and move to pending_verify
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, evidence: evidenceInput.trim(), status: 'pending_verify' as const };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });

    setShowEvidenceModal(false);
    setCurrentMicrotaskContext(null);
    setEvidenceInput('');
  };

  const handleVerify = (taskId: string, microtaskId: string) => {
    const microtask = microtasksByTask[taskId]?.find((m) => m.id === microtaskId);

    if (!microtask || !microtask.successCriteria) return;

    // Open verify modal
    setCurrentMicrotaskContext({ taskId, microtaskId, microtaskTitle: microtask.description });
    setVerifyCheckbox(false);
    setShowVerifyModal(true);
  };

  const handleConfirmVerify = () => {
    if (!currentMicrotaskContext || !verifyCheckbox) return;

    const { taskId, microtaskId } = currentMicrotaskContext;

    // Mark as verified
    updateMicrotaskStatus(taskId, microtaskId, 'verified');

    setShowVerifyModal(false);
    setCurrentMicrotaskContext(null);
    setVerifyCheckbox(false);
  };

  const updateMicrotaskStatus = (
    taskId: string,
    microtaskId: string,
    status: 'idle' | 'running' | 'pending_verify' | 'verified'
  ) => {
    setMicrotasksByTask((prev) => {
      const taskMicrotasks = prev[taskId] || [];
      const updated = taskMicrotasks.map((m) => {
        if (m.id === microtaskId) {
          return { ...m, status };
        }
        return m;
      });
      return {
        ...prev,
        [taskId]: updated,
      };
    });
  };

  return (
    <>
      <div className="space-y-6">
        {phases.map((phase) => {
          const completed = phase.tasks.filter((t) => t.status === 'completed').length;
          const total = phase.tasks.length;
          const percentage = phase.completion;
          const isExpanded = expandedPhases.has(phase.id);

          // For now, create a single default "epic" per phase containing all tasks
          // In the future, the data source should include real epics
          const defaultEpicId = `${phase.id}-epic-1`;
          const defaultEpic = {
            id: defaultEpicId,
            name: 'Default Epic',
            tasks: phase.tasks,
          };

          return (
            <Card key={phase.id}>
              <CardHeader>
                {/* Phase Header - Clickable to expand/collapse */}
                <div
                  className="flex items-center justify-between cursor-pointer hover:bg-accent/50 -mx-6 -my-4 px-6 py-4 rounded-lg transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="text-xl">{phase.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {total - completed} {total - completed === 1 ? 'task' : 'tasks'} remaining
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{percentage}%</div>
                    <p className="text-xs text-muted-foreground">
                      {completed} of {total} complete
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <Progress value={percentage} className="h-2 mt-4" />
              </CardHeader>

              {/* Expanded Content - Epics */}
              {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Epic Row */}
                  <EpicRow
                    epic={defaultEpic}
                    isExpanded={expandedEpics.has(defaultEpicId)}
                    onToggle={() => toggleEpic(defaultEpicId)}
                    expandedTasks={expandedTasks}
                    onToggleTask={toggleTask}
                    microtasksByTask={microtasksByTask}
                    onCreateMicrotasks={createMicrotasks}
                    onStartMicrotask={handleStartMicrotask}
                    onSubmitEvidence={handleSubmitEvidence}
                    onVerify={handleVerify}
                    hasRunningMicrotask={hasRunningMicrotask()}
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Success Criteria Modal */}
      <Dialog open={showSuccessCriteriaModal} onOpenChange={setShowSuccessCriteriaModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Define Success Criteria</DialogTitle>
            <DialogDescription>
              Review and customize the success criteria for this microtask.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Explanation Section */}
            {currentMicrotaskContext && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">What this microtask means:</p>
                <p className="text-sm text-blue-800">
                  {getMicrotaskGuidance(currentMicrotaskContext.microtaskTitle).explanation}
                </p>
              </div>
            )}

            {/* Success Criteria Input */}
            <div className="space-y-2">
              <Label htmlFor="successCriteria">
                Success Criteria <span className="text-muted-foreground text-xs">(editable)</span>
              </Label>
              <Textarea
                id="successCriteria"
                value={successCriteriaInput}
                onChange={(e) => setSuccessCriteriaInput(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Must be human-observable (something you can see in UI / numbers / table row).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSuccessCriteriaModal(false);
                setCurrentMicrotaskContext(null);
                setSuccessCriteriaInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSuccessCriteria} disabled={!successCriteriaInput.trim()}>
              Start Microtask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Modal */}
      <Dialog open={showEvidenceModal} onOpenChange={setShowEvidenceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide Evidence</DialogTitle>
            <DialogDescription>
              Short note confirming what you observed (e.g., "Widget renders with 3 cards showing pending=5, in-progress=2, completed=12").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evidence">Evidence</Label>
              <Textarea
                id="evidence"
                placeholder="e.g., 'Confirmed order status widget displays correctly with live data from Supabase'"
                value={evidenceInput}
                onChange={(e) => setEvidenceInput(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEvidenceModal(false);
                setCurrentMicrotaskContext(null);
                setEvidenceInput('');
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEvidence} disabled={!evidenceInput.trim()}>
              Submit Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Modal */}
      <Dialog open={showVerifyModal} onOpenChange={setShowVerifyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Microtask</DialogTitle>
            <DialogDescription>
              Confirm that you observed the success criteria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {currentMicrotaskContext && (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-semibold mb-1">Success Criteria:</p>
                  <p className="text-sm text-muted-foreground">
                    {microtasksByTask[currentMicrotaskContext.taskId]?.find(
                      (m) => m.id === currentMicrotaskContext.microtaskId
                    )?.successCriteria}
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-semibold mb-1 text-green-800">Evidence:</p>
                  <p className="text-sm text-green-700">
                    {microtasksByTask[currentMicrotaskContext.taskId]?.find(
                      (m) => m.id === currentMicrotaskContext.microtaskId
                    )?.evidence}
                  </p>
                </div>
                <div className="flex items-start space-x-2 pt-2">
                  <Checkbox
                    id="verify"
                    checked={verifyCheckbox}
                    onCheckedChange={(checked) => setVerifyCheckbox(checked === true)}
                  />
                  <label
                    htmlFor="verify"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I observed the success criteria
                  </label>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowVerifyModal(false);
                setCurrentMicrotaskContext(null);
                setVerifyCheckbox(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmVerify} disabled={!verifyCheckbox}>
              Mark Verified
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Epic Row Component
interface EpicRowProps {
  epic: {
    id: string;
    name: string;
    tasks: PhaseTask[];
  };
  isExpanded: boolean;
  onToggle: () => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  microtasksByTask: Record<string, Microtask[]>;
  onCreateMicrotasks: (taskId: string, taskTitle: string) => void;
  onStartMicrotask: (taskId: string, microtaskId: string) => void;
  onSubmitEvidence: (taskId: string, microtaskId: string) => void;
  onVerify: (taskId: string, microtaskId: string) => void;
  hasRunningMicrotask: boolean;
}

function EpicRow({
  epic,
  isExpanded,
  onToggle,
  expandedTasks,
  onToggleTask,
  microtasksByTask,
  onCreateMicrotasks,
  onStartMicrotask,
  onSubmitEvidence,
  onVerify,
  hasRunningMicrotask,
}: EpicRowProps) {
  const completed = epic.tasks.filter((t) => t.status === 'completed').length;
  const total = epic.tasks.length;

  return (
    <div className="border rounded-lg">
      {/* Epic Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 rounded-lg transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold">{epic.name}</span>
          <span className="text-sm text-muted-foreground">
            ({completed}/{total} tasks complete)
          </span>
        </div>
      </div>

      {/* Expanded Content - Tasks */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {epic.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isExpanded={expandedTasks.has(task.id)}
              onToggle={() => onToggleTask(task.id)}
              microtasks={microtasksByTask[task.id] || []}
              onCreateMicrotasks={() => onCreateMicrotasks(task.id, task.title)}
              onStartMicrotask={(microtaskId) => onStartMicrotask(task.id, microtaskId)}
              onSubmitEvidence={(microtaskId) => onSubmitEvidence(task.id, microtaskId)}
              onVerify={(microtaskId) => onVerify(task.id, microtaskId)}
              hasRunningMicrotask={hasRunningMicrotask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Task Row Component
interface TaskRowProps {
  task: PhaseTask;
  isExpanded: boolean;
  onToggle: () => void;
  microtasks: Microtask[];
  onCreateMicrotasks: () => void;
  onStartMicrotask: (microtaskId: string) => void;
  onSubmitEvidence: (microtaskId: string) => void;
  onVerify: (microtaskId: string) => void;
  hasRunningMicrotask: boolean;
}

function TaskRow({
  task,
  isExpanded,
  onToggle,
  microtasks,
  onCreateMicrotasks,
  onStartMicrotask,
  onSubmitEvidence,
  onVerify,
  hasRunningMicrotask,
}: TaskRowProps) {
  const hasMicrotasks = microtasks.length > 0;

  return (
    <div
      className={`border rounded-lg ${
        task.status === 'in-progress' || task.status === 'testing'
          ? 'border-blue-500/50 bg-blue-500/5 shadow-md'
          : task.status === 'fixing'
          ? 'border-red-500/50 bg-red-500/5'
          : 'border-border bg-card'
      }`}
    >
      {/* Task Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/20 rounded-lg transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1">
          {hasMicrotasks && (
            <>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </>
          )}
          <span className="font-medium">{task.title}</span>
          <Badge className={`${repoColors[task.repo]} border text-xs`} variant="outline">
            {task.repo}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(task.status)}
        </div>
      </div>

      {/* Expanded Content - Microtasks or Create Button */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {!hasMicrotasks ? (
            <div className="flex justify-center">
              <Button size="sm" variant="outline" onClick={onCreateMicrotasks}>
                Create microtasks
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {microtasks.map((microtask) => (
                <MicrotaskRow
                  key={microtask.id}
                  microtask={microtask}
                  onStartMicrotask={() => onStartMicrotask(microtask.id)}
                  onSubmitEvidence={() => onSubmitEvidence(microtask.id)}
                  onVerify={() => onVerify(microtask.id)}
                  hasRunningMicrotask={hasRunningMicrotask}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Microtask Row Component
interface MicrotaskRowProps {
  microtask: Microtask;
  onStartMicrotask: () => void;
  onSubmitEvidence: () => void;
  onVerify: () => void;
  hasRunningMicrotask: boolean;
}

function MicrotaskRow({
  microtask,
  onStartMicrotask,
  onSubmitEvidence,
  onVerify,
  hasRunningMicrotask,
}: MicrotaskRowProps) {
  // Disable Start button if another microtask is running or pending verify, and this one is idle
  const isStartDisabled = microtask.status === 'idle' && hasRunningMicrotask;

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-medium">{microtask.description}</span>
        </div>
        <div className="flex items-center gap-2">
          {getMicrotaskStatusBadge(microtask.status)}
          {microtask.status === 'idle' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs"
              onClick={onStartMicrotask}
              disabled={isStartDisabled}
            >
              <Play className="h-3 w-3 mr-1" />
              Start
            </Button>
          )}
          {microtask.status === 'running' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs bg-yellow-600 hover:bg-yellow-700"
              onClick={onSubmitEvidence}
            >
              Submit Evidence
            </Button>
          )}
          {microtask.status === 'pending_verify' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
              onClick={onVerify}
            >
              <Eye className="h-3 w-3 mr-1" />
              Verify
            </Button>
          )}
        </div>
      </div>

      {/* Show success criteria if set */}
      {microtask.successCriteria && (
        <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border/30">
          <span className="font-semibold">Success:</span> {microtask.successCriteria}
        </div>
      )}

      {/* Show evidence if set */}
      {microtask.evidence && (
        <div className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
          <span className="font-semibold">Evidence:</span> {microtask.evidence}
        </div>
      )}
    </div>
  );
}
