// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyHistogram } from "@/lib/image-pipeline/histogram";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const workerClientMocks = vi.hoisted(() => ({
  getLastBackendDiagnostics: vi.fn(() => null),
  renderPreviewWithWorkerFallback: vi.fn(),
}));

const PREVIEW_SETTLE_MS = 80;

vi.mock("@/lib/image-pipeline/worker-client", () => ({
  getLastBackendDiagnostics: workerClientMocks.getLastBackendDiagnostics,
  isPipelineAbortError: () => false,
  renderPreviewWithWorkerFallback: workerClientMocks.renderPreviewWithWorkerFallback,
}));

import { usePipelinePreview } from "@/hooks/use-pipeline-preview";

function createPreviewResult(width: number, height: number) {
  return {
    width,
    height,
    imageData: { data: new Uint8ClampedArray(width * height * 4) },
    histogram: emptyHistogram(),
  };
}

function createDeferredPreviewResult() {
  let resolve: ((value: ReturnType<typeof createPreviewResult>) => void) | null = null;

  return {
    promise: new Promise<ReturnType<typeof createPreviewResult>>((innerResolve) => {
      resolve = innerResolve;
    }),
    resolve(value: ReturnType<typeof createPreviewResult>) {
      resolve?.(value);
    },
  };
}

