import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Id } from "@/convex/_generated/dataModel";
import { optimisticNodeIdForClientRequest } from "@/components/canvas/canvas-sync-optimistic-updates";
import { createCanvasSyncPendingController } from "@/components/canvas/canvas-sync-pending-controller";
import { shouldRetryCanvasSyncError } from "@/components/canvas/canvas-sync-queue-flusher";
import { ensureCanvasSyncClientRequestId } from "@/components/canvas/canvas-sync-node-create-actions";
import { createCanvasSyncEngineController } from "@/components/canvas/use-canvas-sync-engine";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;
describe("useCanvasSyncEngine", () => {
  it("hands off an optimistic create to the real node id before replaying a deferred move", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);
    const runBatchRemoveNodes = vi.fn(async () => undefined);
    const runSplitEdgeAtExistingNode = vi.fn(async () => undefined);

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => runBatchRemoveNodes,
      getRunSplitEdgeAtExistingNode: () => runSplitEdgeAtExistingNode,
    });

    controller.pendingMoveAfterCreateRef.current.set("req-1", {
      positionX: 320,
      positionY: 180,
    });

    await controller.syncPendingMoveForClientRequest("req-1", asNodeId("node-real"));

    expect(enqueueSyncMutation).toHaveBeenCalledWith("moveNode", {
      nodeId: asNodeId("node-real"),
      positionX: 320,
      positionY: 180,
    });
    expect(
      controller.pendingLocalPositionUntilConvexMatchesRef.current.get("node-real"),
    ).toEqual({ x: 320, y: 180 });
    expect(controller.resolvedRealIdByClientRequestRef.current.get("req-1")).toBe(
      asNodeId("node-real"),
    );
    expect(controller.pendingMoveAfterCreateRef.current.has("req-1")).toBe(false);
    expect(runBatchRemoveNodes).not.toHaveBeenCalled();
    expect(runSplitEdgeAtExistingNode).not.toHaveBeenCalled();
  });

  it("exposes pending operation coordination from a focused module", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);

    const controller = createCanvasSyncPendingController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
    });

    await controller.queueNodeResize({
      nodeId: asNodeId("optimistic_req-module"),
      width: 480,
      height: 320,
    });

    expect(controller.pendingResizeAfterCreateRef.current.get("req-module")).toEqual({
      width: 480,
      height: 320,
    });
    expect(enqueueSyncMutation).not.toHaveBeenCalled();
  });

  it("exposes optimistic id helpers from a focused module", () => {
    expect(optimisticNodeIdForClientRequest("req-optimistic")).toBe(
      "optimistic_req-optimistic",
    );
  });

  it("exposes queue retry classification from a focused module", () => {
    expect(shouldRetryCanvasSyncError(new Error("network timeout"), true)).toBe(true);
    expect(shouldRetryCanvasSyncError(new Error("validation failed"), true)).toBe(false);
  });

  it("exposes create-node client request helpers from a focused module", () => {
    const payload = ensureCanvasSyncClientRequestId({
      canvasId: asCanvasId("canvas-1"),
      clientRequestId: "req-existing",
    });

    expect(payload.clientRequestId).toBe("req-existing");
  });

  it("defers resize and data updates for an optimistic node until the real id is known", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
    });

    await controller.queueNodeResize({
      nodeId: asNodeId("optimistic_req-2"),
      width: 640,
      height: 360,
    });
    await controller.queueNodeDataUpdate({
      nodeId: asNodeId("optimistic_req-2"),
      data: { label: "Updated" },
    });

    expect(enqueueSyncMutation).not.toHaveBeenCalled();

    await controller.syncPendingMoveForClientRequest("req-2", asNodeId("node-2"));

    expect(enqueueSyncMutation.mock.calls).toEqual([
      ["resizeNode", { nodeId: asNodeId("node-2"), width: 640, height: 360 }],
      ["updateData", { nodeId: asNodeId("node-2"), data: { label: "Updated" } }],
    ]);
    expect(controller.pendingResizeAfterCreateRef.current.has("req-2")).toBe(false);
    expect(controller.pendingDataAfterCreateRef.current.has("req-2")).toBe(false);
  });

  it("keeps favorite fields in pinned and deferred optimistic data updates", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
    });

    const favoritePayload = {
      storageId: "storage-next",
      filename: "hero.png",
      isFavorite: true,
    };

    await controller.queueNodeDataUpdate({
      nodeId: asNodeId("optimistic_req-favorite"),
      data: favoritePayload,
    });

    expect(
      controller.pendingLocalNodeDataUntilConvexMatchesRef.current.get(
        "optimistic_req-favorite",
      ),
    ).toEqual(favoritePayload);

    await controller.syncPendingMoveForClientRequest(
      "req-favorite",
      asNodeId("node-favorite"),
    );

    expect(enqueueSyncMutation).toHaveBeenCalledWith("updateData", {
      nodeId: asNodeId("node-favorite"),
      data: favoritePayload,
    });
    expect(
      controller.pendingLocalNodeDataUntilConvexMatchesRef.current.get("node-favorite"),
    ).toEqual(favoritePayload);
  });

  it("uses favorite-preserving payloads in media replacement write paths", () => {
    const imageNodeSource = readFileSync(
      resolve(process.cwd(), "components/canvas/nodes/image-node.tsx"),
      "utf8",
    );
    const assetBrowserSource = readFileSync(
      resolve(process.cwd(), "components/canvas/asset-browser-panel.tsx"),
      "utf8",
    );
    const videoBrowserSource = readFileSync(
      resolve(process.cwd(), "components/canvas/video-browser-panel.tsx"),
      "utf8",
    );

    expect(imageNodeSource).toContain("preserveNodeFavorite(");
    expect(assetBrowserSource).toContain("preserveNodeFavorite(");
    expect(videoBrowserSource).toContain("preserveNodeFavorite(");
  });


  it("pins local node data immediately when queueing an update", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);
    let nodes = [
      {
        id: "node-1",
        type: "curves",
        position: { x: 0, y: 0 },
        data: { blackPoint: 124 },
      },
    ];
    const setNodes = (updater: (current: typeof nodes) => typeof nodes) => {
      nodes = updater(nodes);
      return nodes;
    };

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
      getSetNodes: () => setNodes as never,
    });

    await controller.queueNodeDataUpdate({
      nodeId: asNodeId("node-1"),
      data: { blackPoint: 209 },
    });

    expect(nodes[0]?.data).toEqual({ blackPoint: 209 });
    expect(controller.pendingLocalNodeDataUntilConvexMatchesRef.current).toEqual(
      new Map([["node-1", { blackPoint: 209 }]]),
    );
    expect(enqueueSyncMutation).toHaveBeenCalledWith("updateData", {
      nodeId: asNodeId("node-1"),
      data: { blackPoint: 209 },
    });
  });

  it("moves optimistic node data pins to the real id when an update arrives after handoff", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);
    let nodes = [
      {
        id: "node-real",
        type: "mixer",
        position: { x: 0, y: 0 },
        data: { mixerVersion: 2, layers: [] },
      },
    ];
    const setNodes = (updater: (current: typeof nodes) => typeof nodes) => {
      nodes = updater(nodes);
      return nodes;
    };

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
      getSetNodes: () => setNodes as never,
    });
    controller.resolvedRealIdByClientRequestRef.current.set(
      "req-mixer",
      asNodeId("node-real"),
    );

    const nextData = {
      mixerVersion: 2,
      layers: [{ id: "layer-2", handleId: "layer-in-2", x: 0.2 }],
    };
    await controller.queueNodeDataUpdate({
      nodeId: asNodeId("optimistic_req-mixer"),
      data: nextData,
    });

    expect(nodes[0]?.data).toEqual(nextData);
    expect(
      controller.pendingLocalNodeDataUntilConvexMatchesRef.current.has(
        "optimistic_req-mixer",
      ),
    ).toBe(false);
    expect(controller.pendingLocalNodeDataUntilConvexMatchesRef.current).toEqual(
      new Map([["node-real", nextData]]),
    );
    expect(enqueueSyncMutation).toHaveBeenCalledWith("updateData", {
      nodeId: asNodeId("node-real"),
      data: nextData,
    });
  });

  it("pins local node size immediately when queueing a resize", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);
    let nodes = [
      {
        id: "node-1",
        type: "render",
        position: { x: 0, y: 0 },
        data: {},
        style: { width: 640, height: 360 },
      },
    ];
    const setNodes = (updater: (current: typeof nodes) => typeof nodes) => {
      nodes = updater(nodes);
      return nodes;
    };

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
      getSetNodes: () => setNodes as never,
    });

    await controller.queueNodeResize({
      nodeId: asNodeId("node-1"),
      width: 419,
      height: 466,
    });

    expect(nodes[0]?.style).toEqual({ width: 419, height: 466 });
    expect(controller.pendingLocalNodeSizeUntilConvexMatchesRef.current).toEqual(
      new Map([["node-1", { width: 419, height: 466 }]]),
    );
    expect(enqueueSyncMutation).toHaveBeenCalledWith("resizeNode", {
      nodeId: asNodeId("node-1"),
      width: 419,
      height: 466,
    });
  });

  it("pins local parent and relative position immediately when queueing a parent change", async () => {
    const enqueueSyncMutation = vi.fn(async () => undefined);
    let nodes = [
      {
        id: "node-group",
        type: "group",
        position: { x: 100, y: 100 },
        data: {},
      },
      {
        id: "node-1",
        type: "image",
        position: { x: 120, y: 120 },
        data: {},
      },
    ];
    const setNodes = (updater: (current: typeof nodes) => typeof nodes) => {
      nodes = updater(nodes);
      return nodes;
    };

    const controller = createCanvasSyncEngineController({
      canvasId: asCanvasId("canvas-1"),
      isSyncOnline: true,
      getEnqueueSyncMutation: () => enqueueSyncMutation,
      getRunBatchRemoveNodes: () => vi.fn(async () => undefined),
      getRunSplitEdgeAtExistingNode: () => vi.fn(async () => undefined),
      getSetNodes: () => setNodes as never,
    });

    await controller.queueNodeParentUpdate({
      nodeId: asNodeId("node-1"),
      parentId: asNodeId("node-group"),
      positionX: 20,
      positionY: 20,
    });

    expect(nodes[1]).toMatchObject({
      parentId: "node-group",
      position: { x: 20, y: 20 },
    });
    expect(controller.pendingLocalNodeParentUntilConvexMatchesRef.current).toEqual(
      new Map([["node-1", { parentId: "node-group", x: 20, y: 20 }]]),
    );
    expect(enqueueSyncMutation).toHaveBeenCalledWith("setNodeParent", {
      nodeId: asNodeId("node-1"),
      parentId: asNodeId("node-group"),
      positionX: 20,
      positionY: 20,
    });
  });
});
