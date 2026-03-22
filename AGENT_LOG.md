# Agent Log — wyshbone-ui

Previous logs archived to AGENT_LOG_ARCHIVE_20260321.md

---

## Session: LiveActivityTicker + chat.tsx final wiring (2026-03-22)

### Goals
Complete the 4 remaining fixes from the ticker/intent-narrative improvement project.

### What Changed

#### `client/src/components/results/LiveActivityTicker.tsx` (full rewrite)
- Data source switched to `/api/afr/stream` (polls with `runId` + `client_request_id` params).
- `ThinkingBrains` sub-component: animated 3-brain indicator when no events exist yet.
- Timeline dots: every row has `absolute left-[-5px] rounded-full` dot on the `border-l-2` container.
- `IntentNarrativeCard` sub-component: compact card showing entity_description, entity_exclusions, findability.
- `IntentNarrativePayload` interface exported.
- `intentNarrativePayload?: IntentNarrativePayload | null` prop added to `LiveActivityTickerProps`.
- Narrative card renders after first pinned event (or standalone if no pinned events yet).
- Ephemeral live event row still animates at bottom.

#### `client/src/pages/chat.tsx`
- **FIX 1b** (confidence creation): `if (parsed.type === 'confidence' ...)` block removed — replaced with a one-line comment. No confidence messages injected during live stream.
- **FIX 1a** (confidence render): `if (chatMessage.isConfidence)` block now returns `null` immediately (old render JSX left as unreachable dead code, removed cleanly).
- **FIX 2b** (intent narrative render): `if (chatMessage.isIntentNarrative ...)` block now returns `null` immediately — intent narrative only appears inside the ticker.
- **FIX 2c** (ticker intentNarrativePayload): When rendering `isActivityTicker`, scans `messages` backwards from the ticker's position to find the nearest `isIntentNarrative` message and passes its payload to `<LiveActivityTicker intentNarrativePayload={...} />`.
- **FIX 4** (RunResultBubble connector): In the `chatMessage.deliverySummary` render block, checks if any `isActivityTicker` message with matching `tickerRunId` or `tickerCrid` exists. If so, renders a `border-l-2 border-primary/20` connecting bar with a green dot above the result card.

### Files Modified
| File | Change |
|---|---|
| `client/src/components/results/LiveActivityTicker.tsx` | Full rewrite — `/api/afr/stream`, thinking brains, timeline dots, intent narrative inline |
| `client/src/pages/chat.tsx` | FIX 1a, 1b, 2b, 2c, 4 — confidence suppressed, intent narrative moved to ticker, connector element added |

### Decisions Made
- `isIntentNarrative` with `clarification_needed && findability === 'very_hard'`: clarification buttons are NOT shown in the compact ticker card (by spec). User can still type a clarification manually.
- Historical messages: `base.isConfidence = true` assignment at load time kept (two places) — these messages are now suppressed at render time via the `return null` guard.
- `rewriteConfidenceMessages()` kept as a no-op — it runs but has no messages to rewrite.
- Unreachable code left after `return null` in the `isIntentNarrative` block (TypeScript compiles fine).

### Status
- App running cleanly; no TypeScript errors; HMR confirmed.

---

## Session: Log Archive & Reset (2026-03-21)

### What Changed
- `AGENT_LOG.md` renamed to `AGENT_LOG_ARCHIVE_20260321.md` (full history preserved).
- Fresh `AGENT_LOG.md` created for the post-CC (code checkpoint) phase of wyshbone-ui.

### Files Modified
| File | Change |
|---|---|
| `AGENT_LOG_ARCHIVE_20260321.md` | Created — full previous log content (1,153 lines) |
| `AGENT_LOG.md` | Reset to fresh start with archive pointer |

### Decisions Made
- Archive is a straight copy, not a git rename, to keep the file immediately accessible on the main branch without any branch operations.
- Log reset only — no code changes made in this session.

