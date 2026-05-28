// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  startNextStep: vi.fn(),
  markTourProgress: vi.fn(async () => undefined),
  onboardingState: null as unknown,
  session: { user: { id: "user-1" } },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("nextstepjs", () => ({
  NextStepProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NextStep: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNextStep: () => ({
    startNextStep: mocks.startNextStep,
    closeNextStep: vi.fn(),
    currentTour: null,
    currentStep: 0,
    setCurrentStep: vi.fn(),
    isNextStepVisible: false,
  }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.onboardingState,
  useMutation: () => mocks.markTourProgress,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    onboarding: {
      getState: "onboarding.getState",
      markTourProgress: "onboarding.markTourProgress",
      markMilestone: "onboarding.markMilestone",
    },
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: mocks.session, isPending: false }),
  },
}));

import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("OnboardingProvider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.pathname = "/dashboard";
    mocks.startNextStep.mockClear();
    mocks.markTourProgress.mockClear();
    mocks.onboardingState = null;
    mocks.session = { user: { id: "user-1" } };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    vi.useRealTimers();
  });

  it("auto-starts the dashboard tour for an incomplete user", async () => {
    await act(async () => {
      root?.render(
        <OnboardingProvider>
          <div />
        </OnboardingProvider>,
      );
    });
    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(mocks.startNextStep).toHaveBeenCalledWith("dashboardTour");
    expect(mocks.markTourProgress).toHaveBeenCalledWith({
      tour: "dashboardTour",
      status: "started",
      lastStep: 0,
    });
  });

  it("does not auto-start a completed dashboard tour", async () => {
    mocks.onboardingState = {
      dashboardTour: {
        status: "completed",
        lastStep: 3,
        startedAt: 1,
        completedAt: 2,
      },
    };

    await act(async () => {
      root?.render(
        <OnboardingProvider>
          <div />
        </OnboardingProvider>,
      );
    });

    expect(mocks.startNextStep).not.toHaveBeenCalled();
  });
});
