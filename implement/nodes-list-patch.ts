/**
 * PATCH für convex/nodes.ts
 *
 * Ersetze die bestehende `list` Query mit dieser Version.
 * Der einzige Unterschied: Für Nodes mit einem `storageId` im data-Objekt
 * wird die Storage-URL aufgelöst und als `data.url` zurückgegeben.
 */

export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, canvasId, user.userId);

    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();

    // Storage-URLs für Nodes mit storageId auflösen
    return Promise.all(
      nodes.map(async (node) => {
        const data = node.data as Record<string, unknown> | undefined;
        if (data?.storageId) {
          const url = await ctx.storage.getUrl(
            data.storageId as Id<"_storage">
          );
          return {
            ...node,
            data: { ...data, url: url ?? undefined },
          };
        }
        return node;
      })
    );
  },
});