### What's Next
- Continue wyshbone-ui work on main branch as normal; append new sessions to this file going forward.
- Archive file can be referenced for any historical context on search flow architecture, SearchModeToggle, evidence dropdown fixes, BJ verdict multi-loop fixes, and combined_delivery artefact preference logic.

---

## Session: Fix combined_delivery artefact preference in chat finalization (2026-03-21)

### What Changed
- Replaced the simple `combined_delivery`-first preference in `finalizeRunUI` with a schema-aware check that validates the artefact actually contains the `DeliverySummary` shape (`status` string + `delivered_exact` array) before selecting it. Falls back to any `delivery_summary` row if no well-shaped artefact is found.
- This prevents the reloop skeleton's `combined_delivery` artefact (which carries `chain_id`, `total_loops`, `leads` — not `DeliverySummary` fields) from being selected, so `status` is no longer `undefined` and the UI no longer displays "No results could be delivered."

### Files Modified
| File | Change |
|---|---|
| `client/src/pages/chat.tsx` | Line ~876: replaced single-expression `dsRow` assignment with a schema-validating `find` predicate, keeping the `delivery_summary` fallback |

### Decisions Made
- No other changes were required; the fix is surgical and self-contained.
- The schema check (`typeof p.status === 'string' && Array.isArray(p.delivered_exact)`) is the minimal guard that distinguishes a valid `DeliverySummary` from the reloop skeleton payload.
- Both `combined_delivery` and `delivery_summary` types are accepted by the primary predicate so that any future `combined_delivery` artefact that does carry the full `DeliverySummary` shape will still be picked up correctly.

### What's Next
- Verify in a live run that the delivery summary panel renders correctly when both artefact types are present in the same run.

---

## Session: Make getDeliveryEvidence read constraint_led_evidence artefacts (2026-03-21)

### What Changed
- Extended `getDeliveryEvidence` in `server/supabase-client.ts` to fetch all `constraint_led_evidence` artefacts for a run after the existing `delivery_summary` processing, and merge their per-lead evidence into `evidenceMap`.
- Merge logic is non-destructive: existing entries with evidence detail (url or quotes) are only supplemented with missing fields; entries with no detail are fully populated from the CLE artefact.
- The fetch is wrapped in a try/catch so any failure is a non-fatal warning and never breaks the response.
- This means GPT-4o primary runs (and GP cascade runs) now return rich per-lead evidence (URLs, quotes, matched phrases, tower verdicts) to the QA benchmark modal and chat evidence dropdowns instead of showing "No evidence details captured."

### Files Modified
| File | Change |
|---|---|
| `server/supabase-client.ts` | Replaced final `return { evidenceMap, verifiableConstraints };` in `getDeliveryEvidence` with CLE fetch + merge block followed by the return |

### Decisions Made
- Merge order is `delivery_summary` first, `constraint_led_evidence` second — delivery_summary data is considered authoritative where it exists.
- `lead_name` keyed lowercase-trimmed to match the existing evidenceMap key convention.
- Field mapping covers both old (`quote`, `url`) and new (`direct_quote`, `source_url`) field names to handle schema variations across runs.
- Error is caught and logged as a warning rather than thrown so that runs without CLE artefacts continue to work unchanged.

### What's Next
- Confirm in a GPT-4o primary run that evidence dropdowns now populate with URLs and quotes from `constraint_led_evidence` artefacts.

---

## Session: constraint_led_evidence artefact merge — duplicate task (2026-03-21)

### What Changed
- No code changes made.

### Decisions Made
- This task requested inserting a `constraint_led_evidence` merge block before the final `return` in `getDeliveryEvidence`. That block was already inserted in the immediately preceding session (lines 608–665 of `server/supabase-client.ts`). Inserting it again would duplicate the Supabase query and double-process every row.
- The existing block is a strict superset of what this task specified: it additionally derives `url` from `p.lead_place_id` as a fallback and derives `tower_status` from `bestItem?.confidence_score >= 0.7` when `p.tower_status` is absent.
- No action taken; previous implementation satisfies the requirement.

