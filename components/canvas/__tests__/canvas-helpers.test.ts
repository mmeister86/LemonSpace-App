import { describe, expect, it } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { withResolvedCompareData } from "../canvas-helpers";
import {
  buildGraphSnapshot,
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
});
