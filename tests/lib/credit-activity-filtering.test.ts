import { describe, expect, it } from "vitest";

import {
  buildCreditActivityViewModel,
  getCreditActivityDateBounds,
  parseCreditActivityDateInput,
} from "@/lib/credit-activity-filtering";

type TestActivityItem = {
  _id: string;
  _creationTime: number;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  description: string;
  model?: string;
  videoMeta?: { model?: string };
};

const NOW = Date.UTC(2026, 3, 28, 12, 0, 0);

function item(overrides: Partial<TestActivityItem> & Pick<TestActivityItem, "_id" | "_creationTime" | "amount">): TestActivityItem {
  return {
    type: "usage",
    status: "committed",
    description: overrides._id,
    ...overrides,
  };
}

describe("credit activity filtering helpers", () => {
  it("parses date inputs at UTC day bounds and rejects invalid values", () => {
    expect(parseCreditActivityDateInput("2026-04-08", false)).toBe(Date.UTC(2026, 3, 8, 0, 0, 0, 0));
    expect(parseCreditActivityDateInput("2026-04-08", true)).toBe(Date.UTC(2026, 3, 8, 23, 59, 59, 999));
    expect(parseCreditActivityDateInput("", false)).toBeNull();
    expect(parseCreditActivityDateInput("not-a-date", false)).toBeNull();
  });

  it("builds preset and custom date bounds from an injected clock", () => {
    expect(getCreditActivityDateBounds({ dateRange: "7d", nowMs: NOW })).toEqual({
      startMs: NOW - 7 * 24 * 60 * 60 * 1000,
      endMs: null,
    });
    expect(getCreditActivityDateBounds({ dateRange: "month", nowMs: NOW })).toEqual({
      startMs: Date.UTC(2026, 3, 1),
      endMs: null,
    });
    expect(
      getCreditActivityDateBounds({
        dateRange: "custom",
        startDate: "2026-04-05",
        endDate: "2026-04-08",
        nowMs: NOW,
      }),
    ).toEqual({
      startMs: Date.UTC(2026, 3, 5, 0, 0, 0, 0),
      endMs: Date.UTC(2026, 3, 8, 23, 59, 59, 999),
    });
  });

  it("filters by bounds and model, sorts by absolute amount, paginates, and summarizes", () => {
    const items = [
      item({ _id: "before-range", _creationTime: Date.UTC(2026, 3, 1), amount: -200, model: "Imagen" }),
      item({ _id: "usage-small", _creationTime: Date.UTC(2026, 3, 6), amount: -10, model: "Imagen" }),
      item({ _id: "topup", _creationTime: Date.UTC(2026, 3, 7), amount: 50, type: "topup", model: "Imagen" }),
      item({ _id: "usage-large", _creationTime: Date.UTC(2026, 3, 8), amount: -75, model: "Imagen" }),
      item({ _id: "other-model", _creationTime: Date.UTC(2026, 3, 8), amount: -99, model: "Kling" }),
    ];

    const result = buildCreditActivityViewModel({
      items,
      dateRange: "custom",
      startDate: "2026-04-05",
      endDate: "2026-04-08",
      selectedModel: "Imagen",
      sortValue: "amount-desc",
      page: 2,
      pageSize: 2,
      nowMs: NOW,
      locale: "de",
    });

    expect(result.modelOptions).toEqual(["Imagen", "Kling"]);
    expect(result.items.map((entry) => entry._id)).toEqual(["usage-small"]);
    expect(result.page).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.summary).toEqual({
      netCredits: -35,
      usageCredits: 85,
      entryCount: 3,
    });
  });

  it("uses video metadata as model fallback and clamps out-of-range pages", () => {
    const items = [
      item({ _id: "video", _creationTime: Date.UTC(2026, 3, 8), amount: -52, videoMeta: { model: "WAN" } }),
    ];

    const result = buildCreditActivityViewModel({
      items,
      dateRange: "all",
      selectedModel: "WAN",
      sortValue: "date-desc",
      page: 5,
      pageSize: 25,
      nowMs: NOW,
      locale: "de",
    });

    expect(result.items.map((entry) => entry._id)).toEqual(["video"]);
    expect(result.modelOptions).toEqual(["WAN"]);
    expect(result.page).toBe(1);
  });
});
