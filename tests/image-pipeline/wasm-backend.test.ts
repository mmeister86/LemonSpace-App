// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImagePipelineBackend } from "@/lib/image-pipeline/backend/backend-types";
import { createBackendRouter } from "@/lib/image-pipeline/backend/backend-router";
import type { WasmKernelModule } from "@/lib/image-pipeline/backend/wasm/wasm-loader";
import { createWasmSimdBackend } from "@/lib/image-pipeline/backend/wasm/wasm-backend";

function createStep() {
  return {
    nodeId: "n1",
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
  } as const;
}

function createCpuBackend(overrides?: {
  preview?: ImagePipelineBackend["runPreviewStep"];
  full?: ImagePipelineBackend["runFullPipeline"];
}): ImagePipelineBackend {
  return {
    id: "cpu",
    runPreviewStep: overrides?.preview ?? vi.fn(),
    runFullPipeline: overrides?.full ?? vi.fn(),
  };
}

describe("wasm backend rollout selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("selects wasm when webgl is unavailable and wasm simd is enabled + available", async () => {
    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual("@/lib/image-pipeline/backend/feature-flags");
      return {
        ...actual,
        getBackendFeatureFlags: () => ({
          forceCpu: false,
          webglEnabled: true,
          wasmEnabled: true,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual("@/lib/image-pipeline/backend/capabilities");
      return {
        ...actual,
        detectBackendCapabilities: () => ({
          webgl: false,
          wasmSimd: true,
          offscreenCanvas: false,
        }),
      };
    });

    const backendRouter = await import("@/lib/image-pipeline/backend/backend-router");

    expect(backendRouter.getPreviewBackendHintForSteps([createStep()])).toBe("wasm");
  });
});

describe("wasm backend fallback behavior", () => {
  it("downgrades to cpu with runtime_error when wasm initialization fails", () => {
    const fallbackEvents: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];
    const cpuPreview = vi.fn();
    const cpuBackend = createCpuBackend({
      preview: cpuPreview,
    });
    const wasmBackend = createWasmSimdBackend({
      loadModule: () => {
        throw new Error("wasm init failed");
      },
    });
    const router = createBackendRouter({
      backends: [cpuBackend, wasmBackend],
      backendAvailability: {
        wasm: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: {
        forceCpu: false,
        webglEnabled: false,
        wasmEnabled: true,
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
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "wasm",
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(fallbackEvents).toEqual([
      {
        reason: "runtime_error",
        requestedBackend: "wasm",
        fallbackBackend: "cpu",
      },
    ]);
  });

  it("does not require SharedArrayBuffer or threads", () => {
    vi.stubGlobal("SharedArrayBuffer", undefined);
    vi.stubGlobal("Worker", undefined);

    const module: WasmKernelModule = {
      applyPreviewStep: vi.fn(),
      applyFullPipeline: vi.fn(),
    };

    const backend = createWasmSimdBackend({
      loadModule: () => module,
    });

    expect(() => {
      backend.runPreviewStep({
        pixels: new Uint8ClampedArray(4),
        step: createStep(),
        width: 1,
        height: 1,
      });
    }).not.toThrow();
    expect(module.applyPreviewStep).toHaveBeenCalledTimes(1);
  });
});
