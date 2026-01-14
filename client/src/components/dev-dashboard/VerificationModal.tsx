/**
 * VerificationModal Component
 *
 * Shows when a critical task is marked complete, prompting the user
 * to verify that the task actually works before continuing.
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Clock, XCircle, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { PhaseTask } from '@/services/devProgressService';
import { SafetyBadge, getSafetyLevelDescription } from './SafetyBadge';

interface VerificationModalProps {
  task: PhaseTask;
  isOpen: boolean;
  onVerified: () => void; // Called when user confirms it works
  onNeedsWork: () => void; // Called when user says it doesn't work
  onSkipRisk: () => void; // Called when user skips verification
  onClose: () => void;
}

export function VerificationModal({
  task,
  isOpen,
  onVerified,
  onNeedsWork,
  onSkipRisk,
  onClose,
}: VerificationModalProps) {
  const [showFullChecklist, setShowFullChecklist] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  if (!task.safetyLevel) {
    return null;
  }

  const isCritical = task.safetyLevel === 'MUST_TEST_NOW';
  const blocksOthers = task.blocksOtherTasks && task.blocksOtherTasks.length > 0;
  const hasHumanVerification = !!task.humanVerification;

  const handleCheckItem = (index: number) => {
    setCheckedItems(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const checklistItems = hasHumanVerification && task.humanVerification
    ? task.humanVerification.whatToCheck
    : task.quickVerification || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {isCritical && <AlertTriangle className="h-6 w-6 text-destructive animate-pulse" />}
            <div>
              <DialogTitle className="text-xl">Verify This Task Works</DialogTitle>
              <DialogDescription className="mt-1">
                Before marking this complete, please verify it actually works
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Task Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{task.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                </div>
                {task.safetyLevel && (
                  <SafetyBadge level={task.safetyLevel} className="ml-3" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Why Verification Matters */}
          {isCritical && blocksOthers && (
            <Card className="border-red-500/50 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-destructive mb-1">Critical: This Blocks Other Tasks</h4>
                    <p className="text-sm text-muted-foreground">
                      {task.riskIfSkipped || getSafetyLevelDescription(task.safetyLevel)}
                    </p>
                    {task.blocksOtherTasks && task.blocksOtherTasks.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Blocks: <span className="font-mono">{task.blocksOtherTasks.join(', ')}</span>
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Verification Checklist */}
          {checklistItems.length > 0 && (
            <Card className="bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">
                      Verification Checklist ({hasHumanVerification ? task.humanVerification!.timeNeeded : task.quickTestTime || '2 minutes'})
                    </h4>
                  </div>
                  {hasHumanVerification && task.humanVerification!.whereToCheck && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      <span>{task.humanVerification!.whereToCheck}</span>
                    </div>
                  )}
                </div>

                {/* First 5 checklist items (or fewer) */}
                <div className="space-y-2">
                  {checklistItems.slice(0, showFullChecklist ? undefined : 5).map((step, index) => (
                    <label
                      key={index}
                      className="flex items-start gap-3 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 p-2 rounded transition-colors"
                      onClick={() => handleCheckItem(index)}
                    >
                      <input
                        type="checkbox"
                        checked={checkedItems[index] || false}
                        onChange={() => handleCheckItem(index)}
                        className="mt-1 w-4 h-4 cursor-pointer"
                      />
                      <span className="flex-1 text-sm leading-relaxed">{step}</span>
                    </label>
                  ))}
                </div>

                {/* Show more/less button */}
                {checklistItems.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFullChecklist(!showFullChecklist)}
                    className="mt-2 w-full text-xs"
                  >
                    {showFullChecklist ? (
                      <>
                        <ChevronRight className="h-3 w-3 mr-1" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Show full checklist ({checklistItems.length} items)
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={() => {
                onVerified();
                onClose();
              }}
              className="w-full h-14 text-base bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              ✅ Verified - It Works!
            </Button>

            <Button
              onClick={() => {
                onNeedsWork();
                onClose();
              }}
              variant="destructive"
              className="w-full h-12 text-base"
            >
              <XCircle className="h-5 w-5 mr-2" />
              ❌ Doesn't Work - Need to Fix
            </Button>

            {!isCritical && (
              <Button
                onClick={() => {
                  onSkipRisk();
                  onClose();
                }}
                variant="outline"
                className="w-full h-10 text-sm"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Skip at My Risk (Not Recommended)
              </Button>
            )}

            {isCritical && (
              <p className="text-xs text-center text-muted-foreground">
                ⚠️ This is a critical task - skipping verification is not allowed
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
