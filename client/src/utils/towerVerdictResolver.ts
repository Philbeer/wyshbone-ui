export interface TowerJudgementRow {
  type: string;
  payload_json?: any;
}

export interface ResolvedTowerVerdict {
  verdict: string | null;
  label: string | null;
  proxyUsed: string | null;
  stopTimePredicate: boolean;
  hasAnyFail: boolean;
  hasMixed: boolean;
  stepFailCount: number;
  totalJudgements: number;
}

function parsePayload(p: any): any {
  if (typeof p === 'string') {
    try { return JSON.parse(p); } catch { return {}; }
  }
  return p || {};
}

const PASS_VERDICTS = ['pass', 'accept', 'accept_with_unverified'];
const FAIL_VERDICTS = ['fail', 'error'];

export function resolveAuthoritativeTowerVerdict(rows: TowerJudgementRow[]): ResolvedTowerVerdict {
  const towerRows = rows.filter(r => r.type === 'tower_judgement');

  if (towerRows.length === 0) {
    return {
      verdict: null,
      label: null,
      proxyUsed: null,
      stopTimePredicate: false,
      hasAnyFail: false,
      hasMixed: false,
      stepFailCount: 0,
      totalJudgements: 0,
    };
  }

  let finalDeliveryVerdict: string | null = null;
  let finalDeliveryProxyUsed: string | null = null;
  let finalDeliveryStopTimePredicate = false;

  let failCount = 0;
  let passCount = 0;
  let lastVerdict: string | null = null;
  let lastProxyUsed: string | null = null;
  let lastStopTimePredicate = false;

  for (const row of towerRows) {
    const p = parsePayload(row.payload_json);
    const v = (p.verdict || '').toLowerCase();

    if (FAIL_VERDICTS.includes(v)) failCount++;
    if (PASS_VERDICTS.includes(v)) passCount++;

    lastVerdict = p.verdict || null;
    lastProxyUsed = p.proxy_used || null;
    lastStopTimePredicate = p.stop_reason === 'time_predicate' || p.constraint_type === 'time_predicate';

    if (p.phase === 'final_delivery') {
      finalDeliveryVerdict = p.verdict || null;
      finalDeliveryProxyUsed = p.proxy_used || null;
      finalDeliveryStopTimePredicate = p.stop_reason === 'time_predicate' || p.constraint_type === 'time_predicate';
    }
  }

  const hasAnyFail = failCount > 0;
  const hasMixed = failCount > 0 && passCount > 0;

  if (finalDeliveryVerdict) {
    const fdv = finalDeliveryVerdict.toLowerCase();
    if (PASS_VERDICTS.includes(fdv)) {
      return {
        verdict: finalDeliveryVerdict,
        label: hasMixed ? `${finalDeliveryVerdict.toUpperCase()} (run)` : finalDeliveryVerdict.toUpperCase(),
        proxyUsed: finalDeliveryProxyUsed,
        stopTimePredicate: finalDeliveryStopTimePredicate,
        hasAnyFail: false,
        hasMixed,
        stepFailCount: failCount,
        totalJudgements: towerRows.length,
      };
    }
    return {
      verdict: finalDeliveryVerdict,
      label: finalDeliveryVerdict.toUpperCase(),
      proxyUsed: finalDeliveryProxyUsed,
      stopTimePredicate: finalDeliveryStopTimePredicate,
      hasAnyFail: true,
      hasMixed,
      stepFailCount: failCount,
      totalJudgements: towerRows.length,
    };
  }

  if (towerRows.length === 1) {
    return {
      verdict: lastVerdict,
      label: lastVerdict ? lastVerdict.toUpperCase() : null,
      proxyUsed: lastProxyUsed,
      stopTimePredicate: lastStopTimePredicate,
      hasAnyFail,
      hasMixed: false,
      stepFailCount: failCount,
      totalJudgements: 1,
    };
  }

  if (hasMixed && lastVerdict) {
    const lv = lastVerdict.toLowerCase();
    if (PASS_VERDICTS.includes(lv)) {
      return {
        verdict: lastVerdict,
        label: `MIXED (${failCount} step${failCount !== 1 ? 's' : ''} failed)`,
        proxyUsed: lastProxyUsed,
        stopTimePredicate: lastStopTimePredicate,
        hasAnyFail: true,
        hasMixed: true,
        stepFailCount: failCount,
        totalJudgements: towerRows.length,
      };
    }
  }

  return {
    verdict: lastVerdict,
    label: lastVerdict ? lastVerdict.toUpperCase() : null,
    proxyUsed: lastProxyUsed,
    stopTimePredicate: lastStopTimePredicate,
    hasAnyFail,
    hasMixed,
    stepFailCount: failCount,
    totalJudgements: towerRows.length,
  };
}

export function isTowerTrustFailure(resolved: ResolvedTowerVerdict): boolean {
  if (!resolved.verdict) return false;
  const v = resolved.verdict.toLowerCase();
  if (PASS_VERDICTS.includes(v) && !resolved.hasMixed) return false;
  if (PASS_VERDICTS.includes(v) && resolved.hasMixed) return false;
  return FAIL_VERDICTS.includes(v) || v === 'stop';
}
