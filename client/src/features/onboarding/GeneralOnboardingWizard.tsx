/**
 * General Onboarding Wizard
 *
 * A comprehensive 3-step onboarding flow for all new users:
 * 1. Welcome & Company Setup - Company details and industry vertical selection
 * 2. Primary Objective - User's main goal with the platform
 * 3. Quick Start - Choose how to begin (first customer, sample data, or chat)
 *
 * Supports sequential flow: General → Brewery wizard for brewery users
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Building2, Target, Rocket, CheckCircle2, ArrowRight, ArrowLeft, User, Package, MessageSquare } from "lucide-react";
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
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type WizardStep = 1 | 2 | 3;
type Vertical = "brewery" | "generic" | "animal_physio" | "other";
type QuickStartOption = "add_customer" | "sample_data" | "chat";

interface OnboardingFormData {
  companyName: string;
  companyDomain: string;
  vertical: Vertical;
  roleHint: string;
  primaryObjective: string;
  quickStartChoice: QuickStartOption | null;
}

/**
 * Step indicator showing progress through the wizard
 */
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: "Company" },
    { num: 2, label: "Objective" },
    { num: 3, label: "Quick Start" },
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
 * Step 1: Welcome & Company Setup
 */
function StepCompanySetup({
  formData,
  onChange,
  onNext,
}: {
  formData: OnboardingFormData;
  onChange: (updates: Partial<OnboardingFormData>) => void;
  onNext: () => void;
}) {
  const canProceed = formData.companyName.trim().length > 0 && formData.vertical;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Building2 className="h-12 w-12 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold">Welcome to Wyshbone!</h2>
        <p className="text-muted-foreground">
          Let's set up your account in just a few minutes
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">
            Company Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="companyName"
            placeholder="Your company name"
            value={formData.companyName}
            onChange={(e) => onChange({ companyName: e.target.value })}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="companyDomain">
            Website (optional)
          </Label>
          <Input
            id="companyDomain"
            placeholder="example.com"
            value={formData.companyDomain}
            onChange={(e) => onChange({ companyDomain: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Helps us understand your industry
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vertical">
            Industry <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.vertical}
            onValueChange={(value: Vertical) => onChange({ vertical: value })}
          >
            <SelectTrigger id="vertical">
              <SelectValue placeholder="Select your industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brewery">Brewery / Beverage</SelectItem>
              <SelectItem value="generic">General B2B</SelectItem>
              <SelectItem value="animal_physio">Animal Physiotherapy</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleHint">Your Role</Label>
          <Select
            value={formData.roleHint}
            onValueChange={(value) => onChange({ roleHint: value })}
          >
            <SelectTrigger id="roleHint">
              <SelectValue placeholder="Select your role (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Founder">Founder</SelectItem>
              <SelectItem value="Sales Director">Sales Director</SelectItem>
              <SelectItem value="Marketing Manager">Marketing Manager</SelectItem>
              <SelectItem value="Business Owner">Business Owner</SelectItem>
              <SelectItem value="Operations Manager">Operations Manager</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full"
        size="lg"
      >
        Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Step 2: Primary Objective
 */
function StepPrimaryObjective({
  formData,
  onChange,
  onNext,
  onBack,
}: {
  formData: OnboardingFormData;
  onChange: (updates: Partial<OnboardingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const objectives = [
    { value: "Find new B2B customers", label: "Find new B2B customers", icon: User },
    { value: "Generate leads", label: "Generate leads", icon: Target },
    { value: "Track sales pipeline", label: "Track sales pipeline", icon: Package },
    { value: "Manage customer relationships", label: "Manage customer relationships", icon: Building2 },
  ];

  const [customObjective, setCustomObjective] = useState("");
  const selectedPredefined = objectives.some(obj => obj.value === formData.primaryObjective);

  const handleSelectObjective = (value: string) => {
    onChange({ primaryObjective: value });
    setCustomObjective("");
  };

  const handleCustomChange = (value: string) => {
    setCustomObjective(value);
    onChange({ primaryObjective: value });
  };

  const canProceed = formData.primaryObjective.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/30">
            <Target className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold">What's your main goal?</h2>
        <p className="text-muted-foreground">
          This helps us personalize your experience
        </p>
      </div>

      <div className="space-y-3">
        {objectives.map((objective) => {
          const Icon = objective.icon;
          const isSelected = formData.primaryObjective === objective.value;
          return (
            <Card
              key={objective.value}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              onClick={() => handleSelectObjective(objective.value)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-medium">{objective.label}</span>
                {isSelected && (
                  <CheckCircle2 className="ml-auto h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="space-y-2 pt-2">
          <Label htmlFor="customObjective">Or describe your own goal:</Label>
          <Input
            id="customObjective"
            placeholder="E.g., Expand into new markets"
            value={customObjective}
            onChange={(e) => handleCustomChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={onBack} variant="outline" className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="flex-1" size="lg">
          Continue <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Step 3: Quick Start Choice
 */
function StepQuickStart({
  formData,
  onChange,
  onComplete,
  onBack,
}: {
  formData: OnboardingFormData;
  onChange: (updates: Partial<OnboardingFormData>) => void;
  onComplete: () => void;
  onBack: () => void;
}) {
  const quickStartOptions = [
    {
      value: "add_customer" as QuickStartOption,
      icon: User,
      title: "Add My First Customer",
      description: "Start by adding a customer and see how Wyshbone works",
    },
    {
      value: "sample_data" as QuickStartOption,
      icon: Package,
      title: "Load Sample Data",
      description: "Explore with pre-filled example data to learn the features",
    },
    {
      value: "chat" as QuickStartOption,
      icon: MessageSquare,
      title: "Try the AI Assistant",
      description: "Ask questions and let AI guide you through the platform",
    },
  ];

  const handleSelect = (choice: QuickStartOption) => {
    onChange({ quickStartChoice: choice });
    // Auto-proceed after selection
    setTimeout(() => onComplete(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-purple-100 dark:bg-purple-900/30">
            <Rocket className="h-12 w-12 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold">Ready to get started?</h2>
        <p className="text-muted-foreground">
          Choose how you'd like to begin
        </p>
      </div>

      <div className="space-y-3">
        {quickStartOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = formData.quickStartChoice === option.value;
          return (
            <Card
              key={option.value}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "hover:border-primary/50 hover:shadow-md"
              }`}
              onClick={() => handleSelect(option.value)}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className={`p-3 rounded-lg ${isSelected ? "bg-primary/10" : "bg-muted"}`}>
                  <Icon className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{option.title}</h3>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button onClick={onBack} variant="outline" className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onComplete} variant="outline" className="flex-1">
          Skip for now
        </Button>
      </div>
    </div>
  );
}

/**
 * Main General Onboarding Wizard Component
 */
export function GeneralOnboardingWizard({
  onComplete,
  onOpenBreweryWizard,
}: {
  onComplete?: () => void;
  onOpenBreweryWizard?: () => void;
}) {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load from localStorage or use defaults
  const [formData, setFormData] = useState<OnboardingFormData>(() => {
    const saved = localStorage.getItem("wyshbone.onboarding.formData");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      companyName: "",
      companyDomain: "",
      vertical: "generic" as Vertical,
      roleHint: "",
      primaryObjective: "",
      quickStartChoice: null,
    };
  });

  // Persist to localStorage on change
  const handleChange = (updates: Partial<OnboardingFormData>) => {
    const newData = { ...formData, ...updates };
    setFormData(newData);
    localStorage.setItem("wyshbone.onboarding.formData", JSON.stringify(newData));
  };

  // Persist current step
  const goToStep = (step: WizardStep) => {
    setCurrentStep(step);
    localStorage.setItem("wyshbone.onboarding.currentStep", step.toString());
  };

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

      // Clear localStorage
      localStorage.removeItem("wyshbone.onboarding.formData");
      localStorage.removeItem("wyshbone.onboarding.currentStep");

      toast({
        title: "Welcome to Wyshbone!",
        description: "Your account is all set up.",
      });

      // Check if brewery vertical → open brewery wizard
      if (formData.vertical === "brewery" && onOpenBreweryWizard) {
        toast({
          title: "Let's customize for breweries",
          description: "A few more quick questions...",
        });
        onOpenBreweryWizard();
        return;
      }

      // Handle quick start choice
      switch (formData.quickStartChoice) {
        case "add_customer":
          navigate("/crm/customers");
          // TODO: Auto-open add customer dialog
          break;
        case "sample_data":
          // TODO: Trigger sample data loading
          navigate("/crm");
          break;
        case "chat":
          navigate("/chat");
          break;
        default:
          navigate("/crm");
      }

      onComplete?.();
    } catch (error) {
      console.error("Failed to save onboarding:", error);
      toast({
        title: "Error",
        description: "Failed to save your settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <StepIndicator currentStep={currentStep} />
      </CardHeader>
      <CardContent>
        {currentStep === 1 && (
          <StepCompanySetup
            formData={formData}
            onChange={handleChange}
            onNext={() => goToStep(2)}
          />
        )}
        {currentStep === 2 && (
          <StepPrimaryObjective
            formData={formData}
            onChange={handleChange}
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {currentStep === 3 && (
          <StepQuickStart
            formData={formData}
            onChange={handleChange}
            onComplete={handleComplete}
            onBack={() => goToStep(2)}
          />
        )}
      </CardContent>
    </Card>
  );
}
