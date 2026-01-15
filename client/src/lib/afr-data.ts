import type { Run, RuleUpdate, RunBundle } from '@/types/afr';
import {
  MOCK_RUNS,
  MOCK_DECISIONS,
  MOCK_EXPECTED_SIGNALS,
  MOCK_STOP_CONDITIONS,
  MOCK_OUTCOMES,
  MOCK_TOWER_VERDICTS,
  MOCK_RULE_UPDATES,
} from '@/mock/afr';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_AFR !== 'false';

export async function fetchRuns(limit: number = 200): Promise<Run[]> {
  if (USE_MOCK) {
    return MOCK_RUNS;
  }

  const res = await fetch(`/api/afr/runs?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch runs: ${res.status}`);
  }
  return res.json();
}

export async function fetchRunBundle(runId: string): Promise<RunBundle> {
  if (USE_MOCK) {
    const run = MOCK_RUNS.find((r) => r.id === runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    return {
      run,
      decisions: MOCK_DECISIONS.filter((d) => d.run_id === runId),
      expected_signals: MOCK_EXPECTED_SIGNALS.filter((s) => s.run_id === runId),
      stop_conditions: MOCK_STOP_CONDITIONS.filter((c) => c.run_id === runId),
      outcome: MOCK_OUTCOMES.find((o) => o.run_id === runId) || null,
      tower_verdict: MOCK_TOWER_VERDICTS.find((v) => v.run_id === runId) || null,
      related_rule_updates: MOCK_RULE_UPDATES.filter((r) =>
        r.evidence_run_ids.includes(runId)
      ),
    };
  }

  const res = await fetch(`/api/afr/runs/${runId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch run bundle: ${res.status}`);
  }
  return res.json();
}

export async function fetchRules(limit: number = 200): Promise<RuleUpdate[]> {
  if (USE_MOCK) {
    return MOCK_RULE_UPDATES;
  }

  const res = await fetch(`/api/afr/rules?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rules: ${res.status}`);
  }
  return res.json();
}

export async function fetchRule(ruleId: string): Promise<RuleUpdate | null> {
  if (USE_MOCK) {
    return MOCK_RULE_UPDATES.find((r) => r.id === ruleId) || null;
  }

  const res = await fetch(`/api/afr/rules/${ruleId}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch rule: ${res.status}`);
  }
  return res.json();
}

export function isUsingMockData(): boolean {
  return USE_MOCK;
}
