export interface GoalWorth {
  value: number;
  budget: number;
  time_horizon: string;
  risk: 'low' | 'medium' | 'high';
}

export interface Run {
  id: string;
  created_at: string;
  vertical: string;
  goal_summary: string;
  goal_worth: GoalWorth;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  score?: number;
  stop_triggered: boolean;
  verdict?: 'continue' | 'revise' | 'abandon';
}

export interface Decision {
  id: string;
  run_id: string;
  index: number;
  title: string;
  choice: string;
  why: string;
  options_considered?: string[];
}

export interface ExpectedSignal {
  id: string;
  run_id?: string;
  decision_id?: string;
  signal: string;
}

export interface StopCondition {
  id: string;
  run_id?: string;
  decision_id?: string;
  condition: string;
}

export interface Outcome {
  id: string;
  run_id?: string;
  decision_id?: string;
  outcome_summary: string;
  metrics_json?: Record<string, any>;
}

export interface TowerVerdict {
  id: string;
  run_id: string;
  verdict: 'continue' | 'revise' | 'abandon';
  reason: string;
}

export interface RuleUpdate {
  id: string;
  created_at: string;
  rule_text: string;
  scope: string;
  confidence: 'low' | 'med' | 'high';
  status: 'active' | 'disabled';
  update_type: 'create' | 'adjust' | 'retire';
  reason: string;
  evidence_run_ids: string[];
}

export const MOCK_RUNS: Run[] = [
  {
    id: 'run_001',
    created_at: '2026-01-15T10:30:00Z',
    vertical: 'hospitality',
    goal_summary: 'Find new pubs in Kent for brewery distribution',
    goal_worth: { value: 5000, budget: 200, time_horizon: '2 weeks', risk: 'low' },
    status: 'completed',
    score: 85,
    stop_triggered: false,
    verdict: 'continue',
  },
  {
    id: 'run_002',
    created_at: '2026-01-14T14:15:00Z',
    vertical: 'healthcare',
    goal_summary: 'Research dental practices in Manchester for equipment sales',
    goal_worth: { value: 15000, budget: 500, time_horizon: '1 month', risk: 'medium' },
    status: 'completed',
    score: 72,
    stop_triggered: true,
    verdict: 'revise',
  },
  {
    id: 'run_003',
    created_at: '2026-01-13T09:00:00Z',
    vertical: 'retail',
    goal_summary: 'Find coffee shops that opened in 2024 in London',
    goal_worth: { value: 3000, budget: 100, time_horizon: '1 week', risk: 'low' },
    status: 'failed',
    stop_triggered: true,
    verdict: 'abandon',
  },
  {
    id: 'run_004',
    created_at: '2026-01-12T16:45:00Z',
    vertical: 'hospitality',
    goal_summary: 'Generate leads for farm shops in Yorkshire',
    goal_worth: { value: 8000, budget: 300, time_horizon: '3 weeks', risk: 'medium' },
    status: 'running',
    stop_triggered: false,
  },
];

export const MOCK_DECISIONS: Decision[] = [
  {
    id: 'dec_001_1',
    run_id: 'run_001',
    index: 1,
    title: 'Search Strategy',
    choice: 'Use Google Places API with radius search',
    why: 'Most comprehensive local business data for UK pubs',
    options_considered: ['Yelp API', 'Manual scraping', 'Google Places'],
  },
  {
    id: 'dec_001_2',
    run_id: 'run_001',
    index: 2,
    title: 'Filter Criteria',
    choice: 'Filter by rating > 3.5 and open status',
    why: 'Focus on established, active venues for better conversion',
  },
  {
    id: 'dec_001_3',
    run_id: 'run_001',
    index: 3,
    title: 'Contact Enrichment',
    choice: 'Use Apollo.io for decision-maker lookup',
    why: 'Best coverage for UK hospitality sector contacts',
  },
  {
    id: 'dec_002_1',
    run_id: 'run_002',
    index: 1,
    title: 'Data Source',
    choice: 'NHS dentist registry + Google Places cross-reference',
    why: 'NHS registry ensures legitimacy; Google adds contact details',
  },
  {
    id: 'dec_002_2',
    run_id: 'run_002',
    index: 2,
    title: 'Scope Reduction',
    choice: 'Limit to practices with 3+ dentists',
    why: 'Larger practices have bigger equipment budgets',
  },
  {
    id: 'dec_003_1',
    run_id: 'run_003',
    index: 1,
    title: 'Time Filter',
    choice: 'Use business registration date from Companies House',
    why: 'Most reliable source for opening dates',
  },
];

export const MOCK_EXPECTED_SIGNALS: ExpectedSignal[] = [
  { id: 'sig_001_1', run_id: 'run_001', signal: 'At least 50 pubs found in search radius' },
  { id: 'sig_001_2', run_id: 'run_001', signal: 'Contact info found for >60% of venues' },
  { id: 'sig_001_3', run_id: 'run_001', signal: 'Decision-maker identified for >40% of contacts' },
  { id: 'sig_002_1', run_id: 'run_002', signal: 'NHS registry returns >100 practices' },
  { id: 'sig_002_2', run_id: 'run_002', signal: 'Equipment purchase signals detected in >20%' },
  { id: 'sig_003_1', run_id: 'run_003', signal: '2024 registrations available via Companies House API' },
];

