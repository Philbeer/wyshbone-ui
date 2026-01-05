# ONBOARDING MODAL IMPROVEMENT PLAN
**Date:** 2026-01-05
**Goal:** Fix onboarding to appear as sequential popup modals, not random panels under leads section

---

## 🚨 CURRENT PROBLEM

**User Report:**
> "The way the two onboarding panels appear is not right - they need to be sequential. When the first is finished then the second one appears etc. At the moment they are both under that leads panel randomly."

**What's Wrong:**
1. Both onboarding wizards render as plain `<Card>` components in the page
2. They appear under/around the leads panel (part of normal page flow)
3. No popup/modal behavior
4. No dark backdrop
5. User can see other page content behind them
6. Not sequential - both might show at once
7. Looks like regular page content, not onboarding

**What Should Happen:**
1. **Wizard #1** (General) appears as a full-screen popup modal
2. User completes Wizard #1 (can't see anything else)
3. Wizard #1 closes
4. **Wizard #2** (Brewery - if applicable) opens as popup modal
5. User completes Wizard #2
6. Both wizards close, user proceeds to app
7. Triggered after first login/signup

---

## 🎯 SOLUTION: SEQUENTIAL POPUP MODALS

### Architecture Overview

```
User logs in for first time
      ↓
✅ Check: Has completed General onboarding?
      ↓ NO
[POPUP MODAL] General Wizard Opens
  - Dark backdrop covers entire screen
  - User cannot dismiss or see behind it
  - 3 steps: Company → Objective → Quick Start
  - User clicks "Complete" or "Get Started"
      ↓
✅ Save to backend: generalOnboardingCompleted = true
      ↓
✅ Check: Did user select "brewery" vertical?
      ↓ YES
[POPUP MODAL] Brewery Wizard Opens
  - Previous modal closed first
  - New modal appears with dark backdrop
  - 3 steps: Welcome → Ideal Leads → Territory
  - User clicks "Start finding leads"
      ↓
✅ Save to backend: breweryOnboardingCompleted = true
      ↓
User proceeds to main app
```

---

## 📋 IMPLEMENTATION STEPS

### STEP 1: Add Conditional Rendering in App.tsx

**File:** `client/src/App.tsx`
**Lines:** 223-234 (OnboardingWizards component)

**Current Code:**
```typescript
return (
  <>
    <GeneralOnboardingWizard
      onComplete={closeGeneralWizard}
      onOpenBreweryWizard={openBreweryWizard}
    />
    <BreweryOnboardingWizard
      isSequential={isBreweryWizardOpen}
      onComplete={closeBreweryWizard}
    />
  </>
);
```

**Problem:** Both always rendered, no conditional visibility

**New Code:**
```typescript
return (
  <>
    {isGeneralWizardOpen && (
      <GeneralOnboardingWizard
        open={isGeneralWizardOpen}
        onClose={closeGeneralWizard}
        onComplete={closeGeneralWizard}
        onOpenBreweryWizard={openBreweryWizard}
      />
    )}
    {isBreweryWizardOpen && (
      <BreweryOnboardingWizard
        open={isBreweryWizardOpen}
        onClose={closeBreweryWizard}
        isSequential={true}
        onComplete={closeBreweryWizard}
      />
    )}
  </>
);
```

**Changes:**
- ✅ Only render when state is `true`
- ✅ Pass `open` prop to control Dialog visibility
- ✅ Pass `onClose` for proper modal management
- ✅ Ensures only ONE wizard visible at a time

---

### STEP 2: Wrap GeneralOnboardingWizard in Dialog

**File:** `client/src/features/onboarding/GeneralOnboardingWizard.tsx`

**Current Structure:**
```typescript
export function GeneralOnboardingWizard({ onComplete, onOpenBreweryWizard }) {
  // ... state ...

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <StepIndicator currentStep={currentStep} />
      </CardHeader>
      <CardContent>
        {/* Steps 1, 2, 3 */}
      </CardContent>
    </Card>
  );
}
```

**Problem:**
- Just a Card sitting in page flow
- No modal/popup behavior
- No backdrop
- Can see page content behind it

