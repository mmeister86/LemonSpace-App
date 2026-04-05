import { describe, expect, it } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { withResolvedCompareData } from "../canvas-helpers";
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
