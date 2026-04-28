import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
}));

import { creditTransitionHelpersForTesting } from "@/convex/credits";

describe("credit transition helpers", () => {
  it("computes available credits from balance and reservations", () => {
    expect(
      creditTransitionHelpersForTesting.getAvailableCredits({
        balance: 120,
        reserved: 45,
      }),
    ).toBe(75);
  });

  it("builds balance patches for reserve, commit, and release transitions", () => {
    const now = Date.UTC(2026, 3, 28, 9);

    expect(
      creditTransitionHelpersForTesting.getReservedBalancePatch(
        { reserved: 20 },
        15,
        now,
      ),
    ).toEqual({ reserved: 35, updatedAt: now });
    expect(
      creditTransitionHelpersForTesting.getCommittedBalancePatch(
        { balance: 200, reserved: 30 },
        { estimatedCost: 30, actualCost: 22, now },
      ),
    ).toEqual({ balance: 178, reserved: 0, updatedAt: now });
    expect(
      creditTransitionHelpersForTesting.getReleasedBalancePatch(
        { reserved: 10 },
        30,
        now,
      ),
    ).toEqual({ reserved: 0, updatedAt: now });
  });

  it("builds daily usage transitions without decrementing generation count", () => {
    expect(
      creditTransitionHelpersForTesting.getIncrementedDailyUsagePatch({
        generationCount: 4,
        concurrentJobs: 1,
      }),
    ).toEqual({ generationCount: 5, concurrentJobs: 2 });
    expect(
      creditTransitionHelpersForTesting.getDecrementedConcurrencyPatch({
        generationCount: 5,
        concurrentJobs: 2,
      }),
    ).toEqual({ concurrentJobs: 1 });
    expect(
      creditTransitionHelpersForTesting.getDecrementedConcurrencyPatch({
        generationCount: 5,
        concurrentJobs: 0,
      }),
    ).toBeNull();
  });
});
