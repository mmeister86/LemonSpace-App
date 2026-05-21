// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  computeEdgeInsertLayout,
  computeEdgeInsertReflowPlan,
  deselectCanvasEdges,
  getPendingNodeSizePinsFromLocalOps,
  getPendingRemovedNodeIdsFromLocalOps,
  isCanvasSelectAllHotkey,
  getSingleCharacterHotkey,
  mergeNodesPreservingLocalState,
  selectAllCanvasNodes,
  withResolvedCompareData,
} from "../canvas-helpers";
import { enqueueCanvasOp } from "@/lib/canvas-local-persistence";
import {
  buildGraphSnapshot,
  pruneCanvasGraphNodeDataOverrides,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";
import { resolveMixerPreviewFromGraph } from "@/lib/canvas-mixer-preview";

function createNode(overrides: Partial<RFNode> & Pick<RFNode, "id">): RFNode {
  return {
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as RFNode;
}

function createEdge(
  overrides: Partial<RFEdge> & Pick<RFEdge, "id" | "source" | "target">,
): RFEdge {
  return {
    ...overrides,
  } as RFEdge;
}

describe("withResolvedCompareData", () => {
  it("does not backfill compare render input from the upstream source image when no render output exists", () => {
    const imageNode = createNode({
      id: "image-1",
      type: "image",
      data: { url: "https://cdn.example.com/source.png" },
    });
    const renderNode = createNode({
      id: "render-1",
      type: "render",
      data: {},
    });
    const compareNode = createNode({
      id: "compare-1",
      type: "compare",
      data: {},
    });

    const nextNodes = withResolvedCompareData(
      [imageNode, renderNode, compareNode],
      [
        createEdge({ id: "edge-image-render", source: "image-1", target: "render-1" }),
        createEdge({
          id: "edge-render-compare",
          source: "render-1",
          target: "compare-1",
          targetHandle: "left",
        }),
      ],
    );

    const nextCompare = nextNodes.find((node) => node.id === "compare-1");
    expect(nextCompare).toBeDefined();
    expect((nextCompare?.data as { leftUrl?: string }).leftUrl).toBeUndefined();
  });

  it("uses uploaded render output URLs for compare inputs when available", () => {
    const imageNode = createNode({
      id: "image-1",
      type: "image",
      data: { url: "https://cdn.example.com/source.png" },
    });
    const renderNode = createNode({
      id: "render-1",
      type: "render",
      data: {
        lastUploadUrl: "https://cdn.example.com/render-output.png",
      },
    });
    const compareNode = createNode({
      id: "compare-1",
      type: "compare",
      data: {},
    });

    const nextNodes = withResolvedCompareData(
      [imageNode, renderNode, compareNode],
      [
        createEdge({ id: "edge-image-render", source: "image-1", target: "render-1" }),
        createEdge({
          id: "edge-render-compare",
          source: "render-1",
          target: "compare-1",
          targetHandle: "left",
        }),
      ],
    );

    const nextCompare = nextNodes.find((node) => node.id === "compare-1");
    expect(nextCompare).toBeDefined();
    expect((nextCompare?.data as { leftUrl?: string }).leftUrl).toBe(
      "https://cdn.example.com/render-output.png",
    );
  });

  it("treats bypassed render sources as absent compare inputs", () => {
    const renderNode = createNode({
      id: "render-1",
      type: "render",
      data: {
        isBypassed: true,
        lastUploadUrl: "https://cdn.example.com/render-output.png",
      },
    });
    const compareNode = createNode({
      id: "compare-1",
      type: "compare",
      data: {},
    });

    const nextNodes = withResolvedCompareData(
      [renderNode, compareNode],
      [
        createEdge({
          id: "edge-render-compare",
          source: "render-1",
          target: "compare-1",
          targetHandle: "left",
        }),
      ],
    );

    const nextCompare = nextNodes.find((node) => node.id === "compare-1");
    expect((nextCompare?.data as { leftUrl?: string }).leftUrl).toBeUndefined();
    expect((nextCompare?.data as { leftLabel?: string }).leftLabel).toBeUndefined();
  });
});

describe("canvas preview graph helpers", () => {
  it("treats node data overrides as complete normalized objects when building a graph snapshot", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/persisted.png",
            previewUrl: "https://cdn.example.com/persisted-preview.png",
            label: "Persisted label",
          },
        },
      ],
      [],
      {
        nodeDataOverrides: new Map([
          [
            "image-1",
            {
              url: "https://cdn.example.com/persisted-source.png",
              previewUrl: "https://cdn.example.com/override-preview.png",
            },
          ],
        ]),
      },
    );

    expect(graph.nodesById.get("image-1")).toMatchObject({
      data: {
        url: "https://cdn.example.com/persisted-source.png",
        previewUrl: "https://cdn.example.com/override-preview.png",
      },
    });
  });

  it("prunes stale node data overrides for deleted nodes and persisted catch-up", () => {
    const overrides = pruneCanvasGraphNodeDataOverrides(
      [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/persisted-source.png",
            previewUrl: "https://cdn.example.com/persisted-preview.png",
            label: "Persisted label",
          },
        },
      ],
      new Map([
        [
          "image-1",
          {
            url: "https://cdn.example.com/persisted-source.png",
            previewUrl: "https://cdn.example.com/local-preview.png",
          },
        ],
        ["deleted-node", { previewUrl: "https://cdn.example.com/stale-preview.png" }],
      ]),
    );

    expect(overrides).toEqual(
      new Map([
        [
          "image-1",
          {
            url: "https://cdn.example.com/persisted-source.png",
            previewUrl: "https://cdn.example.com/local-preview.png",
          },
        ],
      ]),
    );
  });

  it("keeps already-pruned node data overrides stable", () => {
    const override = { previewUrl: "https://cdn.example.com/local-preview.png" };
    const overrides = new Map([["image-1", override]]);

    const nextOverrides = pruneCanvasGraphNodeDataOverrides(
      [
        {
          id: "image-1",
          type: "image",
          data: {
            url: "https://cdn.example.com/persisted-source.png",
            previewUrl: "https://cdn.example.com/persisted-preview.png",
          },
        },
      ],
      overrides,
    );

    expect(nextOverrides).toBe(overrides);
  });

  it("keeps full nested overrides until persisted data fully catches up", () => {
    const override = {
      exposure: 0.8,
      adjustments: {
        shadows: 12,
        highlights: -4,
      },
    };

    const nextOverrides = pruneCanvasGraphNodeDataOverrides(
      [
        {
          id: "curves-1",
          type: "curves",
          data: {
            exposure: 0.2,
            adjustments: {
              shadows: 0,
              highlights: -4,
            },
          },
        },
      ],
      new Map([["curves-1", override]]),
    );

    expect(nextOverrides).toEqual(new Map([["curves-1", override]]));
  });

  it("resolves the upstream source and pipeline steps from a graph snapshot", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { url: "https://cdn.example.com/source.png" },
        },
        {
          id: "curves-1",
          type: "curves",
          data: { exposure: 0.2 },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-1", target: "curves-1" },
        { source: "curves-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/source.png");
    expect(preview.steps).toEqual([
      {
        nodeId: "curves-1",
        type: "curves",
        params: { exposure: 0.2 },
      },
    ]);
  });

  it("resolves completed change camera nodes as render sources", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "change-camera-1",
          type: "change-camera",
          data: { url: "https://cdn.example.com/camera.png" },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "change-camera-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/camera.png");
    expect(preview.steps).toEqual([]);
  });

  it("prefers local node data overrides during render preview resolution", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { url: "https://cdn.example.com/persisted-source.png" },
        },
        {
          id: "curves-1",
          type: "curves",
          data: { exposure: 0.2 },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-1", target: "curves-1" },
        { source: "curves-1", target: "render-1" },
      ],
      {
        nodeDataOverrides: new Map([
          ["image-1", { url: "https://cdn.example.com/override-source.png" }],
          ["curves-1", { exposure: 0.8 }],
        ]),
      },
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/override-source.png");
    expect(preview.steps).toEqual([
      {
        nodeId: "curves-1",
        type: "curves",
        params: { exposure: 0.8 },
      },
    ]);
  });

  it("uses local crop overrides when resolving downstream render preview steps", () => {
    const persistedCrop = {
      crop: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      resize: {
        mode: "source",
        fit: "cover",
        keepAspect: true,
      },
    };
    const localCrop = {
      crop: {
        x: 0.25,
        y: 0.1,
        width: 0.5,
        height: 0.6,
      },
      resize: {
        mode: "source",
        fit: "cover",
        keepAspect: true,
      },
    };

    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { url: "https://cdn.example.com/source.png" },
        },
        {
          id: "crop-1",
          type: "crop",
          data: persistedCrop,
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-1", target: "crop-1" },
        { source: "crop-1", target: "render-1" },
      ],
      {
        nodeDataOverrides: new Map([["crop-1", localCrop]]),
      },
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.steps).toEqual([
      {
        nodeId: "crop-1",
        type: "crop",
        params: localCrop,
      },
    ]);
  });

  it("skips bypassed adjustment nodes when resolving downstream render preview steps", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { url: "https://cdn.example.com/source.png" },
        },
        {
          id: "curves-1",
          type: "curves",
          data: { isBypassed: true, exposure: 0.2 },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-1", target: "curves-1" },
        { source: "curves-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBe("https://cdn.example.com/source.png");
    expect(preview.steps).toEqual([]);
  });

  it("treats bypassed source nodes as absent render inputs", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-1",
          type: "image",
          data: { isBypassed: true, url: "https://cdn.example.com/source.png" },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [{ source: "image-1", target: "render-1" }],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBeNull();
    expect(preview.steps).toEqual([]);
  });

  it("treats bypassed mixer nodes as absent render inputs", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { url: "https://cdn.example.com/base.png" },
        },
        {
          id: "image-overlay",
          type: "image",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: { isBypassed: true },
        },
        {
          id: "render-1",
          type: "render",
          data: {},
        },
      ],
      [
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "image-overlay", target: "mixer-1", targetHandle: "overlay" },
        { source: "mixer-1", target: "render-1" },
      ],
    );

    const preview = resolveRenderPreviewInputFromGraph({
      nodeId: "render-1",
      graph,
    });

    expect(preview.sourceUrl).toBeNull();
    expect(preview.sourceComposition).toBeUndefined();
    expect(preview.steps).toEqual([]);
  });

  it("treats bypassed mixer layer sources as absent in mixer previews", () => {
    const graph = buildGraphSnapshot(
      [
        {
          id: "image-base",
          type: "image",
          data: { isBypassed: true, url: "https://cdn.example.com/base.png" },
        },
        {
          id: "image-overlay",
          type: "image",
          data: { url: "https://cdn.example.com/overlay.png" },
        },
        {
          id: "mixer-1",
          type: "mixer",
          data: {},
        },
      ],
      [
        { source: "image-base", target: "mixer-1", targetHandle: "base" },
        { source: "image-overlay", target: "mixer-1", targetHandle: "overlay" },
      ],
    );

    const preview = resolveMixerPreviewFromGraph({ nodeId: "mixer-1", graph });

    expect(preview.status).toBe("partial");
    expect(preview.baseUrl).toBeUndefined();
    expect(preview.overlayUrl).toBe("https://cdn.example.com/overlay.png");
  });
});

