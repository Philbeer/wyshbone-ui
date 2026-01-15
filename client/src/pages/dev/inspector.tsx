import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  getAllRuns,
  getRunById,
  getDecisionsForRun,
  getSignalsForRun,
  getStopConditionsForRun,
  getOutcomeForRun,
  getVerdictForRun,
  getRulesReferencingRun,
  getAllRules,
  getRuleById,
  type Run,
  type RuleUpdate,
} from '@/mock/afr';

type View = 'runs' | 'run-detail' | 'ledger';

export default function InspectorPage() {
  const [view, setView] = useState<View>('runs');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const handleRunClick = (runId: string) => {
    setSelectedRunId(runId);
    setView('run-detail');
  };

  const handleRuleClick = (ruleId: string) => {
    setSelectedRuleId(ruleId);
  };

  const handleBackToRuns = () => {
    setSelectedRunId(null);
    setView('runs');
  };

  const handleBackToLedger = () => {
    setSelectedRuleId(null);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', background: '#1a1a1a', color: '#e0e0e0', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '10px', color: '#ff6b6b' }}>Agent Flight Recorder (AFR)</h1>
      <p style={{ color: '#888', marginBottom: '20px' }}>Internal dev inspector - read only</p>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <TabButton active={view === 'runs'} onClick={() => { setView('runs'); setSelectedRunId(null); }}>
          Runs List
        </TabButton>
        <TabButton active={view === 'run-detail'} onClick={() => setView('run-detail')} disabled={!selectedRunId}>
          Run Detail
        </TabButton>
        <TabButton active={view === 'ledger'} onClick={() => { setView('ledger'); setSelectedRuleId(null); }}>
          Judgment Ledger
        </TabButton>
      </div>

      {view === 'runs' && <RunsList onRunClick={handleRunClick} />}
      {view === 'run-detail' && selectedRunId && (
        <RunDetail 
          runId={selectedRunId} 
          onBack={handleBackToRuns}
          onRuleClick={(ruleId) => { setSelectedRuleId(ruleId); setView('ledger'); }}
        />
      )}
      {view === 'ledger' && (
        <JudgmentLedger 
          selectedRuleId={selectedRuleId}
          onRuleClick={handleRuleClick}
          onRunClick={handleRunClick}
          onBackToList={handleBackToLedger}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, disabled, children }: { 
  active: boolean; 
  onClick: () => void; 
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        background: active ? '#4a9eff' : '#333',
        color: active ? '#fff' : '#aaa',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function RunsList({ onRunClick }: { onRunClick: (runId: string) => void }) {
  const runs = getAllRuns();

  return (
    <div>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Runs List (newest first)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#2a2a2a', textAlign: 'left' }}>
            <th style={thStyle}>Created</th>
            <th style={thStyle}>Goal Summary</th>
            <th style={thStyle}>Vertical</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Stop?</th>
            <th style={thStyle}>Verdict</th>
            <th style={thStyle}>Score</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => (
            <tr 
              key={run.id} 
              onClick={() => onRunClick(run.id)}
              style={{ cursor: 'pointer', borderBottom: '1px solid #333' }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#2a2a2a')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={tdStyle}>{new Date(run.created_at).toLocaleString()}</td>
              <td style={tdStyle}>{run.goal_summary.substring(0, 50)}...</td>
              <td style={tdStyle}><VerticalBadge vertical={run.vertical} /></td>
              <td style={tdStyle}><StatusBadge status={run.status} /></td>
              <td style={tdStyle}>{run.stop_triggered ? '🛑 YES' : '—'}</td>
              <td style={tdStyle}><VerdictBadge verdict={run.verdict} /></td>
              <td style={tdStyle}>{run.score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunDetail({ runId, onBack, onRuleClick }: { 
  runId: string; 
  onBack: () => void;
  onRuleClick: (ruleId: string) => void;
}) {
  const run = getRunById(runId);
  if (!run) return <div>Run not found: {runId}</div>;

  const decisions = getDecisionsForRun(runId);
  const signals = getSignalsForRun(runId);
  const stopConditions = getStopConditionsForRun(runId);
  const outcome = getOutcomeForRun(runId);
  const verdict = getVerdictForRun(runId);
  const relatedRules = getRulesReferencingRun(runId);

  return (
    <div>
      <button onClick={onBack} style={backButtonStyle}>← Back to Runs</button>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Run Detail: {runId}</h2>

      <Block title="1. Goal & Worth">
        <p><strong>Goal:</strong> {run.goal_summary}</p>
        <p style={{ color: '#888', fontSize: '12px' }}>
          Value: ${run.goal_worth.value} | Budget: ${run.goal_worth.budget} | 
          Horizon: {run.goal_worth.time_horizon} | Risk: {run.goal_worth.risk}
        </p>
      </Block>

      <Block title="2. Decisions Timeline">
        {decisions.length === 0 ? (
          <p style={{ color: '#666' }}>No decisions recorded</p>
        ) : (
          decisions.map(d => (
            <div key={d.id} style={{ marginBottom: '10px', paddingLeft: '10px', borderLeft: '2px solid #4a9eff' }}>
              <strong>D{d.index}: {d.title}</strong> → {d.choice}
              <br />
              <span style={{ color: '#888', fontSize: '12px' }}>Why: {d.why}</span>
            </div>
          ))
        )}
      </Block>

      <Block title="3. Expected Signals">
        {signals.length === 0 ? (
          <p style={{ color: '#666' }}>No signals defined</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {signals.map(s => <li key={s.id}>{s.signal}</li>)}
          </ul>
        )}
      </Block>

      <Block title="4. Stop Conditions">
        {stopConditions.length === 0 ? (
          <p style={{ color: '#666' }}>No stop conditions defined</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {stopConditions.map(s => <li key={s.id}>{s.condition}</li>)}
          </ul>
        )}
      </Block>

      <Block title="5. Outcomes + Tower Verdict">
        {outcome ? (
          <div style={{ marginBottom: '10px' }}>
            <strong>Outcome:</strong> {outcome.outcome_summary}
            {outcome.metrics_json && (
              <pre style={{ background: '#222', padding: '8px', fontSize: '11px', marginTop: '5px' }}>
                {JSON.stringify(outcome.metrics_json, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <p style={{ color: '#666' }}>No outcome recorded</p>
        )}
        {verdict ? (
          <div style={{ marginTop: '10px' }}>
            <strong>Tower Verdict:</strong> <VerdictBadge verdict={verdict.verdict} />
            <p style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>{verdict.reason}</p>
          </div>
        ) : (
          <p style={{ color: '#666' }}>No verdict yet</p>
        )}
      </Block>

      {relatedRules.length > 0 && (
        <Block title="Related Rules (from Judgment Ledger)">
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {relatedRules.map(r => (
              <li key={r.id}>
                <button 
                  onClick={() => onRuleClick(r.id)}
                  style={{ background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {r.rule_text.substring(0, 60)}...
                </button>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function JudgmentLedger({ selectedRuleId, onRuleClick, onRunClick, onBackToList }: {
  selectedRuleId: string | null;
  onRuleClick: (ruleId: string) => void;
  onRunClick: (runId: string) => void;
  onBackToList: () => void;
}) {
  const rules = getAllRules();
  const selectedRule = selectedRuleId ? getRuleById(selectedRuleId) : null;

  if (selectedRule) {
    return (
      <div>
        <button onClick={onBackToList} style={backButtonStyle}>← Back to Ledger</button>
        <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Rule Detail: {selectedRule.id}</h2>
        
        <Block title="Rule">
          <p><strong>{selectedRule.rule_text}</strong></p>
          <p style={{ color: '#888', fontSize: '12px' }}>
            Scope: {selectedRule.scope} | Confidence: <ConfidenceBadge confidence={selectedRule.confidence} /> | 
            Status: <StatusBadge status={selectedRule.status as any} /> | Type: {selectedRule.update_type}
          </p>
          <p style={{ color: '#888', fontSize: '12px' }}>Reason: {selectedRule.reason}</p>
          <p style={{ color: '#666', fontSize: '11px' }}>Created: {new Date(selectedRule.created_at).toLocaleString()}</p>
        </Block>

        <Block title="Evidence Runs">
          {selectedRule.evidence_run_ids.length === 0 ? (
            <div style={{ background: '#ff4444', color: '#fff', padding: '10px', fontWeight: 'bold' }}>
              ⚠️ NO EVIDENCE (invalid rule)
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {selectedRule.evidence_run_ids.map(runId => {
                const run = getRunById(runId);
                return (
                  <li key={runId}>
                    <button
                      onClick={() => onRunClick(runId)}
                      style={{ background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {runId}: {run?.goal_summary.substring(0, 40) || 'Unknown'}...
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Judgment Ledger (Rules)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#2a2a2a', textAlign: 'left' }}>
            <th style={thStyle}>Rule Text</th>
            <th style={thStyle}>Scope</th>
            <th style={thStyle}>Confidence</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Evidence</th>
            <th style={thStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <tr 
              key={rule.id}
              onClick={() => onRuleClick(rule.id)}
              style={{ cursor: 'pointer', borderBottom: '1px solid #333' }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#2a2a2a')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={tdStyle}>{rule.rule_text.substring(0, 50)}...</td>
              <td style={tdStyle}>{rule.scope}</td>
              <td style={tdStyle}><ConfidenceBadge confidence={rule.confidence} /></td>
              <td style={tdStyle}><StatusBadge status={rule.status as any} /></td>
              <td style={tdStyle}>
                {rule.evidence_run_ids.length === 0 ? (
                  <span style={{ color: '#ff4444', fontWeight: 'bold' }}>⚠️ NONE</span>
                ) : (
                  <span style={{ color: '#4a9eff' }}>{rule.evidence_run_ids.length} runs</span>
                )}
              </td>
              <td style={tdStyle}>{new Date(rule.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#222', padding: '15px', marginBottom: '15px', borderRadius: '4px' }}>
      <h3 style={{ margin: '0 0 10px 0', color: '#ffa500', fontSize: '14px' }}>{title}</h3>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: '#4a9eff',
    completed: '#4aff4a',
    failed: '#ff4a4a',
    stopped: '#ff9f4a',
    active: '#4aff4a',
    disabled: '#888',
  };
  return (
    <span style={{ 
      background: colors[status] || '#888', 
      color: '#000', 
      padding: '2px 6px', 
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: 'bold',
    }}>
      {status.toUpperCase()}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict) return <span style={{ color: '#666' }}>—</span>;
  const colors: Record<string, string> = {
    continue: '#4aff4a',
    revise: '#ffa500',
    abandon: '#ff4a4a',
  };
  return (
    <span style={{ 
      background: colors[verdict] || '#888', 
      color: '#000', 
      padding: '2px 6px', 
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: 'bold',
    }}>
      {verdict.toUpperCase()}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors: Record<string, string> = {
    high: '#4aff4a',
    med: '#ffa500',
    low: '#ff4a4a',
  };
  return (
    <span style={{ 
      background: colors[confidence] || '#888', 
      color: '#000', 
      padding: '2px 6px', 
      borderRadius: '3px',
      fontSize: '11px',
    }}>
      {confidence.toUpperCase()}
    </span>
  );
}

function VerticalBadge({ vertical }: { vertical: string }) {
  return (
    <span style={{ 
      background: '#6a5aff', 
      color: '#fff', 
      padding: '2px 6px', 
      borderRadius: '3px',
      fontSize: '11px',
    }}>
      {vertical}
    </span>
  );
}

const thStyle: React.CSSProperties = { padding: '10px', borderBottom: '2px solid #444' };
const tdStyle: React.CSSProperties = { padding: '10px' };
const backButtonStyle: React.CSSProperties = {
  background: '#333',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  cursor: 'pointer',
  marginBottom: '15px',
};
