/**
 * Task Data and Prompt Generation
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

  // Hidden metadata in HTML comment (invisible when rendered, but Claude Code can detect it)
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

  sections.push(`\n---`);
  sections.push(`\n**Note:** This task is part of ${task.id.includes('p1') ? 'Phase 1: Fix Foundation' : task.id.includes('p2') ? 'Phase 2: Build Autonomous Agent' : 'Phase 3: Add Intelligence'}`);
  sections.push(`\nPlease implement this task following the acceptance criteria and verification steps above.`);

  // Auto-notify instructions for Claude Code
  sections.push(`\n\n---`);
  sections.push(`\n## AUTOMATIC DASHBOARD NOTIFICATION\n`);
  sections.push(`**IMPORTANT:** When you (Claude Code) start working on this task, please automatically notify the dashboard by running this command:\n`);
  sections.push(`\`\`\`bash`);
  sections.push(`curl -X POST ${metadata.dashboardUrl}/api/task/started \\`);
  sections.push(`  -H "Content-Type: application/json" \\`);
  sections.push(`  -d '{"taskId": "${metadata.taskId}", "claudeCodePid": "$$", "timestamp": "'$(date -Iseconds)'"}'`);
  sections.push(`\`\`\``);
  sections.push(`\nThis will update the dashboard to show "🤖 Claude Code is working on this task!"\n`);
  sections.push(`**When you finish this task**, notify the dashboard by running:\n`);
  sections.push(`\`\`\`bash`);
  sections.push(`curl -X POST ${metadata.dashboardUrl}/api/task/finished \\`);
  sections.push(`  -H "Content-Type: application/json" \\`);
  sections.push(`  -d '{"taskId": "${metadata.taskId}", "success": true, "timestamp": "'$(date -Iseconds)'"}'`);
  sections.push(`\`\`\``);
  sections.push(`\n*(Set "success": false if the task couldn't be completed)*`);

  return sections.join('\n');
}

// Phase 1 Tasks with complete metadata
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
    problem: 'ClaudeService calls backend tool endpoints without authentication headers, resulting in 401 Unauthorized errors',
    requiredFix: 'Add session ID headers to all tool endpoint calls',
    acceptanceCriteria: [
      'All tool endpoints receive valid session ID',
      'No 401 errors in browser console',
      'Error messages are clear and actionable',
      'All 5 tools work: search_google_places, deep_research, email_finder, create_scheduled_monitor, get_nudges'
    ],
    files: [
      'client/src/services/ClaudeService.ts',
      'client/src/services/auth.ts (if exists)',
      'server/routes/tools/*.ts (backend endpoints)'
    ],
    verification: [
      'Open browser console',
      'Execute each tool through the UI',
      'Verify no 401 errors appear',
      'Verify tools return successful responses'
    ],
    blockers: ['Authentication configuration issue', 'API key rotation needed'],
    // Smart guidance
    safetyLevel: 'MUST_TEST_NOW',
    blocksOtherTasks: ['p1-t2', 'p1-t3', 'p1-t4'],
    quickVerification: [
      'Open browser console (F12)',
      'Click any tool button (e.g., search_google_places)',
      'Check: No 401 errors appear? ✅',
      'Check: Tool returns response? ✅'
    ],
    quickTestTime: '2 minutes',
    fullTestingTime: '5 minutes',
    riskIfSkipped: 'CRITICAL - All other Phase 1 tasks will fail if auth is broken. You MUST test this before continuing.',
    canContinueWithout: false,

    // Detailed human verification
    humanVerification: {
      whatToCheck: [
        'Open browser DevTools (F12)',
        'Click "Console" tab',
        'Click any tool button (e.g., "Find pubs in Leeds")',
        'Watch the console output',
        'Verify: NO red "401 Unauthorized" errors appear',
        'Verify: Tool returns actual results (not error message)',
        'Try 2-3 different tools to be sure',
        'Check Network tab: all API calls show "200 OK" status'
      ],
      successLooksLike: `Console shows:
✅ No 401 errors
✅ Tool executes successfully
✅ Results returned (even if empty)
✅ All HTTP requests show 200/201 status codes

Right panel shows:
✅ "Executing..." then results appear
✅ NOT "No Output Available" error`,
      commonIssues: [
        'Still seeing 401? Session headers not being sent properly',
        'Different error? Might be a different auth issue',
        'Tools time out? Check network connection',
        'Results empty? That\'s OK - we\'re just testing auth'
      ],
      whereToCheck: 'Browser Console (F12) + Network Tab',
      timeNeeded: '2-3 minutes'
    },

    dependencyExplanations: {
      whyThisBlocksThat: {
        'p1-t2': 'Testing tools requires authentication to work. If auth is broken, all tool tests will fail with 401 errors, giving false failures.',
        'p1-t3': 'Results display requires tools to execute successfully. If tools fail with 401s, you can\'t tell if results display is broken or auth is broken.',
        'p1-t4': 'Unifying tool execution means calling backend endpoints. If auth headers aren\'t working, the unified endpoint will fail immediately.'
      },
      whyThatBlocksThis: {}
    },

    impactIfBroken: `🔴 CRITICAL IMPACT:
- NO tools will work (all fail with 401)
- Cannot test any other Phase 1 tasks
- Cannot build autonomous agent (Phase 2)
- Entire system is non-functional
- User experience is completely broken`
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
      'search_google_places returns 10-20 results for "pubs in Leeds"',
      'deep_research starts research and returns run ID',
      'email_finder starts job and returns batch ID',
      'create_scheduled_monitor returns monitor ID',
      'get_nudges returns nudges array'
    ],
    files: [
      'server/lib/actions.ts',
      'server/routes/tools/*.ts',
      'Test each tool endpoint'
    ],
    verification: [
      'Run test query for each tool',
      'Verify expected response structure',
      'Check Tower logs for execution records',
      'Document any errors in test log'
    ],
    // Smart guidance
    safetyLevel: 'MUST_TEST_NOW',
    blockedBy: ['p1-t1'],
    blocksOtherTasks: ['p1-t3'],
    quickVerification: [
      'Test search_google_places: "pubs in Leeds" → Should return 10-20 results',
      'Test deep_research: Any topic → Should return run ID',
      'Test email_finder: "brewery owners in Manchester" → Should return batch ID',
      'Check console: No errors? ✅'
    ],
    quickTestTime: '3 minutes',
    fullTestingTime: '10 minutes',
    riskIfSkipped: 'HIGH - If tools don\'t work properly, users will see errors and results won\'t display. Please verify at least 2-3 tools work.',
    canContinueWithout: false,

    // Detailed human verification
    humanVerification: {
      whatToCheck: [
        '1. Test search_google_places:',
        '   - Enter: "Find pubs in Leeds"',
        '   - Verify: Returns 10-20 pub results with names/addresses',
        '   - Check: Results look like real places (not garbage)',
        '',
        '2. Test deep_research:',
        '   - Enter: "Research craft beer market trends"',
        '   - Verify: Returns a research run ID (string/number)',
        '   - Check: No immediate errors',
        '',
        '3. Test email_finder:',
        '   - Enter: "Find email for The Red Lion pub"',
        '   - Verify: Returns batch ID',
        '   - Check: Job starts (even if email not found)',
        '',
        '4. Test create_scheduled_monitor:',
        '   - Enter: "Monitor new pubs in Manchester"',
        '   - Verify: Returns monitor ID',
        '   - Check: No errors in console',
        '',
        '5. Test get_nudges:',
        '   - Click "Get Nudges" or trigger it',
        '   - Verify: Returns array (even if empty)',
        '   - Check: No 500 errors'
      ],
      successLooksLike: `For EACH tool:
✅ Executes without errors
✅ Returns expected data structure
✅ Console shows success (no red errors)
✅ Tower logs the execution

It's OK if:
- Results are empty (e.g., no email found)
- Deep research is still running
- Monitor is just a stub

NOT OK if:
- 401/403/500 errors
- "undefined" or "null" response
- Tool crashes/freezes
- Nothing happens when clicked`,
      commonIssues: [
        'Tool returns empty? That\'s OK - structure is correct',
        'Deep research doesn\'t complete? Just needs to START',
        'Email not found? That\'s fine - job should still run',
        'One tool fails? Test the others, note which one broke'
      ],
      whereToCheck: 'UI (tool results) + Browser Console + Tower logs',
      timeNeeded: '5-8 minutes (1-2 min per tool)'
    },

    dependencyExplanations: {
      whyThatBlocksThis: {
        'p1-t1': 'Auth must work first. Without valid session headers, all tools will fail with 401 errors before they can even attempt to execute their logic.'
      },
      whyThisBlocksThat: {
        'p1-t3': 'Results display shows tool outputs. If tools are completely broken (returning garbage, crashing, etc.), you can\'t tell if the results panel is working - you have no valid data to display.'
      }
    },

    impactIfBroken: `🟡 HIGH IMPACT:
- Core functionality doesn't work
- Users can't search, research, or find contacts
- Autonomous agent can't perform tasks
- Product is unusable for end-users

But other development can continue:
- Can still work on UI components
- Can test tool execution unification
- Can build schemas and non-tool features`
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
      'Deep research progress and completed reports visible',
      'All result types formatted properly'
    ],
    files: [
      'client/src/components/results/ResultsPanel.tsx',
      'client/src/components/results/ActivityFeed.tsx (create if needed)',
      'client/src/components/results/DeepResearchDisplay.tsx (create if needed)'
    ],
    verification: [
      'Execute a tool and verify results appear',
      'Check activity feed populates correctly',
      'Verify deep research shows progress',
      'Test with all 5 tools'
    ],
    // Smart guidance
    safetyLevel: 'QUICK_CHECK_RECOMMENDED',
    blockedBy: ['p1-t1', 'p1-t2'],
    quickVerification: [
      'Run a quick tool (search_google_places)',
      'Check: Results appear in Results Panel? ✅',
      'Check: Activity Feed shows the action? ✅'
    ],
    quickTestTime: '1 minute',
    fullTestingTime: '5 minutes',
    riskIfSkipped: 'MEDIUM - Results might not display for users, but tools still work. You can test later if needed.',
    canContinueWithout: true,

    // Detailed human verification
    humanVerification: {
      whatToCheck: [
        '1. Execute a tool (e.g., search for pubs)',
        '   - Watch right panel during execution',
        '   - Verify: Shows "Executing..." loading state',
        '',
        '2. After tool completes:',
        '   - Verify: Results appear in right panel within 5 seconds',
        '   - Check: Results are formatted nicely (not raw JSON)',
        '   - Check: Can read and understand the data',
        '',
        '3. Check Activity Feed:',
        '   - Verify: New activity appears at top',
        '   - Check: Shows tool name, timestamp, status',
        '   - Check: Shows last 10 activities',
        '',
        '4. Test with different tools:',
        '   - Run 2-3 different tools',
        '   - Verify: Each shows results correctly',
        '   - Check: Old results clear when new tool runs',
        '',
        '5. Test edge cases:',
        '   - Run tool that returns empty results',
        '   - Verify: Shows "No results found" not error',
        '   - Run tool that fails',
        '   - Verify: Shows error message clearly'
      ],
      successLooksLike: `✅ Right Panel:
   - Shows loading state during execution
   - Displays results within 5 seconds
   - Results are readable (not raw JSON)
   - Empty results show friendly message
   - Errors show clear error message

✅ Activity Feed:
   - Updates automatically
   - Shows last 10 activities
   - Displays timestamp, tool name, status
   - Auto-refreshes every 30 seconds`,
      commonIssues: [
        'Still shows "No Output Available"? Results not being passed to component',
        'Raw JSON showing? Formatting component not working',
        'Feed not updating? WebSocket or polling broken',
        'Slow to appear? Check network delays'
      ],
      whereToCheck: 'UI Right Panel + Activity Feed section',
      timeNeeded: '3-5 minutes'
    },

    dependencyExplanations: {
      whyThatBlocksThis: {
        'p1-t2': 'Need working tools that return valid data. If tools are broken, results panel has nothing valid to display - can\'t tell if panel is broken or tools are broken.'
      },
      whyThisBlocksThat: {}
    },

    impactIfBroken: `🟡 MEDIUM IMPACT:
- Users can't see tool results (bad UX)
- Have to check console to see outputs (technical users only)
- Activity tracking not visible
- Deep research reports inaccessible

But system still functions:
- Tools execute successfully in background
- Data is being saved correctly
- Tower logs everything
- Just the UI layer that's broken`
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
    location: 'server/lib/actions.ts and supervisor connection',
    problem: 'Tools implemented in TWO places (UI and Supervisor) with different code',
    requiredFix: 'Create single /api/tools/execute endpoint in UI. Supervisor calls this endpoint instead of duplicating code.',
    acceptanceCriteria: [
      'Single /api/tools/execute endpoint created in UI',
      'All 5 tools execute through this endpoint',
      'Supervisor configured to call UI endpoint',
      'Zero tool duplication - one source of truth',
      'All tool calls logged to Tower'
    ],
    files: [
      'server/routes/api/tools/execute.ts (create this)',
      'server/lib/actions.ts (refactor to use endpoint)',
      'Document Supervisor integration pattern'
    ],
    verification: [
      'Test tools from UI - should work',
      'Test tools from Supervisor - should call UI endpoint',
      'Verify only one implementation exists',
      'Check Tower logs show all executions'
    ],
    additionalContext: 'This requires coordination between UI and Supervisor repos, but implementation is in UI repo',
    // Smart guidance
    safetyLevel: 'CAN_TEST_LATER',
    blockedBy: ['p1-t1'],
    quickVerification: [
      'Test one tool from UI → Should work',
      'Check code: Only one implementation exists? ✅'
    ],
    quickTestTime: '2 minutes',
    fullTestingTime: '10 minutes',
    riskIfSkipped: 'LOW - This is architectural improvement. Tools still work even if not unified. Safe to test later.',
    canContinueWithout: true,

    // Detailed human verification
    humanVerification: {
      whatToCheck: [
        '1. Check the code:',
        '   - Search codebase for "executeAction" or tool execution',
        '   - Verify: Only ONE /api/tools/execute endpoint exists',
        '   - Check: UI routes through this endpoint',
        '   - Check: No duplicate tool logic in Supervisor',
        '',
        '2. Test from UI:',
        '   - Run a tool from the UI',
        '   - Verify: Still works exactly as before',
        '   - Check: No new errors introduced',
        '',
        '3. Check Tower logs:',
        '   - Run tool from UI',
        '   - Verify: Logged to Tower with correct format',
        '   - Check: Single source of truth confirmed',
        '',
        '4. Code review:',
        '   - Look at server/lib/actions.ts (or similar)',
        '   - Verify: Clean, no duplication',
        '   - Check: Good error handling',
        '   - Check: Proper logging'
      ],
      successLooksLike: `✅ Code Structure:
   - Single /api/tools/execute endpoint in UI
   - All tool logic in one place
   - Supervisor makes HTTP calls to UI endpoint
   - No duplicate implementations

✅ Functionality:
   - Tools work from UI (no regression)
   - Both paths logged consistently
   - Same error handling everywhere

✅ Maintainability:
   - One place to fix bugs
   - One place to add new tools
   - Clear separation of concerns`,
      commonIssues: [
        'Tools broke? Refactoring introduced bug',
        'Logs inconsistent? Different code paths still exist',
        'Still see duplication? Migration not complete'
      ],
      whereToCheck: 'Code files + UI tool execution + Tower logs',
      timeNeeded: '5-7 minutes (mostly code review)'
    },

    dependencyExplanations: {
      whyThatBlocksThis: {
        'p1-t1': 'Unified endpoint needs auth headers to work. If auth is broken, the new unified endpoint will fail immediately and you can\'t tell if it\'s the refactoring or auth that\'s the problem.'
      },
      whyThisBlocksThat: {}
    },

    impactIfBroken: `🟢 LOW IMMEDIATE IMPACT:
- Tools still work (just duplicated code)
- Users don't see any difference
- System functions normally

But MEDIUM LONG-TERM IMPACT:
- Bugs need fixing in two places
- New tools need implementing twice
- Inconsistent behavior between UI and Supervisor
- Technical debt accumulates
- Harder to maintain and debug`
  },
];

// Phase 2 Tasks with complete metadata
export const phase2Tasks: PhaseTask[] = [
  {
    id: 'p2-t1',
    title: 'Database schema for agent activities',
    description: 'Create tables for agent runs, decisions, and outcomes',
    status: 'completed',
    priority: 'high',
    blockedBy: ['p1-t4'],
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'agent-activities-schema',
    location: 'Database migration files',
    requiredFix: 'Create agent_activities table to store autonomous agent actions',
    acceptanceCriteria: [
      'agent_activities table created with proper schema',
      'Stores: id, timestamp, user_id, task_generated, action_taken, results, interesting_flag, status',
      'Proper indexes for common queries (user_id, timestamp, interesting_flag)',
      'Migration script created and tested',
      'Rollback script exists'
    ],
    files: [
      'Database migration file (location depends on your setup)',
      'Schema documentation',
      'Example insert/query scripts'
    ],
    verification: [
      'Run migration successfully',
      'Verify table exists in database',
      'Test insert operation',
      'Test query by user_id and timestamp',
      'Verify indexes created',
      'Test rollback works'
    ],
  },
  {
    id: 'p2-t2',
    title: 'Simple goal generator',
    description: 'Claude API integration for autonomous goal generation',
    status: 'completed',
    priority: 'critical',
    blockedBy: ['p2-t1'],
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'autonomous-goal-generator',
    location: 'server/autonomous-agent.ts (create this file)',
    requiredFix: 'Agent decides what tasks to do today based on user goals using Claude API',
    acceptanceCriteria: [
      'Autonomous agent reads user goals from database',
      'Uses Claude API to generate 3-5 specific tasks for today',
      'Tasks are actionable and specific (not vague)',
      'Tasks stored in agent_activities table',
      'Rate limiting implemented (don\'t spam API)'
    ],
    files: [
      'server/autonomous-agent.ts (create)',
      'server/services/claude-api.ts (may need to create)',
      'Connection to agent_activities table'
    ],
    verification: [
      'Run goal generator for test user',
      'Verify 3-5 tasks generated',
      'Tasks are specific and actionable',
      'Tasks saved to database',
      'Claude API called successfully'
    ],
  },
  {
    id: 'p2-t3',
    title: 'Task executor',
    description: 'Calls unified tool endpoint without user approval',
    status: 'completed',
    priority: 'critical',
    blockedBy: ['p2-t2'],
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'autonomous-task-executor',
    location: 'server/autonomous-agent.ts',
    requiredFix: 'Execute generated tasks using unified tool endpoint, evaluate results, log to database',
    acceptanceCriteria: [
      'Calls /api/tools/execute endpoint from UI for each task',
      'Evaluates if results are interesting (using simple heuristics or AI)',
      'Logs all activities to agent_activities table with results',
      'Rate limits API calls (2 second delay between tasks)',
      'Handles errors gracefully without stopping'
    ],
    files: [
      'server/autonomous-agent.ts (extend)',
      'server/services/task-executor.ts (create)',
      'Error handling and retry logic'
    ],
    verification: [
      'Execute generated tasks end-to-end',
      'Verify tool endpoint called correctly',
      'Check results logged to database',
      'Verify rate limiting works (2s delay)',
      'Test error handling with failed task'
    ],
  },
  {
    blockedBy: ['p2-t3'],
    id: 'p2-t4',
    title: 'Email notification system',
    description: 'Send daily summaries of agent activity to users',
    status: 'completed',
    priority: 'medium',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'email-notifications',
    location: 'server/services/email-service.ts (create)',
    requiredFix: 'Email user about interesting findings from autonomous agent',
    acceptanceCriteria: [
      'Email service configured (using SendGrid, AWS SES, or similar)',
      'HTML email template created with agent findings',
      'Emails sent only for "interesting" findings',
      'Email includes: summary, links to dashboard, timestamp',
      'Unsubscribe link included (compliance)',
      'Email deliverability tested'
    ],
    files: [
      'server/services/email-service.ts (create)',
      'email-templates/agent-findings.html (create)',
      'Environment variables for email config'
    ],
    verification: [
      'Send test email successfully',
      'Email looks good in Gmail, Outlook',
      'Links in email work correctly',
      'Unsubscribe link works',
      'Only interesting findings trigger emails'
    ],
  },
  {
    id: 'p2-t5',
    title: 'Daily cron job',
    description: 'Scheduled execution at 9am daily',
    status: 'completed',
    priority: 'high',
    blockedBy: ['p2-t2', 'p2-t3', 'p2-t4'],
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'daily-cron-job',
    location: 'server/cron/daily-agent.ts (create)',
    requiredFix: 'Schedule agent to run automatically at 9am daily for all active users',
    acceptanceCriteria: [
      'Cron job runs daily at 9am local time',
      'Processes all active users sequentially',
      'Generates goals, executes tasks, sends emails for each user',
      'Handles errors per-user (one user\'s error doesn\'t stop others)',
      'Logs cron execution to database',
      'Can be manually triggered for testing'
    ],
    files: [
      'server/cron/daily-agent.ts (create)',
      'package.json (add node-cron dependency)',
      'server/index.ts (register cron job on startup)'
    ],
    verification: [
      'Manually trigger cron job - verify it works',
      'Check it runs for multiple test users',
      'Verify error handling per user',
      'Check execution logged to database',
      'Set cron for 1 minute from now, verify it triggers'
    ],
  },
  {
    id: 'p2-t6',
    title: 'Activity Feed UI component',
    description: 'Display autonomous agent activities in UI',
    status: 'queued',
    priority: 'medium',
    blockedBy: ['p2-t3'],
    repo: 'wyshbone-ui',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-ui',
    branchName: 'activity-feed-ui',
    location: 'client/src/components/ActivityFeed.tsx (create)',
    requiredFix: 'Show users what the autonomous agent did',
    acceptanceCriteria: [
      'Displays last 10 agent activities from database',
      'Shows: timestamp, task, results summary, interesting flag',
      'Auto-refreshes every 30 seconds',
      'Highlights interesting findings',
      'Click activity to see full details',
      'Responsive design, works on mobile'
    ],
    files: [
      'client/src/components/ActivityFeed.tsx (create)',
      'client/src/components/ActivityDetail.tsx (create for modal)',
      'API endpoint to fetch activities'
    ],
    verification: [
      'Activity feed displays correctly',
      'Shows real data from database',
      'Auto-refresh works (30s interval)',
      'Click activity shows details',
      'Interesting findings highlighted',
      'Looks good on desktop and mobile'
    ],
  },
];

// Phase 3 Tasks with complete metadata
export const phase3Tasks: PhaseTask[] = [
  {
    id: 'p3-t1',
    title: 'Memory system (schema, reader, writer)',
    description: 'Store and retrieve agent context and decisions',
    status: 'queued',
    blockedBy: ['p2-t5'],
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'memory-system',
    location: 'Multiple locations',
    requiredFix: 'Agent learns user preferences and past outcomes',
    acceptanceCriteria: [
      'agent_memory table created (schema)',
      'Memory reader reads relevant memories for planning',
      'Memory writer (WABS) stores outcomes and learnings',
      'Memories influence future task generation',
      'Old memories deprecate/expire over time'
    ],
    files: [
      'Database migration for agent_memory table',
      'server/services/memory-reader.ts (create)',
      'WABS integration for memory writing',
      'Memory retrieval and ranking logic'
    ],
    verification: [
      'Create test memories',
      'Verify planner reads memories',
      'Generate tasks - see memory influence',
      'Write new memory after task completion',
      'Check old memories expire correctly'
    ],
  },
  {
    id: 'p3-t2',
    title: 'Failure categorization',
    description: 'Classify and learn from failure patterns',
    status: 'queued',
    blockedBy: ['p3-t1'],
    priority: 'medium',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'failure-categorization',
    location: 'lib/evaluator.js',
    requiredFix: 'Automatically categorize and analyze failure types',
    acceptanceCriteria: [
      'Failures categorized into types (auth, timeout, data, logic)',
      'Failure patterns detected automatically',
      'Recommendations generated per category',
      'Failure trends tracked over time',
      'Integration with memory system'
    ],
    files: [
      'lib/failure-categorizer.js (create)',
      'lib/evaluator.js (extend)',
      'Database schema for failure_categories'
    ],
    verification: [
      'Trigger different failure types',
      'Verify correct categorization',
      'Check recommendations make sense',
      'Verify trends tracked correctly',
      'Test memory integration'
    ],
  },
  {
    id: 'p3-t3',
    title: 'Error reaction logic',
    description: 'Automated responses to common errors',
    status: 'queued',
    blockedBy: ['p3-t2'],
    priority: 'medium',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'error-reaction-logic',
    location: 'server/services/error-handler.ts (create)',
    requiredFix: 'Agent automatically handles common errors without human intervention',
    acceptanceCriteria: [
      'Common errors handled automatically (retry, fallback, skip)',
      'Error reactions logged for review',
      'Success rate of auto-recovery tracked',
      'Escalation to human for unknown errors',
      'Learning from successful recoveries'
    ],
    files: [
      'server/services/error-handler.ts (create)',
      'Error reaction rules database',
      'Integration with failure categorization'
    ],
    verification: [
      'Trigger known error - see auto-recovery',
      'Trigger unknown error - see escalation',
      'Verify success rate tracking',
      'Check logging completeness',
      'Test learning from recoveries'
    ],
  },
  {
    id: 'p3-t4',
    title: 'Planner replan API',
    description: 'Dynamic plan adjustment based on outcomes',
    status: 'queued',
    blockedBy: ['p3-t3'],
    priority: 'high',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'planner-replan-api',
    location: 'server/plan-executor.ts',
    requiredFix: 'Agent adjusts plans mid-execution based on results',
    acceptanceCriteria: [
      'Replan API endpoint created',
      'Plans adjusted based on step outcomes',
      'Replanning reasons logged clearly',
      'User notified of significant plan changes',
      'Replan history tracked'
    ],
    files: [
      'server/plan-executor.ts (extend)',
      'API endpoint /api/plan/replan (create)',
      'Replanning logic and rules'
    ],
    verification: [
      'Execute plan with failing step',
      'Verify replan triggered',
      'Check new plan makes sense',
      'Verify user notification sent',
      'Check replan history logged'
    ],
  },
  {
    id: 'p3-t5',
    title: 'DAG mutation engine',
    description: 'Modify execution graphs on the fly',
    status: 'queued',
    blockedBy: ['p3-t4'],
    priority: 'medium',
    repo: 'wyshbone-supervisor',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-supervisor',
    branchName: 'dag-mutation-engine',
    location: 'server/plan-executor.ts',
    requiredFix: 'Dynamic modification of execution DAG based on runtime conditions',
    acceptanceCriteria: [
      'DAG nodes can be added/removed/modified at runtime',
      'Dependency constraints maintained',
      'Mutations validated for correctness',
      'Mutation history tracked',
      'Integration with replanning'
    ],
    files: [
      'server/dag-mutator.ts (create)',
      'server/plan-executor.ts (integrate)',
      'DAG validation logic'
    ],
    verification: [
      'Add node to running DAG',
      'Remove completed node',
      'Modify node dependencies',
      'Verify constraint validation',
      'Check mutation history'
    ],
  },
  {
    id: 'p3-t6',
    title: 'Strategy evaluator',
    description: 'Measure and compare strategy effectiveness',
    status: 'queued',
    blockedBy: ['p3-t5'],
    priority: 'high',
    repo: 'wyshbone-tower',
    repoPath: 'C:\\Users\\Phil Waite\\Documents\\GitHub\\wyshbone-control-tower',
    branchName: 'strategy-evaluator',
    location: 'lib/evaluator.js',
    requiredFix: 'Compare different approaches and recommend best strategies',
    acceptanceCriteria: [
      'Strategies tracked with success metrics',
      'A/B testing framework operational',
      'Statistical significance calculated',
      'Recommendations generated automatically',
      'Strategy performance dashboards'
    ],
    files: [
      'lib/strategy-evaluator.js (create)',
      'lib/evaluator.js (integrate)',
      'Database schema for strategy_performance'
    ],
    verification: [
      'Create test strategies',
      'Run A/B test',
      'Verify metrics tracked',
      'Check significance calculation',
      'View performance dashboard'
    ],
  },
];

// Add prompts to all tasks
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

export function getAllTasksWithPrompts(): PhaseTask[] {
  return [
    ...getPhase1TasksWithPrompts(),
    ...getPhase2TasksWithPrompts(),
    ...getPhase3TasksWithPrompts(),
  ];
}
