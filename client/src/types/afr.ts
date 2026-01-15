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
