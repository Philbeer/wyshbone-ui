# Agent Log — wyshbone-ui

Previous logs archived to AGENT_LOG_ARCHIVE_20260321.md

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
