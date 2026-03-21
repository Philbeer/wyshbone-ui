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
