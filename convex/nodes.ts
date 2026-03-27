import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./helpers";
import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Interne Helpers
// ============================================================================

/**
 * Prüft ob der User Zugriff auf den Canvas hat und gibt ihn zurück.
 */
async function getCanvasOrThrow(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: string
) {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    throw new Error("Canvas not found");
  }
  return canvas;
}

async function getCanvasIfAuthorized(
  ctx: QueryCtx | MutationCtx,
  canvasId: Id<"canvases">,
  userId: string
) {
  const canvas = await ctx.db.get(canvasId);
  if (!canvas || canvas.ownerId !== userId) {
    return null;
  }
  return canvas;
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Alle Nodes eines Canvas laden.
 */
export const list = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, canvasId, user.userId);

    return await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

/**
 * Einzelnen Node laden.
 */
export const get = query({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return null;

    const canvas = await getCanvasIfAuthorized(ctx, node.canvasId, user.userId);
    if (!canvas) {
      return null;
    }

    const data = node.data as Record<string, unknown> | undefined;
    if (!data?.storageId) {
      return node;
    }

    const url = await ctx.storage.getUrl(data.storageId as Id<"_storage">);

    return {
      ...node,
      data: {
        ...data,
        url: url ?? undefined,
      },
    };
  },
});

/**
 * Nodes nach Typ filtern (z.B. alle ai-image Nodes eines Canvas).
 */
export const listByType = query({
  args: {
    canvasId: v.id("canvases"),
    type: v.string(),
  },
  handler: async (ctx, { canvasId, type }) => {
    const user = await requireAuth(ctx);
    const canvas = await getCanvasIfAuthorized(ctx, canvasId, user.userId);
    if (!canvas) {
      return [];
    }

    return await ctx.db
      .query("nodes")
      .withIndex("by_canvas_type", (q) =>
        q.eq("canvasId", canvasId).eq("type", type as Doc<"nodes">["type"])
      )
      .collect();
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Neuen Node auf dem Canvas erstellen.
 */
export const create = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: v.string(),
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    /** Client-only correlation for optimistic UI (not persisted). */
    clientRequestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    void args.clientRequestId;

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    // Canvas updatedAt aktualisieren
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    return nodeId;
  },
});

/**
 * Neuen Node erzeugen und eine bestehende Kante in zwei Kanten aufteilen (ein Roundtrip).
 */
export const createWithEdgeSplit = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: v.string(),
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    splitEdgeId: v.id("edges"),
    newNodeTargetHandle: v.optional(v.string()),
    newNodeSourceHandle: v.optional(v.string()),
    splitSourceHandle: v.optional(v.string()),
    splitTargetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);

    const edge = await ctx.db.get(args.splitEdgeId);
    if (!edge || edge.canvasId !== args.canvasId) {
      throw new Error("Edge not found");
    }

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: nodeId,
      sourceHandle: args.splitSourceHandle,
      targetHandle: args.newNodeTargetHandle,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: nodeId,
      targetNodeId: edge.targetNodeId,
      sourceHandle: args.newNodeSourceHandle,
      targetHandle: args.splitTargetHandle,
    });

    await ctx.db.delete(args.splitEdgeId);
    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    return nodeId;
  },
});

/**
 * Neuen Node erstellen und sofort mit einem bestehenden Node verbinden
 * (ein Roundtrip — z. B. Prompt → neue AI-Image-Node).
 */
export const createWithEdgeFromSource = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: v.string(),
    positionX: v.number(),
    positionY: v.number(),
    width: v.number(),
    height: v.number(),
    data: v.any(),
    parentId: v.optional(v.id("nodes")),
    zIndex: v.optional(v.number()),
    clientRequestId: v.optional(v.string()),
    sourceNodeId: v.id("nodes"),
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await getCanvasOrThrow(ctx, args.canvasId, user.userId);
    void args.clientRequestId;

    const source = await ctx.db.get(args.sourceNodeId);
    if (!source || source.canvasId !== args.canvasId) {
      throw new Error("Source node not found");
    }

    const nodeId = await ctx.db.insert("nodes", {
      canvasId: args.canvasId,
      type: args.type as Doc<"nodes">["type"],
      positionX: args.positionX,
      positionY: args.positionY,
      width: args.width,
      height: args.height,
      status: "idle",
      retryCount: 0,
      data: args.data,
      parentId: args.parentId,
      zIndex: args.zIndex,
    });

    await ctx.db.insert("edges", {
      canvasId: args.canvasId,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: nodeId,
      sourceHandle: args.sourceHandle,
      targetHandle: args.targetHandle,
    });

    await ctx.db.patch(args.canvasId, { updatedAt: Date.now() });

    return nodeId;
  },
});

/**
 * Node-Position auf dem Canvas verschieben.
 */
