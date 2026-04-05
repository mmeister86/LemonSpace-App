import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";

type StoreState = {
  nodes: Array<{ id: string; type?: string; data?: unknown }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    className?: string;
    targetHandle?: string;
  }>;
};

const storeState: StoreState = {
  nodes: [],
  edges: [],
};

const compareSurfaceSpy = vi.fn();

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useStore: (selector: (state: StoreState) => unknown) => selector(storeState),
}));

vi.mock("../nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../nodes/compare-surface", () => ({
  default: (props: unknown) => {
    compareSurfaceSpy(props);
    return null;
  },
}));

import CompareNode from "../nodes/compare-node";

function renderCompareNode(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    <CanvasGraphProvider
      nodes={storeState.nodes as Array<{ id: string; type: string; data?: unknown }>}
      edges={storeState.edges}
    >
      <CompareNode {...(props as React.ComponentProps<typeof CompareNode>)} />
    </CanvasGraphProvider>,
  );
}

describe("CompareNode render preview inputs", () => {
  beforeEach(() => {
    storeState.nodes = [];
    storeState.edges = [];
    compareSurfaceSpy.mockReset();
  });

  it("passes previewInput to CompareSurface for a connected render node without final output", () => {
    storeState.nodes = [
      {
        id: "image-1",
        type: "image",
        data: { url: "https://cdn.example.com/source.png" },
      },
      {
        id: "render-1",
        type: "render",
        data: {},
      },
    ];
    storeState.edges = [
      { id: "edge-image-render", source: "image-1", target: "render-1" },
      {
        id: "edge-render-compare",
        source: "render-1",
        target: "compare-1",
        targetHandle: "left",
      },
    ];

    renderCompareNode({
        id: "compare-1",
        data: { leftUrl: "https://cdn.example.com/render-output.png" },
        selected: false,
        dragging: false,
        zIndex: 0,
        isConnectable: true,
        type: "compare",
        xPos: 0,
        yPos: 0,
        width: 500,
        height: 380,
        sourcePosition: undefined,
        targetPosition: undefined,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      });

    expect(compareSurfaceSpy).toHaveBeenCalled();
    const previewCall = compareSurfaceSpy.mock.calls.find(
      ([props]) =>
        Boolean(
          (props as { previewInput?: { sourceUrl: string; steps: unknown[] } }).previewInput,
        ),
    );
    expect(previewCall).toBeDefined();
    expect(
      (previewCall?.[0] as { previewInput?: { sourceUrl: string; steps: unknown[] } })
        .previewInput,
    ).toEqual({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
    });
  });

  it("defaults render-backed compare inputs to preview mode even when a final render output exists", () => {
    storeState.nodes = [
      {
        id: "image-1",
        type: "image",
        data: { url: "https://cdn.example.com/source.png" },
      },
      {
        id: "render-1",
        type: "render",
        data: {
          lastUploadUrl: "https://cdn.example.com/render-output.png",
        },
      },
    ];
    storeState.edges = [
      { id: "edge-image-render", source: "image-1", target: "render-1" },
      {
        id: "edge-render-compare",
        source: "render-1",
        target: "compare-1",
        targetHandle: "left",
      },
    ];

    renderCompareNode({
        id: "compare-1",
        data: { leftUrl: "https://cdn.example.com/render-output.png" },
        selected: false,
        dragging: false,
        zIndex: 0,
        isConnectable: true,
        type: "compare",
        xPos: 0,
        yPos: 0,
        width: 500,
        height: 380,
        sourcePosition: undefined,
        targetPosition: undefined,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      });

    expect(compareSurfaceSpy).toHaveBeenCalledTimes(1);
    expect(compareSurfaceSpy.mock.calls[0]?.[0]).toMatchObject({
      finalUrl: "https://cdn.example.com/render-output.png",
      preferPreview: true,
    });
  });
});
