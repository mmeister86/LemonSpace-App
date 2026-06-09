// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildGraphSnapshot,
  type CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";
import { emptyHistogram } from "@/lib/image-pipeline/histogram";
import type { PersistedRenderData } from "@/components/canvas/nodes/render-node-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TestCanvasGraph = CanvasGraphSnapshot & {
  previewNodeDataOverrides: Map<string, unknown>;
};

let currentGraph: TestCanvasGraph | null = null;
let latestTargetAspectRatio: number | null | undefined;
let currentPreviewAspectRatio = 6;

vi.mock("@/components/canvas/canvas-graph-context", () => ({
  useCanvasGraph: () => {
    if (!currentGraph) {
      throw new Error("Test graph was not configured.");
    }
    return currentGraph;
  },
}));

vi.mock("@/components/canvas/use-zoom-aware-preview-quality", () => ({
  useZoomAwarePreviewQuality: () => ({
    previewQuality: "standard",
    sourceQuality: undefined,
  }),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: () => ({
    canvasRef: { current: null },
    histogram: emptyHistogram(),
    isRendering: false,
    hasSource: true,
    previewAspectRatio: currentPreviewAspectRatio,
    error: null,
  }),
}));

import { useRenderNodePreview } from "@/components/canvas/nodes/use-render-node-preview";

const localData: PersistedRenderData = {
  outputResolution: "original",
  format: "png",
  jpegQuality: 90,
};

function HookHarness() {
  const state = useRenderNodePreview({
    id: "render-1",
    localData,
    width: 420,
    height: 320,
    isFullscreenOpen: false,
  });

  useEffect(() => {
    latestTargetAspectRatio = state.targetAspectRatio;
  }, [state.targetAspectRatio]);

  return null;
}

describe("useRenderNodePreview", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    currentGraph = null;
    latestTargetAspectRatio = undefined;
    currentPreviewAspectRatio = 6;
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
    root = null;
    container = null;
    currentGraph = null;
  });

  it("uses the mixer base stage aspect ratio instead of a later layer source", async () => {
    currentGraph = {
      ...buildGraphSnapshot(
        [
          {
            id: "z-base-image",
            type: "image",
            data: {
              url: "https://cdn.example.com/base.png",
              intrinsicWidth: 700,
              intrinsicHeight: 1000,
            },
          },
          {
            id: "a-wide-logo",
            type: "asset",
            data: {
              url: "https://cdn.example.com/logo.png",
              intrinsicWidth: 3000,
              intrinsicHeight: 500,
            },
          },
          {
            id: "mixer-1",
            type: "mixer",
            data: {
              mixerVersion: 2,
              stage: null,
              layers: [],
            },
          },
          {
            id: "render-1",
            type: "render",
            data: {},
          },
        ],
        [
          { source: "z-base-image", target: "mixer-1", targetHandle: "layer-in" },
          { source: "a-wide-logo", target: "mixer-1", targetHandle: "layer-in-2" },
          { source: "mixer-1", target: "render-1" },
        ],
      ),
      previewNodeDataOverrides: new Map(),
    };

    await act(async () => {
      root?.render(createElement(HookHarness));
    });

    expect(latestTargetAspectRatio).toBeCloseTo(0.7, 5);
  });

  it("does not fall back to a later source node when mixer composition dimensions are unavailable", async () => {
    currentPreviewAspectRatio = 0.7;
    currentGraph = {
      ...buildGraphSnapshot(
        [
          {
            id: "z-base-image",
            type: "image",
            data: {
              url: "https://cdn.example.com/base.png",
              width: 700,
              height: 1000,
            },
          },
          {
            id: "a-wide-logo",
            type: "asset",
            data: {
              url: "https://cdn.example.com/logo.png",
              intrinsicWidth: 3000,
              intrinsicHeight: 500,
            },
          },
          {
            id: "mixer-1",
            type: "mixer",
            data: {},
          },
          {
            id: "render-1",
            type: "render",
            data: {},
          },
        ],
        [
          { source: "z-base-image", target: "mixer-1", targetHandle: "base" },
          { source: "a-wide-logo", target: "mixer-1", targetHandle: "overlay" },
          { source: "mixer-1", target: "render-1" },
        ],
      ),
      previewNodeDataOverrides: new Map(),
    };

    await act(async () => {
      root?.render(createElement(HookHarness));
    });

    expect(latestTargetAspectRatio).toBeCloseTo(0.7, 5);
  });
});
