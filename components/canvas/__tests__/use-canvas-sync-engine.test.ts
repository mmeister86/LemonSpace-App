import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Id } from "@/convex/_generated/dataModel";
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
});
