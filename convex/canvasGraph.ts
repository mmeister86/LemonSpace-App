import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAuth } from "./helpers";
import { nodeTypeValidator } from "./node_type_validator";

const PERFORMANCE_LOG_THRESHOLD_MS = 250;

export async function loadCanvasGraph(
  ctx: QueryCtx,
  args: {
    canvasId: Id<"canvases">;
    userId: string;
  },
) {
  const canvas = await ctx.db.get(args.canvasId);
  if (!canvas || canvas.ownerId != args.userId) {
    throw new Error("Canvas not found");
  }

  const [nodes, edges] = await Promise.all([
    ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect(),
    ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect(),
  ]);

  return { canvas, nodes, edges };
}

export const get = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const startedAt = Date.now();
    const authStartedAt = Date.now();
    const user = await requireAuth(ctx);
    const authMs = Date.now() - authStartedAt;

    const graphStartedAt = Date.now();
    const { canvas, nodes, edges } = await loadCanvasGraph(ctx, {
      canvasId,
      userId: user.userId,
    });
    const graphMs = Date.now() - graphStartedAt;

    const durationMs = Date.now() - startedAt;
    if (durationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
      console.warn("[canvasGraph.get] slow graph query", {
        canvasId,
        userId: user.userId,
        authMs,
        graphMs,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        canvasUpdatedAt: canvas.updatedAt,
        durationMs,
      });
    }

    return { nodes, edges };
  },
});

export const getInternal = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    userId: v.string(),
  },
  handler: async (ctx, { canvasId, userId }) => {
    return loadCanvasGraph(ctx, {
      canvasId,
      userId,
    });
  },
});

const snapshotNodeValidator = v.object({
  id: v.string(),
  type: nodeTypeValidator,
  positionX: v.number(),
  positionY: v.number(),
  width: v.number(),
  height: v.number(),
  data: v.any(),
  parentId: v.optional(v.string()),
  zIndex: v.optional(v.number()),
});

