"use client";

import type { CardComponentProps } from "nextstepjs";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OnboardingCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl">
      {arrow}
      <div className="mb-3 flex items-start gap-3">
        {step.icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm text-primary">
            {step.icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{step.title}</p>
          <div className="mt-1 text-sm leading-5 text-muted-foreground">
            {step.content}
          </div>
        </div>
        {skipTour ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mt-2 -mr-2 size-8"
            onClick={skipTour}
            aria-label="Onboarding schließen"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tabular-nums text-muted-foreground">
          {currentStep + 1}/{totalSteps}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={prevStep}
            disabled={isFirst}
            aria-label="Vorheriger Schritt"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" size="sm" onClick={nextStep}>
            {isLast ? "Fertig" : "Weiter"}
            {!isLast ? <ChevronRight className="size-4" /> : null}
          </Button>
        </div>
      </div>
    </div>
  );
}
