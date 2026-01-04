/**
 * Task Evaluation Reset Utility
 *
 * Resets task progress to match actual codebase state based on code audit.
 * Run this to fix discrepancies between dashboard and reality.
 */

export interface TaskEvaluationReport {
  taskId: string;
  taskName: string;
  dashboardStatus: string;
  actualStatus: 'not-started' | 'in-progress' | 'completed';
  actualEvidence: string[];
  hasDiscrepancy: boolean;
  discrepancyReason?: string;
  recommendedAction: 'reset' | 'keep' | 'verify';
}

/**
 * Evaluation report from code audit (2026-01-04)
 */
export const evaluationReport: TaskEvaluationReport[] = [
  {
    taskId: 'p1-t1',
    taskName: 'Fix 401 authentication errors',
    dashboardStatus: 'pending',
    actualStatus: 'completed',
    actualEvidence: [
      'credentials: "include" found in ClaudeService.ts (5 locations)',
      'x-session-id headers added to all tool calls',
      'getSessionId() method implemented',
      'All 5 tools have auth headers (lines 657, 713, 823, 861, 893)',
      'No 401 auth issues in implementation'
    ],
    hasDiscrepancy: true,
    discrepancyReason: 'Dashboard shows pending but code shows complete - auth is fully implemented',
    recommendedAction: 'reset'
  },
  {
    taskId: 'p1-t2',
    taskName: 'Test all 5 tools execute correctly',
    dashboardStatus: 'pending',
    actualStatus: 'not-started', // Needs user verification
    actualEvidence: [
      '5 tools found in server/lib/actions.ts',
      'SEARCH_PLACES implemented (line 34)',
      'DEEP_RESEARCH implemented (line 67)',
      'BATCH_CONTACT_FINDER implemented (line 107)',
      'DRAFT_EMAIL implemented',
      'CREATE_SCHEDULED_MONITOR implemented',
      'Cannot verify TESTING status from code alone'
    ],
    hasDiscrepancy: false,
    discrepancyReason: 'Tools are implemented but testing status unknown - needs user verification',
    recommendedAction: 'verify'
  },
  {
    taskId: 'p1-t3',
    taskName: 'Fix results display in UI',
    dashboardStatus: 'pending',
    actualStatus: 'completed',
    actualEvidence: [
      'ResultsPanel.tsx exists (400+ lines)',
      'QuickSearchFullView implemented',
      'DeepResearchFullView implemented',
      'EmailFinderFullView implemented',
      'ScheduledMonitorFullView implemented',
      'ResultsPanelContext for state management',
      'ToolResultsView integration exists'
    ],
    hasDiscrepancy: true,
    discrepancyReason: 'Dashboard shows pending but code shows complete - full results UI exists',
    recommendedAction: 'reset'
  },
  {
    taskId: 'p1-t4',
    taskName: 'Unify tool execution',
    dashboardStatus: 'pending',
    actualStatus: 'not-started',
    actualEvidence: [
      'wyshbone-ui has server/lib/actions.ts',
      'wyshbone-supervisor has server/actions/registry.ts (DUPLICATE)',
      'wyshbone-supervisor has server/actions/executors.ts (DUPLICATE)',
      'Tool execution is NOT unified - duplication exists',
      'Task correctly shows as incomplete'
    ],
    hasDiscrepancy: false,
    discrepancyReason: 'Status is correct - task not started, duplication still exists',
    recommendedAction: 'keep'
  }
];

/**
 * Reset task progress based on evaluation report
 */
export function resetTaskProgressFromEvaluation() {
  console.log('🔄 Resetting task progress based on code audit...');
  console.log('');

  const STORAGE_KEY = 'wyshbone-task-progress';
  const existingProgress = localStorage.getItem(STORAGE_KEY);
  const progress: Record<string, any> = existingProgress ? JSON.parse(existingProgress) : {};

  let resetCount = 0;
  let keptCount = 0;
  let verifyCount = 0;

  evaluationReport.forEach(task => {
    if (task.recommendedAction === 'reset') {
      if (task.actualStatus === 'completed') {
        progress[task.taskId] = {
          status: 'completed',
          completedAt: new Date().toISOString(),
          verifiedBy: 'code-audit-2026-01-04',
          evidence: task.actualEvidence.join('; '),
          timestamp: new Date().toISOString()
        };
        console.log(`✅ ${task.taskName}: Reset to COMPLETED`);
        console.log(`   Evidence: ${task.actualEvidence[0]}`);
        resetCount++;
      } else if (task.actualStatus === 'not-started') {
        delete progress[task.taskId];
        console.log(`❌ ${task.taskName}: Reset to NOT STARTED`);
        resetCount++;
      }
    } else if (task.recommendedAction === 'keep') {
      console.log(`⚪ ${task.taskName}: Kept as ${task.dashboardStatus.toUpperCase()}`);
      keptCount++;
    } else if (task.recommendedAction === 'verify') {
      console.log(`⚠️  ${task.taskName}: Needs USER VERIFICATION`);
      console.log(`   Reason: ${task.discrepancyReason}`);
      verifyCount++;
    }
    console.log('');
  });

  // Save cleaned progress
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));

  console.log('📊 Summary:');
  console.log(`   ${resetCount} tasks reset`);
  console.log(`   ${keptCount} tasks kept as-is`);
  console.log(`   ${verifyCount} tasks need user verification`);
  console.log('');
  console.log('✅ Task progress reset complete!');
  console.log('🔄 Refresh page to see updated dashboard');
  console.log('');

  return {
    resetCount,
    keptCount,
    verifyCount,
    updatedProgress: progress
  };
}

/**
 * Get evaluation summary statistics
 */