**New Structure:**
```typescript
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface GeneralOnboardingWizardProps {
  open?: boolean;
  onClose?: () => void;
  onComplete?: () => void;
  onOpenBreweryWizard?: () => void;
}

export function GeneralOnboardingWizard({
  open = true,
  onClose,
  onComplete,
  onOpenBreweryWizard
}: GeneralOnboardingWizardProps) {
  // ... existing state ...

  // Optional: Skip button in Step 1
  const handleSkip = () => {
    if (window.confirm("Skip onboarding? You can always complete it later in Account Settings.")) {
      onClose?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose} modal={true}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()} // Prevent dismiss on backdrop click
        onEscapeKeyDown={(e) => e.preventDefault()} // Prevent dismiss on Escape
      >
        <Card className="border-0 shadow-none">
          <CardHeader>
            {/* Optional: Add skip button in top-right for Step 1 only */}
            {currentStep === 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="absolute top-4 right-4 text-xs text-muted-foreground"
              >
                Skip for now
              </Button>
            )}
            <StepIndicator currentStep={currentStep} />
          </CardHeader>
          <CardContent>
            {/* Existing step content */}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
```

**Key Changes:**
- ✅ Wrapped in `<Dialog>` component
- ✅ `modal={true}` - Creates dark backdrop
- ✅ `onPointerDownOutside` prevented - Can't dismiss by clicking outside
- ✅ `onEscapeKeyDown` prevented - Can't dismiss with Escape key
- ✅ `[&>button]:hidden` - Hides default close button
- ✅ Optional "Skip for now" button in Step 1 top-right
- ✅ Card has no border/shadow (Dialog provides)

---

### STEP 3: Wrap BreweryOnboardingWizard in Dialog

**File:** `client/src/features/onboarding/BreweryOnboardingWizard.tsx`

**Current Structure:**
```typescript
export function BreweryOnboardingWizard({ isSequential = false, onComplete } = {}) {
  // ... state ...

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader className="pb-2">
          <StepIndicator currentStep={step} />
        </CardHeader>
        <CardContent>
          {/* Steps 1, 2, 3 */}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Problem:**
- Full-screen `<div>` wrapper (wrong approach for modal)
- No Dialog component
- No backdrop
- Renders as page content

**New Structure:**
```typescript
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface BreweryOnboardingWizardProps {
  open?: boolean;
  onClose?: () => void;
  isSequential?: boolean;
  onComplete?: () => void;
}

