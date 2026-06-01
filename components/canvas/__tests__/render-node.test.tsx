// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RenderNode from "@/components/canvas/nodes/render-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ResizeObserverEntryLike = {
  target: Element;
  contentRect: {
    width: number;
    height: number;
  };
};

const mocks = vi.hoisted(() => ({
  previewArgs: [] as Array<{ width?: number; height?: number }>,
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
  handleRender: vi.fn(async () => undefined),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    queueNodeResize: mocks.queueNodeResize,
    status: { isOffline: false },
  }),
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({
    children,
    className,
    contentClassName,
  }: {
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
  }) => (
    <div data-testid="mock-base-node-wrapper" className={className}>
      <div data-testid="mock-base-node-content" className={contentClassName}>
        {children}
      </div>
    </div>
  ),
}));

vi.mock("@/components/canvas/nodes/use-render-node-preview", () => ({
  useRenderNodePreview: (args: { width?: number; height?: number }) => {
    mocks.previewArgs.push(args);
    return {
      sourceUrl: "https://cdn.example.com/source.png",
      sourceComposition: undefined,
      steps: [],
      currentPipelineHash: "pipeline-hash",
      hasSource: true,
      isAlphaBearing: false,
      targetAspectRatio: 4 / 3,
      preview: {
        canvasRef: { current: null },
        histogram: { red: [], green: [], blue: [], luminance: [] },
        isRendering: false,
        hasSource: true,
        previewAspectRatio: 4 / 3,
        error: null,
      },
      fullscreenPreview: {
        canvasRef: { current: null },
        histogram: { red: [], green: [], blue: [], luminance: [] },
        isRendering: false,
        hasSource: true,
        previewAspectRatio: 4 / 3,
        error: null,
      },
      histogramPlot: {
        polylines: {
          rgb: "",
          red: "",
          green: "",
          blue: "",
        },
      },
    };
  },
}));

vi.mock("@/components/canvas/nodes/use-render-node-rendering", () => ({
  useRenderNodeRendering: () => ({
    isRendering: false,
    isUploading: false,
    handleRender: mocks.handleRender,
  }),
}));

describe("RenderNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let resizeObserverCallback:
    | ((entries: ResizeObserverEntryLike[]) => void)
    | null = null;
  let previousResizeObserver: typeof globalThis.ResizeObserver | undefined;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.previewArgs.length = 0;
    mocks.queueNodeDataUpdate.mockClear();
    mocks.queueNodeResize.mockClear();
    mocks.handleRender.mockClear();
    resizeObserverCallback = null;
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    previousResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class ResizeObserver {
      constructor(callback: (entries: ResizeObserverEntryLike[]) => void) {
        resizeObserverCallback = callback;
      }

      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
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
    resizeObserverCallback = null;
    consoleInfoSpy?.mockRestore();
    consoleInfoSpy = null;
    globalThis.ResizeObserver = previousResizeObserver as typeof ResizeObserver;
  });

  async function renderNode() {
    await act(async () => {
      root?.render(
        <RenderNode
          {...({
            id: "render-1",
            data: {},
            selected: false,
            width: 640,
            height: 480,
          } as React.ComponentProps<typeof RenderNode>)}
        />,
      );
    });
  }

  it("sizes the render preview from the measured viewport instead of the outer node", async () => {
    await renderNode();

    const previewFrame = container?.querySelector(
      '[data-testid="render-preview-frame"]',
    ) as HTMLElement | null;
    expect(previewFrame).toBeInstanceOf(HTMLElement);
    expect(resizeObserverCallback).toBeTypeOf("function");

    const previewViewport = previewFrame?.parentElement?.parentElement as HTMLElement | null;
    expect(previewViewport).toBeInstanceOf(HTMLElement);

    await act(async () => {
      resizeObserverCallback?.([
        {
          target: previewViewport as HTMLElement,
          contentRect: { width: 468, height: 312 },
        },
      ]);
    });

    expect(previewFrame?.style.width).toBe("416px");
    expect(previewFrame?.style.height).toBe("312px");
    expect(mocks.previewArgs.at(-1)).toMatchObject({ width: 468 });
  });

  it("keeps the render preview viewport flexible inside the node body", async () => {
    await renderNode();

    const previewFrame = container?.querySelector(
      '[data-testid="render-preview-frame"]',
    ) as HTMLElement | null;
    const previewViewport = previewFrame?.parentElement?.parentElement as HTMLElement | null;
    const baseNodeContent = container?.querySelector(
      '[data-testid="mock-base-node-content"]',
    ) as HTMLElement | null;

    expect(baseNodeContent?.className).toContain("flex");
    expect(baseNodeContent?.className).toContain("flex-col");
    expect(previewViewport?.className).toContain("min-h-0");
    expect(previewViewport?.className).not.toContain("min-h-[300px]");
  });
});
