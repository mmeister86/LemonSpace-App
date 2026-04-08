import { describe, expect, it } from "vitest";

import {
  buildCreditsActivitySeries,
  calculateUsageActivityDomain,
  formatCredits,
  prioritizeRecentCreditTransactions,
} from "@/lib/credits-activity";

type TestTransaction = {
  _id: string;
  _creationTime: number;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  description: string;
};

describe("credits activity helpers", () => {
  it("formats credits as Cr label", () => {
    expect(formatCredits(1234, "de-DE")).toBe("1.234 Cr");
  });

  it("prioritizes usage events ahead of non-usage items", () => {
    const now = Date.UTC(2026, 3, 8, 10, 0, 0);
    const tx: TestTransaction[] = [
      {
        _id: "topup-1",
        _creationTime: now,
        amount: 500,
        type: "topup",
        status: "committed",
        description: "Top-up",
      },
      {
        _id: "usage-1",
        _creationTime: now - 60_000,
        amount: -52,
        type: "usage",
        status: "committed",
        description: "Image generation",
      },
      {
        _id: "reservation-1",
        _creationTime: now - 120_000,
        amount: -52,
        type: "reservation",
        status: "reserved",
        description: "Video reservation",
      },
    ];

    const result = prioritizeRecentCreditTransactions(tx, 3);

    expect(result.map((item) => item._id)).toEqual([
      "usage-1",
      "reservation-1",
      "topup-1",
    ]);
  });

  it("builds a daily activity series with usage and available line", () => {
    const dayA = Date.UTC(2026, 3, 6, 8, 0, 0);
    const dayB = Date.UTC(2026, 3, 7, 10, 0, 0);

    const tx: TestTransaction[] = [
      {
        _id: "usage-a",
        _creationTime: dayA,
        amount: -40,
        type: "usage",
        status: "committed",
        description: "Image",
      },
      {
        _id: "reservation-b",
        _creationTime: dayB,
        amount: -30,
        type: "reservation",
        status: "reserved",
        description: "Video queued",
      },
      {
        _id: "usage-b",
        _creationTime: dayB + 1_000,
        amount: -60,
        type: "usage",
        status: "committed",
        description: "Video done",
      },
    ];

    const result = buildCreditsActivitySeries(tx, 320, "de-DE", 2);

    expect(result).toEqual([
      {
        day: "06. Apr",
        usage: 40,
        activity: 40,
        available: 320,
      },
      {
        day: "07. Apr",
        usage: 60,
        activity: 90,
        available: 320,
      },
    ]);
  });

  it("calculates a zoomed domain for low usage/activity values", () => {
    const domain = calculateUsageActivityDomain([
      {
        day: "06. Apr",
        usage: 4,
        activity: 4,
        available: 1200,
      },
      {
        day: "07. Apr",
        usage: 20,
        activity: 20,
        available: 1200,
      },
    ]);

    expect(domain).toEqual([0, 24]);
  });
});
