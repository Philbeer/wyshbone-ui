// PLAN VERSION: Vision-Aligned v1.0
// Created: 2026-01-10
// Source: CURRENT_PLAN.md

/**
 * Task Data and Prompt Generation - Vision-Aligned 5-Phase Plan
 *
 * Complete task definitions with repo paths, branches, and prompt generation
 */

import { PhaseTask } from './devProgressService';

// Helper to generate detailed prompts for Claude Code
export function generateTaskPrompt(task: PhaseTask): string {
  const sections = [];

  // Hidden task metadata for automatic Claude Code detection
  const metadata = {
    taskId: task.id,
    taskName: task.title,
    repo: task.repo,
    dashboardUrl: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    generatedAt: new Date().toISOString()
  };

  // Header
  sections.push(`# TASK: ${task.title}\n`);

  // Hidden metadata in HTML comment
  sections.push(`<!-- WYSHBONE_TASK_START`);
  sections.push(JSON.stringify(metadata, null, 2));
  sections.push(`WYSHBONE_TASK_END -->\n`);

  sections.push(`**Priority:** ${task.priority.toUpperCase()}`);
  sections.push(`**Repository:** ${task.repo}`);
  sections.push(`**Branch:** ${task.branchName}\n`);

  // Description
  sections.push(`## Description\n`);
  sections.push(task.description);

  // Problem (if exists)
  if (task.problem) {
    sections.push(`\n## Problem Statement\n`);
    sections.push(task.problem);
  }

  // Required Fix
  if (task.requiredFix) {
    sections.push(`\n## Required Fix\n`);
    sections.push(task.requiredFix);
  }

  // Location
  if (task.location) {
    sections.push(`\n## Primary Location\n`);
    sections.push(`\`${task.location}\``);
  }

  // Files
  if (task.files.length > 0) {
    sections.push(`\n## Files to Modify/Create\n`);
    task.files.forEach(file => {
      sections.push(`- \`${file}\``);
    });
  }

  // Acceptance Criteria
  if (task.acceptanceCriteria.length > 0) {
    sections.push(`\n## Acceptance Criteria\n`);
    task.acceptanceCriteria.forEach((criteria, i) => {
      sections.push(`${i + 1}. ${criteria}`);
    });
  }

  // Verification Steps
  if (task.verification.length > 0) {
    sections.push(`\n## Verification Steps\n`);
    task.verification.forEach((step, i) => {
      sections.push(`${i + 1}. ${step}`);
    });
  }

  // Additional Context
  if (task.additionalContext) {
    sections.push(`\n## Additional Context\n`);
    sections.push(task.additionalContext);
  }

  // Blockers
  if (task.blockers && task.blockers.length > 0) {
    sections.push(`\n## Current Blockers\n`);
    task.blockers.forEach(blocker => {
      sections.push(`- ⚠️ ${blocker}`);
    });
  }

  return sections.join('\n');
}

