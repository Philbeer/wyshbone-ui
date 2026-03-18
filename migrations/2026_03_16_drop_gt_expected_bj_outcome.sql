-- Remove expectedBjOutcome from ground_truth_records.
-- A GT record now contains only: queryId, queryText, queryClass, trueUniverse, matchCriteria, reasoning, notes.

ALTER TABLE ground_truth_records DROP COLUMN IF EXISTS expected_bj_outcome;
