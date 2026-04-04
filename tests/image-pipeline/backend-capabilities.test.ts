// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImagePipelineBackend } from "@/lib/image-pipeline/backend/backend-types";
import { detectBackendCapabilities } from "@/lib/image-pipeline/backend/capabilities";
import { createBackendRouter } from "@/lib/image-pipeline/backend/backend-router";

const previewRendererMocks = vi.hoisted(() => ({
  renderPreview: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({
  renderFull: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/preview-renderer", () => ({
  renderPreview: previewRendererMocks.renderPreview,
}));

vi.mock("@/lib/image-pipeline/bridge", () => ({
  renderFull: bridgeMocks.renderFull,
}));

describe("detectBackendCapabilities", () => {
  it("reports webgl, wasmSimd and offscreenCanvas independently", () => {
    expect(
      detectBackendCapabilities({
        probeWebgl: () => true,
        probeWasmSimd: () => false,
        probeOffscreenCanvas: () => true,
      }),
    ).toEqual({
      webgl: true,
      wasmSimd: false,
      offscreenCanvas: true,
    });

    expect(
      detectBackendCapabilities({
        probeWebgl: () => false,
        probeWasmSimd: () => true,
        probeOffscreenCanvas: () => false,
      }),
    ).toEqual({
      webgl: false,
      wasmSimd: true,
      offscreenCanvas: false,
    });
  });
});

describe("backend router fallback reasons", () => {
  function createPreviewStep() {
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

  function createTestBackends(args: {
    webglPreview: ImagePipelineBackend["runPreviewStep"];
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
        runPreviewStep: args.webglPreview,
        runFullPipeline: vi.fn(),
      },
    ];
  }

  it("emits unsupported_api when backend is unavailable at runtime", () => {
    const reasons: string[] = [];
    const cpuPreview = vi.fn();
    const router = createBackendRouter({
      backends: createTestBackends({
        cpuPreview,
        webglPreview: vi.fn(),
      }),
      backendAvailability: {
        webgl: {
          supported: false,
          enabled: true,
        },
      },
      onFallback: (event) => {
        reasons.push(event.reason);
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createPreviewStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(["unsupported_api"]);
  });

  it("emits flag_disabled when backend is disabled by flags", () => {
    const reasons: string[] = [];
    const cpuPreview = vi.fn();
    const router = createBackendRouter({
      backends: createTestBackends({
        cpuPreview,
        webglPreview: vi.fn(),
      }),
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: false,
        },
      },
      onFallback: (event) => {
        reasons.push(event.reason);
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createPreviewStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(["flag_disabled"]);
  });

  it("emits runtime_error when backend execution throws", () => {
    const reasons: string[] = [];
    const cpuPreview = vi.fn();
    const router = createBackendRouter({
      backends: createTestBackends({
        cpuPreview,
        webglPreview: () => {
          throw new Error("WebGL kernel failed");
        },
      }),
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
      },
      onFallback: (event) => {
        reasons.push(event.reason);
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createPreviewStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(["runtime_error"]);
  });
});

describe("worker-client backend diagnostics metadata", () => {
  type WorkerMessage =
    | {
        kind: "preview" | "full";
        requestId: number;
      }
    | {
        kind: "cancel";
        requestId: number;
      };

  class FakeWorker {
    static behavior: (worker: FakeWorker, message: WorkerMessage) => void = () => {};

    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;

    postMessage(message: WorkerMessage): void {
      FakeWorker.behavior(this, message);
    }

    terminate(): void {
      // no-op for test worker
    }
  }

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "ImageData",
      class ImageData {
        data: Uint8ClampedArray;
        width: number;
        height: number;

        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
  });

  it("captures diagnostics metadata while keeping preview return contract", async () => {
    FakeWorker.behavior = (worker, message) => {
      if (message.kind !== "preview") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "preview-result",
            requestId: message.requestId,
            payload: {
              width: 2,
              height: 2,
              histogram: {
                red: new Uint32Array(256),
                green: new Uint32Array(256),
                blue: new Uint32Array(256),
                luminance: new Uint32Array(256),
              },
              pixels: new Uint8ClampedArray(16).buffer,
              diagnostics: {
                backendId: "cpu",
                fallbackReason: "unsupported_api",
                details: {
                  requestedBackend: "webgl",
                },
              },
            },
          },
        } as MessageEvent);
      });
    };

    const workerClient = await import("@/lib/image-pipeline/worker-client");

    const result = await workerClient.renderPreviewWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: true,
    });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect((result as { diagnostics?: unknown }).diagnostics).toBeUndefined();
    expect(workerClient.getLastBackendDiagnostics()).toEqual({
      backendId: "cpu",
      fallbackReason: "unsupported_api",
      details: {
        requestedBackend: "webgl",
      },
    });
  });
});
