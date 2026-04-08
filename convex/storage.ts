import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
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
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: string,
): Promise<void> {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    throw new Error("Canvas not found");
  }
}

async function resolveStorageUrls(
  ctx: QueryCtx | MutationCtx,
  storageIds: Array<Id<"_storage">>,
  options?: { logLabel?: string },
): Promise<StorageUrlMap> {
  const logLabel = options?.logLabel ?? "batchGetUrlsForCanvas";
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
        console.warn(`[storage.${logLabel}] getUrl failed`, {
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

    logSlowQuery(`${logLabel}::resolveStorageBatch`, batchStartedAt, {
      batchSize: batch.length,
      successCount: entries.length - batchFailedCount,
      failedCount: batchFailedCount,
      cursor: `${i + 1}..${Math.min(i + STORAGE_URL_BATCH_SIZE, storageIds.length)} / ${storageIds.length}`,
    });
  }

  logSlowQuery(logLabel, operationStartedAt, {
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
export const batchGetUrlsForCanvas = mutation({
  args: {
    canvasId: v.id("canvases"),
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, { canvasId, storageIds }) => {
    const startedAt = Date.now();
    const user = await requireAuth(ctx);
    await assertCanvasOwner(ctx, canvasId, user.userId);

    const uniqueSortedStorageIds = [...new Set(storageIds)].sort();
    if (uniqueSortedStorageIds.length === 0) {
      return {};
    }

    const nodes = await listNodesForCanvas(ctx, canvasId);
    const allowedStorageIds = new Set(collectStorageIds(nodes));
    const verifiedStorageIds = uniqueSortedStorageIds.filter((storageId) =>
      allowedStorageIds.has(storageId),
    );
    const rejectedStorageIds = uniqueSortedStorageIds.length - verifiedStorageIds.length;
    if (rejectedStorageIds > 0) {
      console.warn("[storage.batchGetUrlsForCanvas] rejected unowned storage ids", {
        canvasId,
        requestedCount: uniqueSortedStorageIds.length,
        rejectedStorageIds,
      });
    }

    const result = await resolveStorageUrls(ctx, verifiedStorageIds, {
      logLabel: "batchGetUrlsForCanvas",
    });
    logSlowQuery("batchGetUrlsForCanvas::total", startedAt, {
      canvasId,
      storageIdCount: verifiedStorageIds.length,
      rejectedStorageIds,
      resolvedCount: Object.keys(result).length,
    });
    return result;
  },
});

export const batchGetUrlsForUserMedia = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, { storageIds }) => {
    const startedAt = Date.now();
    const user = await requireAuth(ctx);

    const uniqueSortedStorageIds = [...new Set(storageIds)].sort();
    if (uniqueSortedStorageIds.length === 0) {
      return {};
    }

    const ownedStorageIds = await collectOwnedImageStorageIdsForUser(ctx, user.userId);
    const verifiedStorageIds = uniqueSortedStorageIds.filter((storageId) =>
      ownedStorageIds.has(storageId),
    );
    const rejectedStorageIds = uniqueSortedStorageIds.length - verifiedStorageIds.length;
    if (rejectedStorageIds > 0) {
      console.warn("[storage.batchGetUrlsForUserMedia] rejected unowned storage ids", {
        userId: user.userId,
        requestedCount: uniqueSortedStorageIds.length,
        rejectedStorageIds,
      });
    }

    const result = await resolveStorageUrls(ctx, verifiedStorageIds, {
      logLabel: "batchGetUrlsForUserMedia",
    });
    logSlowQuery("batchGetUrlsForUserMedia::total", startedAt, {
      userId: user.userId,
      storageIdCount: verifiedStorageIds.length,
      rejectedStorageIds,
      resolvedCount: Object.keys(result).length,
    });

    return result;
  },
});

export const registerUploadedImageMedia = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.optional(v.id("nodes")),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await assertCanvasOwner(ctx, args.canvasId, user.userId);

    if (args.nodeId) {
      const node = await ctx.db.get(args.nodeId);
      if (!node) {
        console.warn("[storage.registerUploadedImageMedia] node not found", {
          userId: user.userId,
          canvasId: args.canvasId,
          nodeId: args.nodeId,
          storageId: args.storageId,
        });
      } else if (node.canvasId !== args.canvasId) {
        console.warn("[storage.registerUploadedImageMedia] node/canvas mismatch", {
          userId: user.userId,
          canvasId: args.canvasId,
          nodeId: args.nodeId,
          nodeCanvasId: node.canvasId,
          storageId: args.storageId,
        });
      }
    }

    console.info("[storage.registerUploadedImageMedia] acknowledged", {
      userId: user.userId,
      canvasId: args.canvasId,
      nodeId: args.nodeId,
      storageId: args.storageId,
      filename: args.filename,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
    });

    return { ok: true as const };
  },
});

async function listNodesForCanvas(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
) {
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
    const previewStorageId = data?.previewStorageId;
    if (typeof storageId === "string" && storageId.length > 0) {
      ids.add(storageId as Id<"_storage">);
    }
    if (typeof previewStorageId === "string" && previewStorageId.length > 0) {
      ids.add(previewStorageId as Id<"_storage">);
    }
  }

  return [...ids];
}

async function collectOwnedImageStorageIdsForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Set<Id<"_storage">>> {
  const canvases = await ctx.db
    .query("canvases")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .collect();
  if (canvases.length === 0) {
    return new Set();
  }

  const imageNodesByCanvas = await Promise.all(
    canvases.map((canvas) =>
      ctx.db
        .query("nodes")
        .withIndex("by_canvas_type", (q) => q.eq("canvasId", canvas._id).eq("type", "image"))
        .collect(),
    ),
  );

  const imageStorageIds = new Set<Id<"_storage">>();
  for (const nodes of imageNodesByCanvas) {
    for (const node of nodes) {
      const data = node.data as Record<string, unknown> | undefined;
      const storageId = data?.storageId;
      const previewStorageId = data?.previewStorageId;
      if (typeof storageId === "string" && storageId.length > 0) {
        imageStorageIds.add(storageId as Id<"_storage">);
      }
      if (typeof previewStorageId === "string" && previewStorageId.length > 0) {
        imageStorageIds.add(previewStorageId as Id<"_storage">);
      }
    }
  }

  return imageStorageIds;
}
