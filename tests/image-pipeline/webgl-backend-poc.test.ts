// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import type { ImagePipelineBackend } from "@/lib/image-pipeline/backend/backend-types";

function createCurvesStep(): PipelineStep {
  return {
    nodeId: "curves-1",
    type: "curves",
    params: {
      channelMode: "master",
      levels: {
        blackPoint: 0,
        whitePoint: 255,
        gamma: 1,
      },
      points: {
        rgb: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        red: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        green: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        blue: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
      },
    },
  };
}

function createColorAdjustStep(): PipelineStep {
  return {
    nodeId: "color-1",
    type: "color-adjust",
    params: {
      hsl: {
        hue: 0,
        saturation: 0,
        luminance: 0,
      },
      temperature: 0,
      tint: 0,
      vibrance: 0,
    },
  };
}

function createUnsupportedStep(): PipelineStep {
  return {
    nodeId: "light-1",
    type: "light-adjust",
    params: {
      exposure: 0,
    },
  };
}

function createCpuAndWebglBackends(args: {
  webglPreview?: ImagePipelineBackend["runPreviewStep"];
  cpuPreview?: ImagePipelineBackend["runPreviewStep"];
}): readonly ImagePipelineBackend[] {
  return [
    {
      id: "cpu",
      runPreviewStep: args.cpuPreview ?? vi.fn(),
      runFullPipeline: vi.fn(),
    },
    {
      id: "webgl",
      runPreviewStep: args.webglPreview ?? vi.fn(),
      runFullPipeline: vi.fn(),
    },
  ];
}

describe("webgl backend poc", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unmock("@/lib/image-pipeline/backend/capabilities");
    vi.unmock("@/lib/image-pipeline/backend/feature-flags");
    vi.unmock("@/lib/image-pipeline/backend/webgl/webgl-backend");
    vi.unmock("@/lib/image-pipeline/backend/backend-router");
    vi.unmock("@/lib/image-pipeline/source-loader");
  });

  it("selects webgl for preview when webgl is available and enabled", async () => {
    const webglPreview = vi.fn();

    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/feature-flags")>(
        "@/lib/image-pipeline/backend/feature-flags",
      );
      return {
        ...actual,
        getBackendFeatureFlags: () => ({
          forceCpu: false,
          webglEnabled: true,
          wasmEnabled: false,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/capabilities")>(
        "@/lib/image-pipeline/backend/capabilities",
      );
      return {
        ...actual,
        detectBackendCapabilities: () => ({
          webgl: true,
          wasmSimd: false,
          offscreenCanvas: true,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/webgl/webgl-backend", () => ({
      createWebglPreviewBackend: () => ({
        id: "webgl",
        runPreviewStep: webglPreview,
        runFullPipeline: vi.fn(),
      }),
    }));

    const { runPreviewStepWithBackendRouter } = await import("@/lib/image-pipeline/backend/backend-router");

    runPreviewStepWithBackendRouter({
      pixels: new Uint8ClampedArray(4),
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(webglPreview).toHaveBeenCalledTimes(1);
  });

  it("uses cpu for every step in a mixed pipeline request", async () => {
    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/feature-flags")>(
        "@/lib/image-pipeline/backend/feature-flags",
      );
      return {
        ...actual,
        getBackendFeatureFlags: () => ({
          forceCpu: false,
          webglEnabled: true,
          wasmEnabled: false,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/capabilities")>(
        "@/lib/image-pipeline/backend/capabilities",
      );
      return {
        ...actual,
        detectBackendCapabilities: () => ({
          webgl: true,
          wasmSimd: false,
          offscreenCanvas: true,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/webgl/webgl-backend", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/webgl/webgl-backend")>(
        "@/lib/image-pipeline/backend/webgl/webgl-backend",
      );
      return {
        ...actual,
      };
    });

    const backendRouterModule = await import("@/lib/image-pipeline/backend/backend-router");
    const runPreviewStepWithBackendRouter = vi
      .spyOn(backendRouterModule, "runPreviewStepWithBackendRouter")
      .mockImplementation(() => {});

    vi.doMock("@/lib/image-pipeline/source-loader", () => ({
      loadSourceBitmap: vi.fn().mockResolvedValue({ width: 2, height: 2 }),
    }));

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(16),
      })),
    } as unknown as CanvasRenderingContext2D);

    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);

    const { renderPreview } = await import("@/lib/image-pipeline/preview-renderer");

    await renderPreview({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [createColorAdjustStep(), createUnsupportedStep()],
      previewWidth: 2,
      includeHistogram: false,
    });

    expect(runPreviewStepWithBackendRouter).toHaveBeenCalledTimes(2);
    for (const call of runPreviewStepWithBackendRouter.mock.calls) {
      expect(call[0]).toMatchObject({
        backendHint: "cpu",
      });
    }
  });

  it("downgrades compile/link failures to cpu with runtime_error reason", async () => {
    const { createBackendRouter } = await import("@/lib/image-pipeline/backend/backend-router");
    const cpuPreview = vi.fn();
    const fallbackEvents: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];

    const router = createBackendRouter({
      backends: createCpuAndWebglBackends({
        cpuPreview,
        webglPreview: () => {
          throw new Error("WebGL shader compile failed");
        },
      }),
      defaultBackendId: "webgl",
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: {
        forceCpu: false,
        webglEnabled: true,
        wasmEnabled: false,
      },
      onFallback: (event) => {
        fallbackEvents.push({
          reason: event.reason,
          requestedBackend: event.requestedBackend,
          fallbackBackend: event.fallbackBackend,
        });
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(fallbackEvents).toEqual([
      {
        reason: "runtime_error",
        requestedBackend: "webgl",
        fallbackBackend: "cpu",
      },
    ]);
  });
});
