// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

type ResizeObserverEntryLike = {
  target: Element;
  contentRect: { width: number; height: number };
};

const storeState: StoreState = {
  nodes: [],
  edges: [],
};

const compareSurfaceSpy = vi.fn();
let resizeObserverCallback:
  | ((entries: ResizeObserverEntryLike[]) => void)
  | null = null;

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useStore: (selector: (state: StoreState) => unknown) => selector(storeState),
}));

vi.mock("@/hooks/use-pipeline-preview", () => ({
  usePipelinePreview: () => ({
    canvasRef: { current: null },
    isRendering: false,
    error: null,
  }),
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    storeState.nodes = [];
    storeState.edges = [];
    compareSurfaceSpy.mockReset();
    resizeObserverCallback = null;
    globalThis.ResizeObserver = class ResizeObserver {
      constructor(callback: (entries: ResizeObserverEntryLike[]) => void) {
        resizeObserverCallback = callback;
      }

      observe(target: Element) {
        resizeObserverCallback?.([
          {
            target,
            contentRect: { width: 500, height: 380 },
          },
        ]);
      }

      unobserve() {}

      disconnect() {}
    } as unknown as typeof ResizeObserver;
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

  it("defaults mixer-backed render compare inputs to preview mode when only sourceComposition exists", () => {
    storeState.nodes = [
      {
        id: "base-image",
        type: "image",
        data: { url: "https://cdn.example.com/base.png" },
      },
      {
        id: "overlay-image",
        type: "asset",
        data: { url: "https://cdn.example.com/overlay.png" },
      },
      {
        id: "mixer-1",
        type: "mixer",
        data: {
          blendMode: "multiply",
          opacity: 62,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.4,
          overlayHeight: 0.5,
          cropLeft: 0.1,
          cropTop: 0,
          cropRight: 0.2,
          cropBottom: 0.1,
        },
      },
      {
        id: "render-1",
        type: "render",
        data: {
          lastUploadUrl: "https://cdn.example.com/stale-render-output.png",
        },
      },
    ];
    storeState.edges = [
      {
        id: "edge-base-mixer",
        source: "base-image",
        target: "mixer-1",
        targetHandle: "base",
      },
      {
        id: "edge-overlay-mixer",
        source: "overlay-image",
        target: "mixer-1",
        targetHandle: "overlay",
      },
      { id: "edge-mixer-render", source: "mixer-1", target: "render-1" },
      {
        id: "edge-render-compare",
        source: "render-1",
        target: "compare-1",
        targetHandle: "left",
      },
    ];

    renderCompareNode({
      id: "compare-1",
      data: { leftUrl: "https://cdn.example.com/stale-render-output.png" },
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
      finalUrl: "https://cdn.example.com/stale-render-output.png",
      preferPreview: true,
      previewInput: {
        sourceUrl: null,
        sourceComposition: {
          kind: "mixer",
          baseUrl: "https://cdn.example.com/base.png",
          overlayUrl: "https://cdn.example.com/overlay.png",
          blendMode: "multiply",
          opacity: 62,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.4,
          overlayHeight: 0.5,
          cropLeft: 0.1,
          cropTop: 0,
          cropRight: 0.2,
          cropBottom: 0.1,
        },
        steps: [],
      },
    });
  });

  it("prefers mixer composite preview over persisted compare finalUrl when mixer is connected", () => {
    storeState.nodes = [
      {
        id: "base-image",
        type: "image",
        data: { url: "https://cdn.example.com/base.png" },
      },
      {
        id: "overlay-image",
        type: "asset",
        data: { url: "https://cdn.example.com/overlay.png" },
      },
      {
        id: "mixer-1",
        type: "mixer",
        data: {
          blendMode: "multiply",
          opacity: 62,
          offsetX: 12,
          offsetY: -4,
        },
      },
      {
        id: "right-image",
        type: "image",
        data: { url: "https://cdn.example.com/right.png" },
      },
    ];
    storeState.edges = [
      {
        id: "edge-base-mixer",
        source: "base-image",
        target: "mixer-1",
        targetHandle: "base",
      },
      {
        id: "edge-overlay-mixer",
        source: "overlay-image",
        target: "mixer-1",
        targetHandle: "overlay",
      },
      {
        id: "edge-mixer-compare",
        source: "mixer-1",
        target: "compare-1",
        targetHandle: "left",
      },
      {
        id: "edge-image-compare",
        source: "right-image",
        target: "compare-1",
        targetHandle: "right",
      },
    ];

    renderCompareNode({
      id: "compare-1",
      data: {
        leftUrl: "https://cdn.example.com/base.png",
        rightUrl: "https://cdn.example.com/right.png",
      },
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

    expect(compareSurfaceSpy).toHaveBeenCalledTimes(2);
    const mixerCall = compareSurfaceSpy.mock.calls.find(
      ([props]) =>
        Boolean((props as { mixerPreviewState?: { status?: string } }).mixerPreviewState),
    );
    expect(mixerCall?.[0]).toMatchObject({
      finalUrl: undefined,
      nodeWidth: 500,
      nodeHeight: 380,
      mixerPreviewState: {
        status: "ready",
        baseUrl: "https://cdn.example.com/base.png",
        overlayUrl: "https://cdn.example.com/overlay.png",
        blendMode: "multiply",
        opacity: 62,
        overlayX: 0,
        overlayY: 0,
        overlayWidth: 1,
        overlayHeight: 1,
        cropLeft: 0,
        cropTop: 0,
        cropRight: 0,
        cropBottom: 0,
      },
    });
  });

  it("passes the measured compare surface size to mixer previews instead of the full node box", async () => {
    storeState.nodes = [
      {
        id: "base-image",
        type: "image",
        data: { url: "https://cdn.example.com/base.png" },
      },
      {
        id: "overlay-image",
        type: "asset",
        data: { url: "https://cdn.example.com/overlay.png" },
      },
      {
        id: "mixer-1",
        type: "mixer",
        data: {
          blendMode: "normal",
          opacity: 100,
          overlayX: 0.1,
          overlayY: 0.2,
          overlayWidth: 0.6,
          overlayHeight: 0.5,
        },
      },
    ];
    storeState.edges = [
      {
        id: "edge-base-mixer",
        source: "base-image",
        target: "mixer-1",
        targetHandle: "base",
      },
      {
        id: "edge-overlay-mixer",
        source: "overlay-image",
        target: "mixer-1",
        targetHandle: "overlay",
      },
      {
        id: "edge-mixer-compare",
        source: "mixer-1",
        target: "compare-1",
        targetHandle: "left",
      },
    ];

    await act(async () => {
      root?.render(
        <CanvasGraphProvider
          nodes={storeState.nodes as Array<{ id: string; type: string; data?: unknown }>}
          edges={storeState.edges}
        >
          <CompareNode
            {...({
              id: "compare-1",
              data: {},
              selected: false,
              dragging: false,
              zIndex: 0,
              isConnectable: true,
              type: "compare",
              xPos: 0,
              yPos: 0,
              width: 640,
              height: 480,
              sourcePosition: undefined,
              targetPosition: undefined,
              positionAbsoluteX: 0,
              positionAbsoluteY: 0,
            } as unknown as React.ComponentProps<typeof CompareNode>)}
          />
        </CanvasGraphProvider>,
      );
    });

    await vi.waitFor(() => {
      const latestCompareSurfaceCall = compareSurfaceSpy.mock.calls.findLast(
        ([props]) =>
          Boolean((props as { mixerPreviewState?: { status?: string } }).mixerPreviewState),
      );

      expect(latestCompareSurfaceCall?.[0]).toMatchObject({
        nodeWidth: 500,
        nodeHeight: 380,
      });
    });

    const surfaceElement = container?.querySelector(".nodrag.relative.min-h-0.w-full");
    expect(surfaceElement).toBeInstanceOf(HTMLDivElement);

    await act(async () => {
      resizeObserverCallback?.([
        {
          target: surfaceElement as HTMLDivElement,
          contentRect: { width: 468, height: 312 },
        },
      ]);
    });

    const latestCompareSurfaceCall = compareSurfaceSpy.mock.calls.findLast(
      ([props]) =>
        Boolean((props as { mixerPreviewState?: { status?: string } }).mixerPreviewState),
    );

    expect(latestCompareSurfaceCall?.[0]).toMatchObject({
      nodeWidth: 468,
      nodeHeight: 312,
    });
    expect(latestCompareSurfaceCall?.[0]).not.toMatchObject({
      nodeWidth: 640,
      nodeHeight: 480,
    });
  });

  it("anchors direct mixer previews to the actual compare surface rect", async () => {
    const compareSurfaceModule = await vi.importActual<typeof import("../nodes/compare-surface")>(
      "../nodes/compare-surface",
    );
    const ActualCompareSurface = compareSurfaceModule.default;

    await act(async () => {
      root?.render(
        <CanvasGraphProvider nodes={[]} edges={[]}>
          <ActualCompareSurface
            mixerPreviewState={{
              status: "ready",
              baseUrl: "https://cdn.example.com/base.png",
              overlayUrl: "https://cdn.example.com/overlay.png",
              blendMode: "normal",
              opacity: 100,
              overlayX: 0,
              overlayY: 0,
              overlayWidth: 1,
              overlayHeight: 1,
              cropLeft: 0,
              cropTop: 0,
              cropRight: 0,
              cropBottom: 0,
            }}
            nodeWidth={500}
            nodeHeight={380}
          />
        </CanvasGraphProvider>,
      );
    });

    const images = container?.querySelectorAll("img");
    const baseImage = images?.[0];

    if (!(baseImage instanceof HTMLImageElement)) {
      throw new Error("base image not found");
    }

    Object.defineProperty(baseImage, "naturalWidth", { configurable: true, value: 200 });
    Object.defineProperty(baseImage, "naturalHeight", { configurable: true, value: 100 });

    await act(async () => {
      baseImage.dispatchEvent(new Event("load"));
    });

    const overlayImage = container?.querySelectorAll("img")?.[1];
    if (!(overlayImage instanceof HTMLImageElement)) {
      throw new Error("overlay image not found");
    }

    Object.defineProperty(overlayImage, "naturalWidth", { configurable: true, value: 200 });
    Object.defineProperty(overlayImage, "naturalHeight", { configurable: true, value: 100 });

    await act(async () => {
      overlayImage.dispatchEvent(new Event("load"));
    });

    const overlayFrame = overlayImage.parentElement;
    expect(overlayFrame?.style.left).toBe("0%");
    expect(overlayFrame?.style.top).toBe("17.105263157894736%");
    expect(overlayFrame?.style.width).toBe("100%");
    expect(overlayFrame?.style.height).toBe("65.78947368421053%");
  });
});