// Phase 1: Complete ACT (Agent Communication Toolkit)
export const phase1Tasks: PhaseTask[] = [
  {
    id: 'p1-t1',
    title: 'Fix 401 authentication errors',
    description: 'ClaudeService.ts returning 401 errors blocking tool execution',
    status: 'completed',
    priority: 'critical',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'fix-auth-errors',
    location: 'client/src/services/ClaudeService.ts',
    problem: 'ClaudeService calls backend tool endpoints without authentication headers',
    requiredFix: 'Add session ID headers to all tool endpoint calls',
    acceptanceCriteria: [
      'All tool endpoints receive valid session ID',
      'No 401 errors in browser console',
      'All 5 tools work: search_google_places, deep_research, email_finder, create_scheduled_monitor, get_nudges'
    ],
    files: [
      'client/src/services/ClaudeService.ts',
      'server/routes/tools/*.ts'
    ],
    verification: [
      'Open browser console',
      'Execute each tool through UI',
      'Verify no 401 errors appear'
    ],
  },
  {
    id: 'p1-t2',
    title: 'Test all 5 tools execute correctly',
    description: 'Verify search_google_places, deep_research, email_finder, create_scheduled_monitor, get_nudges',
    status: 'completed',
    priority: 'critical',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'test-tools-execution',
    location: 'All tool implementations',
    requiredFix: 'Verify each tool works end-to-end after auth fix',
    acceptanceCriteria: [
      'search_google_places returns 10-20 results',
      'deep_research starts and returns run ID',
      'email_finder starts job and returns batch ID',
      'create_scheduled_monitor returns monitor ID',
      'get_nudges returns nudges array'
    ],
    files: [
      'server/lib/actions.ts',
      'server/routes/tools/*.ts'
    ],
    verification: [
      'Run test query for each tool',
      'Verify expected response structure',
      'Check Tower logs for execution records'
    ],
  },
  {
    id: 'p1-t3',
    title: 'Fix results display in UI',
    description: 'Results Panel and Activity Feed not showing outputs',
    status: 'completed',
    priority: 'high',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'fix-results-display',
    location: 'client/src/components/results/',
    problem: 'Results Panel showing "No Output Available" even when tools execute successfully',
    requiredFix: 'Create/fix Results Panel, Activity Feed, and Deep Research Display components',
    acceptanceCriteria: [
      'Results display in UI within 5 seconds of tool execution',
      'Activity feed shows last 10 actions',
      'Deep research progress visible',
      'All result types formatted properly'
    ],
    files: [
      'client/src/components/results/ResultsPanel.tsx',
      'client/src/components/results/ActivityFeed.tsx'
    ],
    verification: [
      'Execute a tool and verify results appear',
      'Check activity feed populates correctly',
      'Verify deep research shows progress'
    ],
  },
  {
    id: 'p1-t4',
    title: 'Unify tool execution',
    description: 'Single /api/tools/execute endpoint for both UI and Supervisor',
    status: 'completed',
    priority: 'high',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'unify-tool-execution',
    location: 'server/lib/actions.ts',
    problem: 'Tools implemented in TWO places (UI and Supervisor) with different code',
    requiredFix: 'Create single /api/tools/execute endpoint',
    acceptanceCriteria: [
      'Single /api/tools/execute endpoint created',
      'All 5 tools execute through this endpoint',
      'Supervisor calls UI endpoint',
      'All tool calls logged to Tower'
    ],
    files: [
      'server/routes/api/tools/execute.ts',
      'server/lib/actions.ts'
    ],
    verification: [
      'Test tools from UI',
      'Test tools from Supervisor',
      'Verify only one implementation exists'
    ],
  },
];

// Phase 2: Build ADAPT (Learning System)
export const phase2Tasks: PhaseTask[] = [
  {
    id: 'p2-t1',
    title: 'Memory schema and storage',
    description: 'Expand agent_memory table to store outcomes and preferences',
    status: 'completed',
    priority: 'critical',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'memory-schema',
    location: 'Database migrations',
    requiredFix: 'Create memory table for outcome storage',
    acceptanceCriteria: [
      'agent_memory table stores: outcome, user_feedback, confidence_score',
      'Memories linked to specific tasks and tools',
      'Memory retrieval API created',
      'Old memories expire after 90 days'
    ],
    files: [
      'database/migrations/add_memory_table.sql',
      'server/api/memory.ts'
    ],
    verification: [
      'Run migration successfully',
      'Insert test memory record',
      'Query memory API'
    ],
  },
  {
    id: 'p2-t2',
    title: 'Outcome storage after tool execution',
    description: 'Store every tool execution outcome in memory',
    status: 'completed',
    priority: 'critical',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'outcome-storage',
    location: 'server/autonomous-agent.ts',
    requiredFix: 'Save outcomes immediately after tool completes',
    acceptanceCriteria: [
      'Outcome saved after each tool execution',
      'Includes: tool used, query, results, timestamp',
      'User can mark as "helpful" or "not helpful"',
      'Feedback stored in memory table'
    ],
    files: [
      'server/autonomous-agent.ts',
      'server/services/memory-writer.ts'
    ],
    verification: [
      'Execute tool',
      'Verify outcome saved to memory',
      'Check user feedback capture'
    ],
  },
  {
    id: 'p2-t3',
    title: 'Memory-influenced planning',
    description: 'Planner reads past outcomes before generating tasks',
    status: 'completed',
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'memory-planning',
    location: 'server/services/planner.ts',
    requiredFix: 'Query memories before plan generation',
    acceptanceCriteria: [
      'Planner queries recent memories',
      'Successful past queries influence new tasks',
      'Failed queries avoided or refined',
      'Memory influence logged'
    ],
    files: [
      'server/services/planner.ts',
      'server/services/memory-reader.ts'
    ],
    verification: [
      'Generate plan with no memories',
      'Add memory, generate again',
      'Verify plan reflects learnings'
    ],
  },
  {
    id: 'p2-t4',
    title: 'User preference learning',
    description: 'Extract patterns from feedback to build preference model',
    status: 'completed',
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'preference-learning',
    location: 'server/services/preference-learner.ts',
    requiredFix: 'Build user preference model from feedback',
    acceptanceCriteria: [
      'Tracks: industries, regions, contact types user engages with',
      'Updates preference weights based on feedback',
      'Planner uses preferences to prioritize',
      'Preferences viewable in UI'
    ],
    files: [
      'server/services/preference-learner.ts',
      'client/src/pages/preferences.tsx'
    ],
    verification: [
      'Provide feedback on 10 results',
      'Verify preferences extracted',
      'Check planner uses preferences'
    ],
  },
];

