/**
 * Onboarding note:
 * Convex backend module for job credit flow. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

type JobCreditActionCtx = Pick<ActionCtx, "runMutation">;

type JobCreditProvider = "openrouter" | "freepik";

type StartPublicJobCreditFlowArgs = {
  internalCreditsEnabled?: boolean;
  estimatedCost: number;
  description: string;
  model?: string;
  nodeId?: Id<"nodes">;
  canvasId?: Id<"canvases">;
  provider?: JobCreditProvider;
  videoMeta?: {
    model: string;
    durationSeconds: number;
    hasAudio: boolean;
  };
};

export function areInternalCreditsEnabled(): boolean {
  return process.env.INTERNAL_CREDITS_ENABLED === "true";
}

export async function startPublicJobCreditFlow(
  ctx: JobCreditActionCtx,
  args: StartPublicJobCreditFlowArgs,
): Promise<{
  reservationId: Id<"creditTransactions"> | null;
  shouldDecrementConcurrency: boolean;
}> {
  await ctx.runMutation(internal.credits.checkAbuseLimits, {});

  const internalCreditsEnabled =
    args.internalCreditsEnabled ?? areInternalCreditsEnabled();
  if (internalCreditsEnabled) {
    const reserveArgs: {
      estimatedCost: number;
      description: string;
      model?: string;
      nodeId?: Id<"nodes">;
      canvasId?: Id<"canvases">;
      provider?: JobCreditProvider;
      videoMeta?: StartPublicJobCreditFlowArgs["videoMeta"];
    } = {
      estimatedCost: args.estimatedCost,
      description: args.description,
    };
    if (args.model !== undefined) reserveArgs.model = args.model;
    if (args.nodeId !== undefined) reserveArgs.nodeId = args.nodeId;
    if (args.canvasId !== undefined) reserveArgs.canvasId = args.canvasId;
    if (args.provider !== undefined) reserveArgs.provider = args.provider;
    if (args.videoMeta !== undefined) reserveArgs.videoMeta = args.videoMeta;

    const reservationId = await ctx.runMutation(api.credits.reserve, reserveArgs);
    return {
      reservationId,
      shouldDecrementConcurrency: false,
    };
  }

  await ctx.runMutation(internal.credits.incrementUsage, {});
  return {
    reservationId: null,
    shouldDecrementConcurrency: true,
  };
}

export async function releasePublicReservationBestEffort(
  ctx: JobCreditActionCtx,
  reservationId: Id<"creditTransactions"> | null | undefined,
  logLabel = "job_credit_flow",
): Promise<void> {
  if (!reservationId) return;
  try {
    await ctx.runMutation(api.credits.release, { transactionId: reservationId });
  } catch (error) {
    console.warn(`[${logLabel}] failed to release public reservation`, {
      reservationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function releaseInternalReservationBestEffort(
  ctx: JobCreditActionCtx,
  reservationId: Id<"creditTransactions"> | null | undefined,
  logLabel = "job_credit_flow",
): Promise<void> {
  if (!reservationId) return;
  try {
    await ctx.runMutation(internal.credits.releaseInternal, {
      transactionId: reservationId,
    });
  } catch (error) {
    console.warn(`[${logLabel}] failed to release internal reservation`, {
      reservationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function commitInternalReservationIfNeeded(
  ctx: JobCreditActionCtx,
  reservationId: Id<"creditTransactions"> | null | undefined,
  actualCost: number,
  openRouterCost?: number,
): Promise<void> {
  if (!reservationId) return;
  await ctx.runMutation(internal.credits.commitInternal, {
    transactionId: reservationId,
    actualCost,
    openRouterCost,
  });
}

export async function decrementConcurrencyIfNeeded(
  ctx: JobCreditActionCtx,
  shouldDecrementConcurrency: boolean,
  userId?: string,
): Promise<void> {
  if (!shouldDecrementConcurrency) return;
  await ctx.runMutation(internal.credits.decrementConcurrency, { userId });
}