describe("canvas local pending op helpers", () => {
  it("restores pending delete and resize guards from the local op mirror", () => {
    const canvasId = "canvas-pending-ops";
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });
    window.localStorage.clear();

    enqueueCanvasOp(canvasId, {
      id: "resize-1",
      type: "resizeNode",
      payload: {
        nodeId: "node-resize",
        width: 480,
        height: 320,
      },
    });
    enqueueCanvasOp(canvasId, {
      id: "delete-1",
      type: "batchRemoveNodes",
      payload: {
        nodeIds: ["node-delete", "node-resize-delete"],
      },
    });
    enqueueCanvasOp(canvasId, {
      id: "resize-deleted",
      type: "resizeNode",
      payload: {
        nodeId: "node-resize-delete",
        width: 900,
        height: 900,
      },
    });

    expect(getPendingRemovedNodeIdsFromLocalOps(canvasId)).toEqual(
      new Set(["node-delete", "node-resize-delete"]),
    );
    expect(getPendingNodeSizePinsFromLocalOps(canvasId)).toEqual(
      new Map([["node-resize", { width: 480, height: 320 }]]),
    );
  });
});

describe("getSingleCharacterHotkey", () => {
  it("returns a lowercase printable hotkey for single-character keys", () => {
    expect(getSingleCharacterHotkey({ key: "K", type: "keydown" })).toBe("k");
    expect(getSingleCharacterHotkey({ key: "v", type: "keydown" })).toBe("v");
    expect(getSingleCharacterHotkey({ key: "Escape", type: "keydown" })).toBe("");
  });

  it("returns an empty string and logs when the event has no string key", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getSingleCharacterHotkey({ type: "keydown" } as { key?: string; type: string })).toBe("");
    expect(warnSpy).toHaveBeenCalledWith("[Canvas] keyboard event missing string key", {
      eventType: "keydown",
      key: undefined,
    });
  });
});

