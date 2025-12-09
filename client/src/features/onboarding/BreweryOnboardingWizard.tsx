/**
 * UI-15: Brewery Onboarding Wizard
 * 
 * A simple 3-step onboarding flow for new brewery users:
 * 1. Welcome - Introduces the app in brewery language
 * 2. Pub Profile - Captures pub type, beer range, rotation preferences
 * 3. Territory - Captures country and target regions
 * 
 * On completion, navigates to the Leads page (Lead Finder) with preferences applied.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Beer, MapPin, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVerticalLabels } from "@/lib/verticals";
import type { 
  BreweryOnboardingSettings, 
  PreferredPubType, 
  RotationPreference 
} from "./types";
import { DEFAULT_ONBOARDING_SETTINGS } from "./types";

type WizardStep = 1 | 2 | 3;

/**
 * Step indicator showing progress through the wizard
 */
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: "Welcome" },
    { num: 2, label: "Ideal Leads" },
    { num: 3, label: "Territory" },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => (
        <div key={step.num} className="flex items-center">
          <div
            className={`
              flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
              transition-colors duration-200
              ${currentStep >= step.num 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted text-muted-foreground"
              }
            `}
          >
            {currentStep > step.num ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              step.num
            )}
          </div>
          {index < steps.length - 1 && (
            <div
              className={`
                w-12 h-0.5 mx-2
                ${currentStep > step.num ? "bg-primary" : "bg-muted"}
              `}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Step 1: Welcome screen
 */
function StepWelcome({ 
  onNext 
}: { 
  onNext: () => void;
}) {
  const { labels } = useVerticalLabels();

  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Beer className="h-12 w-12 text-amber-600 dark:text-amber-400" />
        </div>
      </div>
      
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {labels.onboarding_welcome_title}
        </h1>
        <p className="text-muted-foreground">
          {labels.onboarding_welcome_subtitle}
        </p>
      </div>

      <div className="text-left max-w-sm mx-auto space-y-3 py-4">
        <p className="text-sm text-muted-foreground mb-3">
          We'll help you:
        </p>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            1
          </div>
          <p className="text-sm">{labels.onboarding_welcome_bullet_1}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            2
          </div>
          <p className="text-sm">{labels.onboarding_welcome_bullet_2}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">
            3
          </div>
          <p className="text-sm">{labels.onboarding_welcome_bullet_3}</p>
        </div>
      </div>

      <Button onClick={onNext} className="w-full sm:w-auto">
        Get started
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Step 2: Pub Profile preferences
 */
function StepPubProfile({
  settings,
  onUpdate,
  onBack,
  onNext,
}: {
  settings: BreweryOnboardingSettings;
  onUpdate: (updates: Partial<BreweryOnboardingSettings>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { labels } = useVerticalLabels();

  const pubTypeOptions: { value: PreferredPubType; label: string }[] = [
    { value: "any", label: "Any type" },
    { value: "freehouse", label: "Freehouses" },
    { value: "pubco", label: "Pub companies" },
    { value: "micropub", label: "Micropubs" },
    { value: "mixed", label: "Mixed / varied" },
  ];

  const rotationOptions: { value: RotationPreference; label: string }[] = [
    { value: "either", label: "Either is fine" },
    { value: "rotating", label: "Rotating guests preferred" },
    { value: "core_only", label: "Core range only" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">
          {labels.onboarding_step2_title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {labels.onboarding_step2_subtitle}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pubType">
            {labels.onboarding_field_preferred_pub_type}
          </Label>
          <Select
            value={settings.preferredPubType || "any"}
            onValueChange={(value: PreferredPubType) => 
              onUpdate({ preferredPubType: value })
            }
          >
            <SelectTrigger id="pubType">
              <SelectValue placeholder="Select pub type" />
            </SelectTrigger>
            <SelectContent>
              {pubTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="beerRange">
            {labels.onboarding_field_beer_range_pref}
          </Label>
          <Input
            id="beerRange"
            placeholder="e.g. 4+ taps, rotating guests, cask-focused"
            value={settings.beerRangePreference || ""}
            onChange={(e) => onUpdate({ beerRangePreference: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Describe the kind of beer range you're looking for
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rotation">
            {labels.onboarding_field_rotation_pref}
          </Label>
          <Select
            value={settings.rotationPreference || "either"}
            onValueChange={(value: RotationPreference) => 
              onUpdate({ rotationPreference: value })
            }
          >
            <SelectTrigger id="rotation">
              <SelectValue placeholder="Select rotation preference" />
            </SelectTrigger>
            <SelectContent>
              {rotationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext}>
          Next
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Step 3: Territory preferences
 */
function StepTerritory({
  settings,
  onUpdate,
  onBack,
  onFinish,
}: {
  settings: BreweryOnboardingSettings;
  onUpdate: (updates: Partial<BreweryOnboardingSettings>) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { labels } = useVerticalLabels();

  const countryOptions = [
    { value: "United Kingdom", label: "United Kingdom" },
    { value: "Ireland", label: "Ireland" },
    { value: "United States", label: "United States" },
    { value: "Canada", label: "Canada" },
    { value: "Australia", label: "Australia" },
    { value: "Other", label: "Other" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <MapPin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h2 className="text-xl font-semibold">
          {labels.onboarding_step3_title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {labels.onboarding_step3_subtitle}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="country">
            {labels.onboarding_field_country}
          </Label>
          <Select
            value={settings.primaryCountry || "United Kingdom"}
            onValueChange={(value) => onUpdate({ primaryCountry: value })}
          >
            <SelectTrigger id="country">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="regions">
            {labels.onboarding_field_regions}
          </Label>
          <Input
            id="regions"
            placeholder="e.g. Sussex, Surrey, London"
            value={settings.focusRegions || ""}
            onChange={(e) => onUpdate({ focusRegions: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Enter the regions, counties, or cities where you want to find leads
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onFinish}>
          {labels.onboarding_finish_button}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Main Brewery Onboarding Wizard component
 */
export function BreweryOnboardingWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<WizardStep>(1);
  const [settings, setSettings] = useState<BreweryOnboardingSettings>(
    DEFAULT_ONBOARDING_SETTINGS
  );

  const updateSettings = (updates: Partial<BreweryOnboardingSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleFinish = () => {
    // Mark onboarding as completed
    const completedSettings: BreweryOnboardingSettings = {
      ...settings,
      completed: true,
      completedAt: new Date().toISOString(),
    };

    // TODO: Persist onboarding settings to backend
    // When backend support exists, make an API call here:
    // await apiRequest('POST', '/api/user/onboarding', completedSettings);
    // or
    // await apiRequest('PATCH', '/api/crm/settings', { breweryOnboarding: completedSettings });
    
    // For now, store in localStorage as a temporary measure
    try {
      localStorage.setItem(
        'breweryOnboardingSettings', 
        JSON.stringify(completedSettings)
      );
      console.log('[Onboarding] Settings saved to localStorage:', completedSettings);
    } catch (e) {
      console.warn('[Onboarding] Failed to save settings to localStorage:', e);
    }

    // Navigate to the Leads page (Lead Finder)
    // TODO: When territory pre-filling is supported, pass settings as query params
    // e.g. navigate(`/leads?region=${encodeURIComponent(settings.focusRegions || '')}`);
    navigate("/leads");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader className="pb-2">
          <StepIndicator currentStep={step} />
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <StepWelcome onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepPubProfile
              settings={settings}
              onUpdate={updateSettings}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepTerritory
              settings={settings}
              onUpdate={updateSettings}
              onBack={() => setStep(2)}
              onFinish={handleFinish}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BreweryOnboardingWizard;

