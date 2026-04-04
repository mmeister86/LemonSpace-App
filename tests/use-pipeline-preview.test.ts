// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyHistogram } from "@/lib/image-pipeline/histogram";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const workerClientMocks = vi.hoisted(() => ({
  renderPreviewWithWorkerFallback: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/worker-client", () => ({
  isPipelineAbortError: () => false,
  renderPreviewWithWorkerFallback: workerClientMocks.renderPreviewWithWorkerFallback,
}));

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";

const previewHarnessState = {
  latestHistogram: emptyHistogram(),
  latestError: null as string | null,
  latestIsRendering: false,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function PreviewHarness({
  sourceUrl,
  steps,
  includeHistogram,
}: {
  sourceUrl: string | null;
  steps: PipelineStep[];
  includeHistogram?: boolean;
}) {
  const { canvasRef, histogram, error, isRendering } = usePipelinePreview({
    sourceUrl,
    steps,
    nodeWidth: 320,
    includeHistogram,
  });

  previewHarnessState.latestHistogram = histogram;
  previewHarnessState.latestError = error;
  previewHarnessState.latestIsRendering = isRendering;

  return createElement("canvas", { ref: canvasRef });
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePipelinePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    previewHarnessState.latestHistogram = emptyHistogram();
    previewHarnessState.latestError = null;
    previewHarnessState.latestIsRendering = false;
    workerClientMocks.renderPreviewWithWorkerFallback.mockReset();
    workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValue({
      width: 120,
      height: 80,
      imageData: { data: new Uint8ClampedArray(120 * 80 * 4) },
      histogram: emptyHistogram(),
    });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("does not restart preview rendering when only step references change", async () => {
    const stepsA: PipelineStep[] = [
      {
        nodeId: "light-1",
        type: "light-adjust",
        params: { brightness: 10 },
      },
    ];

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: stepsA,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    const stepsB: PipelineStep[] = [
      {
        nodeId: "light-1",
        type: "light-adjust",
        params: { brightness: 10 },
      },
    ];

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: stepsB,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
  });

  it("renders image output when histogram work is disabled", async () => {
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);

    workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValueOnce({
      width: 64,
      height: 32,
      imageData: { data: new Uint8ClampedArray(64 * 32 * 4) },
      histogram: emptyHistogram(),
    });

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: [],
          includeHistogram: false,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: false,
      }),
    );
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(previewHarnessState.latestHistogram).toEqual(emptyHistogram());
  });

  it("keeps histogram data available when explicitly requested", async () => {
    const histogram = {
      red: Array.from({ length: 256 }, (_, index) => index),
      green: Array.from({ length: 256 }, (_, index) => index + 1),
      blue: Array.from({ length: 256 }, (_, index) => index + 2),
      rgb: Array.from({ length: 256 }, (_, index) => index + 3),
    };

    workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValueOnce({
      width: 64,
      height: 32,
      imageData: { data: new Uint8ClampedArray(64 * 32 * 4) },
      histogram,
    });

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: [],
          includeHistogram: true,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(16);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: true,
      }),
    );
    expect(previewHarnessState.latestHistogram).toEqual(histogram);
  });
});

