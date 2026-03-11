# UI Results Surfacing Audit

**Date:** 2026-03-11  
**Scope:** How the chat UI currently decides what results to render, and why it can show a different count/verification state than the backend truth.

---

## 1. Plain-English Summary of Current UI Behaviour

When a run completes, the chat UI fetches **all artefacts** for that run from `/api/afr/artefacts`. It then follows one of two paths:

1. **Path A (Happy path):** If a `delivery_summary` artefact exists, the UI reads its `delivered_exact` and `delivered_closest` arrays directly and renders them.
2. **Path B (Fallback / Synthesis):** If no `delivery_summary` artefact exists but other terminal artefacts do (e.g. `verification_summary`, `run_halted`, `tower_judgement`), the UI **synthesises a delivery summary** by scooping up every lead from all `leads_list` artefacts. This synthesised summary dumps all discovered leads into either `delivered_exact` or `delivered_closest` — it does **not** filter by verification status.

The verification badges ("Verified" / "Unverified") are then computed **client-side** by cross-referencing the displayed leads against `leadVerifications` and `semanticJudgements` artefacts. The lead list itself is **not filtered** — all leads are shown, just with different badges.

This means the UI can show 5 results (all from discovery) marked "Unverified" when the backend truth (Tower/delivery) only considers 3 to be real delivered results.

---

## 2. Files / Components / Hooks Involved

### Core rendering chain

| File | Role |
|------|------|
| `client/src/pages/chat.tsx` | Orchestrator. Calls `finalizeRunUI` which fetches artefacts and assembles the `deliverySummary` prop. |
| `client/src/components/results/RunResultBubble.tsx` | Primary chat-bubble renderer. Receives `deliverySummary`, splits leads into matches/candidates, renders `LeadRow` for each. |
| `client/src/components/results/UserResultsView.tsx` | Full-panel results view. Reads the same `DeliverySummary` type. Renders `LeadCard` components. |
| `client/src/utils/deliveryStatus.ts` | Utility: `resolveCanonicalStatus()` maps raw status strings to `PASS | PARTIAL | STOP | FAIL | ACCEPT_WITH_UNVERIFIED | UNAVAILABLE`. |
| `client/src/components/results/CvlArtefactViews.tsx` | Constraint-level verification badges and evidence sections. |

### Data flow chain

| File | Role |
|------|------|
| `client/src/pages/chat.tsx` → `finalizeRunUI` (line ~858) | Fetches `/api/afr/artefacts`, finds `delivery_summary` row or synthesises one from `leads_list` rows. |
| `client/src/pages/chat.tsx` → `parseSiblingArtefacts` | Extracts `verification_summary`, `constraints_extracted`, `lead_verifications`, `semantic_judgements`, `run_receipt`, etc. from the same artefact batch. |
| `client/src/pages/chat.tsx` → `resolveAuthoritativeTower` | Extracts the Tower verdict/label from `tower_judgement` artefacts. |
| `client/src/pages/chat.tsx` → `extractContactCounts` | Extracts contact info from `lead_pack` / `contact_extract` artefacts. |

---

## 3. Exact Current Data Source for Displayed Results

### When `delivery_summary` artefact exists (Path A)

- `delivered_exact` → taken directly from `dsRow.payload_json.delivered_exact`
- `delivered_closest` → taken directly from `dsRow.payload_json.delivered_closest`
- `verified_exact_count` → from the same payload
- These are the **backend's final word** on what to deliver.

### When `delivery_summary` artefact is missing (Path B — the problem path)

- All `leads_list` artefacts are collected.
- Every lead object from every `leads_list` is pushed into a flat `provisionalLeads` array.
- If a `verification_summary` exists with `verified_exact_count > 0`:
  - All `provisionalLeads` go into `delivered_exact` (status = `PASS`)
- Otherwise:
  - All `provisionalLeads` go into `delivered_closest` (status = `STOP`)
- **No filtering occurs.** Discovery candidates and verified leads are mixed.

**This is the root cause of the "5 shown, 3 verified" problem.**