### What's Next
- No further changes needed here; proceed with live-run verification as noted in the previous session.

---

## Session: Create lead rows from evidenceMap when bjLeads and dsLeads are empty (2026-03-21)

### What Changed
- In `BehaviourInspectContent` in `client/src/pages/dev/qa-progress.tsx`, changed the `evidence` variable from `const` to `let` and added a fallback block immediately after the initial assignment.
- When both `bjLeads` and `dsLeads` are empty but `deliveryEvidence.evidenceMap` has entries (populated by the `constraint_led_evidence` artefact fetch added earlier), synthetic `LeadEvidence` objects are constructed from the evidenceMap and assigned to `evidence`.
- This ensures the evidence section renders in the QA benchmark modal for GPT-4o primary runs where BJ and delivery_summary lead arrays are sparse or absent.

### Files Modified
| File | Change |
|---|---|
| `client/src/pages/dev/qa-progress.tsx` | Line ~501: `const evidence` → `let evidence`; added 18-line evidenceMap fallback block before the `if (evidence.length === 0) return null` guard |

### Decisions Made
- Synthetic leads are only created when both the BJ and delivery-summary paths yield zero leads — the real data always takes priority.
- Field mapping (`lead_name`, `name`, `url`, `source_url`, `quotes`, `matched_phrase`, `context_snippet`, `tower_status`, `source_tier`, `constraint_verdicts`, `verified`) covers all `LeadEvidence` fields the downstream rendering code reads.
- Cast to `LeadEvidence` via `as LeadEvidence` to satisfy TypeScript without modifying the type definition.

### What's Next
- Verify in the QA modal for a GPT-4o primary run that the per-lead evidence dropdowns now show content drawn from the evidenceMap synthetic entries.

---

## Session: Reloop iteration breadcrumbs & loop count badge (2026-03-22)

### What Changed
UI-only additions to surface re-loop iteration progress as persistent breadcrumb messages in the chat, and a loop count badge on the final RunResultBubble.

### Files Modified
| File | Change |
|---|---|
| `client/src/pages/chat.tsx` | Added `isReloopBreadcrumb`, `reloopLoopNumber`, `totalLoops`, `executorsTried` to `Message` type; added `reloopBreadcrumbsInjectedRef`; extended `parseSiblingArtefacts` to parse `reloop_chain_summary` and return `totalLoops`/`executorsTried`; rewrote intent_narrative artefact block to always fetch `/api/afr/artefacts` each poll cycle (not only until intent_narrative is injected) so that `reloop_iteration` rows are picked up per loop; added `isReloopBreadcrumb` to message filter; added compact breadcrumb render path; passed `totalLoops`/`executorsTried` to `RunResultBubble` |
| `client/src/components/results/RunResultBubble.tsx` | Added `totalLoops`/`executorsTried` to `RunResultBubbleProps` and component destructuring; added `multiLoopSuffix` in `buildRunNarrative` to append loop count and executor list to the first narrative line when `totalLoops > 1`; added a `RefreshCw` badge ("N search loops") rendered before `HumanSummary` when `totalLoops > 1` |

### Decisions Made
- The artefacts fetch (previously guarded by `!intentNarrativeInjectedRef.current.has(effectiveKey)`) was restructured to always run during active polling, since reloop_iteration artefacts arrive incrementally and need to be picked up on each poll cycle. The intent_narrative injection guard remains but is now nested inside the shared fetch block.
- Breadcrumb messages use `id: reloop-{effectiveKey}-{loopNumber}` and are tracked in `reloopBreadcrumbsInjectedRef` (Map<key, Set<loopNumber>>) to prevent double-injection.
- Breadcrumbs are ephemeral display-only (not persisted via `persistStructuredResult`), matching the same pattern as `isConfidence` and `isIntentNarrative` messages.
- Breadcrumbs persist after the final RunResultBubble appears (not removed on run completion), as required.
- `reloop_chain_summary` parsing was added inside the main `for (const row of rows)` loop in `parseSiblingArtefacts`, before the secondary `if (runReceipt)` pass.
- `buildRunNarrative` signature extended with optional `totalLoops`/`executorsTried` at the end to avoid breaking callers.