describe("isCanvasSelectAllHotkey", () => {
  it("recognizes Cmd+A and Ctrl+A outside editable targets", () => {
    const target = document.createElement("div");

    expect(
      isCanvasSelectAllHotkey({
        key: "a",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        target,
        type: "keydown",
      }),
    ).toBe(true);
    expect(
      isCanvasSelectAllHotkey({
        key: "A",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        target,
        type: "keydown",
      }),
    ).toBe(true);
  });

  it("ignores modified or non-select-all shortcuts", () => {
    const target = document.createElement("div");

    expect(
      isCanvasSelectAllHotkey({
        key: "a",
        metaKey: true,
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        target,
        type: "keydown",
      }),
    ).toBe(false);
    expect(
      isCanvasSelectAllHotkey({
        key: "a",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        target,
        type: "keydown",
      }),
    ).toBe(false);
    expect(
      isCanvasSelectAllHotkey({
        key: "b",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        target,
        type: "keydown",
      }),
    ).toBe(false);
  });

  it("ignores editable targets so native text selection still works", () => {
    const input = document.createElement("input");
    const contentEditable = document.createElement("div");
    contentEditable.setAttribute("contenteditable", "true");

    expect(
      isCanvasSelectAllHotkey({
        key: "a",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        target: input,
        type: "keydown",
      }),
    ).toBe(false);
    expect(
      isCanvasSelectAllHotkey({
        key: "a",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        target: contentEditable,
        type: "keydown",
      }),
    ).toBe(false);
  });
});

