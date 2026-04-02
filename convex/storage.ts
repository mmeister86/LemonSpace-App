import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Id } from "./_generated/dataModel";

const STORAGE_URL_BATCH_SIZE = 12;
const PERFORMANCE_LOG_THRESHOLD_MS = 250;

function logSlowQuery(label: string, startedAt: number, details: Record<string, unknown>) {
  const durationMs = Date.now() - startedAt;
  if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
    console.warn(`[storage] ${label} slow`, {
      durationMs,
      ...details,
    });
  }
}

type StorageUrlMap = Record<string, string | undefined>;

type StorageUrlResult =
  | {
      storageId: Id<"_storage">;
      url: string | undefined;
      error: null;
    }
  | {
      storageId: Id<"_storage">;
      url: null;
      error: string;
    };

async function assertCanvasOwner(
  ctx: QueryCtx,
  canvasId: Id<"canvases">,
  userId: string,
): Promise<void> {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    throw new Error("Canvas not found");
  }
}

async function listNodesForCanvas(ctx: QueryCtx, canvasId: Id<"canvases">) {
  return await ctx.db
    .query("nodes")
    .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
    .collect();
}

function collectStorageIds(
  nodes: Array<{ data: unknown }>,
): Array<Id<"_storage">> {
  const ids = new Set<Id<"_storage">>();

  for (const node of nodes) {
    const data = node.data as Record<string, unknown> | undefined;
    const storageId = data?.storageId;
    if (typeof storageId === "string" && storageId.length > 0) {
      ids.add(storageId as Id<"_storage">);
    }
  }

  return [...ids];
}

async function resolveStorageUrls(
  ctx: QueryCtx,
  storageIds: Array<Id<"_storage">>,
): Promise<StorageUrlMap> {
  const resolved: StorageUrlMap = {};
  const operationStartedAt = Date.now();
  let failedCount = 0;
  let totalResolved = 0;

  for (let i = 0; i < storageIds.length; i += STORAGE_URL_BATCH_SIZE) {
    const batch = storageIds.slice(i, i + STORAGE_URL_BATCH_SIZE);

    const batchStartedAt = Date.now();
    let batchFailedCount = 0;

    const entries = await Promise.all(
      batch.map(async (id): Promise<StorageUrlResult> => {
        try {
          const url = await ctx.storage.getUrl(id);
          return { storageId: id, url: url ?? undefined, error: null };
        } catch (error) {
          return {
            storageId: id,
            url: null,
            error: String(error),
          };
        }
      }),
    );

    for (const entry of entries) {
      if (entry.error) {
        failedCount += 1;
        batchFailedCount += 1;
        console.warn("[storage.batchGetUrlsForCanvas] getUrl failed", {
          storageId: entry.storageId,
          error: entry.error,
        });
        continue;
      }

      const { storageId, url } = entry;
      resolved[storageId] = url ?? undefined;
      if (url) {
        totalResolved += 1;
      }
    }

    logSlowQuery("batchGetUrlsForCanvas::resolveStorageBatch", batchStartedAt, {
      batchSize: batch.length,
      successCount: entries.length - batchFailedCount,
      failedCount: batchFailedCount,
      cursor: `${i + 1}..${Math.min(i + STORAGE_URL_BATCH_SIZE, storageIds.length)} / ${storageIds.length}`,
    });
  }

  logSlowQuery("batchGetUrlsForCanvas", operationStartedAt, {
    requestStorageCount: storageIds.length,
    resolvedCount: totalResolved,
    failedCount,
  });

  return resolved;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Signierte URLs für alle Storage-Assets eines Canvas (gebündelt).
 * `nodes.list` liefert keine URLs mehr, damit Node-Liste schnell bleibt.
 */
export const batchGetUrlsForCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const user = await requireAuth(ctx);
    await assertCanvasOwner(ctx, canvasId, user.userId);

    const nodes = await listNodesForCanvas(ctx, canvasId);
    const nodeCount = nodes.length;
    const storageIds = collectStorageIds(nodes);
    const collectTimeMs = Date.now() - startedAt;
    if (collectTimeMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[storage.batchGetUrlsForCanvas] slow node scan", {
        canvasId,
        nodeCount,
        storageIdCount: storageIds.length,
        durationMs: collectTimeMs,
      });
    }

    const result = await resolveStorageUrls(ctx, storageIds);
    logSlowQuery("batchGetUrlsForCanvas::total", startedAt, {
      canvasId,
      nodeCount,
      storageIdCount: storageIds.length,
      resolvedCount: Object.keys(result).length,
    });
    return result;
  },
});
