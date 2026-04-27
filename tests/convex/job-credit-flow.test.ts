import { describe, expect, it } from "vitest";

import {
  decrementConcurrencyIfNeeded,
  releaseInternalReservationBestEffort,
  releasePublicReservationBestEffort,
  startPublicJobCreditFlow,
} from "@/convex/job_credit_flow";

describe("job credit flow helpers", () => {
  function ctxWithRunMutation(resultByCall: unknown[] = []) {
    const calls: Array<{ args: unknown }> = [];
    return {
      ctx: {
        runMutation: async (_ref: unknown, args: unknown) => {
          calls.push({ args });
          return resultByCall[calls.length - 1];
        },
      } as never,
      calls,
    };
  }

  it("reserves credits when internal credit accounting is enabled", async () => {
    const { ctx, calls } = ctxWithRunMutation([null, "reservation-1"]);

    await expect(
      startPublicJobCreditFlow(ctx, {
        internalCreditsEnabled: true,
        estimatedCost: 12,
        description: "Test job",
        model: "model-1",
        nodeId: "node-1" as never,
        canvasId: "canvas-1" as never,
        provider: "openrouter",
      }),
    ).resolves.toEqual({
      reservationId: "reservation-1",
      shouldDecrementConcurrency: false,
    });

    expect(calls.map((call) => call.args)).toEqual([
      {},
      {
        estimatedCost: 12,
        description: "Test job",
        model: "model-1",
        nodeId: "node-1",
        canvasId: "canvas-1",
        provider: "openrouter",
      },
    ]);
  });

  it("increments usage and marks concurrency cleanup when reservations are disabled", async () => {
    const { ctx, calls } = ctxWithRunMutation();

    await expect(
      startPublicJobCreditFlow(ctx, {
        internalCreditsEnabled: false,
        estimatedCost: 7,
        description: "Legacy job",
        model: "model-2",
        nodeId: "node-2" as never,
        canvasId: "canvas-2" as never,
        provider: "freepik",
      }),
    ).resolves.toEqual({
      reservationId: null,
      shouldDecrementConcurrency: true,
    });

    expect(calls.map((call) => call.args)).toEqual([{}, {}]);
  });

  it("keeps reservation release best-effort and decrements only when requested", async () => {
    const publicCalls: unknown[] = [];
    const internalCalls: unknown[] = [];
    const ctx = {
      runMutation: async (_ref: unknown, args: unknown) => {
        publicCalls.push(args);
        throw new Error("release failed");
      },
    } as never;
    const internalCtx = {
      runMutation: async (_ref: unknown, args: unknown) => {
        internalCalls.push(args);
      },
    } as never;

    await expect(
      releasePublicReservationBestEffort(ctx, "public-reservation" as never),
    ).resolves.toBeUndefined();
    await expect(
      releaseInternalReservationBestEffort(internalCtx, "internal-reservation" as never),
    ).resolves.toBeUndefined();
    await decrementConcurrencyIfNeeded(internalCtx, false, "user-1");
    await decrementConcurrencyIfNeeded(internalCtx, true, "user-1");

    expect(publicCalls).toEqual([{ transactionId: "public-reservation" }]);
    expect(internalCalls).toEqual([
      { transactionId: "internal-reservation" },
      { userId: "user-1" },
    ]);
  });
});