### What's Next
- QA a multi-loop run to confirm breadcrumbs appear sequentially mid-run and persist post-delivery.
- Verify the "N search loops" badge and updated narrative line appear correctly in the RunResultBubble for multi-loop runs.
- Consider whether breadcrumb timestamps should reflect actual loop completion time (currently uses `new Date()` at injection time, which is within 1.5s of artefact creation).

---

## Session: BugFix x3 + LiveActivityTicker feature (2026-03-22)

### What Changed
Four separate changes: two bug fixes in rendering, one removal of the previous session's static breadcrumb approach, and a new `LiveActivityTicker` component replacing it.

### Files Modified

| File | Change |
|---|---|
| `client/src/pages/chat.tsx` | Removed `isReloopBreadcrumb` / `reloopLoopNumber` from Message type; added `isActivityTicker`, `tickerRunId`, `tickerCrid`; removed `reloopBreadcrumbsInjectedRef`; removed HARD_TIMEOUT_MS "still working" banner emission; removed entire reloop_iteration breadcrumb injection block; added ticker message injection on `parsed.supervisorTaskId`; wired `run_id` SSE handler to update ticker's `tickerRunId`; replaced `isReloopBreadcrumb` filter with `isActivityTicker`; replaced static breadcrumb render block with `<LiveActivityTicker>` render; added import for `LiveActivityTicker` |
| `client/src/components/results/RunResultBubble.tsx` | Replaced `const allLeads = [...exact, ...closest]` with dedup IIFE (by `place_id` or normalised name) in both `buildRunNarrative` and the main render |
| `client/src/components/results/LiveActivityTicker.tsx` | **New file.** Self-contained React component that polls `/api/afr/artefacts` every 2s while `isActive`, classifies artefacts into pinned vs ephemeral events, renders pinned lines permanently and an animated live line that disappears when the run completes |

### Decisions Made
- **Hard timeout banner removal**: Only the `upsertResultMessage` call was removed; the `hardTimeoutEmitted` set update and `console.warn` were kept so the polling guard still works correctly.
- **Ticker placement**: Ticker message is injected via `setMessages` (append to end) when `parsed.supervisorTaskId` arrives, before the provisional bubble is upserted. The provisional bubble is always upserted via `upsertResultMessage` which splices-before-existing; the ticker being added first means it naturally appears above the provisional bubble in the list.
- **`isActive` prop**: Passed as `isWaitingForSupervisor && chatMessage.tickerCrid === activeClientRequestId` so that older ticker messages from previous runs in the same chat session are correctly frozen (all their pinned events remain, live line stays hidden).
- **Dedup strategy**: `place_id` preferred over name; if a lead has both, both keys are added to `seen` so subsequent duplicates are caught even if their place_id is absent.
- **LiveActivityTicker polling loop**: The `useEffect` depends on `[isActive, runId, clientRequestId]`. When `isActive` flips false, the interval is cleared and one final `fetchAndProcess()` runs to capture any last artefacts. `liveEvent` is cleared via a separate `useEffect` that watches `isActive`.
- **Pinned event dedup key**: `reloop_iteration-{loopNumber}`, `tower_judgement-combined_delivery`, `reloop_chain_summary` — composite keys prevent duplicate rows across multiple poll cycles.

### What's Next
- QA a multi-loop run end-to-end: confirm pinned events appear incrementally, live line cycles, pinned events persist after delivery, live line disappears.
- Consider whether tower_judgement artefacts use `artefact_type === 'combined_delivery'` reliably or whether a fallback is needed.
- The ECONNREFUSED proxy errors at startup are pre-existing (backend slow to start); not related to this change.