describe("preview histogram call sites", () => {
  beforeEach(() => {
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
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("keeps histogram enabled for AdjustmentPreview", async () => {
    const hookSpy = vi.fn(() => ({
      canvasRef: { current: null },
      histogram: emptyHistogram(),
      isRendering: false,
      hasSource: true,
      previewAspectRatio: 1,
      error: null,
    }));

    vi.doMock("@/hooks/use-pipeline-preview", () => ({
      usePipelinePreview: hookSpy,
    }));
    vi.doMock("@/components/canvas/canvas-graph-context", () => ({
      useCanvasGraph: () => ({ nodes: [], edges: [] }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      collectPipelineFromGraph: () => [],
      getSourceImageFromGraph: () => "https://cdn.example.com/source.png",
    }));

    const module = await import("@/components/canvas/nodes/adjustment-preview");
    const AdjustmentPreview = module.default;

    await act(async () => {
      root?.render(
        createElement(AdjustmentPreview, {
          nodeId: "light-1",
          nodeWidth: 320,
          currentType: "light-adjust",
          currentParams: { brightness: 10 },
        }),
      );
    });

    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: true,
      }),
    );
  });

  it("requests previews without histogram work in CompareSurface and fullscreen RenderNode", async () => {
    const hookSpy = vi.fn(() => ({
      canvasRef: { current: null },
      histogram: emptyHistogram(),
      isRendering: false,
      hasSource: true,
      previewAspectRatio: 1,
      error: null,
    }));

    vi.doMock("@/hooks/use-pipeline-preview", () => ({
      usePipelinePreview: hookSpy,
    }));
    vi.doMock("@xyflow/react", () => ({
      Handle: () => null,
      Position: { Left: "left", Right: "right" },
    }));
    vi.doMock("convex/react", () => ({
      useMutation: () => vi.fn(async () => undefined),
    }));
    vi.doMock("lucide-react", () => ({
      AlertCircle: () => null,
      ArrowDown: () => null,
      CheckCircle2: () => null,
      CloudUpload: () => null,
      Loader2: () => null,
      Maximize2: () => null,
      X: () => null,
    }));
    vi.doMock("@/components/canvas/nodes/base-node-wrapper", () => ({
      default: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
    }));
    vi.doMock("@/components/canvas/nodes/adjustment-controls", () => ({
      SliderRow: () => null,
    }));
    vi.doMock("@/components/ui/select", () => ({
      Select: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      SelectContent: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      SelectItem: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      SelectTrigger: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      SelectValue: () => null,
    }));
    vi.doMock("@/components/canvas/canvas-sync-context", () => ({
      useCanvasSync: () => ({
        queueNodeDataUpdate: vi.fn(async () => undefined),
        queueNodeResize: vi.fn(async () => undefined),
        status: { isOffline: false },
      }),
    }));
    vi.doMock("@/hooks/use-debounced-callback", () => ({
      useDebouncedCallback: (callback: () => void) => callback,
    }));
    vi.doMock("@/components/canvas/canvas-graph-context", () => ({
      useCanvasGraph: () => ({ nodes: [], edges: [] }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      resolveRenderPreviewInputFromGraph: () => ({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
      }),
      findSourceNodeFromGraph: () => null,
    }));
    vi.doMock("@/lib/canvas-utils", () => ({
      resolveMediaAspectRatio: () => null,
    }));
    vi.doMock("@/lib/image-formats", () => ({
      parseAspectRatioString: () => ({ w: 1, h: 1 }),
    }));
    vi.doMock("@/lib/image-pipeline/contracts", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/contracts")>(
        "@/lib/image-pipeline/contracts",
      );
      return {
        ...actual,
        hashPipeline: () => "pipeline-hash",
      };
    });
    vi.doMock("@/lib/image-pipeline/worker-client", () => ({
      isPipelineAbortError: () => false,
      renderFullWithWorkerFallback: vi.fn(),
    }));
    vi.doMock("@/components/ui/dialog", () => ({
      Dialog: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      DialogContent: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
      DialogTitle: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
    }));

    const compareSurfaceModule = await import("@/components/canvas/nodes/compare-surface");
    const CompareSurface = compareSurfaceModule.default;
    const renderNodeModule = await import("@/components/canvas/nodes/render-node");
    const RenderNode = renderNodeModule.default;

    await act(async () => {
      root?.render(
        createElement("div", null,
          createElement(CompareSurface, {
            nodeWidth: 320,
            previewInput: {
              sourceUrl: "https://cdn.example.com/source.png",
              steps: [],
            },
            preferPreview: true,
          }),
          createElement(RenderNode, {
            id: "render-1",
            data: {},
            selected: false,
            dragging: false,
            zIndex: 0,
            isConnectable: true,
            type: "render",
            xPos: 0,
            yPos: 0,
            width: 320,
            height: 300,
            sourcePosition: undefined,
            targetPosition: undefined,
            positionAbsoluteX: 0,
            positionAbsoluteY: 0,
          } as never),
        ),
      );
    });

    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: "https://cdn.example.com/source.png",
      }),
    );
    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: null,
      }),
    );
  });
});