export function BreweryOnboardingWizard({
  open = true,
  onClose,
  isSequential = false,
  onComplete
}: BreweryOnboardingWizardProps) {
  // ... existing state ...

  return (
    <Dialog open={open} onOpenChange={onClose} modal={true}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <Card className="w-full border-0 shadow-none">
          <CardHeader className="pb-2">
            {/* Add continuity badge if sequential */}
            {isSequential && (
              <div className="mb-4 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-sm text-blue-700 dark:text-blue-300 text-center">
                📋 Part 2 of 2: Brewery-specific setup
              </div>
            )}
            <StepIndicator currentStep={step} />
          </CardHeader>
          <CardContent>
            {/* Existing step content */}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
```

**Key Changes:**
- ✅ Wrapped in `<Dialog>` component
- ✅ Removed full-screen `<div>` wrapper
- ✅ Same modal behavior as General wizard
- ✅ Continuity badge shows when sequential
- ✅ Can't dismiss until completed

---

### STEP 4: Ensure Proper Sequencing

**Current Auto-Open Logic (App.tsx lines 213-221):**
```typescript
useEffect(() => {
  const hasCompletedOnboarding = user?.preferences?.generalOnboardingCompleted;
  if (!hasCompletedOnboarding && user?.id) {
    const timer = setTimeout(() => {
      openGeneralWizard();
    }, 1000);
    return () => clearTimeout(timer);
  }
}, [user?.id, user?.preferences?.generalOnboardingCompleted, openGeneralWizard]);
```

**Status:** ✅ Already triggers on first login after 1 second

**Sequence Flow in GeneralOnboardingWizard (lines 440-503):**
```typescript
const handleComplete = async () => {
  setIsSubmitting(true);
  try {
    // Save to backend
    await apiRequest("PUT", "/api/auth/profile", {
      companyName: formData.companyName,
      companyDomain: formData.companyDomain || undefined,
      roleHint: formData.roleHint || undefined,
      primaryObjective: formData.primaryObjective,
      preferences: {
        generalOnboardingCompleted: true,
        generalOnboardingCompletedAt: new Date().toISOString(),
      },
    });

    // Check if brewery vertical → open brewery wizard
    if (formData.vertical === "brewery" && onOpenBreweryWizard) {
      toast({
        title: "Let's customize for breweries",
        description: "A few more quick questions...",
      });
      onOpenBreweryWizard(); // ✅ This triggers Wizard #2
      return;
    }

    // Otherwise proceed to app
    onComplete?.();
  } catch (error) {
    // error handling
  }
}
```

**Status:** ✅ Sequential logic already exists! Just needs proper modal rendering.

---

### STEP 5: Style the Modal Backdrop

**Default Dialog Styling (shadcn/ui):**
- Backdrop: `bg-black/80` (dark overlay)
- Backdrop blur: `backdrop-blur-sm`
- Z-index: 50
- Position: fixed, covers viewport
- Centered content

**Additional Styling (if needed):**

Create custom backdrop in `client/src/features/onboarding/styles.css`:
```css
/* Onboarding modal backdrop override */
[data-onboarding-modal] {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
}

/* Ensure modal content is centered */
[data-onboarding-modal-content] {
  max-width: 672px; /* max-w-2xl */
  max-height: 90vh;
  overflow-y: auto;
}
```

**Usage:**
```typescript
<Dialog open={open} data-onboarding-modal>
  <DialogContent data-onboarding-modal-content className="...">
    {/* content */}
  </DialogContent>
</Dialog>
```

**Status:** Optional - Dialog defaults should be sufficient

---

## 🎨 VISUAL SPECIFICATIONS

### Modal Appearance

**Backdrop:**
- Background: `rgba(0, 0, 0, 0.8)` with `backdrop-blur-sm`
- Covers: Full viewport (100vw × 100vh)
- Position: Fixed
- Z-index: 50 (Dialog default)
- Click behavior: **Non-dismissible** (user must complete or skip)

**Modal Container:**
- Max width: `max-w-2xl` (672px)
- Min height: `min-h-[500px]`
- Padding: `p-8` inside CardContent
- Background: `bg-card` (white in light mode, dark in dark mode)
- Border radius: `rounded-xl` (12px)
- Box shadow: Dialog provides elevation
- Position: Centered vertically and horizontally
- Overflow: `overflow-y-auto` if content exceeds viewport

**Step Indicators:**
- Format: Circular badges with numbers or checkmarks
- Active step: `bg-primary text-primary-foreground`
- Completed step: `bg-primary` with `CheckCircle2` icon
- Pending step: `bg-muted text-muted-foreground`
- Connector lines: `w-12 h-0.5` between steps
- Spacing: `gap-2` between badges

**Buttons:**
- Primary (Continue/Finish): `size="lg"`, full width on mobile
- Secondary (Back): `variant="outline"` or `variant="ghost"`
- Skip (optional): `variant="ghost"`, `size="sm"`, top-right position

**Typography:**
- Main title: `text-2xl font-bold`
- Subtitle: `text-muted-foreground`
- Labels: `font-medium`
- Helper text: `text-xs text-muted-foreground`
- Spacing: `space-y-6` between sections

---

## 🧪 TESTING CHECKLIST

### Modal Behavior:
- [ ] Only ONE wizard visible at a time
- [ ] Dark backdrop covers entire screen
- [ ] Backdrop is NOT clickable (can't dismiss)
- [ ] Escape key does NOT dismiss modal
- [ ] Modal is centered in viewport
- [ ] Modal content scrollable if needed
- [ ] No page content visible behind modal

### Sequencing:
- [ ] New user sees General Wizard first
- [ ] Cannot proceed to app without completing/skipping General Wizard
- [ ] Brewery users see Brewery Wizard second (after General completes)
- [ ] Non-brewery users proceed directly to app (skip Brewery Wizard)
- [ ] Transition between wizards is smooth (no flash of page content)
- [ ] Only one wizard open at a time

### Triggering:
- [ ] Wizard appears 1 second after first login
- [ ] Does NOT appear on subsequent logins (if onboarding completed)
- [ ] "Skip for now" button works (if implemented)
- [ ] Skipped onboarding can be resumed from Account Settings (future feature)

### Data Persistence:
- [ ] General wizard saves: company name, domain, vertical, role, objective
- [ ] Brewery wizard saves: pub type, beer range, rotation, country, regions
- [ ] `generalOnboardingCompleted` flag set correctly
- [ ] `breweryOnboardingCompleted` flag set correctly
- [ ] Data persists across sessions
- [ ] No console errors

### Visual:
- [ ] Step indicators show correct progress
- [ ] Icons display correctly (Building2, Target, Rocket, Beer, MapPin)
- [ ] Buttons are clear and prominent
- [ ] Helper text is readable
- [ ] Dark mode looks good
- [ ] Light mode looks good
- [ ] Mobile responsive (modal adapts to small screens)
- [ ] Desktop looks professional

---

## 📁 FILES TO MODIFY

### Required Changes:

1. **client/src/App.tsx**
   - Lines 223-234: Add conditional rendering
   - Add `open` and `onClose` props to wizard calls

2. **client/src/features/onboarding/GeneralOnboardingWizard.tsx**
   - Add Dialog import
   - Add `open`, `onClose` props
   - Wrap entire component in Dialog
   - Remove outer positioning (Dialog handles it)
   - Add non-dismissible behavior
   - Optional: Add "Skip for now" button

3. **client/src/features/onboarding/BreweryOnboardingWizard.tsx**
   - Add Dialog import
   - Add `open`, `onClose` props
   - Wrap entire component in Dialog
   - Remove full-screen div wrapper
   - Add non-dismissible behavior
   - Add continuity badge when sequential

### Optional Changes:

4. **client/src/features/onboarding/styles.css** (create if needed)
   - Custom backdrop styling (if Dialog defaults insufficient)

---

## 🎯 SUCCESS CRITERIA

After implementation, the onboarding experience should be:

### User Experience:
- [x] User logs in → sees popup modal immediately
- [x] Cannot see page content behind modal
- [x] Cannot dismiss modal by clicking outside
- [x] Cannot bypass modal with Escape key
- [x] Completes General Wizard → modal closes
- [x] (If brewery) Sees Brewery Wizard → completes → modal closes
- [x] Proceeds to main app after all onboarding complete

### Visual:
- [x] Professional popup modal appearance
- [x] Dark backdrop creates focus
- [x] Clear step progression
- [x] Smooth transitions between wizards
- [x] No flash of page content between modals

### Technical:
- [x] Only one modal visible at a time
- [x] Data saves correctly to backend
- [x] Flags set properly (generalOnboardingCompleted, breweryOnboardingCompleted)
- [x] No console errors
- [x] Responsive on all screen sizes

---

## ⚠️ IMPORTANT NOTES

1. **Non-Dismissible Behavior:**
   - Users MUST complete or skip onboarding
   - Can't accidentally dismiss with clicks or key presses
   - Ensures proper data collection
   - "Skip for now" option provides escape hatch

2. **Sequential Logic Already Works:**
   - `onOpenBreweryWizard` correctly triggers second wizard
   - Just needs proper modal rendering to prevent both showing at once

3. **Trigger Timing:**
   - Currently: 1 second after first login
   - User requested: "after first login/signup"
   - ✅ Already implemented correctly
   - Future: May allow chat exploration before onboarding (but not now)

4. **Dialog Component:**
   - Uses shadcn/ui Dialog (already in project)
   - Provides backdrop, centering, z-index automatically
   - Very reliable and accessible

5. **No "Old Onboarding" to Remove:**
   - There's only ONE onboarding system
   - Just needs to render as modals instead of page content

---

## 🚀 READY TO IMPLEMENT

This plan addresses the core issue:
- ❌ **Before:** Wizards appear as random panels under leads section
- ✅ **After:** Wizards appear as sequential popup modals with backdrop

**Estimated Time:** 45-60 minutes
**Risk Level:** LOW (isolated changes, Dialog component well-tested)

**Next Step:** Begin implementation with Step 1 (conditional rendering in App.tsx)

---

## 📞 FINAL CONFIRMATION

Before proceeding, please confirm:

1. ✅ **Modal approach is correct?**
   - Full-screen dark backdrop
   - Centered popup
   - Non-dismissible (must complete or skip)

2. ✅ **Sequencing is clear?**
   - General Wizard first
   - Brewery Wizard second (if applicable)
   - One closes before next opens

3. ✅ **Trigger timing is correct?**
   - Appears 1 second after first login
   - Not on subsequent logins

4. ✅ **Any other requirements?**

**Ready to begin implementation! 🚀**