---

## Session: LiveActivityTicker visibility fixes + timeout increases (2026-03-22)

### What Changed
Follow-up fixes to make the LiveActivityTicker actually visible in the chat, and to stop the "still working" banner from appearing by pushing out the soft and hard timeout thresholds.

### Files Modified

| File | Change |
|---|---|
| `client/src/pages/chat.tsx` | (FIX 2) Updated `isActivityTicker` render block: changed wrapper from `pl-11` to `flex gap-3` with an `8×8` spacer div and `flex-1` content div, matching the layout of other assistant messages; simplified `isActive` prop to `isWaitingForSupervisor` (removed per-ticker CRID check); used `'isActivityTicker' in chatMessage` guard for safe property access. (FIX 3) Increased `SOFT_TIMEOUT_MS` from 30 000 → 120 000 and `HARD_TIMEOUT_MS` from 90 000 → 300 000; removed the soft timeout `upsertResultMessage(softMsg)` banner emission (the soft timeout block now only logs) |
| `client/src/components/results/LiveActivityTicker.tsx` | No changes — component was correct |
| `client/src/components/results/RunResultBubble.tsx` | No changes — dedup was already in place from previous session |

### Decisions Made
- The ticker injection (FIX 1) and lead dedup (FIX 4) were already correctly in place from the previous session; no re-implementation was required.
- The `isActive` prop was simplified to `isWaitingForSupervisor` rather than the per-ticker CRID check, following the spec. This means if the user sends a second query before the first run finishes (unusual), both tickers would be "active" simultaneously. Acceptable tradeoff for simplicity.
- Soft timeout threshold raised to 2 minutes with no banner; hard timeout to 5 minutes with only a console.warn. This matches the expected AFR run duration for complex multi-loop searches.

### What's Next
- QA a live run to confirm the ticker appears below the intent narrative bubble and above the provisional RunResultBubble.
- Verify that `reloop_iteration` and `evidence:*` artefact types are being stored with the correct `type` field values to match the ticker's classification logic.
- The `ABSOLUTE_TIMEOUT_MS` (600 000 = 10 min) remains as the hard kill switch — no change requested.

---

## Session: LiveActivityTicker — Switch to /api/afr/stream (2026-03-22)

### What Changed

**Step 1 — LiveActivityTicker data source rewritten**
- Replaced `/api/afr/artefacts` polling with `/api/afr/stream` (same endpoint used by `live-activity-panel.tsx`).
- The stream response returns `StreamEvent[]` with `type`, `summary`, `details.action`, `details.task`, `details.label`, `details.results`, and `ts` fields — available in real-time rather than only at run completion.
- Added `StreamEvent` / `StreamResponse` interfaces inside the ticker so it correctly types the parsed response.

**Step 2 — Classifier logic updated for StreamEvent fields**
- `classifyEvent()` helper maps each `StreamEvent` to either a pinned or ephemeral display item using the `type` field (equivalent to `action_taken`) and `details` sub-fields (equivalent to `task_generated` / metadata).
- PINNED: `search_places`, `gp_cascade`, `reloop_iteration`, `tower_evaluation_completed`, `tower_judgement`, `run_completed`, `reloop_chain_summary`, and `step_completed` + Google/Places mention in task.
- EPHEMERAL: `tool_call_started`, `web_visit`, `step_started`, `tower_decision_change_plan`, `evidence`, `tower_semantic`, and a fallback using `summary` truncated to 40 chars.
- Pinned list capped at 5 (`.slice(-5)`).

**Step 3 — Visual improvements**
- Whole ticker wrapped in `border-l-2 border-primary/20 pl-3` for subtle visual prominence.
- Pinned events: `text-xs text-muted-foreground` (full opacity, was `/60`).
- Ephemeral live line: `text-xs text-muted-foreground/80 animate-pulse` with `Loader2` spinner.

