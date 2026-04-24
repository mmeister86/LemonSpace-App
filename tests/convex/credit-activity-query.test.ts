import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/convex/helpers", () => ({
  requireAuth: vi.fn(),
  optionalAuth: vi.fn(),
}));

import { listActivity } from "@/convex/credits";
import { optionalAuth } from "@/convex/helpers";

type MockCreditTransaction = {
  _id: string;
  _creationTime: number;
  userId: string;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  description: string;
  model?: string;
  videoMeta?: {
    model: string;
    durationSeconds: number;
    hasAudio: boolean;
  };
};

type ListActivityArgs = {
  page: number;
  pageSize?: number;
  dateRange: "all" | "7d" | "30d" | "month" | "custom";
  startDate?: string;
  endDate?: string;
  model?: string;
  sortBy: "date" | "amount" | "model";
  sortDirection: "asc" | "desc";
};

function createListActivityCtx(transactions: MockCreditTransaction[]) {
  return {
    db: {
      query: vi.fn((table: string) => {
        expect(table).toBe("creditTransactions");

        return {
          withIndex: vi.fn(
            (
              index: "by_user",
              apply: (q: { eq: (field: string, value: unknown) => unknown }) => unknown,
            ) => {
              expect(index).toBe("by_user");

              const clauses: Array<{ field: string; value: unknown }> = [];
              const queryBuilder = {
                eq(field: string, value: unknown) {
                  clauses.push({ field, value });
                  return this;
                },
              };

              apply(queryBuilder);
              const ownerId = clauses.find((clause) => clause.field === "userId")?.value;
              const filtered = transactions
                .filter((transaction) => transaction.userId === ownerId)
                .sort((left, right) => right._creationTime - left._creationTime);

              return {
                order: vi.fn((direction: "desc") => {
                  expect(direction).toBe("desc");
                  return {
                    collect: vi.fn(async () => filtered),
                  };
                }),
              };
            },
          ),
        };
      }),
    },
  };
}

async function runListActivity(
  ctx: unknown,
  args: ListActivityArgs,
) {
  return await (listActivity as unknown as {
    _handler: (ctx: unknown, args: ListActivityArgs) => Promise<unknown>;
  })._handler(ctx, args);
}

describe("credits.listActivity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty paginated response without auth", async () => {
    vi.mocked(optionalAuth).mockResolvedValue(null);

    const result = await runListActivity(createListActivityCtx([]), {
      page: 1,
      dateRange: "all",
      sortBy: "date",
      sortDirection: "desc",
    });

    expect(result).toMatchObject({
      items: [],
      page: 1,
      pageSize: 25,
      totalPages: 0,
      totalCount: 0,
      modelOptions: [],
      summary: {
        netCredits: 0,
        usageCredits: 0,
        entryCount: 0,
      },
    });
  });

  it("filters by custom date range and model, then sorts by absolute amount", async () => {
    vi.mocked(optionalAuth).mockResolvedValue({ userId: "user_1" } as never);

    const transactions: MockCreditTransaction[] = [
      {
        _id: "tx_old",
        _creationTime: Date.UTC(2026, 3, 1, 10),
        userId: "user_1",
        amount: -99,
        type: "usage",
        status: "committed",
        description: "Old usage",
        model: "gpt-5.4-mini",
      },
      {
        _id: "tx_a",
        _creationTime: Date.UTC(2026, 3, 9, 10),
        userId: "user_1",
        amount: -15,
        type: "usage",
        status: "committed",
        description: "Text usage",
        model: "gpt-5.4-mini",
      },
      {
        _id: "tx_b",
        _creationTime: Date.UTC(2026, 3, 10, 11),
        userId: "user_1",
        amount: -38,
        type: "usage",
        status: "committed",
        description: "Text usage",
        model: "gpt-5.4-mini",
      },
      {
        _id: "tx_c",
        _creationTime: Date.UTC(2026, 3, 10, 12),
        userId: "user_1",
        amount: -4,
        type: "usage",
        status: "committed",
        description: "Image usage",
        model: "gemini-2.5-flash",
      },
      {
        _id: "tx_other_user",
        _creationTime: Date.UTC(2026, 3, 10, 13),
        userId: "user_2",
        amount: -500,
        type: "usage",
        status: "committed",
        description: "Other user",
        model: "gpt-5.4-mini",
      },
    ];

    const result = await runListActivity(createListActivityCtx(transactions), {
      page: 1,
      pageSize: 10,
      dateRange: "custom",
      startDate: "2026-04-09",
      endDate: "2026-04-10",
      model: "gpt-5.4-mini",
      sortBy: "amount",
      sortDirection: "desc",
    });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 10,
      totalPages: 1,
      totalCount: 2,
      modelOptions: ["gemini-2.5-flash", "gpt-5.4-mini"],
      summary: {
        netCredits: -53,
        usageCredits: 53,
        entryCount: 2,
      },
    });
    expect((result as { items: MockCreditTransaction[] }).items.map((item) => item._id)).toEqual([
      "tx_b",
      "tx_a",
    ]);
  });

  it("paginates sorted activity rows", async () => {
    vi.mocked(optionalAuth).mockResolvedValue({ userId: "user_1" } as never);

    const transactions: MockCreditTransaction[] = Array.from({ length: 12 }, (_, index) => ({
      _id: `tx_${index + 1}`,
      _creationTime: Date.UTC(2026, 3, 1, 10 + index),
      userId: "user_1",
      amount: -(index + 1),
      type: "usage",
      status: "committed",
      description: `Usage ${index + 1}`,
      model: "gpt-5.4-mini",
    }));

    const result = await runListActivity(createListActivityCtx(transactions), {
      page: 2,
      pageSize: 5,
      dateRange: "all",
      sortBy: "date",
      sortDirection: "desc",
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 5,
      totalPages: 3,
      totalCount: 12,
    });
    expect((result as { items: MockCreditTransaction[] }).items.map((item) => item._id)).toEqual([
      "tx_7",
      "tx_6",
      "tx_5",
      "tx_4",
      "tx_3",
    ]);
  });
});
