import { describe, expect, it } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import {
  CANVAS_SYNC_RETENTION_MS,
  normalizeCanvasSyncOp,
} from "@/lib/canvas-sync-op-normalize";
import type { CanvasSyncOpType } from "@/lib/canvas-sync-op-types";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;
const asEdgeId = (id: string): Id<"edges"> => id as Id<"edges">;

describe("normalizeCanvasSyncOp", () => {
  const base = {
    id: "op-1",
    canvasId: "canvas-1",
    enqueuedAt: 1_000,
    attemptCount: 2,
    nextRetryAt: 2_000,
    expiresAt: 3_000,
    lastError: "retry later",
  };

  const cases: Array<{
    type: CanvasSyncOpType;
    payload: Record<string, unknown>;
  }> = [
    {
      type: "createNode",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        type: "image",
        positionX: 10,
        positionY: 20,
        width: 300,
        height: 200,
        data: { label: "Hero" },
        parentId: asNodeId("parent-1"),
        zIndex: 4,
        clientRequestId: "req-create",
      },
    },
    {
      type: "createNodeWithEdgeFromSource",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        type: "prompt",
        positionX: 11,
        positionY: 21,
        width: 301,
        height: 201,
        data: { prompt: "lemon" },
        parentId: asNodeId("parent-2"),
        zIndex: 5,
        clientRequestId: "req-from-source",
        sourceNodeId: "source-1",
        sourceHandle: "source-out",
        targetHandle: "target-in",
      },
    },
    {
      type: "createNodeWithEdgeToTarget",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        type: "render",
        positionX: 12,
        positionY: 22,
        width: 302,
        height: 202,
        data: null,
        parentId: asNodeId("parent-3"),
        zIndex: 6,
        clientRequestId: "req-to-target",
        targetNodeId: "target-1",
        sourceHandle: "source-out",
        targetHandle: "target-in",
      },
    },
    {
      type: "createNodeWithEdgeSplit",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        type: "mixer",
        positionX: 13,
        positionY: 23,
        width: 303,
        height: 203,
        data: { blendMode: "normal" },
        parentId: asNodeId("parent-4"),
        zIndex: 7,
        splitEdgeId: asEdgeId("edge-split"),
        newNodeTargetHandle: "base",
        newNodeSourceHandle: "mixer-out",
        splitSourceHandle: "source",
        splitTargetHandle: "target",
        clientRequestId: "req-split-new",
      },
    },
    {
      type: "createEdge",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        sourceNodeId: asNodeId("source-2"),
        targetNodeId: asNodeId("target-2"),
        sourceHandle: "source",
        targetHandle: "target",
        edgeIdToIgnore: asEdgeId("edge-ignore"),
        clientRequestId: "req-edge",
      },
    },
    {
      type: "removeEdge",
      payload: { edgeId: asEdgeId("edge-remove") },
    },
    {
      type: "batchRemoveNodes",
      payload: { nodeIds: [asNodeId("node-remove-1"), asNodeId("node-remove-2")] },
    },
    {
      type: "splitEdgeAtExistingNode",
      payload: {
        canvasId: asCanvasId("canvas-1"),
        splitEdgeId: asEdgeId("edge-existing"),
        middleNodeId: asNodeId("middle-1"),
        splitSourceHandle: "source",
        splitTargetHandle: "target",
        newNodeSourceHandle: "middle-out",
        newNodeTargetHandle: "middle-in",
        positionX: 14,
        positionY: 24,
        clientRequestId: "req-split-existing",
      },
    },
    {
      type: "moveNode",
      payload: { nodeId: asNodeId("node-move"), positionX: 15, positionY: 25 },
    },
    {
      type: "setNodeParent",
      payload: {
        nodeId: asNodeId("node-child"),
        parentId: asNodeId("node-parent"),
        positionX: 16,
        positionY: 26,
      },
    },
    {
      type: "resizeNode",
      payload: { nodeId: asNodeId("node-resize"), width: 304, height: 204 },
    },
    {
      type: "updateData",
      payload: { nodeId: asNodeId("node-data"), data: { isFavorite: true } },
    },
  ];

  it.each(cases)("normalizes $type payloads without changing valid values", ({ type, payload }) => {
    expect(normalizeCanvasSyncOp({ ...base, type, payload })).toEqual({
      ...base,
      type,
      payload,
    });
  });

  it("fills retry metadata defaults from enqueuedAt", () => {
    expect(
      normalizeCanvasSyncOp({
        id: "op-defaults",
        canvasId: "canvas-1",
        type: "moveNode",
        payload: { nodeId: "node-1", positionX: 1, positionY: 2 },
        enqueuedAt: 4_000,
      }),
    ).toEqual({
      id: "op-defaults",
      canvasId: "canvas-1",
      type: "moveNode",
      payload: { nodeId: "node-1", positionX: 1, positionY: 2 },
      enqueuedAt: 4_000,
      attemptCount: 0,
      nextRetryAt: 4_000,
      expiresAt: 4_000 + CANVAS_SYNC_RETENTION_MS,
      lastError: undefined,
    });
  });

  it("rejects unknown operation types and malformed payloads", () => {
    expect(
      normalizeCanvasSyncOp({
        ...base,
        type: "renameNode",
        payload: { nodeId: "node-1", label: "New" },
      }),
    ).toBeNull();

    expect(
      normalizeCanvasSyncOp({
        ...base,
        type: "createEdge",
        payload: { canvasId: "canvas-1", sourceNodeId: "source-1" },
      }),
    ).toBeNull();
  });
});
