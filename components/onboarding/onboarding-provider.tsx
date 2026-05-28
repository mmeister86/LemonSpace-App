"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { NextStep, NextStepProvider, useNextStep } from "nextstepjs";

import { OnboardingCard } from "@/components/onboarding/onboarding-card";
import { OnboardingHelpButton } from "@/components/onboarding/onboarding-help-button";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import {
  clearPendingCanvasTour,
  mergeOnboardingState,
  readLocalOnboardingState,
  readPendingCanvasTour,
  updateLocalOnboardingState,
  type OnboardingMilestone,
  type OnboardingState,
  type OnboardingTourKey,
  type OnboardingTourStatus,
} from "@/lib/onboarding/storage";
import { onboardingTours } from "@/lib/onboarding/tours";

type StartTourOptions = {
  manual?: boolean;
};

type OnboardingActions = {
  startTour: (tour: OnboardingTourKey, options?: StartTourOptions) => void;
  markTourProgress: (
    tour: OnboardingTourKey,
    status: OnboardingTourStatus,
    lastStep?: number,
  ) => void;
  markMilestone: (milestone: OnboardingMilestone) => void;
};

const noopActions: OnboardingActions = {
  startTour: () => undefined,
  markTourProgress: () => undefined,
  markMilestone: () => undefined,
};

const OnboardingActionsContext = createContext<OnboardingActions>(noopActions);

export function useOnboardingActions() {
  return useContext(OnboardingActionsContext);
}

function isTourTerminal(state: OnboardingState, tour: OnboardingTourKey) {
  const status = state[tour]?.status;
  return status === "completed" || status === "skipped";
}

function getCanvasIdFromPathname(pathname: string) {
  return /^\/canvas\/([^/?#]+)/.exec(pathname)?.[1] ?? null;
}

function OnboardingRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { startNextStep } = useNextStep();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const userId = session?.user?.id;
  const remoteState = useQuery(api.onboarding.getState, userId ? {} : "skip");
  const markTourProgressMutation = useMutation(api.onboarding.markTourProgress);
  const markMilestoneMutation = useMutation(api.onboarding.markMilestone);
  const [, refreshLocalState] = useReducer((value: number) => value + 1, 0);
  const autoStartedRef = useRef(new Set<string>());
  const localState = userId ? readLocalOnboardingState(userId) : null;

  const mergedState = useMemo(
    () => mergeOnboardingState(remoteState ?? null, localState),
    [localState, remoteState],
  );

  const markTourProgress = useCallback<OnboardingActions["markTourProgress"]>(
    (tour, status, lastStep = 0) => {
      if (!userId) return;
      const now = Date.now();
      updateLocalOnboardingState(userId, (current) => ({
        ...current,
        [tour]: {
          ...current[tour],
          status,
          lastStep,
          startedAt: current[tour]?.startedAt ?? now,
          completedAt:
            status === "completed" ? current[tour]?.completedAt ?? now : current[tour]?.completedAt,
          skippedAt:
            status === "skipped" ? current[tour]?.skippedAt ?? now : current[tour]?.skippedAt,
        },
      }));
      refreshLocalState();
      void markTourProgressMutation({ tour, status, lastStep });
    },
    [markTourProgressMutation, userId],
  );

  const startTour = useCallback<OnboardingActions["startTour"]>(
    (tour) => {
      startNextStep(tour);
      markTourProgress(tour, "started", 0);
    },
    [markTourProgress, startNextStep],
  );

  const markMilestone = useCallback<OnboardingActions["markMilestone"]>(
    (milestone) => {
      if (!userId) return;
      const field =
        milestone === "firstWorkspace"
          ? "firstWorkspaceCreatedAt"
          : "firstOutputCreatedAt";
      updateLocalOnboardingState(userId, (current) => ({
        ...current,
        [field]: current[field] ?? Date.now(),
      }));
      refreshLocalState();
      void markMilestoneMutation({ milestone });
    },
    [markMilestoneMutation, userId],
  );

  useEffect(() => {
    if (isSessionPending || !userId || remoteState === undefined) return;
    if (pathname !== "/dashboard") return;
    if (isTourTerminal(mergedState, "dashboardTour")) return;

    const key = `${userId}:dashboardTour`;
    if (autoStartedRef.current.has(key)) return;
    autoStartedRef.current.add(key);
    const timeoutId = window.setTimeout(() => startTour("dashboardTour"), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isSessionPending, mergedState, pathname, remoteState, startTour, userId]);

  useEffect(() => {
    if (isSessionPending || !userId || remoteState === undefined) return;
    const canvasId = getCanvasIdFromPathname(pathname);
    if (!canvasId) return;
    if (isTourTerminal(mergedState, "canvasTour")) return;

    const pending = readPendingCanvasTour();
    if (!pending || pending.canvasId !== canvasId) return;
    clearPendingCanvasTour();
    const timeoutId = window.setTimeout(() => startTour("canvasTour"), 0);
    return () => window.clearTimeout(timeoutId);
  }, [isSessionPending, mergedState, pathname, remoteState, startTour, userId]);

  const actions = useMemo<OnboardingActions>(
    () => ({
      startTour,
      markTourProgress,
      markMilestone,
    }),
    [markMilestone, markTourProgress, startTour],
  );

  return (
    <OnboardingActionsContext.Provider value={actions}>
      <NextStep
        steps={onboardingTours}
        cardComponent={OnboardingCard}
        shadowRgb="15, 23, 42"
        shadowOpacity="0.28"
        overlayZIndex={90}
        disableConsoleLogs
        onStepChange={(step, tourName) => {
          if (tourName === "dashboardTour" || tourName === "canvasTour") {
            markTourProgress(tourName, "started", step);
          }
        }}
        onComplete={(tourName) => {
          if (tourName === "dashboardTour" || tourName === "canvasTour") {
            markTourProgress(tourName, "completed");
          }
        }}
        onSkip={(step, tourName) => {
          if (tourName === "dashboardTour" || tourName === "canvasTour") {
            markTourProgress(tourName, "skipped", step);
          }
        }}
      >
        {children}
        {userId ? <OnboardingHelpButton onStartTour={(tour) => startTour(tour, { manual: true })} /> : null}
      </NextStep>
    </OnboardingActionsContext.Provider>
  );
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  return (
    <NextStepProvider>
      <OnboardingRuntime>{children}</OnboardingRuntime>
    </NextStepProvider>
  );
}
