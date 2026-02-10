# UI Artefacts Debug Report

## 1) What ID does the UI use to fetch artefacts?

The `ResultsModal` component accepts **two** optional identifiers: `runId` and `clientRequestId`.

- **`runId`** is preferred — if present, the fetch uses `?runId=<value>`.
- **`clientRequestId`** is the fallback — if `runId` is null/undefined, the fetch uses `?client_request_id=<value>`.

**Where they are sourced from:**

| Prop | Source | File & Line |
|------|--------|-------------|
| `runId` | `stream?.run_id` — comes from the `/api/afr/stream` response, which reads `agentRun?.id` from the `agent_runs` table | `live-activity-panel.tsx:2277` → `afr.ts:854` |
| `clientRequestId` | `activeClientRequestId` — prop passed into `LiveActivityPanel` from the parent, set when the user sends a chat message | `live-activity-panel.tsx:2277` → `live-activity-panel.tsx:1703` |

**Key finding:** If no `agent_runs` row exists for a given `client_request_id`, then `stream.run_id` is **null**. In that case the modal falls back to `client_request_id` for lookup, which on the server side calls `storage.getAgentRunByClientRequestId()` — if that also returns null, the server returns an **empty array `[]`**.

## 2) What endpoint does the UI call? What base URL?

**Endpoint:** `GET /api/afr/artefacts`

**Base URL:** The UI's own server (relative fetch — no absolute URL). The `fetch(url)` call at `live-activity-panel.tsx:691` uses a relative path like:
```
/api/afr/artefacts?runId=<run_id>
```
or
```
/api/afr/artefacts?client_request_id=<crid>
```

This hits the **UI backend** (Express on port 5001), **not** the Supervisor. The Supervisor is only involved for job delegation and run-bridging — artefact retrieval is always local.

**Server handler:** `server/routes/afr.ts:337-376`

**Note:** There is also `GET /api/afr/runs/:id/artefacts` at `afr.ts:316` but the UI never calls this endpoint — it only uses the query-parameter variant.

## 3) What filters hide artefacts?

### UI-side filters (ResultsModal)

1. **Guard clause** (`live-activity-panel.tsx:675`): Modal fetch is skipped entirely if `!open || (!runId && !clientRequestId)`. If both IDs are null, nothing is fetched.

2. **SequenceStatusRow visibility** (`live-activity-panel.tsx:2276`): The "View results" button (and thus the modal) only renders when:
   - `effectiveTerminal === true` AND `allRevealed === true` (all playback events shown)
   - AND `mappedStatus` is one of: `completed`, `failed`, `stopped`, `awaiting_judgement`
   - If `mappedStatus` is `executing`, `routing`, `planning`, or `finalizing`, the button never appears.

3. **De-duplication** (`live-activity-panel.tsx:699-709`): Within the modal, artefacts are de-duplicated by `type` — only the latest `created_at` per type is kept. This is intentional but means multiple artefacts of the same type collapse to one.

### Server-side filters

4. **No artefacts table** (`afr.ts:371`): If the `artefacts` table doesn't exist, server returns `[]` silently (catches "does not exist" error).

5. **crid → runId resolution failure** (`afr.ts:348-351`): If `client_request_id` lookup finds no `agent_runs` row, server returns `[]` with a console log — **this is a likely root cause** for Supervisor-originated runs that never created an `agent_runs` row locally.

6. **runId mismatch**: Artefacts are stored with the `runId` used at POST time (could be a Supervisor-generated ID). If the UI queries with a different `runId` (the local `agent_runs.id`), the WHERE clause `run_id = ${resolvedRunId}` returns zero rows.

## 4) Are the Runs list and Artefacts panel using the same run identifier?

**Potentially NO — this is the likely bug.**

| Context | Identifier Used | Source |
|---------|----------------|--------|
| Live Activity Panel (stream polling) | `client_request_id` → resolves to `agent_runs.id` | `afr.ts:691-694` |
| SequenceStatusRow → ResultsModal | `stream.run_id` = `agentRun?.id` from `agent_runs` table | `afr.ts:854` |
| POST /api/afr/artefacts (ingestion) | `body.runId` — could be Supervisor's run ID, not the local `agent_runs.id` | `afr.ts:430` |

**The mismatch:** When the Supervisor persists artefacts via `POST /api/afr/artefacts`, it uses its own `runId` (e.g., a Supervisor-generated UUID). But when the UI fetches artefacts, it queries with the local `agent_runs.id`. Unless `run-bridge` was called to link them, the artefact `run_id` column won't match the `agent_runs.id`, producing zero results.

**Run-bridge** (`POST /api/afr/run-bridge` at `afr.ts:379-411`) sets `agent_runs.supervisor_run_id` but does NOT update the `artefacts.run_id` column, nor does the GET endpoint check `supervisor_run_id` as a fallback.

## 5) Debug console.log (already added)

The following logs are now in `ResultsModal` at `live-activity-panel.tsx:688-698`:

```
[ResultsModal] Fetching artefacts — runId=<run_id> crid=<first 12 chars> url=<full URL with origin>
[ResultsModal] Response status=<status> contentLength=<content-length header>
[ResultsModal] Got <N> artefact(s) — types: [<list>] runIds: [<unique run_ids from results>]
```

Plus on button click at line 931:
```
[ViewResults] Button clicked — runId=<run_id> crid=<first 12 chars>
```

---

## Summary of Probable Root Causes

1. **ID mismatch**: Artefacts stored with Supervisor's `runId` but queried with local `agent_runs.id`.
2. **No agent_runs row**: Supervisor-originated runs may never create a local `agent_runs` record, so `crid` lookup returns null → empty results.
3. **run-bridge gap**: Even when run-bridge links supervisor_run_id, the artefact GET endpoint doesn't fall back to `supervisor_run_id` for lookup.