// Phase 3: Integrate WABS (Judgement)
export const phase3Tasks: PhaseTask[] = [
  {
    id: 'p3-t1',
    title: 'WABS scoring engine',
    description: 'Score results 0-100 for "interestingness" based on user goals',
    status: 'completed',
    priority: 'critical',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'wabs-scoring',
    location: 'lib/evaluator.js',
    requiredFix: 'Create interestingness scoring system',
    acceptanceCriteria: [
      'Scores consider: relevance, novelty, actionability, urgency',
      'Uses user preferences from memory',
      'Returns score + explanation',
      'Calibrated against user feedback'
    ],
    files: [
      'lib/wabs-scorer.js',
      'lib/evaluator.js'
    ],
    verification: [
      'Score 10 test results',
      'Verify scores match intuition',
      'Check explanation quality'
    ],
  },
  {
    id: 'p3-t2',
    title: 'Automatic outcome marking',
    description: 'Automatically flag interesting findings for notifications',
    status: 'queued',
    priority: 'critical',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'auto-marking',
    location: 'lib/outcome-marker.js',
    requiredFix: 'Auto-flag results scoring >70',
    acceptanceCriteria: [
      'Results scoring >70 flagged as "interesting"',
      'Threshold adjusts based on user feedback',
      'Flagged results trigger email',
      'User can override flags'
    ],
    files: [
      'lib/outcome-marker.js',
      'lib/email-notifier.js'
    ],
    verification: [
      'Execute tool, get high-score result',
      'Verify auto-flagged',
      'Check email triggered'
    ],
  },
  {
    id: 'p3-t3',
    title: 'WABS feedback loop',
    description: 'WABS learns from user accept/reject decisions',
    status: 'queued',
    priority: 'high',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'wabs-feedback',
    location: 'lib/wabs-learner.js',
    requiredFix: 'Adjust scoring weights based on feedback',
    acceptanceCriteria: [
      'User can mark results as interesting/not interesting',
      'Feedback adjusts scoring weights',
      'Model improves over time',
      'Feedback history stored'
    ],
    files: [
      'lib/wabs-learner.js',
      'lib/wabs-scorer.js'
    ],
    verification: [
      'Provide feedback on 20 results',
      'Verify weights adjusted',
      'Test scoring accuracy improvement'
    ],
  },
  {
    id: 'p3-t4',
    title: 'Multi-signal interestingness',
    description: 'Combine signals: recency, scarcity, urgency, fit',
    status: 'queued',
    priority: 'medium',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'multi-signal',
    location: 'lib/wabs-scorer.js',
    requiredFix: 'Weighted combination of multiple signals',
    acceptanceCriteria: [
      'Considers: recency, scarcity, urgency indicators',
      'Weighted combination of signals',
      'Explainable scoring',
      'Tunable weights per user'
    ],
    files: [
      'lib/wabs-scorer.js'
    ],
    verification: [
      'Test each signal independently',
      'Verify weighted combination',
      'Check explainability'
    ],
  },
];