describe("selectAllCanvasNodes", () => {
  it("marks every node selected while preserving already-selected node references", () => {
    const alreadySelected = createNode({
      id: "node-a",
      selected: true,
    });
    const unselected = createNode({
      id: "node-b",
      selected: false,
    });

    const result = selectAllCanvasNodes([alreadySelected, unselected]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(alreadySelected);
    expect(result[1]).not.toBe(unselected);
    expect(result.map((node) => node.selected)).toEqual([true, true]);
  });
});

describe("mergeNodesPreservingLocalState", () => {
  it("keeps incoming relative positions when selected media nodes are grouped", () => {
    const previousImage = createNode({
      id: "image-1",
      type: "image",
      position: { x: 420, y: 160 },
      selected: true,
      style: { width: 300, height: 220 },
      data: {},
    });
    const incomingGroup = createNode({
      id: "group-1",
      type: "group",
      position: { x: 396, y: 116 },
      style: { width: 348, height: 288 },
      data: { label: "Gruppe" },
    });
    const incomingImage = createNode({
      id: "image-1",
      type: "image",
      parentId: "group-1",
      position: { x: 24, y: 44 },
      style: { width: 300, height: 220 },
      data: {},
    });

    const result = mergeNodesPreservingLocalState(
      [previousImage],
      [incomingGroup, incomingImage],
    );

    expect(result.find((node) => node.id === "image-1")).toMatchObject({
      parentId: "group-1",
      position: { x: 24, y: 44 },
      selected: true,
    });
  });
});

describe("deselectCanvasEdges", () => {
  it("clears selected edges while preserving unselected edge references", () => {
    const selectedEdge = createEdge({
      id: "edge-a",
      source: "node-a",
      target: "node-b",
      selected: true,
    });
    const unselectedEdge = createEdge({
      id: "edge-b",
      source: "node-b",
      target: "node-c",
      selected: false,
    });

    const result = deselectCanvasEdges([selectedEdge, unselectedEdge]);

    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(selectedEdge);
    expect(result[1]).toBe(unselectedEdge);
    expect(result.map((edge) => edge.selected)).toEqual([false, false]);
  });
});

describe("computeEdgeInsertLayout", () => {
  it("shifts source and target along a horizontal axis when spacing is too tight", () => {
    const source = createNode({
      id: "source",
      position: { x: 0, y: 0 },
      style: { width: 100, height: 60 },
    });
    const target = createNode({
      id: "target",
      position: { x: 120, y: 0 },
      style: { width: 100, height: 60 },
    });

    const layout = computeEdgeInsertLayout({
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 80,
      newNodeHeight: 40,
      gapPx: 10,
    });

    expect(layout.insertPosition).toEqual({ x: 70, y: 10 });
    expect(layout.sourcePosition).toEqual({ x: -40, y: 0 });
    expect(layout.targetPosition).toEqual({ x: 160, y: 0 });
  });

  it("keeps diagonal-axis spacing adjustments aligned to the edge direction", () => {
    const source = createNode({
      id: "source",
      position: { x: 0, y: 0 },
      style: { width: 100, height: 100 },
    });
    const target = createNode({
      id: "target",
      position: { x: 100, y: 100 },
      style: { width: 100, height: 100 },
    });

    const layout = computeEdgeInsertLayout({
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 80,
      newNodeHeight: 80,
      gapPx: 10,
    });

    expect(layout.insertPosition).toEqual({ x: 60, y: 60 });
    expect(layout.sourcePosition).toBeDefined();
    expect(layout.targetPosition).toBeDefined();
    expect(layout.sourcePosition?.x).toBeCloseTo(layout.sourcePosition?.y ?? 0, 6);
    expect(layout.targetPosition?.x).toBeCloseTo(layout.targetPosition?.y ?? 0, 6);
    expect(layout.sourcePosition?.x).toBeLessThan(source.position.x);
    expect(layout.targetPosition?.x).toBeGreaterThan(target.position.x);
  });

  it("does not shift source or target when there is enough spacing", () => {
    const source = createNode({
      id: "source",
      position: { x: 0, y: 0 },
      style: { width: 100, height: 60 },
    });
    const target = createNode({
      id: "target",
      position: { x: 320, y: 0 },
      style: { width: 100, height: 60 },
    });

    const layout = computeEdgeInsertLayout({
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 80,
      newNodeHeight: 40,
      gapPx: 10,
    });

    expect(layout.insertPosition).toEqual({ x: 170, y: 10 });
    expect(layout.sourcePosition).toBeUndefined();
    expect(layout.targetPosition).toBeUndefined();
  });

  it("falls back to midpoint placement without aggressive shifts in degenerate cases", () => {
    const source = createNode({
      id: "source",
      position: { x: 40, y: 80 },
    });
    const target = createNode({
      id: "target",
      position: { x: 40, y: 80 },
    });

    const layout = computeEdgeInsertLayout({
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 30,
      newNodeHeight: 10,
      gapPx: 10,
    });

    expect(layout.insertPosition).toEqual({ x: 25, y: 75 });
    expect(layout.sourcePosition).toBeUndefined();
    expect(layout.targetPosition).toBeUndefined();
  });
});

describe("computeEdgeInsertReflowPlan", () => {
  it("propagates source and target shifts across full upstream/downstream chains", () => {
    const upstream = createNode({
      id: "upstream",
      position: { x: -120, y: 0 },
      style: { width: 100, height: 60 },
    });
    const source = createNode({
      id: "source",
      position: { x: 0, y: 0 },
      style: { width: 100, height: 60 },
    });
    const target = createNode({
      id: "target",
      position: { x: 120, y: 0 },
      style: { width: 100, height: 60 },
    });
    const downstream = createNode({
      id: "downstream",
      position: { x: 240, y: 0 },
      style: { width: 100, height: 60 },
    });

    const edges = [
      createEdge({ id: "edge-upstream", source: "upstream", target: "source" }),
      createEdge({ id: "edge-split", source: "source", target: "target" }),
      createEdge({ id: "edge-downstream", source: "target", target: "downstream" }),
    ];

    const plan = computeEdgeInsertReflowPlan({
      nodes: [upstream, source, target, downstream],
      edges,
      splitEdge: edges[1],
      sourceNode: source,
      targetNode: target,
      newNodeWidth: 220,
      newNodeHeight: 120,
      gapPx: 10,
    });

    expect(plan.moves).toEqual([
      { nodeId: "upstream", positionX: -230, positionY: 0 },
      { nodeId: "source", positionX: -110, positionY: 0 },
      { nodeId: "target", positionX: 230, positionY: 0 },
      { nodeId: "downstream", positionX: 350, positionY: 0 },
    ]);
  });
});
