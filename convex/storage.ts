import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Id } from "./_generated/dataModel";

const STORAGE_URL_BATCH_SIZE = 12;

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

  for (let i = 0; i < storageIds.length; i += STORAGE_URL_BATCH_SIZE) {
    const batch = storageIds.slice(i, i + STORAGE_URL_BATCH_SIZE);

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
        console.warn("[storage.batchGetUrlsForCanvas] getUrl failed", {
          storageId: entry.storageId,
          error: entry.error,
        });
        continue;
      }

      const { storageId, url } = entry;
      resolved[storageId] = url ?? undefined;
    }
  }

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
    const user = await requireAuth(ctx);
    await assertCanvasOwner(ctx, canvasId, user.userId);

    const nodes = await listNodesForCanvas(ctx, canvasId);
    const storageIds = collectStorageIds(nodes);

    return await resolveStorageUrls(ctx, storageIds);
  },
});