export const MOCK_STOP_CONDITIONS: StopCondition[] = [
  { id: 'stop_001_1', run_id: 'run_001', condition: 'API rate limit exceeded' },
  { id: 'stop_001_2', run_id: 'run_001', condition: 'Budget exhausted (>200 API calls)' },
  { id: 'stop_002_1', run_id: 'run_002', condition: 'Contact enrichment yield <30%' },
  { id: 'stop_002_2', run_id: 'run_002', condition: 'Time horizon exceeded' },
  { id: 'stop_003_1', run_id: 'run_003', condition: 'Companies House API unavailable' },
];

export const MOCK_OUTCOMES: Outcome[] = [
  {
    id: 'out_001',
    run_id: 'run_001',
    outcome_summary: 'Found 67 pubs, 45 with contact info, 28 with decision-maker data. Ready for outreach.',
    metrics_json: { pubs_found: 67, contacts: 45, decision_makers: 28, conversion_rate: 0.42 },
  },
  {
    id: 'out_002',
    run_id: 'run_002',
    outcome_summary: 'Located 112 practices but contact enrichment only yielded 25%. Stopped early due to low ROI.',
    metrics_json: { practices_found: 112, enriched: 28, yield_rate: 0.25 },
  },
  {
    id: 'out_003',
    run_id: 'run_003',
    outcome_summary: 'Companies House API returned 403 errors. Could not verify 2024 registrations. Run abandoned.',
    metrics_json: { api_errors: 15, successful_calls: 0 },
  },
];

export const MOCK_TOWER_VERDICTS: TowerVerdict[] = [
  {
    id: 'tv_001',
    run_id: 'run_001',
    verdict: 'continue',
    reason: 'Strong yield rate (42%) justifies continued investment in hospitality vertical.',
  },
  {
    id: 'tv_002',
    run_id: 'run_002',
    verdict: 'revise',
    reason: 'Healthcare vertical needs different enrichment strategy. Consider using LinkedIn Sales Nav instead of Apollo.',
  },
  {
    id: 'tv_003',
    run_id: 'run_003',
    verdict: 'abandon',
    reason: 'Companies House API unreliable for real-time queries. Do not retry without alternative data source.',
  },
];

export const MOCK_RULE_UPDATES: RuleUpdate[] = [
  {
    id: 'rule_001',
    created_at: '2026-01-15T11:00:00Z',
    rule_text: 'For hospitality leads, prioritize Google Places over Yelp API',
    scope: 'hospitality',
    confidence: 'high',
    status: 'active',
    update_type: 'create',
    reason: 'Google Places showed 3x better coverage for UK pubs',
    evidence_run_ids: ['run_001'],
  },
  {
    id: 'rule_002',
    created_at: '2026-01-14T15:30:00Z',
    rule_text: 'Use LinkedIn Sales Nav for healthcare sector contact enrichment',
    scope: 'healthcare',
    confidence: 'med',
    status: 'active',
    update_type: 'adjust',
    reason: 'Apollo.io underperforms in UK healthcare sector',
    evidence_run_ids: ['run_002'],
  },
  {
    id: 'rule_003',
    created_at: '2026-01-13T10:00:00Z',
    rule_text: 'Avoid Companies House API for real-time business registration queries',
    scope: 'all',
    confidence: 'high',
    status: 'active',
    update_type: 'create',
    reason: 'API unreliable; frequent 403 errors and rate limiting',
    evidence_run_ids: ['run_003'],
  },
  {
    id: 'rule_004',
    created_at: '2026-01-10T08:00:00Z',
    rule_text: 'Legacy rule without evidence',
    scope: 'retail',
    confidence: 'low',
    status: 'disabled',
    update_type: 'retire',
    reason: 'No evidence to support this rule',
    evidence_run_ids: [],
  },
];

export function getRunById(id: string): Run | undefined {
  return MOCK_RUNS.find(r => r.id === id);
}

export function getDecisionsForRun(runId: string): Decision[] {
  return MOCK_DECISIONS.filter(d => d.run_id === runId).sort((a, b) => a.index - b.index);
}

export function getSignalsForRun(runId: string): ExpectedSignal[] {
  return MOCK_EXPECTED_SIGNALS.filter(s => s.run_id === runId);
}

export function getStopConditionsForRun(runId: string): StopCondition[] {
  return MOCK_STOP_CONDITIONS.filter(s => s.run_id === runId);
}

export function getOutcomeForRun(runId: string): Outcome | undefined {
  return MOCK_OUTCOMES.find(o => o.run_id === runId);
}

export function getVerdictForRun(runId: string): TowerVerdict | undefined {
  return MOCK_TOWER_VERDICTS.find(v => v.run_id === runId);
}

export function getRulesReferencingRun(runId: string): RuleUpdate[] {
  return MOCK_RULE_UPDATES.filter(r => r.evidence_run_ids.includes(runId));
}

export function getRuleById(id: string): RuleUpdate | undefined {
  return MOCK_RULE_UPDATES.find(r => r.id === id);
}

export function getAllRules(): RuleUpdate[] {
  return MOCK_RULE_UPDATES;
}

export function getAllRuns(): Run[] {
  return [...MOCK_RUNS].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
