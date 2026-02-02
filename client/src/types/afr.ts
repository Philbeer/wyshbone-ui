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
  goal_worth: GoalWorth | string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  score?: number | null;
  stop_triggered: boolean;
  verdict?: 'continue' | 'revise' | 'abandon' | null;
  run_type?: 'deep_research' | 'plan' | 'tool' | 'chat' | 'agent';
  activity_id?: string;
  plan_id?: string;
  client_request_id?: string;
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
  outcome_summary?: string;
  summary?: string;
  full_output?: string;
  status?: 'success' | 'partial' | 'failed';
  created_at?: string;
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
  updated_at?: string;
  rule_text: string;
  scope: string;
  confidence: 'low' | 'med' | 'high';
  status: 'active' | 'disabled' | 'invalid';
  update_type: 'create' | 'adjust' | 'retire';
  reason: string | null;
  evidence_run_ids: string[];
  source?: 'human' | 'agent' | 'hybrid';
  supersedes_rule_id?: string | null;
}

export interface ActivitySummary {
  id: string;
  timestamp: string;
  runType: string;
  label: string;
  action: string;
  status: string;
  durationMs?: number | null;
  error?: string | null;
}

export interface RunBundle {
  run: Run;
  decisions: Decision[];
  expected_signals: ExpectedSignal[];
  stop_conditions: StopCondition[];
  outcome: Outcome | null;
  tower_verdict: TowerVerdict | string | null;
  related_rule_updates: RuleUpdate[];
  goal_worth?: string | null;
  verdict?: string | null;
  score?: number | null;
  bundle_present?: boolean;
  activities?: ActivitySummary[];
}