// Phase 4: Commercial EVALUATE
export const phase4Tasks: PhaseTask[] = [
  {
    id: 'p4-t1',
    title: 'Strategy performance tracking',
    description: 'Track success metrics per strategy',
    status: 'queued',
    priority: 'critical',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'strategy-tracking',
    location: 'lib/strategy-evaluator.js',
    requiredFix: 'Metrics tracking per strategy',
    acceptanceCriteria: [
      'Metrics: open rate, click rate, conversion, satisfaction',
      'Per-strategy dashboard',
      'Trend analysis over time',
      'Statistical significance testing'
    ],
    files: [
      'lib/strategy-evaluator.js',
      'client/src/pages/strategy-dashboard.tsx'
    ],
    verification: [
      'Execute 2 strategies',
      'Verify metrics tracked',
      'Compare effectiveness'
    ],
  },
  {
    id: 'p4-t2',
    title: 'A/B testing framework',
    description: 'Test multiple strategies simultaneously',
    status: 'queued',
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'ab-testing',
    location: 'server/ab-tester.ts',
    requiredFix: 'Parallel strategy testing framework',
    acceptanceCriteria: [
      'Can run 2-3 strategies in parallel',
      'Assigns users to strategy buckets',
      'Measures comparative performance',
      'Automatically promotes winner'
    ],
    files: [
      'server/ab-tester.ts',
      'server/strategy-selector.ts'
    ],
    verification: [
      'Configure A/B test',
      'Execute both strategies',
      'Verify winner selected'
    ],
  },
  {
    id: 'p4-t3',
    title: 'ROI calculator',
    description: 'Calculate cost vs value for agent actions',
    status: 'queued',
    priority: 'high',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'roi-calculator',
    location: 'server/lib/roi-calculator.ts',
    requiredFix: 'ROI calculation system',
    acceptanceCriteria: [
      'Tracks: API costs, time saved, leads generated, deals closed',
      'Per-action ROI calculation',
      'ROI dashboard for users',
      'Helps justify subscription pricing'
    ],
    files: [
      'server/lib/roi-calculator.ts',
      'client/src/pages/roi-dashboard.tsx'
    ],
    verification: [
      'Execute actions with known costs',
      'Mark conversions',
      'Verify ROI calculated correctly'
    ],
  },
  {
    id: 'p4-t4',
    title: 'Multi-tenant performance analytics',
    description: 'Aggregate performance across all users (anonymized)',
    status: 'queued',
    priority: 'medium',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'multi-tenant-analytics',
    location: 'lib/analytics.js',
    requiredFix: 'Cross-user performance benchmarks',
    acceptanceCriteria: [
      'Cross-user performance benchmarks',
      'Industry-specific insights',
      'Best practice recommendations',
      'Privacy-preserving aggregation'
    ],
    files: [
      'lib/analytics.js',
      'lib/aggregator.js'
    ],
    verification: [
      'Aggregate data from 10+ users',
      'Verify privacy preserved',
      'Check insights quality'
    ],
  },
];

