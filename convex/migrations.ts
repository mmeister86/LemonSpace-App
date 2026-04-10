import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { backfillLegacyMediaForCanvas } from "./media";

const MEDIA_BACKFILL_DEFAULT_BATCH_SIZE = 25;
const MEDIA_BACKFILL_MIN_BATCH_SIZE = 1;
const MEDIA_BACKFILL_MAX_BATCH_SIZE = 200;

export type MediaArchiveBackfillBatchArgs = {
  cursor?: Id<"canvases">;
  batchSize?: number;
  now?: number;
};

export type MediaArchiveBackfillBatchResult = {
  processedCanvasCount: number;
  scannedNodeCount: number;
  upsertedItemCount: number;
  nextCursor: Id<"canvases"> | null;
  done: boolean;
};

function normalizeBatchSize(batchSize: number | undefined): number {
  if (typeof batchSize !== "number" || !Number.isFinite(batchSize)) {
    return MEDIA_BACKFILL_DEFAULT_BATCH_SIZE;
  }

  return Math.min(
    MEDIA_BACKFILL_MAX_BATCH_SIZE,
    Math.max(MEDIA_BACKFILL_MIN_BATCH_SIZE, Math.floor(batchSize)),
  );
}

function computeStartIndex(
  canvasIds: Array<Id<"canvases">>,
  cursor: Id<"canvases"> | undefined,
): number {
  if (!cursor) {
    return 0;
  }

  const exactCursorIndex = canvasIds.findIndex((canvasId) => canvasId === cursor);
  if (exactCursorIndex >= 0) {
    return exactCursorIndex + 1;
  }

  const fallbackIndex = canvasIds.findIndex((canvasId) => canvasId > cursor);
  return fallbackIndex >= 0 ? fallbackIndex : canvasIds.length;
}

export async function backfillMediaArchiveBatch(
  ctx: MutationCtx,
  { cursor, batchSize, now = Date.now() }: MediaArchiveBackfillBatchArgs,
): Promise<MediaArchiveBackfillBatchResult> {
  const normalizedBatchSize = normalizeBatchSize(batchSize);
  const canvases = await ctx.db.query("canvases").order("asc").collect();
  const canvasIds = canvases.map((canvas) => canvas._id);

  const startIndex = computeStartIndex(canvasIds, cursor);
  const batch = canvases.slice(startIndex, startIndex + normalizedBatchSize);

  let scannedNodeCount = 0;
  let upsertedItemCount = 0;

  for (const canvas of batch) {
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvas._id))
      .collect();

    const canvasResult = await backfillLegacyMediaForCanvas(ctx, {
      canvas: {
        _id: canvas._id,
        ownerId: canvas.ownerId,
      },
      nodes,
      now,
    });

    scannedNodeCount += canvasResult.scannedNodeCount;
    upsertedItemCount += canvasResult.upsertedItemCount;
  }

  const processedCanvasCount = batch.length;
  const done = startIndex + processedCanvasCount >= canvases.length;
  const nextCursor =
    processedCanvasCount > 0 ? batch[processedCanvasCount - 1]._id : (cursor ?? null);

  return {
    processedCanvasCount,
    scannedNodeCount,
    upsertedItemCount,
    nextCursor,
    done,
  };
}

export const backfillMediaArchiveBatchInternal = internalMutation({
  args: {
    cursor: v.optional(v.id("canvases")),
    batchSize: v.optional(v.number()),
    now: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await backfillMediaArchiveBatch(ctx, args);
  },
});
