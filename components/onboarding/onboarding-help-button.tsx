"use client";

import { CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { OnboardingTourKey } from "@/lib/onboarding/storage";

type OnboardingHelpButtonProps = {
  onStartTour: (tour: OnboardingTourKey) => void;
};

export function OnboardingHelpButton({ onStartTour }: OnboardingHelpButtonProps) {
  const pathname = usePathname();
  const tour = pathname.startsWith("/canvas/") ? "canvasTour" : "dashboardTour";

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="fixed bottom-4 left-4 z-40 size-10 rounded-full shadow-lg"
      aria-label="Onboarding öffnen"
      title="Onboarding öffnen"
      onClick={() => onStartTour(tour)}
    >
      <CircleHelp className="size-4" />
    </Button>
  );
}
