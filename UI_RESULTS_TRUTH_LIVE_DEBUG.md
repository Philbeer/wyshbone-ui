# UI Results Truth — Live Debug Report

## Exact Active Component / Branch

The screen showing "I found 5 businesses" / "RESULTS (5)" / all "Unverified" is rendered by:

- **Component:** `RunResultBubble` in `client/src/components/results/RunResultBubble.tsx`
- **Branch:** The **default rendering branch** (not receipt-attrs, not location-buckets, not provisional)
- **Specifically:** The `candidates` section at ~line 1826, which renders when `matches.length === 0` and `candidates.length > 0`

## Was the Preview Stale?

No. The Vite HMR logs confirm the edited files were hot-updated. The issue is not stale build/preview state.

## Did the Previous Fix Touch the Wrong Path?

**Yes — partially.** The previous truth fix only addressed:

1. **Path B (fallback synthesis in `chat.tsx`):** When no `delivery_summary` artefact exists, the fallback synthesis path now correctly splits leads by verification status. This is correct but rarely triggered.

2. **RunResultBubble rendering branches:** The receipt-attrs and default branches were updated with verification-aware headers and collapsed candidates. This was correct but had a critical logic gap.

**The gap:** The previous fix assumed that when RunResultBubble renders, verification data (leadVerifications, semanticJudgements, receiptAttrs) would be available. In reality, most completed runs arrive via **Path A** (backend provides `delivery_summary` artefact directly) with **no per-lead verification artefacts** at all. In this case:

- `leadVerifications` = null
- `semanticJudgements` = null
- `receiptAttrsForIds` = null/empty
- `verifiedExact` = 0 (from `resolveVerifiedCount`)
- `verifiedIds` = empty Set
- `hasVerificationData` = false

## Exact Root Cause

When `hasVerificationData` is false:

1. `splitLeadsByVerification` returned `{ matches: [], candidates: allLeads }` because `verifiedIds.size === 0 && verifiedExact === 0` — ALL leads went into `candidates`, NONE into `matches`

2. `hasUnverifiedLeads` was computed as `(!hasVerificationData) || isTrustFailure || isTimePredicateStop` — when `!hasVerificationData` is true, `hasUnverifiedLeads` = true

3. `defaultBadgeStatus` was `'unverified'` because `hasUnverifiedLeads` was true

4. The matches section (`matches.length > 0`) did NOT render (matches was empty)

5. The candidates section rendered: `"Results (5)"` header with every row badged `"Unverified"`

6. `buildRunNarrative` received `verifiedMatchCount = undefined` (because `hasVerificationData` was false), so it fell through to `"I found 5 businesses"` — neutral language but combined with "Unverified" badges gave a misleading impression

**In short:** When the backend provides no verification artefacts, the old code treated all leads as unverified candidates rather than showing them neutrally. The "Unverified" badge implies verification was attempted and failed — when in reality verification was never done.

## Exact Code Fix Made

### 1. `splitLeadsByVerification` — new `hasVerificationData` parameter

**Before:** When `verifiedIds.size === 0 && verifiedExact === 0`, returned all leads as candidates regardless.

**After:** Added `hasVerificationData: boolean` parameter. When `!hasVerificationData && verifiedIds.size === 0 && verifiedExact === 0`, returns all leads as `matches` (not candidates). Rationale: if verification was never done, we cannot label results as "unverified."

### 2. `hasUnverifiedLeads` — only true when verification data exists

**Before:** `const hasUnverifiedLeads = (!hasVerificationData) || isTrustFailure || isTimePredicateStop;`

**After:** `const hasUnverifiedLeads = hasVerificationData && (isTrustFailure || isTimePredicateStop || candidates.length > 0);`

When no verification data exists, `hasUnverifiedLeads` is now `false`, so `defaultBadgeStatus` becomes `'candidate'` (neutral) instead of `'unverified'`.

### 3. LeadBadge `'none'` status — suppress badges when irrelevant

**Before:** `LeadBadgeStatus` had 4 values: `'verified' | 'weak_match' | 'candidate' | 'unverified'`

**After:** Added `'none'` option. When `badgeStatus === 'none'`, `LeadBadge` returns null (no badge rendered).

### 4. Default branch LeadRow — conditional badge/verification

**Before:** `<LeadRow ... isVerified={true} badgeStatus={getLeadBadgeStatus(lead)} />`

**After:** `<LeadRow ... isVerified={hasVerificationData} badgeStatus={hasVerificationData ? getLeadBadgeStatus(lead) : 'none'} />`

When no verification data exists, leads render with no badge at all — clean, neutral presentation.

### 5. Enhanced debug logging

Added comprehensive `console.log` in RunResultBubble render path showing: `hasVerificationData`, `hasReceiptAttrData`, `hasSemanticData`, `leadVerifications` count, `semanticJudgements` count, `verifiedIds` size, `weakMatchIds` size, `hasUnverifiedLeads`, `defaultBadgeStatus`, `renderBranch`.

## Expected Behaviour After Fix

### When NO verification data exists (common case):
```
"I found 5 businesses in Arundel."

RESULTS (5)
  The Crown Inn
    📍 Arundel · 🌐 thecrowninn.co.uk
  The Swan Hotel
    ...
  [etc — no badges, no "Verified"/"Unverified" labels]
```

### When verification data EXISTS (3 verified, 2 not):
```
"I found 3 verified matches in Arundel."
"2 other candidates were found but could not be verified."

VERIFIED MATCHES (3)
  ✅ The Crown Inn
  ✅ The Swan Hotel
  ✅ The Eagle

▶ Other candidates — not verified (2) [collapsed]
```

### 6. Location-buckets branch — same gating applied

All four location-bucket sections (verifiedGeo, searchBounded, outOfArea, unknown) now gate `isVerified` and `badgeStatus` on `hasVerificationData`, matching the default branch fix. When no verification data exists, no Verified/Unverified badges appear in the location-buckets view either.

## Debug Logging Reference

To confirm the rendering path on any live run, check the browser console for:

```
[RunResultBubble] render: status=PASS (raw=PASS), verifiedExact=0, ...
  hasVerificationData=false, hasReceiptAttrData=false, hasSemanticData=false,
  leadVerifications=none, semanticJudgements=none, verifiedIds=0,
  weakMatchIds=0, hasUnverifiedLeads=false, defaultBadgeStatus=candidate,
  renderBranch=default
```

And in chat.tsx:
```
[Chat][finalizeRunUI] delivery_summary found for run=xxx, status=PASS, ...
```
(This confirms Path A was used, not fallback synthesis.)
