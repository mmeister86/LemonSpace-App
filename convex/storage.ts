import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Id } from "./_generated/dataModel";

type StorageUrlMap = Record<string, string | undefined>;

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
  const entries = await Promise.all(
    storageIds.map(
      async (id) => [id, (await ctx.storage.getUrl(id)) ?? undefined] as const,
    ),
  );

  return Object.fromEntries(entries) as StorageUrlMap;
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
