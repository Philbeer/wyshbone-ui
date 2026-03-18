-- QA Run Metrics: derived/cache table for charting QA benchmark AFR run progress over time.
-- One row per individual benchmark test query run. AFR remains source of truth; this is a derived layer.
-- Scores use NUMERIC(2,1) to support 0, 0.5, and 1.
-- source='benchmark' = deterministic forward path from QA runner.
-- source='heuristic' = approximate AFR backfill (legacy, clearly separated).

CREATE TABLE IF NOT EXISTS qa_run_metrics (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  timestamp BIGINT NOT NULL,
  query TEXT NOT NULL,
  query_class TEXT,
  expected_mode TEXT,
  suite_id TEXT,
  pack_timestamp BIGINT,
  benchmark_test_id TEXT,
  source TEXT NOT NULL DEFAULT 'heuristic',
  system_status TEXT NOT NULL,
  agent_status TEXT NOT NULL,
  tower_result TEXT NOT NULL,
  behaviour_result TEXT NOT NULL,
  system_score NUMERIC(2,1) NOT NULL,
  agent_score NUMERIC(2,1) NOT NULL,
  tower_score NUMERIC(2,1) NOT NULL,
  behaviour_score NUMERIC(2,1) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS qa_run_metrics_run_id_idx ON qa_run_metrics (run_id);
CREATE INDEX IF NOT EXISTS qa_run_metrics_timestamp_idx ON qa_run_metrics (timestamp);
CREATE INDEX IF NOT EXISTS qa_run_metrics_pack_timestamp_idx ON qa_run_metrics (pack_timestamp);
CREATE INDEX IF NOT EXISTS qa_run_metrics_source_idx ON qa_run_metrics (source);