export function getEvaluationSummary() {
  const totalTasks = evaluationReport.length;
  const correctTasks = evaluationReport.filter(t => !t.hasDiscrepancy).length;
  const discrepancyTasks = evaluationReport.filter(t => t.hasDiscrepancy).length;
  const resetTasks = evaluationReport.filter(t => t.recommendedAction === 'reset').length;
  const verifyTasks = evaluationReport.filter(t => t.recommendedAction === 'verify').length;

  return {
    totalTasks,
    correctTasks,
    discrepancyTasks,
    resetTasks,
    verifyTasks,
    accuracyBefore: Math.round((correctTasks / totalTasks) * 100),
    accuracyAfter: Math.round(((correctTasks + resetTasks) / totalTasks) * 100)
  };
}

/**
 * Print detailed evaluation report to console
 */
export function printEvaluationReport() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         WYSHBONE TASK EVALUATION REPORT                        ║');
  console.log('║         Code Audit vs Dashboard State                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  const summary = getEvaluationSummary();
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Tasks Audited:        ${summary.totalTasks}`);
  console.log(`   Correct Status:       ${summary.correctTasks}`);
  console.log(`   Discrepancies Found:  ${summary.discrepancyTasks}`);
  console.log(`   Needs Reset:          ${summary.resetTasks}`);
  console.log(`   Needs Verification:   ${summary.verifyTasks}`);
  console.log('');
  console.log(`   Accuracy (Before):    ${summary.accuracyBefore}%`);
  console.log(`   Accuracy (After):     ${summary.accuracyAfter}%`);
  console.log('');

  console.log('📋 DETAILED FINDINGS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  evaluationReport.forEach((task, index) => {
    const statusIcon = task.hasDiscrepancy ? '❌' : '✅';
    const actionIcon = task.recommendedAction === 'reset' ? '🔄' :
                      task.recommendedAction === 'verify' ? '⚠️' : '⚪';

    console.log(`${statusIcon} Task ${index + 1}: ${task.taskName}`);
    console.log(`   Dashboard: ${task.dashboardStatus}`);
    console.log(`   Reality:   ${task.actualStatus}`);
    if (task.hasDiscrepancy) {
      console.log(`   Issue:     ${task.discrepancyReason}`);
    }
    console.log(`   Action:    ${actionIcon} ${task.recommendedAction.toUpperCase()}`);
    console.log('');
    console.log('   Evidence:');
    task.actualEvidence.forEach(evidence => {
      console.log(`   • ${evidence}`);
    });
    console.log('');
  });

  console.log('🎯 NEXT STEPS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('1. Run resetTaskProgressFromEvaluation() to apply fixes');
  console.log('2. Answer verification questions for Task 2 (testing status)');
  console.log('3. Refresh page to see accurate dashboard');
  console.log('');
}

/**
 * User verification questions for Task 2
 */
export function getVerificationQuestions() {
  return {
    taskId: 'p1-t2',
    taskName: 'Test all 5 tools execute correctly',
    questions: [
      {
        id: 1,
        tool: 'search_google_places',
        question: 'Have you clicked a search button (e.g., "Find pubs in Leeds")?',
        subQuestions: [
          'Did it execute without 401 errors?',
          'Did results appear in the UI?'
        ]
      },
      {
        id: 2,
        tool: 'deep_research',
        question: 'Have you started a deep research job?',
        subQuestions: [
          'Did it start successfully?',
          'Did you see a job ID?',
          'Can you view the research progress?'
        ]
      },
      {
        id: 3,
        tool: 'email_finder',
        question: 'Have you tried the email finder / batch contact finder?',
        subQuestions: [
          'Did it find contacts?',
          'Did results display properly?'
        ]
      },
      {
        id: 4,
        tool: 'scheduled_monitor',
        question: 'Have you created a scheduled monitor?',
        subQuestions: [
          'Did it create successfully?',
          'Can you see the monitor in the list?'
        ]
      },
      {
        id: 5,
        tool: 'get_nudges',
        question: 'Have you used the "get nudges" feature?',
        subQuestions: [
          'Did it return suggestions?',
          'Did the nudges display properly?'
        ]
      }
    ],
    conclusion: {
      allYes: 'If YES to all → Mark Task 2 as COMPLETED',
      anyNo: 'If NO to any → Task 2 is NOT COMPLETED - needs testing'
    }
  };
}

/**
 * Mark Task 2 as completed after user verification
 */
export function markTask2AsCompleted() {
  const STORAGE_KEY = 'wyshbone-task-progress';
  const progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

  progress['p1-t2'] = {
    status: 'completed',
    completedAt: new Date().toISOString(),
    verifiedBy: 'user-verification-2026-01-04',
    evidence: 'User confirmed all 5 tools tested and working',
    timestamp: new Date().toISOString()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  console.log('✅ Task 2 marked as COMPLETED');
  console.log('🔄 Refresh page to see updated dashboard');
}

// Export convenience function to run full audit and reset
export function runFullAuditAndReset() {
  console.clear();
  printEvaluationReport();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  const result = resetTaskProgressFromEvaluation();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (result.verifyCount > 0) {
    console.log('⚠️  USER VERIFICATION REQUIRED');
    console.log('');
    const questions = getVerificationQuestions();
    console.log(`Task: ${questions.taskName}`);
    console.log('');
    questions.questions.forEach(q => {
      console.log(`${q.id}. ${q.question}`);
      q.subQuestions.forEach(sub => {
        console.log(`   - ${sub}`);
      });
      console.log('');
    });
    console.log(questions.conclusion.allYes);
    console.log(questions.conclusion.anyNo);
    console.log('');
    console.log('To mark Task 2 as complete after verification:');
    console.log('  markTask2AsCompleted()');
    console.log('');
  }

  return result;
}