export const move = mutation({
  args: {
    nodeId: v.id("nodes"),
    positionX: v.number(),
    positionY: v.number(),
  },
  handler: async (ctx, { nodeId, positionX, positionY }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { positionX, positionY });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Größe ändern.
 */
export const resize = mutation({
  args: {
    nodeId: v.id("nodes"),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, { nodeId, width, height }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) return;

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { width, height });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Mehrere Nodes gleichzeitig verschieben (Batch Move, z.B. nach Multiselect-Drag).
 */
export const batchMove = mutation({
  args: {
    moves: v.array(
      v.object({
        nodeId: v.id("nodes"),
        positionX: v.number(),
        positionY: v.number(),
      })
    ),
  },
  handler: async (ctx, { moves }) => {
    const user = await requireAuth(ctx);
    if (moves.length === 0) return;

    // Canvas-Zugriff über den ersten Node prüfen
    const firstNode = await ctx.db.get(moves[0].nodeId);
    if (!firstNode) throw new Error("Node not found");
    await getCanvasOrThrow(ctx, firstNode.canvasId, user.userId);

    for (const { nodeId, positionX, positionY } of moves) {
      await ctx.db.patch(nodeId, { positionX, positionY });
    }

    await ctx.db.patch(firstNode.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Daten aktualisieren (typ-spezifische Payload).
 */
export const updateData = mutation({
  args: {
    nodeId: v.id("nodes"),
    data: v.any(),
  },
  handler: async (ctx, { nodeId, data }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { data });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node-Status aktualisieren (UX-Strategie: Status direkt am Node).
 */
export const updateStatus = mutation({
  args: {
    nodeId: v.id("nodes"),
    status: v.union(
      v.literal("idle"),
      v.literal("analyzing"),
      v.literal("clarifying"),
      v.literal("executing"),
      v.literal("done"),
      v.literal("error")
    ),
    statusMessage: v.optional(v.string()),
    retryCount: v.optional(v.number()),
  },
  handler: async (ctx, { nodeId, status, statusMessage, retryCount }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    const patch: {
      status: typeof status;
      statusMessage?: string;
      retryCount?: number;
    } = {
      status,
    };
    if (statusMessage !== undefined) {
      patch.statusMessage = statusMessage;
    } else if (status === "done" || status === "executing" || status === "idle") {
      patch.statusMessage = undefined;
    }
    if (retryCount !== undefined) {
      patch.retryCount = retryCount;
    }
    await ctx.db.patch(nodeId, patch);
  },
});

/**
 * Node-Z-Index ändern (Layering).
 */
export const updateZIndex = mutation({
  args: {
    nodeId: v.id("nodes"),
    zIndex: v.number(),
  },
  handler: async (ctx, { nodeId, zIndex }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);
    await ctx.db.patch(nodeId, { zIndex });
  },
});

/**
 * Node in eine Gruppe/Frame verschieben oder aus Gruppe entfernen.
 */
export const setParent = mutation({
  args: {
    nodeId: v.id("nodes"),
    parentId: v.optional(v.id("nodes")),
  },
  handler: async (ctx, { nodeId, parentId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);

    // Prüfen ob Parent existiert und zum gleichen Canvas gehört
    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (!parent || parent.canvasId !== node.canvasId) {
        throw new Error("Parent not found");
      }
    }

    await ctx.db.patch(nodeId, { parentId });
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Node löschen — entfernt auch alle verbundenen Edges.
 */
export const remove = mutation({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node) throw new Error("Node not found");

    await getCanvasOrThrow(ctx, node.canvasId, user.userId);

    // Alle Edges entfernen, die diesen Node als Source oder Target haben
    const sourceEdges = await ctx.db
      .query("edges")
      .withIndex("by_source", (q) => q.eq("sourceNodeId", nodeId))
      .collect();
    for (const edge of sourceEdges) {
      await ctx.db.delete(edge._id);
    }

    const targetEdges = await ctx.db
      .query("edges")
      .withIndex("by_target", (q) => q.eq("targetNodeId", nodeId))
      .collect();
    for (const edge of targetEdges) {
      await ctx.db.delete(edge._id);
    }

    // Kind-Nodes aus Gruppe/Frame lösen (parentId auf undefined setzen)
    const children = await ctx.db
      .query("nodes")
      .withIndex("by_parent", (q) => q.eq("parentId", nodeId))
      .collect();
    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: undefined });
    }

    // Node löschen
    await ctx.db.delete(nodeId);
    await ctx.db.patch(node.canvasId, { updatedAt: Date.now() });
  },
});

/**
 * Mehrere Nodes gleichzeitig löschen (Batch Delete).
 * Entfernt auch alle verbundenen Edges und löst Kind-Nodes aus Gruppen/Frames.
 */
export const batchRemove = mutation({
  args: { nodeIds: v.array(v.id("nodes")) },
  handler: async (ctx, { nodeIds }) => {
    const user = await requireAuth(ctx);
    if (nodeIds.length === 0) return;

    // Canvas-Zugriff über den ersten Node prüfen
    const firstNode = await ctx.db.get(nodeIds[0]);
    if (!firstNode) throw new Error("Node not found");
    await getCanvasOrThrow(ctx, firstNode.canvasId, user.userId);

    for (const nodeId of nodeIds) {
      const node = await ctx.db.get(nodeId);
      if (!node) continue;

      // Alle Edges entfernen, die diesen Node als Source oder Target haben
      const sourceEdges = await ctx.db
        .query("edges")
        .withIndex("by_source", (q) => q.eq("sourceNodeId", nodeId))
        .collect();
      for (const edge of sourceEdges) {
        await ctx.db.delete(edge._id);
      }

      const targetEdges = await ctx.db
        .query("edges")
        .withIndex("by_target", (q) => q.eq("targetNodeId", nodeId))
        .collect();
      for (const edge of targetEdges) {
        await ctx.db.delete(edge._id);
      }

      // Kind-Nodes aus Gruppe/Frame lösen
      const children = await ctx.db
        .query("nodes")
        .withIndex("by_parent", (q) => q.eq("parentId", nodeId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { parentId: undefined });
      }

      // Node löschen
      await ctx.db.delete(nodeId);
    }

    await ctx.db.patch(firstNode.canvasId, { updatedAt: Date.now() });
  },
});
