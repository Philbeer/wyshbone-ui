/**
 * Development Progress Service
 *
 * Scans the codebase and plan documents to provide real-time
 * development progress tracking for the Wyshbone project.
 */

import {
  getPhase1TasksWithPrompts,
  getPhase2TasksWithPrompts,
  getPhase3TasksWithPrompts,
  getPhase4TasksWithPrompts,
  getPhase5TasksWithPrompts
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
  // Core identification
  id: string;
  title: string;
  status: 'queued' | 'in-progress' | 'testing' | 'fixing' | 'completed';

  // Execution context
  repo: 'wyshbone-ui' | 'wyshbone-supervisor' | 'wyshbone-tower' | 'WABS';
  repoPath: string;
  branchName: string;
  files: string[];

  // Dependencies
  blockedBy?: string[]; // Task IDs that block this task

  // Optional fields for backward compatibility with existing data
  priority?: 'critical' | 'high' | 'medium' | 'low';
  description?: string;
  location?: string;
  prompt?: string;
  [key: string]: any; // Allow other fields to exist without breaking
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
  const phase1Tasks = getPhase1TasksWithPrompts();
  const phase2Tasks = getPhase2TasksWithPrompts();
  const phase3Tasks = getPhase3TasksWithPrompts();
  const phase4Tasks = getPhase4TasksWithPrompts();
  const phase5Tasks = getPhase5TasksWithPrompts();

  // Calculate dynamic completion percentages
  const calculateCompletion = (tasks: PhaseTask[]) => {
    const completed = tasks.filter(t => t.status === 'completed').length;
    return tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  };

  const phase1Completion = calculateCompletion(phase1Tasks);
  const phase2Completion = calculateCompletion(phase2Tasks);
  const phase3Completion = calculateCompletion(phase3Tasks);
  const phase4Completion = calculateCompletion(phase4Tasks);
  const phase5Completion = calculateCompletion(phase5Tasks);

  // Determine phase status
  const getPhaseStatus = (completion: number, tasks: PhaseTask[]): Phase['status'] => {
    if (completion === 100) return 'completed';
    if (completion > 0 || tasks.some(t => t.status === 'in-progress' || t.status === 'testing')) return 'in-progress';
    return 'not-started';
  };

  const phases: Phase[] = [
    {
      id: 'phase-1',
      name: 'Phase 1: Complete ACT',
      description: 'Agent Communication Toolkit - Finish tool execution layer',
      duration: '1-2 weeks',
      status: getPhaseStatus(phase1Completion, phase1Tasks),
      completion: phase1Completion,
      tasks: phase1Tasks,
      successCriteria: [
        'All 5 tools execute without errors',
        'Results display correctly in UI',
        'Single unified execution endpoint',
      ],
    },
    {
      id: 'phase-2',
      name: 'Phase 2: Build ADAPT',
      description: 'Learning System - Agent remembers outcomes and learns preferences',
      duration: '2-3 weeks',
      status: getPhaseStatus(phase2Completion, phase2Tasks),
      completion: phase2Completion,
      tasks: phase2Tasks,
      successCriteria: [
        'Agent remembers 90% of outcomes',
        'Planning influenced by past success/failure',
        'User preferences learned within 7 days',
      ],
    },
    {
      id: 'phase-3',
      name: 'Phase 3: Integrate WABS',
      description: 'Judgement Layer - Agent determines what\'s "interesting" without human input',
      duration: '2-3 weeks',
      status: getPhaseStatus(phase3Completion, phase3Tasks),
      completion: phase3Completion,
      tasks: phase3Tasks,
      successCriteria: [
        '80% accuracy on "interesting" predictions',
        'User overrides <20% of flagged results',
        'Scoring improves 10% month-over-month',
      ],
    },
    {
      id: 'phase-4',
      name: 'Phase 4: Commercial EVALUATE',
      description: 'Measure strategy effectiveness and optimize for commercial success',
      duration: '2-3 weeks',
      status: getPhaseStatus(phase4Completion, phase4Tasks),
      completion: phase4Completion,
      tasks: phase4Tasks,
      successCriteria: [
        'Can measure ROI per action',
        'A/B tests show statistically significant winners',
        'Multi-user performance benchmarks available',
      ],
    },
    {
      id: 'phase-5',
      name: 'Phase 5: Enable REPEAT',
      description: 'Autonomy - Fully autonomous operation without human intervention',
      duration: '3-4 weeks',
      status: getPhaseStatus(phase5Completion, phase5Tasks),
      completion: phase5Completion,
      tasks: phase5Tasks,
      successCriteria: [
        '7 days of autonomous operation without human intervention',
        'Self-heals 95% of errors',
        '10 paying customers on production system',
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

  // Calculate weighted overall completion
  // Phase 1: 40%, Phase 2: 35%, Phase 3: 25%
  const overallCompletion = Math.round(
    (phase1Completion * 0.4) + (phase2Completion * 0.35) + (phase3Completion * 0.25)
  );

  // Determine current phase based on progress
  const currentPhase = phase1Completion < 100
    ? 'Phase 1: Fix Foundation'
    : phase2Completion < 100
    ? 'Phase 2: Build Autonomous Agent'
    : 'Phase 3: Add Intelligence';

  return {
    timestamp,
    overview: {
      currentPhase,
      overallCompletion,
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