function createLightAdjustSteps(brightness: number): PipelineStep[] {
  return [
    {
      nodeId: "light-1",
      type: "light-adjust",
      params: { brightness },
    },
  ];
}

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
  debounceMs,
}: {
  sourceUrl: string | null;
  steps: PipelineStep[];
  includeHistogram?: boolean;
  debounceMs?: number;
}) {
  const { canvasRef, histogram, error, isRendering } = usePipelinePreview({
    sourceUrl,
    steps,
    nodeWidth: 320,
    includeHistogram,
    debounceMs,
  });

  useEffect(() => {
    previewHarnessState.latestHistogram = histogram;
    previewHarnessState.latestError = error;
    previewHarnessState.latestIsRendering = isRendering;
  }, [error, histogram, isRendering]);

  return createElement("canvas", { ref: canvasRef });
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("usePipelinePreview", () => {
  let putImageDataSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    previewHarnessState.latestHistogram = emptyHistogram();
    previewHarnessState.latestError = null;
    previewHarnessState.latestIsRendering = false;
    workerClientMocks.getLastBackendDiagnostics.mockReset();
    workerClientMocks.getLastBackendDiagnostics.mockReturnValue(null);
    workerClientMocks.renderPreviewWithWorkerFallback.mockReset();
    workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValue({
      width: 120,
      height: 80,
      imageData: { data: new Uint8ClampedArray(120 * 80 * 4) },
      histogram: emptyHistogram(),
    });

    putImageDataSpy = vi.fn();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData: putImageDataSpy,
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
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
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
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
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
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
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
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: true,
      }),
    );
    expect(previewHarnessState.latestHistogram).toEqual(histogram);
  });

  it("restarts preview rendering when the computed preview width changes", async () => {
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
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
      await Promise.resolve();
    });

    function WidePreviewHarness() {
      const { canvasRef } = usePipelinePreview({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        nodeWidth: 640,
        includeHistogram: false,
      });

      return createElement("canvas", { ref: canvasRef });
    }

    await act(async () => {
      root?.render(createElement(WidePreviewHarness));
    });

    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_SETTLE_MS);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(2);
    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        previewWidth: 320,
      }),
    );
    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        previewWidth: 640,
      }),
    );
  });

  it("only commits the latest visible preview after rapid sequential invalidations", async () => {
    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(10),
          includeHistogram: false,
        }),
      );
    });

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(20),
          includeHistogram: false,
        }),
      );
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(30),
          includeHistogram: false,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: createLightAdjustSteps(30),
      }),
    );
    expect(putImageDataSpy).toHaveBeenCalledTimes(1);
  });

  it("does not let stale finished renders overwrite a newer preview", async () => {
    const firstRender = createDeferredPreviewResult();
    const secondRender = createDeferredPreviewResult();

    workerClientMocks.renderPreviewWithWorkerFallback.mockReset();
    workerClientMocks.renderPreviewWithWorkerFallback
      .mockReturnValueOnce(firstRender.promise)
      .mockReturnValueOnce(secondRender.promise);

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(10),
          includeHistogram: false,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(20),
          includeHistogram: false,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    const latestResult = createPreviewResult(240, 120);
    await act(async () => {
      secondRender.resolve(latestResult);
      await Promise.resolve();
    });

    await act(async () => {
      firstRender.resolve(createPreviewResult(120, 80));
      await Promise.resolve();
    });

    const canvas = container?.querySelector("canvas");

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(2);
    expect(putImageDataSpy).toHaveBeenCalledTimes(1);
    expect(putImageDataSpy).toHaveBeenCalledWith(latestResult.imageData, 0, 0);
    expect(canvas?.width).toBe(240);
    expect(canvas?.height).toBe(120);
  });

  it("coalesces slider churn so transient values do not fan out one render per value", async () => {
    workerClientMocks.renderPreviewWithWorkerFallback.mockImplementation(
      () => new Promise(() => undefined),
    );

    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(10),
          includeHistogram: false,
        }),
      );
    });

    for (const brightness of [20, 30, 40, 50]) {
      await act(async () => {
        vi.advanceTimersByTime(20);
        await Promise.resolve();
      });

      expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(0);

      await act(async () => {
        root?.render(
          createElement(PreviewHarness, {
            sourceUrl: "https://cdn.example.com/source.png",
            steps: createLightAdjustSteps(brightness),
            includeHistogram: false,
          }),
        );
      });
    }

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: createLightAdjustSteps(50),
      }),
    );
  });

  it("supports a faster debounce override for local preview updates", async () => {
    await act(async () => {
      root?.render(
        createElement(PreviewHarness, {
          sourceUrl: "https://cdn.example.com/source.png",
          steps: createLightAdjustSteps(10),
          includeHistogram: false,
          debounceMs: 16,
        }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(15);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
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

  it("disables histogram for fast-path AdjustmentPreview", async () => {
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
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map([["light-1", { brightness: 10 }]]),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      collectPipelineFromGraph: () => [
        {
          nodeId: "light-1",
          type: "light-adjust",
          params: { brightness: 10 },
        },
      ],
      getSourceImageFromGraph: () => "https://cdn.example.com/source.png",
      shouldFastPathPreviewPipeline: (steps: PipelineStep[], overrides: Map<string, unknown>) =>
        steps.some((step) => overrides.has(step.nodeId)),
    }));

    const adjustmentPreviewModule = await import("@/components/canvas/nodes/adjustment-preview");
    const AdjustmentPreview = adjustmentPreviewModule.default;

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
        includeHistogram: false,
        debounceMs: 16,
      }),
    );
  });

  it("does not fast-path AdjustmentPreview when overrides belong to another pipeline", async () => {
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
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map([["other-node", { brightness: 10 }]]),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      collectPipelineFromGraph: () => [
        {
          nodeId: "light-1",
          type: "light-adjust",
          params: { brightness: 10 },
        },
      ],
      getSourceImageFromGraph: () => "https://cdn.example.com/source.png",
      shouldFastPathPreviewPipeline: (steps: PipelineStep[], overrides: Map<string, unknown>) =>
        steps.some((step) => overrides.has(step.nodeId)),
    }));

    const adjustmentPreviewModule = await import("@/components/canvas/nodes/adjustment-preview");
    const AdjustmentPreview = adjustmentPreviewModule.default;

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
        debounceMs: undefined,
      }),
    );
  });

  it("keeps histogram enabled for downstream AdjustmentPreview fast path", async () => {
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
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map([["upstream-node", { brightness: 10 }]]),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      collectPipelineFromGraph: () => [
        {
          nodeId: "upstream-node",
          type: "light-adjust",
          params: { brightness: 10 },
        },
        {
          nodeId: "light-1",
          type: "light-adjust",
          params: { brightness: 20 },
        },
      ],
      getSourceImageFromGraph: () => "https://cdn.example.com/source.png",
      shouldFastPathPreviewPipeline: (steps: PipelineStep[], overrides: Map<string, unknown>) =>
        steps.some((step) => overrides.has(step.nodeId)),
    }));

    const adjustmentPreviewModule = await import("@/components/canvas/nodes/adjustment-preview");
    const AdjustmentPreview = adjustmentPreviewModule.default;

    await act(async () => {
      root?.render(
        createElement(AdjustmentPreview, {
          nodeId: "light-1",
          nodeWidth: 320,
          currentType: "light-adjust",
          currentParams: { brightness: 20 },
        }),
      );
    });

    expect(hookSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        includeHistogram: true,
        debounceMs: 16,
      }),
    );
  });

  it("requests fast preview rendering without histogram work in CompareSurface and RenderNode", async () => {
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
      useConnection: () => ({ inProgress: false }),
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
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map([
          ["compare-step", { brightness: 20 }],
          ["render-1-pipeline", { format: "png" }],
        ]),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      resolveRenderPreviewInputFromGraph: () => ({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "render-1-pipeline",
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
      }),
      findSourceNodeFromGraph: () => null,
      shouldFastPathPreviewPipeline: (steps: PipelineStep[], overrides: Map<string, unknown>) =>
        steps.some((step) => overrides.has(step.nodeId)),
    }));
    vi.doMock("@/lib/canvas-utils", () => ({
      resolveMediaAspectRatio: () => null,
      canvasHandleAccentColor: () => "rgb(13, 148, 136)",
      canvasHandleAccentColorWithAlpha: () => "rgba(13, 148, 136, 0.4)",
      canvasHandleGlowShadow: () => "none",
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
              steps: [
                {
                  nodeId: "compare-step",
                  type: "light-adjust",
                  params: { brightness: 20 },
                },
              ],
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

    expect(hookSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "compare-step",
            type: "light-adjust",
            params: { brightness: 20 },
          },
        ],
        debounceMs: 16,
      }),
    );
    expect(hookSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "render-1-pipeline",
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
        debounceMs: 16,
      }),
    );
    expect(hookSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: null,
        debounceMs: 16,
      }),
    );
  });

  it("does not fast-path CompareSurface or RenderNode for unrelated overrides", async () => {
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
      useConnection: () => ({ inProgress: false }),
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
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map([["unrelated-node", { format: "png" }]]),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      resolveRenderPreviewInputFromGraph: ({ nodeId }: { nodeId: string }) => ({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: `${nodeId}-pipeline`,
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
      }),
      findSourceNodeFromGraph: () => null,
      shouldFastPathPreviewPipeline: (steps: PipelineStep[], overrides: Map<string, unknown>) =>
        steps.some((step) => overrides.has(step.nodeId)),
    }));
    vi.doMock("@/lib/canvas-utils", () => ({
      resolveMediaAspectRatio: () => null,
      canvasHandleAccentColor: () => "rgb(13, 148, 136)",
      canvasHandleAccentColorWithAlpha: () => "rgba(13, 148, 136, 0.4)",
      canvasHandleGlowShadow: () => "none",
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
              steps: [
                {
                  nodeId: "compare-pipeline",
                  type: "light-adjust",
                  params: { brightness: 10 },
                },
              ],
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

    expect(hookSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "compare-pipeline",
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
        debounceMs: undefined,
      }),
    );
    expect(hookSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "render-1-pipeline",
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
        debounceMs: undefined,
      }),
    );
    expect(hookSpy).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        includeHistogram: false,
        sourceUrl: null,
        steps: [
          {
            nodeId: "render-1-pipeline",
            type: "light-adjust",
            params: { brightness: 10 },
          },
        ],
        debounceMs: undefined,
      }),
    );
  });

  it("prefers preview aspect ratio for RenderNode resize when pipeline contains crop", async () => {
    const queueNodeResizeCalls: unknown[] = [];
    let queueNodeResize = vi.fn(async (args: unknown) => {
      queueNodeResizeCalls.push(args);
    });

    vi.doMock("@/hooks/use-pipeline-preview", () => ({
      usePipelinePreview: () => ({
        canvasRef: { current: null },
        histogram: emptyHistogram(),
        isRendering: false,
        hasSource: true,
        previewAspectRatio: 1,
        error: null,
      }),
    }));
    vi.doMock("@xyflow/react", () => ({
      Handle: () => null,
      Position: { Left: "left", Right: "right" },
      useConnection: () => ({ inProgress: false }),
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
        queueNodeResize,
        status: { isOffline: false },
      }),
    }));
    vi.doMock("@/hooks/use-debounced-callback", () => ({
      useDebouncedCallback: (callback: () => void) => callback,
    }));
    vi.doMock("@/components/canvas/canvas-graph-context", () => ({
      useCanvasGraph: () => ({
        nodes: [],
        edges: [],
        previewNodeDataOverrides: new Map(),
      }),
    }));
    vi.doMock("@/lib/canvas-render-preview", () => ({
      resolveRenderPreviewInputFromGraph: () => ({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [
          {
            nodeId: "crop-1",
            type: "crop",
            params: { cropRect: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
          },
        ],
      }),
      findSourceNodeFromGraph: () => ({
        id: "image-1",
        type: "image",
        data: { width: 1200, height: 800 },
      }),
      shouldFastPathPreviewPipeline: () => false,
    }));
    vi.doMock("@/lib/canvas-utils", () => ({
      resolveMediaAspectRatio: () => null,
      canvasHandleAccentColor: () => "rgb(13, 148, 136)",
      canvasHandleAccentColorWithAlpha: () => "rgba(13, 148, 136, 0.4)",
      canvasHandleGlowShadow: () => "none",
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

    const renderNodeModule = await import("@/components/canvas/nodes/render-node");
    const RenderNode = renderNodeModule.default;

    await act(async () => {
      root?.render(
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
          width: 450,
          height: 300,
          sourcePosition: undefined,
          targetPosition: undefined,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as never),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(queueNodeResizeCalls).toEqual([
      expect.objectContaining({
        nodeId: "render-1",
        width: 450,
        height: 450,
      }),
    ]);

    queueNodeResize = vi.fn(async (args: unknown) => {
      queueNodeResizeCalls.push(args);
    });

    await act(async () => {
      root?.render(
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
          width: 450,
          height: 300,
          sourcePosition: undefined,
          targetPosition: undefined,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        } as never),
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(queueNodeResizeCalls).toHaveLength(1);
  });
});
