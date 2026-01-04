/**
 * Task Workflow Modal
 *
 * Beginner-friendly step-by-step instructions for executing a task using Claude Code.
 * Shows terminal commands with copy buttons and the generated prompt.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Check, ChevronDown, ChevronUp, Terminal, GitBranch, Sparkles } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';

interface TaskWorkflowModalProps {
  task: PhaseTask;
  isOpen: boolean;
  onClose: () => void;
}

// Repo color mapping
const repoColors = {
  'wyshbone-ui': 'bg-purple-500/10 text-purple-700 border-purple-500/20',
  'wyshbone-supervisor': 'bg-pink-500/10 text-pink-700 border-pink-500/20',
  'wyshbone-tower': 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  'WABS': 'bg-green-500/10 text-green-700 border-green-500/20',
};

const repoColorsSolid = {
  'wyshbone-ui': 'bg-purple-500',
  'wyshbone-supervisor': 'bg-pink-500',
  'wyshbone-tower': 'bg-blue-500',
  'WABS': 'bg-green-500',
};

export function TaskWorkflowModal({ task, isOpen, onClose }: TaskWorkflowModalProps) {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [promptExpanded, setPromptExpanded] = useState(true); // Always show prompt by default

  // Debug logging
  console.log('=== TaskWorkflowModal Opened ===');
  console.log('Task:', task);
  console.log('Repo:', task?.repo);
  console.log('RepoPath:', task?.repoPath);
  console.log('BranchName:', task?.branchName);
  console.log('Prompt exists:', !!task?.prompt);
  console.log('Prompt length:', task?.prompt?.length || 0);

  const copyToClipboard = async (text: string, stepNumber: number) => {
    try {
      if (!text) {
        console.error('No text to copy!');
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepNumber);
      setTimeout(() => setCopiedStep(null), 2000);
      console.log(`✓ Copied ${text.length} characters for step ${stepNumber}`);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy. Please select and copy manually.');
    }
  };

  // Defensive: Ensure we have required task fields
  if (!task.repo || !task.repoPath || !task.branchName) {
    console.error('Missing required task fields:', { repo: task.repo, repoPath: task.repoPath, branchName: task.branchName });
  }

  const steps = [
    {
      number: 1,
      emoji: '💻',
      title: 'Open Terminal',
      description: 'Open your terminal application (Command Prompt, PowerShell, or Terminal)',
      command: null,
      note: 'Windows: Press Win+R, type "cmd", press Enter',
    },
    {
      number: 2,
      emoji: '📂',
      title: 'Navigate to Repository',
      description: 'Change directory to the repository',
      command: `cd "${task.repoPath}"`,
      note: 'This moves you to the correct project folder',
    },
    {
      number: 3,
      emoji: '🌿',
      title: 'Create New Branch',
      description: 'Create and checkout a new branch for this task',
      command: `git checkout -b ${task.branchName}`,
      note: 'Creates a new branch so your changes are isolated',
    },
    {
      number: 4,
      emoji: '🤖',
      title: 'Start Claude Code',
      description: 'Launch Claude Code in the repository',
      command: 'claude',
      note: 'Starts the AI coding assistant',
    },
    {
      number: 5,
      emoji: '📝',
      title: 'Paste the Prompt',
      description: 'Copy the prompt below and paste it into Claude Code',
      command: task.prompt || 'ERROR: Prompt not generated. Please refresh the page.',
      note: 'This tells Claude Code exactly what to do',
      isPrompt: true,
    },
  ];

  // Log the steps for debugging
  console.log('Steps constructed:', steps.length);
  steps.forEach((step, i) => {
    console.log(`Step ${i + 1}:`, {
      number: step.number,
      title: step.title,
      hasCommand: !!step.command,
      commandLength: step.command?.length || 0,
    });
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <Sparkles className="h-6 w-6 text-primary" />
            How to Complete This Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Error Warning if missing data */}
          {(!task.prompt || !task.repo || !task.repoPath || !task.branchName) && (
            <Card className="border-red-500/50 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-2xl">⚠️</div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-2 text-red-600">Missing Task Data</h4>
                    <p className="text-sm text-muted-foreground">
                      Some required task information is missing. Please refresh the page.
                      Missing: {[
                        !task.prompt && 'prompt',
                        !task.repo && 'repo',
                        !task.repoPath && 'repoPath',
                        !task.branchName && 'branchName'
                      ].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Task Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge className={`${repoColors[task.repo]} border font-medium`}>
                {task.repo || 'Unknown'}
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {task.branchName || 'unknown-branch'}
              </Badge>
            </div>
            <div>
              <h3 className="font-semibold text-lg">{task.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4" />
              Follow these steps in order:
            </div>

            {steps.map((step) => (
              <Card key={step.number} className="border-2">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Step Header */}
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${repoColorsSolid[task.repo]} text-white flex items-center justify-center font-bold text-sm`}>
                        {step.number}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{step.emoji}</span>
                          <h4 className="font-semibold">{step.title}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>

                    {/* Command Box */}
                    {step.command && (
                      <div className="ml-11 space-y-3">
                        {step.isPrompt ? (
                          // PROMINENT PROMPT DISPLAY for Step 5
                          <div className="space-y-3">
                            {/* Collapsible Toggle */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-between"
                              onClick={() => setPromptExpanded(!promptExpanded)}
                            >
                              {promptExpanded ? 'Hide Prompt Preview' : 'Show Prompt Preview'}
                              {promptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>

                            {/* Prompt Display Box - Always visible, dark themed */}
                            {promptExpanded && (
                              <div className="bg-slate-950 border-2 border-slate-700 rounded-lg p-4 max-h-80 overflow-y-auto shadow-lg">
                                <pre className="text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed m-0">
                                  {step.command}
                                </pre>
                              </div>
                            )}

                            {/* BIG PROMINENT COPY BUTTON for Prompt */}
                            <Button
                              onClick={() => copyToClipboard(step.command, step.number)}
                              className="w-full h-14 text-base font-bold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
                              size="lg"
                            >
                              {copiedStep === step.number ? (
                                <>
                                  <Check className="h-5 w-5 mr-2" />
                                  ✓ Copied to Clipboard!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-5 w-5 mr-2" />
                                  📋 Copy Prompt to Clipboard
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          // Regular command box for other steps
                          <>
                            <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm border">
                              {step.command}
                            </div>

                            {/* Regular Copy Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(step.command, step.number)}
                              className="w-full"
                            >
                              {copiedStep === step.number ? (
                                <>
                                  <Check className="h-4 w-4 mr-2" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Command
                                </>
                              )}
                            </Button>
                          </>
                        )}

                        {/* Note */}
                        {step.note && (
                          <p className="text-xs text-muted-foreground italic">
                            💡 {step.note}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Note without command */}
                    {!step.command && step.note && (
                      <p className="ml-11 text-xs text-muted-foreground italic">
                        💡 {step.note}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* After Completion */}
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 text-2xl">✅</div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">After Claude Code Completes the Task:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Review the changes Claude Code made</li>
                    <li>Test that everything works as expected</li>
                    <li>If satisfied, commit and push your changes</li>
                    <li>Return to this dashboard and move on to the next task!</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
