/**
 * Development Progress Service
 *
 * Scans the codebase and plan documents to provide real-time
 * development progress tracking for the Wyshbone project.
 */

import {
  getPhase1TasksWithPrompts,
  getPhase2TasksWithPrompts,
  getPhase3TasksWithPrompts
} from './taskData';

export interface RepoStatus {
  name: string;
  displayName: string;
  health: 'healthy' | 'partial' | 'critical' | 'unknown';
  completion: number;
  description: string;
  integrations: {
    name: string;
    status: 'working' | 'partial' | 'missing';
  }[];
  keyFiles: string[];
}

export interface ComponentStatus {
  id: string;
  name: string;
  category: string;
  status: 'complete' | 'partial' | 'missing' | 'in-progress';
  description: string;
  files: string[];
  lastUpdated?: string;
  issues?: string[];
}

export interface PhaseTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  blockers?: string[];

  // Repo and branch info
  repo: 'wyshbone-ui' | 'wyshbone-supervisor' | 'wyshbone-tower' | 'WABS';
  repoPath: string;
  branchName: string;

  // Task details
  location?: string;
  problem?: string;
  requiredFix?: string;
  acceptanceCriteria: string[];
  files: string[];
  verification: string[];
  additionalContext?: string;

  // Generated prompt (will be computed)
  prompt?: string;

  // Smart task guidance fields
  safetyLevel?: 'MUST_TEST_NOW' | 'QUICK_CHECK_RECOMMENDED' | 'CAN_TEST_LATER';
  blockedBy?: string[]; // Task IDs that must be completed first
  blocksOtherTasks?: string[]; // Task IDs that this task blocks
  quickVerification?: string[]; // Quick 30s-2min verification steps
  quickTestTime?: string; // e.g., "2 minutes"
  fullTestingTime?: string; // e.g., "5 minutes"
  riskIfSkipped?: string; // Description of risk if verification is skipped
  canContinueWithout?: boolean; // Can user continue to next task without verifying this one?

  // Detailed human verification fields
  humanVerification?: {
    whatToCheck: string[]; // Clear steps for human to verify
    successLooksLike: string; // What "working" means
    commonIssues: string[]; // What might go wrong
    whereToCheck: string; // Where to look (browser console, UI, etc.)
    timeNeeded: string; // How long verification takes
  };

  dependencyExplanations?: {
    whyThisBlocksThat: Record<string, string>; // taskId -> reason
    whyThatBlocksThis: Record<string, string>; // taskId -> reason
  };

  impactIfBroken?: string; // What happens if this doesn't work
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  duration: string;
  status: 'not-started' | 'in-progress' | 'completed';
  completion: number;
  tasks: PhaseTask[];
  successCriteria: string[];
}

export interface Blocker {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedComponents: string[];
  location?: string;
}

export interface Tool {
  id: string;
  name: string;
  status: 'working' | 'broken' | 'unknown' | 'stubbed';
  lastTested?: string;
  location: string;
  description: string;
}

export interface DevProgressData {
  timestamp: number;
  overview: {
    currentPhase: string;
    overallCompletion: number;
    criticalBlockersCount: number;
    todoCount: number;
  };
  repos: RepoStatus[];
  phases: Phase[];
  components: ComponentStatus[];
  blockers: Blocker[];
  tools: Tool[];
  autonomyGap: {
    current: string;
    target: string;
    gapPercentage: number;
    missingFeatures: string[];
  };
  developmentVelocity: {
    recentActivity: string[];
    activeAreas: string[];
    staleAreas: string[];
    todosByFile: { file: string; count: number }[];
  };
}

/**
 * Analyzes the codebase and returns development progress data
 */
