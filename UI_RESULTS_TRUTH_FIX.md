# UI Results Truth Fix

## Previous Misleading Behaviour

1. **Fallback synthesis showed all candidates as delivered:** When the backend `delivery_summary` artefact was missing or delayed, `chat.tsx` synthesised a summary by dumping all `leads_list` candidates into `delivered_exact` or `delivered_closest` without filtering by verification status. This meant 5 discovery candidates could appear as "5 results" when only 3 were actually verified.

2. **Headline count used total leads, not verified count:** `buildRunNarrative` counted `[...exact, ...closest].length` for the "I found N" line, treating unverified candidates the same as verified matches.

3. **Unverified candidates mixed into the main list:** Both the receipt-attributes rendering branch and the default rendering branch showed all leads (matches + candidates) in the same flat list, differentiated only by small badges. Users had no way to know the backend intended to deliver only 3.

## Exact Branches Changed

### 1. `client/src/pages/chat.tsx` — Fallback synthesis path (~lines 925-1000)

**Before:** All `provisionalLeads` dumped into `delivered_exact` if any verification summary existed, or into `delivered_closest` otherwise.

**After:** When verification data exists (`leadVerifications`, `semanticJudgements`, or `runReceipt.outcomes.attributes`):
- Builds a `verifiedIds` set from all three verification sources
- Splits provisional leads into `verifiedLeads` and `unverifiedLeads`
- Verified leads go into `delivered_exact`
- Unverified leads go into `delivered_closest`
- `verified_exact_count` is set to `verifiedLeads.length`
- Status is `PARTIAL` (not `PASS`) when unverified leads exist alongside verified ones

When no verification data exists, all leads remain conservative (placed in `delivered_closest` with `STOP` status).

### 2. `client/src/components/results/RunResultBubble.tsx` — Narrative counts (~line 691)

**Before:** `buildRunNarrative` always used `allLeads.length` for the primary count.

**After:** Accepts a new `verifiedMatchCount` parameter. When verification data exists, the primary "I found N" line uses the verified count:
- "I found 3 verified matches in Arundel."
- "2 other candidates were found but could not be verified."

### 3. `client/src/components/results/RunResultBubble.tsx` — `buildSummaryText` (~lines 326-380)

**Before:** `PARTIAL` and `ACCEPT_WITH_UNVERIFIED` cases used `totalDelivered` (all leads) in user-facing language.

**After:** When `verifiedExact > 0`, language distinguishes verified from unverified:
- PARTIAL: "Found 3 verified matches of 5 requested (2 other candidates were found but not verified)."
- ACCEPT_WITH_UNVERIFIED: "I found 3 verified matches. 2 other candidates could not be verified."

### 4. `client/src/components/results/RunResultBubble.tsx` — Receipt-attributes branch (~lines 1721-1766)

**Before:** Verified leads shown under "Mentions '{attr}'" header, remaining leads shown under "Other results" in an open list.

**After:** Verified leads shown under "Verified — mentions '{attr}'" header. Remaining unverified leads moved into a `CollapsedCandidates` component (collapsed by default) with explanatory text.

### 5. `client/src/components/results/RunResultBubble.tsx` — Default rendering branch (~lines 1768-1799)

**Before:** Matches shown under "Results (N)", candidates shown under "Other results (N)" — both always visible.

**After:**
- Matches shown under "Verified matches (N)" when verification data exists
- When verification data exists and matches exist, candidates are rendered via `CollapsedCandidates` (collapsed by default)
- When no verification data exists, falls back to flat "Results (N)" list (unchanged behaviour)

### 6. `client/src/components/results/UserResultsView.tsx` — Full panel view (~lines 302-349)

**Before:** Exact and closest results both shown as open sections. "Closest results" always visible.

**After:**
- Verified exact section header now says "Verified matches (N)"
- When verified matches exist, the closest results section is collapsed behind a `ClosestResultsCollapsed` component with explanatory text
- When no verified matches exist, closest results remain visible as before

## How Counts Now Work

| Context | Count source | Example |
|---------|-------------|---------|
| Narrative headline ("I found N") | `verifiedMatchCount` when verification data exists, otherwise `allLeads.length` | "I found 3 verified matches" |
| Section headers | `matches.length` or `candidates.length` | "Verified matches (3)" / "Other candidates — not verified (2)" |
| `buildSummaryText` PASS case | `verifiedExact` (unchanged) | "I found 3 results that match" |
| `buildSummaryText` PARTIAL case | `verifiedExact` for primary count, with candidate count noted separately | "Found 3 verified matches (2 other candidates found but not verified)" |
| Diagnostic footer | Raw `deliveredCount` (unchanged for debugging) | "delivered=5" |

## How Verified vs Candidate Separation Now Works

```
┌─────────────────────────────────────────────┐
│ "I found 3 verified matches in Arundel."    │
│ "2 other candidates were found but could    │
│  not be verified."                          │
│                                             │
│ VERIFIED MATCHES (3)                        │
│ ✅ The Crown Inn                             │
│    📍 Arundel · 🌐 thecrowninn.co.uk        │
│    "Live music every Friday"                │
│ ✅ The Swan Hotel                             │
│    ...                                      │
│ ✅ The Eagle                                  │
│    ...                                      │
│                                             │
│ ▶ Other candidates — not verified (2)       │
│   [collapsed - click to expand]             │
│   These were found in discovery but could   │
│   not be verified against your requirements │
│   ⚪ The Red Lion                             │
│   ⚪ The Norfolk Arms                         │
└─────────────────────────────────────────────┘
```

## Remaining Known Limitations

1. **Evidence availability depends on backend:** If the backend doesn't attach `evidence`, `match_reason`, or `evidence_source_url` to the lead objects, the UI can't show them. This fix doesn't change that — it only ensures evidence is displayed for leads that have it.

2. **Path A still trusts `delivery_summary` contents:** When the `delivery_summary` artefact exists, its `delivered_exact` and `delivered_closest` arrays are used as-is. If the Supervisor puts unverified leads into `delivered_exact`, the UI will trust that. This fix only hardens the fallback synthesis path (Path B).

3. **`buildSummaryText` is only used in older/alternate rendering paths:** The primary narrative is now `buildRunNarrative` with the new `verifiedMatchCount` parameter. `buildSummaryText` still exists for completeness but has been updated to use truthful language.

4. **No backend contract changes:** This fix is entirely client-side. If the backend starts populating `delivery_summary` correctly for all runs, the fallback path won't be hit, and the fix has no effect. Both paths are now truthful.