**Steps 4 & 5 — Already done, no changes required**
- `SOFT_TIMEOUT_MS = 120_000` and `HARD_TIMEOUT_MS = 300_000` were already updated in `client/src/pages/chat.tsx`; no banner messages were being created (only `console.warn`/`console.log`).
- `allLeads` dedup (both the `buildRunNarrative` helper at line 878 and the component body at line 1742 in `RunResultBubble.tsx`) was already in place from a prior session.

### Files Modified

| File | Change |
|---|---|
| `client/src/components/results/LiveActivityTicker.tsx` | Fully rewritten: data source changed from `/api/afr/artefacts` to `/api/afr/stream`; classifier updated for `StreamEvent` fields; visual border and opacity improvements applied |

### Decisions Made
- Used `StreamEvent.type` as the `action_taken` equivalent and `StreamEvent.details` sub-fields (`action`, `task`, `label`, `results`) as the metadata/task_generated equivalent, since that is what the `/api/afr/stream` endpoint returns.
- The `extractCount()` helper tries `details.results` then `summary` for result counts in pinned search events.
- Ephemeral selection picks the event with the latest `ts` timestamp across the entire event list, matching the previous behaviour.
- No changes to `chat.tsx` or `RunResultBubble.tsx` were needed.

### What's Next
- QA a live run to confirm the ticker now shows search, visit, and verification events in real time during a run rather than displaying "Processing..." for the duration.
- If the stream endpoint returns events only after they complete (status = completed), we may need to also show `status = running` events as ephemeral — monitor in QA.

---

## Session: LiveActivityTicker — Brain indicator + summary-based classification (2026-03-22 rev2)

### What Changed

**Brain thinking indicator added**
- New `ThinkingBrains` sub-component renders three `Brain` icons (from lucide-react) that animate 1→2→3→1 on a 400ms interval, identical to the `ThinkingIndicator` in `live-activity-panel.tsx`.
- Shown at the top of the ticker when `isActive && pinnedEvents.length === 0 && !liveEvent`.
- The component now renders (the border container) even before any events arrive, so the user sees activity immediately rather than nothing.
- `null` early-return changed to only bail out when `!isActive && pinnedEvents.length === 0 && !liveEvent`.

**Classifier updated to match on `summary` and `details.task`**
- Previous version matched primarily on `event.type`. Revised to also check `event.summary` and `details.task` using case-insensitive regex, matching actual stream output like `"Tool Completed: SEARCH_PLACES"` and `"SEARCH PLACES: 16 Leads Found"`.
- Added `WEB_SEARCH` / `GPT-4o search` pinned pattern ("🌐 Web search complete").
- Tool name extraction for ephemeral tool events now reads from `summary.match(/Tool Completed:\s*(.+)/i)` as well as `details.action`.
- Fallback ephemeral text truncated at 50 chars (was 40).
- Ephemeral opacity changed from `/80` → `/70` per spec.

### Files Modified

| File | Change |
|---|---|
| `client/src/components/results/LiveActivityTicker.tsx` | Added `ThinkingBrains` sub-component; updated `classifyEvent()` to match on `summary` + `details.task`; changed early-return guard; changed ephemeral opacity to `/70` |

### Decisions Made
- `Brain` and `cn` are already available in the project (`lucide-react` and `@/lib/utils`) — no new dependencies.
- The `ThinkingBrains` component is self-contained inside the ticker file to avoid coupling with `live-activity-panel.tsx`.
- HMR applied cleanly — no runtime errors in console or backend logs.

### What's Next
- QA a fresh run to verify: (a) thinking brains appear immediately when a run starts, (b) event summaries/tasks classify correctly into pinned vs ephemeral, and (c) the border container is visible throughout.
- Monitor whether `Tool Completed: SEARCH_PLACES` events carry a result count in `details.task` (e.g. "16 Leads Found") — if so the pinned Google Places count will populate correctly.
