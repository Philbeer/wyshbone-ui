/**
 * UI-17: Onboarding Tour Overlay Component
 * 
 * A multi-step walkthrough that highlights key UI areas.
 * Uses a semi-opaque backdrop with a callout panel showing step info and controls.
 */

import { useEffect, useState, useCallback } from 'react';
import { useOnboardingTourContext } from '@/contexts/OnboardingTourContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, X, HelpCircle } from 'lucide-react';

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: 'left' | 'right' | 'top' | 'bottom' | 'center';
}

/**
 * Get position for tooltip near the target element
 */
function getTooltipPosition(targetId: string, position: string): TooltipPosition | null {
  const target = document.querySelector(`[data-tour-id="${targetId}"]`);
  if (!target) {
    // Fallback to center if target not found
    return {
      top: window.innerHeight / 2 - 100,
      left: window.innerWidth / 2 - 200,
      arrowPosition: 'center',
    };
  }

  const rect = target.getBoundingClientRect();
  const tooltipWidth = 400;
  const tooltipHeight = 200;
  const padding = 20;

  let top: number;
  let left: number;
  let arrowPosition: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'center';

  switch (position) {
    case 'left':
      // Position tooltip to the left of the target
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - padding;
      arrowPosition = 'right';
      // If it goes off-screen, center it
      if (left < padding) {
        left = window.innerWidth / 2 - tooltipWidth / 2;
        top = window.innerHeight / 2 - tooltipHeight / 2;
        arrowPosition = 'center';
      }
      break;
    case 'right':
      // Position tooltip to the right of the target
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + padding;
      arrowPosition = 'left';
      // If it goes off-screen, center it
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth / 2 - tooltipWidth / 2;
        top = window.innerHeight / 2 - tooltipHeight / 2;
        arrowPosition = 'center';
      }
      break;
    case 'top':
      // Position tooltip above the target
      top = rect.top - tooltipHeight - padding;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrowPosition = 'bottom';
      break;
    case 'bottom':
      // Position tooltip below the target
      top = rect.bottom + padding;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      arrowPosition = 'top';
      break;
    default:
      // Center on screen
      top = window.innerHeight / 2 - tooltipHeight / 2;
      left = window.innerWidth / 2 - tooltipWidth / 2;
      arrowPosition = 'center';
  }

  // Ensure tooltip stays within viewport
  top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));
  left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

  return { top, left, arrowPosition };
}

/**
 * Highlight effect for the target element
 */
function TargetHighlight({ targetId }: { targetId: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const updateRect = () => {
      const target = document.querySelector(`[data-tour-id="${targetId}"]`);
      if (target) {
        setRect(target.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, [targetId]);

  if (!rect) return null;

  return (
    <div
      className="absolute pointer-events-none rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background transition-all duration-300 z-[9998]"
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }}
    />
  );
}

export function OnboardingTour() {
  const {
    isTourOpen,
    currentStep,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    finishTour,
    skipTour,
  } = useOnboardingTourContext();

  const [position, setPosition] = useState<TooltipPosition | null>(null);

  // Update tooltip position when step changes or on resize
  const updatePosition = useCallback(() => {
    if (currentStep) {
      const pos = getTooltipPosition(currentStep.target, currentStep.position);
      setPosition(pos);
    }
  }, [currentStep]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [updatePosition]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isTourOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStepIndex < totalSteps - 1) {
          nextStep();
        } else {
          finishTour();
        }
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourOpen, currentStepIndex, totalSteps, nextStep, prevStep, finishTour, skipTour]);

  if (!isTourOpen || !currentStep || !position) {
    return null;
  }

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      {/* Semi-transparent backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity duration-300"
        onClick={skipTour}
      />

      {/* Highlight around target element */}
      <TargetHighlight targetId={currentStep.target} />

      {/* Tooltip card */}
      <Card
        className="absolute w-[400px] shadow-2xl border-2 border-primary/20 z-[10000]"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <HelpCircle className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-lg">{currentStep.title}</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mr-2 -mt-2"
              onClick={skipTour}
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pb-4">
          <p className="text-muted-foreground leading-relaxed">
            {currentStep.body}
          </p>
        </CardContent>

        <CardFooter className="flex items-center justify-between pt-0">
          {/* Progress indicator */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === currentStepIndex
                    ? 'w-6 bg-primary'
                    : i < currentStepIndex
                    ? 'w-1.5 bg-primary/60'
                    : 'w-1.5 bg-muted'
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={prevStep}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            
            {isFirstStep && (
              <Button
                variant="ghost"
                size="sm"
                onClick={skipTour}
                className="text-muted-foreground"
              >
                Skip
              </Button>
            )}

            {isLastStep ? (
              <Button
                size="sm"
                onClick={finishTour}
                className="gap-1"
              >
                Done
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={nextStep}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

