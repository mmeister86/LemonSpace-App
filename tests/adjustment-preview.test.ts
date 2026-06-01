// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildGraphSnapshot, type CanvasGraphSnapshot } from "@/lib/canvas-render-preview";
import { DEFAULT_CURVES_DATA } from "@/lib/image-pipeline/adjustment-types";

const pipelinePreviewMock = vi.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentGraph: (CanvasGraphSnapshot & { previewNodeDataOverrides: Map<string, unknown> }) | null = null;

vi.mock("@/components/canvas/canvas-graph-context", () => ({
  useCanvasGraph: () => {
    if (!currentGraph) {
      throw new Error("Graph not configured for test");
    }

    return currentGraph;
  },
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: (options: unknown) => {
    pipelinePreviewMock(options);
    return {
      canvasRef: { current: null },
      histogram: {
        rgb: Array.from({ length: 256 }, () => 0),
        red: Array.from({ length: 256 }, () => 0),
        green: Array.from({ length: 256 }, () => 0),
        blue: Array.from({ length: 256 }, () => 0),
        max: 0,
      },
      isRendering: false,
      hasSource: true,
      previewAspectRatio: 1,
      error: null,
    };
  },
}));

vi.mock("@xyflow/react", () => ({
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}));

import AdjustmentPreview from "@/components/canvas/nodes/adjustment-preview";

describe("AdjustmentPreview", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    pipelinePreviewMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
    currentGraph = null;
  });

  it("includes upstream crop steps for adjustment previews", async () => {
    currentGraph = {
      ...buildGraphSnapshot(
        [
          {
            id: "image-1",
            type: "image",
            data: { url: "https://cdn.example.com/source.png" },
          },
          {
            id: "crop-1",
            type: "crop",
            data: {
              crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
              resize: { mode: "source", fit: "cover", keepAspect: true },
            },
          },
          {
            id: "curves-1",
            type: "curves",
            data: DEFAULT_CURVES_DATA,
          },
        ],
        [
          { source: "image-1", target: "crop-1" },
          { source: "crop-1", target: "curves-1" },
        ],
      ),
      previewNodeDataOverrides: new Map(),
    };

    const currentParams = {
      ...DEFAULT_CURVES_DATA,
      levels: {
        ...DEFAULT_CURVES_DATA.levels,
        gamma: 1.4,
      },
    };

    await act(async () => {
      root?.render(
        React.createElement(AdjustmentPreview, {
          nodeId: "curves-1",
          nodeWidth: 320,
          currentType: "curves",
          currentParams,
        }),
      );
    });

    expect(pipelinePreviewMock).toHaveBeenCalledTimes(1);
    expect(pipelinePreviewMock.mock.calls[0]?.[0]).toMatchObject({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [
        {
          nodeId: "crop-1",
          type: "crop",
          params: {
            crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
            resize: { mode: "source", fit: "cover", keepAspect: true },
          },
        },
        {
          nodeId: "curves-1",
          type: "curves",
          params: currentParams,
        },
      ],
    });
  });

  it("uses bg-remove-output as an alpha-bearing preview source", async () => {
    currentGraph = {
      ...buildGraphSnapshot(
        [
          {
            id: "bg-output-1",
            type: "bg-remove-output",
            data: { url: "https://cdn.example.com/cutout.png" },
          },
          {
            id: "curves-1",
            type: "curves",
            data: DEFAULT_CURVES_DATA,
          },
        ],
        [{ source: "bg-output-1", target: "curves-1" }],
      ),
      previewNodeDataOverrides: new Map(),
    };

    await act(async () => {
      root?.render(
        React.createElement(AdjustmentPreview, {
          nodeId: "curves-1",
          nodeWidth: 320,
          currentType: "curves",
          currentParams: DEFAULT_CURVES_DATA,
        }),
      );
    });

    expect(pipelinePreviewMock).toHaveBeenCalledTimes(1);
    expect(pipelinePreviewMock.mock.calls[0]?.[0]).toMatchObject({
      sourceUrl: "https://cdn.example.com/cutout.png",
    });
    expect(container?.querySelector('[data-alpha-source="true"]')).toBeTruthy();
  });
});