const snapshotEdgeValidator = v.object({
  id: v.string(),
  sourceNodeId: v.string(),
  targetNodeId: v.string(),
  sourceHandle: v.optional(v.string()),
  targetHandle: v.optional(v.string()),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function remapNodeDataReferences(
  data: unknown,
  nodeIdBySnapshotId: ReadonlyMap<string, Id<"nodes">>,
): unknown {
  if (!isRecord(data)) {
    return data;
  }

  const next = { ...data };
  for (const key of ["leftNodeId", "rightNodeId"] as const) {
    const value = next[key];
    if (typeof value === "string") {
      next[key] = nodeIdBySnapshotId.get(value) ?? value;
    }
  }
  return next;
}

async function assertExistingNodeBelongsToCanvas(
  ctx: MutationCtx,
  nodeId: string,
  canvasId: Id<"canvases">,
): Promise<Id<"nodes"> | null> {
  const node = await ctx.db.get(nodeId as Id<"nodes">);
  if (!node) return null;
  if (node.canvasId !== canvasId) {
    throw new Error("Snapshot node belongs to another canvas");
  }
  return node._id;
}

async function assertExistingEdgeBelongsToCanvas(
  ctx: MutationCtx,
  edgeId: string,
  canvasId: Id<"canvases">,
): Promise<Id<"edges"> | null> {
  const edge = await ctx.db.get(edgeId as Id<"edges">);
  if (!edge) return null;
  if (edge.canvasId !== canvasId) {
    throw new Error("Snapshot edge belongs to another canvas");
  }
  return edge._id;
}

export const restoreSnapshot = mutation({
  args: {
    canvasId: v.id("canvases"),
    nodes: v.array(snapshotNodeValidator),
    edges: v.array(snapshotEdgeValidator),
  },
  handler: async (ctx, { canvasId, nodes, edges }) => {
    const user = await requireAuth(ctx);
    const canvas = await ctx.db.get(canvasId);
    if (!canvas || canvas.ownerId !== user.userId) {
      throw new Error("Canvas not found");
    }

    const currentNodes = await ctx.db
      .query("nodes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
    const currentEdges = await ctx.db
      .query("edges")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();

    const targetNodeIds = new Set(nodes.map((node) => node.id));
    const targetEdgeIds = new Set(edges.map((edge) => edge.id));
    if (targetNodeIds.size !== nodes.length || targetEdgeIds.size !== edges.length) {
      throw new Error("Snapshot contains duplicate ids");
    }

    const nodeIdBySnapshotId = new Map<string, Id<"nodes">>();
    for (const node of nodes) {
      const existingId = await assertExistingNodeBelongsToCanvas(
        ctx,
        node.id,
        canvasId,
      );
      if (existingId) {
        nodeIdBySnapshotId.set(node.id, existingId);
      }
    }

    const currentEdgeIds = new Set(currentEdges.map((edge) => edge._id as string));
    for (const edge of currentEdges) {
      if (!targetEdgeIds.has(edge._id as string)) {
        await ctx.db.delete(edge._id);
      }
    }

    for (const node of currentNodes) {
      if (!targetNodeIds.has(node._id as string)) {
        await ctx.db.delete(node._id);
      }
    }

    for (const node of nodes) {
      if (nodeIdBySnapshotId.has(node.id)) continue;
      const createdId = await ctx.db.insert("nodes", {
        canvasId,
        type: node.type,
        positionX: node.positionX,
        positionY: node.positionY,
        width: node.width,
        height: node.height,
        status: "idle",
        retryCount: 0,
        data: remapNodeDataReferences(node.data, nodeIdBySnapshotId),
        zIndex: node.zIndex,
      });
      nodeIdBySnapshotId.set(node.id, createdId);
    }

    for (const node of nodes) {
      const nodeId = nodeIdBySnapshotId.get(node.id);
      if (!nodeId) {
        throw new Error("Snapshot node could not be restored");
      }
      const parentId = node.parentId
        ? nodeIdBySnapshotId.get(node.parentId)
        : undefined;
      if (node.parentId && !parentId) {
        throw new Error("Snapshot parent node could not be restored");
      }

      await ctx.db.patch(nodeId, {
        type: node.type,
        positionX: node.positionX,
        positionY: node.positionY,
        width: node.width,
        height: node.height,
        data: remapNodeDataReferences(node.data, nodeIdBySnapshotId),
        parentId,
        zIndex: node.zIndex,
      });
    }

    const edgeIdBySnapshotId = new Map<string, Id<"edges">>();
    for (const edge of edges) {
      if (currentEdgeIds.has(edge.id)) {
        const existingId = await assertExistingEdgeBelongsToCanvas(
          ctx,
          edge.id,
          canvasId,
        );
        if (existingId) {
          edgeIdBySnapshotId.set(edge.id, existingId);
        }
      }
    }

    for (const edge of edges) {
      const sourceNodeId = nodeIdBySnapshotId.get(edge.sourceNodeId);
      const targetNodeId = nodeIdBySnapshotId.get(edge.targetNodeId);
      if (!sourceNodeId || !targetNodeId) {
        throw new Error("Snapshot edge references missing nodes");
      }

      const existingEdgeId = edgeIdBySnapshotId.get(edge.id);
      if (existingEdgeId) {
        await ctx.db.patch(existingEdgeId, {
          sourceNodeId,
          targetNodeId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        });
        continue;
      }

      const createdEdgeId = await ctx.db.insert("edges", {
        canvasId,
        sourceNodeId,
        targetNodeId,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      });
      edgeIdBySnapshotId.set(edge.id, createdEdgeId);
    }

    await ctx.db.patch(canvasId, { updatedAt: Date.now() });

    return {
      nodeIdMap: Object.fromEntries(
        Array.from(nodeIdBySnapshotId.entries()).map(([from, to]) => [from, to]),
      ),
      edgeIdMap: Object.fromEntries(
        Array.from(edgeIdBySnapshotId.entries()).map(([from, to]) => [from, to]),
      ),
    };
  },
});
