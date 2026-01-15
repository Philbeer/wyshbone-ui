import { useState, useEffect } from 'react';
import { useSearch } from 'wouter';
import type { Run, RuleUpdate, RunBundle } from '@/types/afr';
import { fetchRuns, fetchRunBundle, fetchRules, fetchRule, isUsingMockData } from '@/lib/afr-data';

type View = 'runs' | 'run-detail' | 'ledger';

function updateURLParams(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState({}, '', url.toString());
}

export default function InspectorPage() {
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const initialRunId = urlParams.get('run');
  const initialRuleId = urlParams.get('rule');

  const [view, setView] = useState<View>(() => {
    if (initialRunId) return 'run-detail';
    if (initialRuleId) return 'ledger';
    return 'runs';
  });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(initialRuleId);
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  const handleRunClick = (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRuleId(null);
    setNotFoundId(null);
    setView('run-detail');
    updateURLParams({ run: runId, rule: null });
  };

  const handleRuleClick = (ruleId: string) => {
    setSelectedRuleId(ruleId);
    setNotFoundId(null);
    updateURLParams({ rule: ruleId });
  };

  const handleBackToRuns = () => {
    setSelectedRunId(null);
    setNotFoundId(null);
    setView('runs');
    updateURLParams({ run: null, rule: null });
  };

  const handleBackToLedger = () => {
    setSelectedRuleId(null);
    setNotFoundId(null);
    updateURLParams({ rule: null });
  };

  const handleTabChange = (newView: View) => {
    setNotFoundId(null);
    if (newView === 'runs') {
      setSelectedRunId(null);
      updateURLParams({ run: null, rule: null });
    } else if (newView === 'ledger') {
      setSelectedRuleId(null);
      updateURLParams({ rule: null });
    }
    setView(newView);
  };

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'monospace', 
      background: '#1a1a1a', 
      color: '#e0e0e0', 
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <h1 style={{ marginBottom: '10px', color: '#ff6b6b', flexShrink: 0 }}>Agent Flight Recorder (AFR)</h1>
      <p style={{ color: '#888', marginBottom: '10px', flexShrink: 0 }}>Internal dev inspector - read only</p>
      <DataSourceBadge />

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexShrink: 0 }}>
        <TabButton active={view === 'runs'} onClick={() => handleTabChange('runs')}>
          Runs List
        </TabButton>
        <TabButton active={view === 'run-detail'} onClick={() => setView('run-detail')} disabled={!selectedRunId}>
          Run Detail
        </TabButton>
        <TabButton active={view === 'ledger'} onClick={() => handleTabChange('ledger')}>
          Judgment Ledger
        </TabButton>
      </div>

      {notFoundId && (
        <div style={{ 
          background: '#5c2020', 
          border: '1px solid #ff6b6b', 
          padding: '12px 16px', 
          marginBottom: '20px',
          borderRadius: '4px',
          flexShrink: 0,
        }}>
          <strong style={{ color: '#ff6b6b' }}>Not found:</strong>{' '}
          <code style={{ background: '#333', padding: '2px 6px', borderRadius: '2px' }}>{notFoundId}</code>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {view === 'runs' && <RunsList onRunClick={handleRunClick} />}
        {view === 'run-detail' && selectedRunId && (
          <RunDetail 
            runId={selectedRunId} 
            onBack={handleBackToRuns}
            onRuleClick={(ruleId) => { 
              setSelectedRuleId(ruleId); 
              setView('ledger'); 
              updateURLParams({ run: selectedRunId, rule: ruleId });
            }}
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
    </div>
  );
}

function DataSourceBadge() {
  const [showInstructions, setShowInstructions] = useState(false);
  const isMock = isUsingMockData();
  
  const targetValue = isMock ? 'false' : 'true';
  const targetLabel = isMock ? 'REAL data' : 'MOCK data';
  
  return (
    <div style={{ marginBottom: '15px', flexShrink: 0 }}>
      <div style={{ 
        padding: '8px 12px', 
        background: isMock ? '#4a3f00' : '#003d00',
        border: `1px solid ${isMock ? '#ffa500' : '#4aff4a'}`,
        borderRadius: '4px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        <div>
          <strong>Data Source:</strong>{' '}
          {isMock ? (
            <span style={{ color: '#ffa500' }}>MOCK DATA</span>
          ) : (
            <span style={{ color: '#4aff4a' }}>REAL DATABASE (Supabase)</span>
          )}
        </div>
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            background: '#555',
            color: '#fff',
            border: 'none',
            padding: '4px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Switch to {targetLabel}
        </button>
      </div>
      
      {showInstructions && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: '#2a2a2a',
          border: '1px solid #555',
          borderRadius: '4px',
          fontSize: '12px',
        }}>
          <p style={{ margin: '0 0 8px 0', color: '#ccc' }}>
            To switch to <strong>{targetLabel}</strong>:
          </p>
          <ol style={{ margin: '0 0 10px 0', paddingLeft: '20px', color: '#aaa' }}>
            <li>Open the <strong>Secrets</strong> tab in your Replit project (left sidebar)</li>
            <li>Find <code style={{ background: '#333', padding: '2px 6px', borderRadius: '2px' }}>VITE_USE_MOCK_AFR</code> and change it to <code style={{ background: '#333', padding: '2px 6px', borderRadius: '2px' }}>{targetValue}</code></li>
            <li>Restart the application (click Stop then Run)</li>
          </ol>
          <button
            onClick={() => setShowInstructions(false)}
            style={{
              background: '#444',
              color: '#aaa',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            Dismiss
          </button>
        </div>
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
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRuns()
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#888' }}>Loading runs...</div>;
  if (error) return <div style={{ color: '#ff4a4a' }}>Error: {error}</div>;
  if (runs.length === 0) return <div style={{ color: '#888' }}>No runs found. Create some runs to see them here.</div>;

  return (
    <div>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Runs List (newest first) - {runs.length} runs</h2>
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
              <td style={tdStyle}>{run.goal_summary?.substring(0, 50) || 'No goal'}...</td>
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
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchRunBundle(runId)
      .then(setBundle)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div style={{ color: '#888' }}>Loading run details...</div>;
  if (error) return <div style={{ color: '#ff4a4a' }}>Error: {error}</div>;
  if (!bundle) return <div>Run not found: {runId}</div>;

  const { run, decisions, expected_signals, stop_conditions, outcome, tower_verdict, related_rule_updates } = bundle;

  const handleCopyBundle = async () => {
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
        <button onClick={onBack} style={backButtonStyle}>← Back to Runs</button>
        <button 
          onClick={handleCopyBundle}
          style={{
            padding: '6px 12px',
            background: copied ? '#22c55e' : '#4a9eff',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          {copied ? '✓ Copied!' : 'Copy Run Bundle JSON'}
        </button>
      </div>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Run Detail: {runId}</h2>

      <Block title="1. Goal & Worth">
        <p><strong>Goal:</strong> {run.goal_summary}</p>
        {run.goal_worth ? (
          <p style={{ color: '#888', fontSize: '12px' }}>
            Value: ${run.goal_worth.value} | Budget: ${run.goal_worth.budget} | 
            Horizon: {run.goal_worth.time_horizon} | Risk: {run.goal_worth.risk}
          </p>
        ) : (
          <NotInstrumented label="Goal worth not captured" />
        )}
      </Block>

      <Block title="2. Decisions Timeline">
        {decisions.length === 0 ? (
          <NotInstrumented label="Decision capture not instrumented yet" />
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
        {expected_signals.length === 0 ? (
          <NotInstrumented label="Signal capture not instrumented yet" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {expected_signals.map(s => <li key={s.id}>{s.signal}</li>)}
          </ul>
        )}
      </Block>

      <Block title="4. Stop Conditions">
        {stop_conditions.length === 0 ? (
          <NotInstrumented label="Stop conditions not instrumented yet" />
        ) : (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {stop_conditions.map(s => <li key={s.id}>{s.condition}</li>)}
          </ul>
        )}
      </Block>

      <Block title="5. Outcomes + Tower Verdict">
        {outcome ? (
          <div style={{ marginBottom: '10px' }}>
            <strong>Outcome:</strong> {outcome.outcome_summary || outcome.summary || 'No summary'}
            {outcome.full_output && (
              <details style={{ marginTop: '5px' }}>
                <summary style={{ cursor: 'pointer', color: '#4a9eff' }}>View full output</summary>
                <pre style={{ background: '#222', padding: '8px', fontSize: '11px', marginTop: '5px', whiteSpace: 'pre-wrap' }}>
                  {outcome.full_output.substring(0, 2000)}
                  {outcome.full_output.length > 2000 && '...'}
                </pre>
              </details>
            )}
            {outcome.metrics_json && (
              <pre style={{ background: '#222', padding: '8px', fontSize: '11px', marginTop: '5px' }}>
                {JSON.stringify(outcome.metrics_json, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <NotInstrumented label="Outcome capture not instrumented yet" />
        )}
        {tower_verdict ? (
          <div style={{ marginTop: '10px' }}>
            <strong>Tower Verdict:</strong> <VerdictBadge verdict={tower_verdict.verdict} />
            <p style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>{tower_verdict.reason}</p>
          </div>
        ) : (
          <NotInstrumented label="Tower verdict not available (Tower integration pending)" />
        )}
      </Block>

      {related_rule_updates.length > 0 && (
        <Block title="Related Rules (from Judgment Ledger)">
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {related_rule_updates.map(r => (
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
  const [rules, setRules] = useState<RuleUpdate[]>([]);
  const [selectedRule, setSelectedRule] = useState<RuleUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRules()
      .then(setRules)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedRuleId) {
      fetchRule(selectedRuleId).then(setSelectedRule);
    } else {
      setSelectedRule(null);
    }
  }, [selectedRuleId]);

  if (loading) return <div style={{ color: '#888' }}>Loading rules...</div>;
  if (error) return <div style={{ color: '#ff4a4a' }}>Error: {error}</div>;

  if (selectedRule) {
    return (
      <div>
        <button onClick={onBackToList} style={backButtonStyle}>← Back to Ledger</button>
        <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Rule Detail: {selectedRule.id}</h2>
        
        <Block title="Rule">
          <p><strong>{selectedRule.rule_text}</strong></p>
          <p style={{ color: '#888', fontSize: '12px' }}>
            Scope: {selectedRule.scope} | Confidence: <ConfidenceBadge confidence={selectedRule.confidence} /> | 
            Status: <StatusBadge status={selectedRule.status} /> | Type: {selectedRule.update_type}
            {selectedRule.source && <> | Source: {selectedRule.source}</>}
          </p>
          <p style={{ color: '#888', fontSize: '12px' }}>Reason: {selectedRule.reason || 'No reason provided'}</p>
          <p style={{ color: '#666', fontSize: '11px' }}>Created: {new Date(selectedRule.created_at).toLocaleString()}</p>
        </Block>

        <Block title="Evidence Runs">
          {selectedRule.evidence_run_ids.length === 0 ? (
            <div style={{ background: '#ff4444', color: '#fff', padding: '10px', fontWeight: 'bold' }}>
              ⚠️ NO EVIDENCE (invalid rule)
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {selectedRule.evidence_run_ids.map(runId => (
                <li key={runId}>
                  <button
                    onClick={() => onRunClick(runId)}
                    style={{ background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {runId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div>
        <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Judgment Ledger (Rules)</h2>
        <div style={{ color: '#888' }}>No rules found. Rules will appear here as the system learns from runs.</div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ color: '#4a9eff', marginBottom: '15px' }}>Judgment Ledger (Rules) - {rules.length} rules</h2>
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
              <td style={tdStyle}><StatusBadge status={rule.status} /></td>
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

function NotInstrumented({ label }: { label: string }) {
  return (
    <div style={{ 
      background: '#3d3d00', 
      border: '1px dashed #888', 
      padding: '10px', 
      color: '#ccc',
      fontSize: '12px',
      fontStyle: 'italic',
    }}>
      ⚙️ {label}
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
    pending: '#888',
    running: '#4a9eff',
    completed: '#4aff4a',
    failed: '#ff4a4a',
    stopped: '#ff9f4a',
    active: '#4aff4a',
    disabled: '#888',
    invalid: '#ff4a4a',
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

function VerdictBadge({ verdict }: { verdict?: string | null }) {
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