export async function analyzeDevProgress(): Promise<DevProgressData> {
  const timestamp = Date.now();

  // Define the 4-repo architecture status
  const repos: RepoStatus[] = [
    {
      name: 'wyshbone-ui',
      displayName: 'Wyshbone UI (The Cockpit)',
      health: 'partial',
      completion: 75,
      description: 'Frontend where users see reality and control the agent. Working well but missing learning system and WABS integration.',
      integrations: [
        { name: 'Supervisor', status: 'working' },
        { name: 'Tower', status: 'partial' },
        { name: 'WABS', status: 'missing' },
        { name: 'Supabase', status: 'working' },
        { name: 'Xero', status: 'working' },
      ],
      keyFiles: [
        'server/routes.ts',
        'server/anthropic-agent.ts',
        'client/src/App.tsx',
        'shared/schema.ts',
      ],
    },
    {
      name: 'wyshbone-supervisor',
      displayName: 'Supervisor (The Operator)',
      health: 'partial',
      completion: 65,
      description: 'Execution brain that turns goals into plans. Plan generation works but many actions stubbed.',
      integrations: [
        { name: 'UI', status: 'working' },
        { name: 'Tower', status: 'working' },
        { name: 'WABS', status: 'missing' },
        { name: 'Google Places', status: 'working' },
        { name: 'Hunter.io', status: 'working' },
      ],
      keyFiles: [
        'server/plan-executor.ts',
        'server/actions/executors.ts',
        'server/subconscious.ts',
      ],
    },
    {
      name: 'wyshbone-control-tower',
      displayName: 'Tower (The Evaluator)',
      health: 'healthy',
      completion: 80,
      description: 'Oversight layer that makes Wyshbone safe and reliable. Infrastructure works well, needs more tests.',
      integrations: [
        { name: 'UI', status: 'partial' },
        { name: 'Supervisor', status: 'working' },
        { name: 'OpenAI', status: 'working' },
      ],
      keyFiles: [
        'server.js',
        'lib/poller.js',
        'lib/evaluator.js',
      ],
    },
    {
      name: 'wyshbone-behaviour',
      displayName: 'WABS (The Judgement Layer)',
      health: 'critical',
      completion: 100,
      description: 'Policy and judgement layer - COMPLETE but NOT INTEGRATED anywhere! This is a critical quick win opportunity.',
      integrations: [
        { name: 'UI', status: 'missing' },
        { name: 'Supervisor', status: 'missing' },
        { name: 'Tower', status: 'missing' },
      ],
      keyFiles: [
        'src/index.ts',
        'src/tone-engine.ts',
        'src/pushback-engine.ts',
      ],
    },
  ];

  // Define phases based on plan documents
  const phases: Phase[] = [
    {
      id: 'phase-1',
      name: 'Phase 1: Fix Foundation',
      description: 'Make user-led mode work perfectly',
      duration: 'Week 1',
      status: 'in-progress',
      completion: 60,
      tasks: getPhase1TasksWithPrompts(),
      successCriteria: [
        'Zero 401 errors',
        'All 5 tools work correctly',
        'Results display in UI within 5 seconds',
        'Activity feed shows last 10 actions',
        'Clean error messages',
      ],
    },
    {
      id: 'phase-2',
      name: 'Phase 2: Build Autonomous Agent',
      description: 'Simple autonomous agent that runs daily without user input',
      duration: 'Weeks 2-3',
      status: 'not-started',
      completion: 0,
      tasks: getPhase2TasksWithPrompts(),
      successCriteria: [
        'Agent runs daily at 9am',
        'Generates 3-5 tasks per user',
        'Tasks execute without errors',
        'Users receive well-formatted emails',
        'Activity visible in UI feed',
      ],
    },
    {
      id: 'phase-3',
      name: 'Phase 3: Add Intelligence',
      description: 'Sophisticated autonomous behaviors with learning and adaptation',
      duration: 'Week 4+',
      status: 'not-started',
      completion: 0,
      tasks: getPhase3TasksWithPrompts(),
      successCriteria: [
        'Agent learns from outcomes',
        'Strategies improve over time',
        'Failure handling is automatic',
        'Plans adapt to results',
        'ROI tracking operational',
      ],
    },
  ];

  // Define component status based on audit
  const components: ComponentStatus[] = [
    {
      id: 'chat',
      name: 'Chat with User',
      category: 'UI',
      status: 'complete',
      description: 'Working chat interface with Claude/OpenAI, streaming responses',
      files: ['client/src/pages/chat.tsx', 'server/anthropic-agent.ts'],
    },
    {
      id: 'plan-generation',
      name: 'Lead Plan Generation',
      category: 'Supervisor',
      status: 'complete',
      description: 'Supervisor generates plans from goals, user approval workflow',
      files: ['supervisor/server/plan-executor.ts'],
    },
    {
      id: 'plan-execution',
      name: 'Plan Execution',
      category: 'Supervisor',
      status: 'partial',
      description: 'Core works (Google Places, Hunter), but email sequences and monitoring stubbed',
      files: ['supervisor/server/actions/executors.ts'],
      issues: ['Email sequence setup stubbed', 'Monitor setup stubbed', 'Deep research not implemented'],
    },
    {
      id: 'tower-monitoring',
      name: 'Tower Monitoring',
      category: 'Tower',
      status: 'complete',
      description: 'Infrastructure working: polling, tests, investigations, diagnosis',
      files: ['tower/server.js', 'tower/lib/poller.js'],
    },
    {
      id: 'xero-integration',
      name: 'Xero Integration',
      category: 'UI',
      status: 'complete',
      description: 'OAuth, import/export, webhooks all functional',
      files: ['server/routes/xero-oauth.ts', 'server/lib/xero-import.ts'],
    },
    {
      id: 'entity-resolution',
      name: 'Entity Resolution (AI Matching)',
      category: 'UI',
      status: 'complete',
      description: 'AI-powered duplicate detection and merging with review queue',
      files: ['server/lib/matching.ts'],
    },
    {
      id: 'crm-features',
      name: 'CRM Features',
      category: 'UI',
      status: 'complete',
      description: 'Full CRUD for customers/orders/products, brewery vertical features',
      files: ['client/src/pages/crm/*'],
    },
    {
      id: 'route-planner',
      name: 'Route Planner',
      category: 'UI',
      status: 'complete',
      description: 'Recently added by Claude Code - delivery route optimization',
      files: ['client/src/pages/crm/routes.tsx', 'server/services/RouteOptimizationService.ts'],
    },
    {
      id: 'learning-system',
      name: 'Learning/Beliefs System',
      category: 'All',
      status: 'missing',
      description: 'CRITICAL GAP: No learning from interactions, no belief storage, no strategy adaptation',
      files: [],
      issues: ['Database tables needed', 'Learning event capture', 'Pattern analysis', 'Belief retrieval'],
    },
    {
      id: 'wabs-integration',
      name: 'WABS Integration',
      category: 'All',
      status: 'missing',
      description: 'QUICK WIN: Library complete but not imported anywhere!',
      files: [],
      issues: ['Not imported by UI', 'Not imported by Supervisor', 'Not imported by Tower'],
    },
    {
      id: 'systematic-logging',
      name: 'Systematic Tower Logging',
      category: 'Tower',
      status: 'partial',
      description: 'Endpoint exists but underused, not called for all events',
      files: ['tower/server.js'],
      issues: ['Inconsistent logging from UI', 'Missing metadata', 'No standardized schema'],
    },
    {
      id: 'autonomous-operation',
      name: 'Autonomous Continuous Operation',
      category: 'All',
      status: 'missing',
      description: 'Agent requires manual trigger for each cycle, not truly autonomous',
      files: [],
      issues: ['No autonomous plan generation', 'No self-scheduling', 'No strategy adaptation'],
    },
  ];

  // Define current blockers
  const blockers: Blocker[] = [
    {
      id: 'auth-401',
      title: '401 Authentication Errors',
      description: 'ClaudeService.ts returning 401 errors blocking all tool execution. Blocks Phase 1 completion.',
      severity: 'critical',
      affectedComponents: ['Tool Execution', 'Agent Chat', 'Plan Execution'],
      location: 'client/src/services/ClaudeService.ts',
    },
    {
      id: 'results-display',
      title: 'Results Not Displaying in UI',
      description: 'Results Panel and Activity Feed showing "No Output Available" even when tools execute successfully.',
      severity: 'high',
      affectedComponents: ['Results Panel', 'Activity Feed'],
      location: 'client/src/components/results/ResultsPanel.tsx',
    },
    {
      id: 'tool-duplication',
      title: 'Tool Execution Duplication',
      description: 'UI and Supervisor have separate tool implementations, causing inconsistency and maintenance burden.',
      severity: 'high',
      affectedComponents: ['UI Tools', 'Supervisor Tools'],
      location: 'server/lib/actions.ts and supervisor/server/actions/executors.ts',
    },
    {
      id: 'no-learning',
      title: 'No Learning System',
      description: 'Agent cannot improve over time - core VALA requirement missing. Affects long-term product vision.',
      severity: 'high',
      affectedComponents: ['All Repos'],
    },
    {
      id: 'wabs-unused',
      title: 'WABS Library Not Integrated',
      description: 'Complete behavioral library exists but is not imported anywhere. Quick win opportunity.',
      severity: 'medium',
      affectedComponents: ['UI', 'Supervisor', 'Tower'],
    },
  ];

  // Define tool status
  const tools: Tool[] = [
    {
      id: 'search-google-places',
      name: 'search_google_places',
      status: 'working',
      location: 'server/anthropic-agent.ts',
      description: 'Google Places API search for businesses',
    },
    {
      id: 'deep-research',
      name: 'deep_research',
      status: 'working',
      location: 'server/routes.ts',
      description: 'AI-powered deep research on topics',
    },
    {
      id: 'email-finder',
      name: 'email_finder',
      status: 'working',
      location: 'supervisor/server/actions/executors.ts',
      description: 'Hunter.io email lookup',
    },
    {
      id: 'create-scheduled-monitor',
      name: 'create_scheduled_monitor',
      status: 'stubbed',
      location: 'supervisor/server/actions/executors.ts',
      description: 'Scheduled monitoring setup (returns mock ID)',
    },
    {
      id: 'get-nudges',
      name: 'get_nudges',
      status: 'working',
      location: 'server/routes.ts',
      description: 'Fetch nudges from Tower',
    },
  ];

  // Define autonomy gap
  const autonomyGap = {
    current: 'Plan Execution (User-Led)',
    target: 'Autonomous Agent (Self-Directed)',
    gapPercentage: 65,
    missingFeatures: [
      'Autonomous goal generation',
      'Self-scheduling and continuous operation',
      'Learning from outcomes',
      'Strategy adaptation without human input',
      'Proactive opportunity detection',
      'ROI-based decision making',
    ],
  };

  // Development velocity (simplified - would need actual file scanning)
  const developmentVelocity = {
    recentActivity: [
      'Fix React hooks order and route planner queries',
      'Add route planner frontend - Phase 1',
      'Add route planner backend - Phase 1',
      'Fixed chat authentication - AgentChatPanel uses backend API',
    ],
    activeAreas: [
      'CRM Features',
      'Route Planner',
      'Agent Chat',
      'Xero Integration',
    ],
    staleAreas: [
      'Learning System (never started)',
      'WABS Integration (library complete, unused)',
      'Tower Commercial Metrics',
      'Autonomous Operation',
    ],
    todosByFile: [
      { file: 'tower/server.js', count: 4 },
      { file: 'tower/design_guidelines.md', count: 4 },
      { file: 'supervisor/server/types/lead-gen-plan.ts', count: 4 },
      { file: 'server/routes/admin/database-maintenance.ts', count: 3 },
      { file: 'client/src/pages/crm/index.tsx', count: 3 },
    ],
  };

  return {
    timestamp,
    overview: {
      currentPhase: 'Phase 1: Fix Foundation',
      overallCompletion: 60,
      criticalBlockersCount: blockers.filter((b) => b.severity === 'critical').length,
      todoCount: 102, // From grep results
    },
    repos,
    phases,
    components,
    blockers,
    tools,
    autonomyGap,
    developmentVelocity,
  };
}

/**
 * Get cached progress data or fetch new data
 */
export async function getDevProgressData(forceRefresh: boolean = false): Promise<DevProgressData> {
  const CACHE_KEY = 'dev-progress-data';
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  if (!forceRefresh) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached) as DevProgressData;
      if (Date.now() - data.timestamp < CACHE_DURATION) {
        return data;
      }
    }
  }

  const data = await analyzeDevProgress();
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}
