// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  ONBOARDING_PENDING_CANVAS_TOUR_KEY,
  mergeOnboardingState,
  readPendingCanvasTour,
  writePendingCanvasTour,
  type OnboardingState,
} from "@/lib/onboarding/storage";

function installLocalStorageMock() {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        entries.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        entries.delete(key);
      }),
      clear: vi.fn(() => {
        entries.clear();
      }),
    },
  });
}

describe("onboarding storage", () => {
  it("keeps completed Convex tour state over local pending state", () => {
    const convex: OnboardingState = {
      dashboardTour: {
        status: "completed",
        lastStep: 3,
        startedAt: 10,
        completedAt: 20,
      },
    };
    const local: OnboardingState = {
      dashboardTour: {
        status: "started",
        lastStep: 1,
        startedAt: 30,
      },
    };

    expect(mergeOnboardingState(convex, local).dashboardTour).toEqual(convex.dashboardTour);
  });

  it("uses local pending values until Convex has a status for the tour", () => {
    const local: OnboardingState = {
      canvasTour: {
        status: "started",
        lastStep: 2,
        startedAt: 100,
      },
    };

    expect(mergeOnboardingState(null, local).canvasTour).toEqual(local.canvasTour);
  });

  it("round-trips the pending canvas tour handoff", () => {
    installLocalStorageMock();

    writePendingCanvasTour({ canvasId: "canvas-1", createdAt: 123 });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      ONBOARDING_PENDING_CANVAS_TOUR_KEY,
      JSON.stringify({ canvasId: "canvas-1", createdAt: 123 }),
    );
    expect(readPendingCanvasTour()).toEqual({ canvasId: "canvas-1", createdAt: 123 });
  });
});