`leads_list` artefacts are written during discovery/candidate generation — they represent the **raw candidate pool**, not the final delivered set. When the Supervisor fails to persist a `delivery_summary` artefact (or when the UI polls before it's written), the fallback path treats **all candidates as delivered results**.

---

## 4. Diagnosis: Why the UI Can Show 5 When Backend Truth Is 3

The sequence of events:

1. Supervisor discovers 5 candidates and writes them as `leads_list` artefacts.
2. Supervisor runs verification. 3 of 5 pass hard constraints (e.g. website mentions live music). 2 fail.
3. Supervisor **should** write a `delivery_summary` with `delivered_exact: [3 leads]` and either omit or put the other 2 in `delivered_closest`.
4. **However**, if:
   - (a) The `delivery_summary` artefact is not persisted (bug, timeout, race condition), **OR**
   - (b) The UI polls before `delivery_summary` is written but after terminal artefacts like `verification_summary` or `tower_judgement` exist
5. The UI hits Path B (synthesis fallback) and dumps all 5 `leads_list` candidates into the display.
6. It then cross-references `leadVerifications` / `semanticJudgements` to assign badges, so the 2 failures show as "Unverified" — but they **are still shown**.

Additionally, even on Path A, the `RunResultBubble` component **never filters leads out**. It splits them into "matches" and "candidates" buckets and renders **both**:
- Lines 1767-1789: Matches section renders leads matched by verification IDs.
- Lines 1780-1789: "Other results" section renders all remaining candidates.

The UI philosophy is "show everything, badge differently" rather than "show only delivered truth."

---

## 5. Where the UI Determines Each Display Element

### Result count shown to the user

- **`buildRunNarrative`** (RunResultBubble.tsx, line 700): `deliveredCount = [...exact, ...closest].length` — counts **all** leads in both arrays, not just verified ones. This drives the "I found N" line in the human summary.
- **`buildSummaryText`** (line 311): Uses `verifiedExact` for the PASS case (correct), but for PARTIAL/STOP cases it uses `totalDelivered` (= `exactLeads + closestLeads`) or `totalCandidates`, which can include unverified discovery candidates.
- **Section headers** (lines 1770, 1782): Show `matches.length` and `candidates.length`.

### Verified / Unverified badge

- **`isLeadVerified`** (line 160): Checks `verified_exact`, `all_hard_satisfied`, or all hard `constraint_checks` status = `yes`.
- **`buildVerifiedLeadIds`** (line 176): Builds a set of verified lead IDs from `leadVerifications`.
- **`semanticJudgements` enrichment** (lines 1474-1486): Adds `strong_match`/`match` leads to `verifiedIds`, `weak_match` leads to `weakMatchIds`.
- **`runReceipt.outcomes.attributes` enrichment** (lines 1488-1494): Adds `matched_place_ids` from receipt attribute outcomes to `verifiedIds`. This is a third verification source beyond `leadVerifications` and `semanticJudgements`.
- **`getLeadBadgeStatus`** (line 1505): Cross-references lead IDs against `verifiedIds` set and `weakMatchIds` set. Falls back to `defaultBadgeStatus` which is `'unverified'` if no verification data exists or if there's a trust failure.
- **`LeadBadge`** (line 378): Renders the badge text: "Verified", "Weak match", "{attr} not checked", "Unverified", or "Candidate".

### Evidence snippet text

- **`LeadRow`** (lines 504-537): Reads `lead.evidence` array. Extracts `snippet`, `quote`, or `summary` from the first evidence entry. Truncates to 120 chars.
- **`lead.match_reason` / `lead.match_summary`**: Shown in emerald-green text above the snippet.
- **`lead.evidence_source_url`**: Shown as a clickable "Source:" link.

### "Included because…" reason text

- **`lead.match_reason`** or **`lead.match_summary`** (line 506): Rendered in emerald text if present.
- **`extractUnverifiableAttribute`** (line 133): Parses the `stop_reason` message to extract the specific unverifiable attribute (e.g. "live music").
- **`StopReasonBadge`** component: Renders the run-level stop reason.

---

## 6. Does the UI Mix Multiple Layers of Truth?

**Yes, extensively.**

| Symptom | Where |
|---------|-------|
| Discovery count shown with delivery wording | `buildRunNarrative` line 729: "I found {deliveredCount}" uses `[...exact, ...closest].length`, which in fallback mode is the raw candidate pool size, not the delivered set. |
| Candidate leads shown with final-run phrasing | The section header says "Results (N)" for both matches and candidates. No distinction in phrasing between "these are verified delivered results" and "these are unverified candidates". |
| Unverified candidates in same list as delivered results | Lines 1767-1789: Both `matches` and `candidates` arrays are rendered in the same bubble, separated only by a subtle "Other results" header. |
| Badge is the only differentiator | A user seeing 5 results with a mix of "Verified" and "Unverified" badges has no way to know the backend intended to deliver only 3. |

---

## 7. What the UI Has Access To Today

| Data point | Available? | Source |
|------------|-----------|--------|
| Final delivered leads only | **Partially.** Only via `delivery_summary` artefact (Path A). Fallback path has no concept of "final delivered." | `delivery_summary.delivered_exact` |
| Verification status per lead | **Yes.** | `leadVerifications` and `semanticJudgements` artefacts |
| Evidence snippet per lead | **Yes.** | `lead.evidence[0].snippet` on leads that have it |
| Source URL per lead | **Yes.** | `lead.evidence_source_url` |
| Tower verdict | **Yes.** | `tower_judgement` artefact via `resolveAuthoritativeTower` |
| Delivery summary counts | **Partially.** `verified_exact_count`, `delivered_count`, `requested_count` from `delivery_summary`. Missing when synthesised. | `delivery_summary` payload |

---

## 8. Recommended Minimal Fix

**Goal: For hard-evidence queries, show only the final delivered truth in the primary results section.**

### Fix 1: Stop showing unverified candidates in the primary list when verification data exists

In `RunResultBubble.tsx`, when `hasVerificationData` is true and the canonical status is not `ACCEPT_WITH_UNVERIFIED`:
- Render **only** the `matches` array in the primary "Results" section.
- Move the `candidates` array to a **collapsed** "Other candidates (not verified)" section, hidden by default.

**Affected lines:** ~1767-1789 in `RunResultBubble.tsx`.

### Fix 2: Fix the count in the summary narrative

In `buildRunNarrative` (line 700), when verification data is available, use `matches.length` (verified count) instead of `allLeads.length` for the primary "I found N results" line.

**Affected lines:** ~728-729 in `RunResultBubble.tsx`.

### Fix 3: Harden the fallback synthesis path

In `chat.tsx` Path B (lines 903-945), when `leadVerifications` or `semanticJudgements` are available:
- Only put leads that pass `isLeadVerified()` into `delivered_exact`.
- Put the rest into `delivered_closest` with appropriate labelling.

**Affected lines:** ~925-935 in `chat.tsx`.

---

## 9. Recommended Long-Term Rendering Model

### A. Delivered Truth Model

The UI should adopt a **single source of truth** hierarchy:

```
Priority 1: delivery_summary artefact (delivered_exact + delivered_closest)
Priority 2: run_receipt outcomes (matched_place_ids per attribute)
Priority 3: NEVER synthesise from leads_list — if no delivery_summary exists,
            show a "Results are still being processed" state with a retry button.
```

Remove the `leads_list` fallback synthesis entirely. If the backend didn't produce a `delivery_summary`, the run is not done — the UI should not pretend it is.

### B. Evidence Visibility

For hard-evidence queries (where the user asked for something that requires website verification):

```
┌─────────────────────────────────────────────────────────┐
│ Verified matches (3)                                     │
│                                                          │
│ ✅ The Crown Inn                                         │
│    📍 Arundel, West Sussex                               │
│    🌐 thecrowninarundel.co.uk                            │
│    "Live music every Friday and Saturday evening"        │
│    Source: thecrowninarundel.co.uk/events                │
│                                                          │
│ ✅ The Swan Hotel                                         │
│    ...                                                   │
│                                                          │
│ ✅ The Eagle                                              │
│    ...                                                   │
├─────────────────────────────────────────────────────────┤
│ ▶ Other candidates — could not verify (2)    [collapsed] │
│   These were found in the area but I couldn't confirm    │
│   they mention "live music" on their website.            │
│                                                          │
│   ⚪ The Red Lion                                         │
│   ⚪ The Norfolk Arms                                     │
└─────────────────────────────────────────────────────────┘
```

Key principles:
- Evidence snippet and source URL are **always visible** for verified matches.
- The header count ("Verified matches (3)") reflects only the verified set.
- Unverified candidates are **separated and collapsed** with a clear explanation.
- The natural language summary says "I found 3 that mention live music" not "I found 5."

### C. Verified vs Closest-Match Separation

Introduce a clear **three-tier model**:

| Tier | Label | When shown | Badge |
|------|-------|-----------|-------|
| **Verified** | "Verified matches" | Lead passes all hard constraints including website evidence | ✅ Verified |
| **Weak match** | "Possible matches" | Lead has some evidence but not conclusive (e.g. snippet is ambiguous) | 🔵 Weak match |
| **Unverified** | "Other candidates" | Lead was found in discovery but evidence could not be confirmed | ⚪ Not verified |

Each tier should be a **separate section** in the UI, not just a badge on the same flat list.

### D. Count Consistency

The summary header count should **always** match the primary rendered section:
- "I found 3 verified matches" → 3 leads visible in the "Verified matches" section
- If candidates are shown, they get their own count: "2 other candidates could not be verified"
- The `delivered_count` in the diagnostic footer should match the `delivery_summary` artefact exactly

---

## 10. Files Requiring Changes (Summary)

| File | Change needed |
|------|--------------|
| `client/src/pages/chat.tsx` (~lines 903-945) | Remove or harden `leads_list` fallback synthesis. Don't treat raw candidates as delivered results. |
| `client/src/components/results/RunResultBubble.tsx` (~lines 688-734) | Fix `buildRunNarrative` to use verified count, not total lead count, for the primary summary line. |
| `client/src/components/results/RunResultBubble.tsx` (~lines 1708-1765) | The `hasReceiptAttributes` rendering branch also shows "Other results" for unmatched leads. Apply the same collapse/separation logic here. |
| `client/src/components/results/RunResultBubble.tsx` (~lines 1767-1789) | Default (non-receipt) candidate branch: collapse/hide unverified candidates behind a disclosure. Make verified matches the primary section. |
| `client/src/components/results/RunResultBubble.tsx` (~lines 304-374) | Fix `buildSummaryText` to distinguish verified count from total discovered count. |
| `client/src/components/results/UserResultsView.tsx` (~lines 302-328) | Same principle: separate verified from unverified in the full-panel view. |
