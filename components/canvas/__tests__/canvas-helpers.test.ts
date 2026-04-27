import { describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  computeEdgeInsertLayout,
  computeEdgeInsertReflowPlan,
  getSingleCharacterHotkey,
  withResolvedCompareData,
} from "../canvas-helpers";
import {
  buildGraphSnapshot,
  pruneCanvasGraphNodeDataOverrides,
  resolveRenderPreviewInputFromGraph,
} from "@/lib/canvas-render-preview";

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