// Phase 5: Enable REPEAT (Autonomy)
export const phase5Tasks: PhaseTask[] = [
  {
    id: 'p5-t1',
    title: 'Continuous execution loop',
    description: 'Agent runs continuously, not just daily',
    status: 'queued',
    priority: 'critical',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'continuous-loop',
    location: 'server/cron/autonomous-loop.ts',
    requiredFix: '24/7 autonomous execution',
    acceptanceCriteria: [
      'Checks for opportunities every 30 minutes',
      'Adapts frequency based on engagement',
      'Backs off during inactive periods',
      'Runs 24/7 without human trigger'
    ],
    files: [
      'server/cron/autonomous-loop.ts',
      'server/execution-scheduler.ts'
    ],
    verification: [
      'Enable continuous mode',
      'Monitor for 24 hours',
      'Verify autonomous execution'
    ],
  },
  {
    id: 'p5-t2',
    title: 'Self-healing error recovery',
    description: 'Agent recovers from errors without human intervention',
    status: 'queued',
    priority: 'critical',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'error-recovery',
    location: 'server/error-handler.ts',
    requiredFix: 'Automatic error recovery system',
    acceptanceCriteria: [
      'Common errors handled automatically',
      'Retry logic with exponential backoff',
      'Escalates only unknown errors',
      'Learns from error patterns'
    ],
    files: [
      'server/error-handler.ts',
      'server/retry-logic.ts'
    ],
    verification: [
      'Trigger known error',
      'Verify auto-recovery',
      'Test escalation for unknown errors'
    ],
  },
  {
    id: 'p5-t3',
    title: 'Dynamic plan adjustment',
    description: 'Agent modifies plans mid-execution',
    status: 'queued',
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'dynamic-plans',
    location: 'server/plan-adjuster.ts',
    requiredFix: 'Mid-execution plan modification',
    acceptanceCriteria: [
      'Replanning triggered by unexpected outcomes',
      'DAG mutation for plan adjustment',
      'Replan reasons logged clearly',
      'User notified of significant changes'
    ],
    files: [
      'server/plan-adjuster.ts',
      'server/dag-mutator.ts'
    ],
    verification: [
      'Execute plan with unexpected result',
      'Verify replanning triggered',
      'Check new plan quality'
    ],
  },
  {
    id: 'p5-t4',
    title: 'Autonomous goal setting',
    description: 'Agent proposes new goals based on patterns',
    status: 'queued',
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'auto-goals',
    location: 'server/goal-generator.ts',
    requiredFix: 'Automatic goal proposal system',
    acceptanceCriteria: [
      'Identifies opportunities user hasn\'t mentioned',
      'Proposes goals for user approval',
      'Learns which proposals user accepts',
      'Eventually auto-approves low-risk goals'
    ],
    files: [
      'server/goal-generator.ts',
      'server/opportunity-detector.ts'
    ],
    verification: [
      'Run for 7 days',
      'Verify goal proposals',
      'Check approval learning'
    ],
  },
  {
    id: 'p5-t5',
    title: 'Full commercial launch',
    description: 'Production-ready multi-tenant system with pricing',
    status: 'queued',
    priority: 'critical',
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'commercial-launch',
    location: 'Full system',
    requiredFix: 'Production deployment',
    acceptanceCriteria: [
      'Stripe integration for subscriptions',
      '3 pricing tiers (Starter, Pro, Enterprise)',
      'User onboarding flow',
      'Production monitoring and alerting',
      'Security audit complete',
      'GDPR compliance verified'
    ],
    files: [
      'server/billing/stripe.ts',
      'client/src/pages/pricing.tsx',
      'server/monitoring/alerts.ts'
    ],
    verification: [
      'Process test subscription',
      'Run security audit',
      'Verify GDPR compliance',
      'Launch to production'
    ],
  },
];

// Helper functions to get tasks with generated prompts
export function getPhase1TasksWithPrompts(): PhaseTask[] {
  return phase1Tasks.map(task => ({
    ...task,
    prompt: generateTaskPrompt(task),
  }));
}

export function getPhase2TasksWithPrompts(): PhaseTask[] {
  return phase2Tasks.map(task => ({
    ...task,
    prompt: generateTaskPrompt(task),
  }));
}

export function getPhase3TasksWithPrompts(): PhaseTask[] {
  return phase3Tasks.map(task => ({
    ...task,
    prompt: generateTaskPrompt(task),
  }));
}

export function getPhase4TasksWithPrompts(): PhaseTask[] {
  return phase4Tasks.map(task => ({
    ...task,
    prompt: generateTaskPrompt(task),
  }));
}

export function getPhase5TasksWithPrompts(): PhaseTask[] {
  return phase5Tasks.map(task => ({
    ...task,
    prompt: generateTaskPrompt(task),
  }));
}

export function getAllTasksWithPrompts(): PhaseTask[] {
  return [
    ...getPhase1TasksWithPrompts(),
    ...getPhase2TasksWithPrompts(),
    ...getPhase3TasksWithPrompts(),
    ...getPhase4TasksWithPrompts(),
    ...getPhase5TasksWithPrompts(),
  ];
}
