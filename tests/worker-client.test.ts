// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyHistogram } from "@/lib/image-pipeline/histogram";
import type { RenderFullResult } from "@/lib/image-pipeline/render-types";

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

function createFullResult(): RenderFullResult {
  return {
    blob: new Blob(["rendered"]),
    width: 32,
    height: 32,
    mimeType: "image/png",
    format: "png",
    quality: null,
    sizeBytes: 8,
    sourceWidth: 32,
    sourceHeight: 32,
    wasSizeClamped: false,
  };
}

type WorkerMessage =
  | {
      kind: "preview" | "full";
      requestId: number;
      payload?: {
        previewWidth?: number;
        includeHistogram?: boolean;
        featureFlags?: {
          forceCpu: boolean;
          webglEnabled: boolean;
          wasmEnabled: boolean;
        };
      };
    }
  | {
      kind: "cancel";
      requestId: number;
    };

type FakeWorkerBehavior = (worker: FakeWorker, message: WorkerMessage) => void;

class FakeWorker {
  static behavior: FakeWorkerBehavior = () => {};

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;

  postMessage(message: WorkerMessage): void {
    FakeWorker.behavior(this, message);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("worker-client fallbacks", () => {
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
    previewRendererMocks.renderPreview.mockReset();
    bridgeMocks.renderFull.mockReset();
    previewRendererMocks.renderPreview.mockResolvedValue({
      width: 16,
      height: 16,
      imageData: { data: new Uint8ClampedArray(16 * 16 * 4) },
      histogram: emptyHistogram(),
    });
    bridgeMocks.renderFull.mockResolvedValue(createFullResult());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fall back to main-thread preview rendering for deterministic worker errors", async () => {
    FakeWorker.behavior = (worker, message) => {
      if (message.kind === "cancel") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "error",
            requestId: message.requestId,
            payload: {
              name: "RenderPipelineError",
              message: "Deterministic worker preview failure",
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    await expect(
      renderPreviewWithWorkerFallback({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        previewWidth: 128,
      }),
    ).rejects.toMatchObject({
      name: "RenderPipelineError",
      message: "Deterministic worker preview failure",
    });

    expect(previewRendererMocks.renderPreview).not.toHaveBeenCalled();
  });

  it("does not fall back to main-thread full rendering for deterministic worker errors", async () => {
    FakeWorker.behavior = (worker, message) => {
      if (message.kind === "cancel") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "error",
            requestId: message.requestId,
            payload: {
              name: "RenderPipelineError",
              message: "Deterministic worker full render failure",
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderFullWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    await expect(
      renderFullWithWorkerFallback({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        render: {
          resolution: "original",
          format: "png",
        },
      }),
    ).rejects.toMatchObject({
      name: "RenderPipelineError",
      message: "Deterministic worker full render failure",
    });

    expect(bridgeMocks.renderFull).not.toHaveBeenCalled();
  });

  it("does not include AbortSignal in full worker payload serialization", async () => {
    const workerMessages: WorkerMessage[] = [];
    FakeWorker.behavior = (worker, message) => {
      workerMessages.push(message);
      if (message.kind !== "full") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "full-result",
            requestId: message.requestId,
            payload: createFullResult(),
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderFullWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    await renderFullWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      render: {
        resolution: "original",
        format: "png",
      },
      signal: new AbortController().signal,
    });

    const fullMessage = workerMessages.find((message) => message.kind === "full") as
      | (WorkerMessage & {
          payload?: Record<string, unknown>;
        })
      | undefined;

    expect(fullMessage).toBeDefined();
    expect(fullMessage?.payload).not.toHaveProperty("signal");
  });

  it("still falls back to the main thread when the Worker API is unavailable", async () => {
    vi.stubGlobal("Worker", undefined);

    const workerClient = await import("@/lib/image-pipeline/worker-client");

    const previewResult = await workerClient.renderPreviewWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
    });
    const fullResult = await workerClient.renderFullWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      render: {
        resolution: "original",
        format: "png",
      },
    });

    expect(previewRendererMocks.renderPreview).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.renderFull).toHaveBeenCalledTimes(1);
    expect(previewResult.width).toBe(16);
    expect(fullResult.format).toBe("png");
  });

  it("shares one worker preview execution across identical requests", async () => {
    const workerMessages: WorkerMessage[] = [];
    FakeWorker.behavior = (worker, message) => {
      workerMessages.push(message);
      if (message.kind !== "preview") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "preview-result",
            requestId: message.requestId,
            payload: {
              width: 8,
              height: 4,
              histogram: emptyHistogram(),
              pixels: new Uint8ClampedArray(8 * 4 * 4).buffer,
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    const request = {
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: true,
    } as const;

    const [first, second] = await Promise.all([
      renderPreviewWithWorkerFallback(request),
      renderPreviewWithWorkerFallback(request),
    ]);

    expect(workerMessages.filter((message) => message.kind === "preview")).toHaveLength(1);
    expect(previewRendererMocks.renderPreview).not.toHaveBeenCalled();
    expect(first.width).toBe(8);
    expect(second.width).toBe(8);
  });

  it("creates separate preview executions when width or histogram settings differ", async () => {
    const workerMessages: WorkerMessage[] = [];
    FakeWorker.behavior = (worker, message) => {
      workerMessages.push(message);
      if (message.kind !== "preview") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "preview-result",
            requestId: message.requestId,
            payload: {
              width: message.payload?.previewWidth ?? 1,
              height: 4,
              histogram: emptyHistogram(),
              pixels: new Uint8ClampedArray((message.payload?.previewWidth ?? 1) * 4 * 4).buffer,
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    await Promise.all([
      renderPreviewWithWorkerFallback({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        previewWidth: 128,
        includeHistogram: false,
      }),
      renderPreviewWithWorkerFallback({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        previewWidth: 256,
        includeHistogram: false,
      }),
      renderPreviewWithWorkerFallback({
        sourceUrl: "https://cdn.example.com/source.png",
        steps: [],
        previewWidth: 128,
        includeHistogram: true,
      }),
    ]);

    expect(workerMessages.filter((message) => message.kind === "preview")).toHaveLength(3);
  });

  it("passes backend feature flags to worker preview requests", async () => {
    const workerMessages: WorkerMessage[] = [];
    FakeWorker.behavior = (worker, message) => {
      workerMessages.push(message);
      if (message.kind !== "preview") {
        return;
      }

      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "preview-result",
            requestId: message.requestId,
            payload: {
              width: 8,
              height: 4,
              histogram: emptyHistogram(),
              pixels: new Uint8ClampedArray(8 * 4 * 4).buffer,
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
    (
      globalThis as typeof globalThis & {
        __LEMONSPACE_FEATURE_FLAGS__?: Record<string, unknown>;
      }
    ).__LEMONSPACE_FEATURE_FLAGS__ = {
      "imagePipeline.backend.forceCpu": false,
      "imagePipeline.backend.webgl.enabled": true,
      "imagePipeline.backend.wasm.enabled": true,
    };

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    await renderPreviewWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: true,
    });

    expect(workerMessages).toContainEqual(
      expect.objectContaining({
        kind: "preview",
        payload: expect.objectContaining({
          featureFlags: {
            forceCpu: false,
            webglEnabled: true,
            wasmEnabled: true,
          },
        }),
      }),
    );
  });

  it("removes aborted subscribers without canceling surviving identical preview consumers", async () => {
    const workerMessages: WorkerMessage[] = [];
    const previewStarted = createDeferred<void>();

    FakeWorker.behavior = (worker, message) => {
      workerMessages.push(message);
      if (message.kind !== "preview") {
        return;
      }

      previewStarted.resolve();
      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            kind: "preview-result",
            requestId: message.requestId,
            payload: {
              width: 8,
              height: 4,
              histogram: emptyHistogram(),
              pixels: new Uint8ClampedArray(8 * 4 * 4).buffer,
            },
          },
        } as MessageEvent);
      });
    };
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    const firstController = new AbortController();
    const secondController = new AbortController();
    const request = {
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: true,
    } as const;

    const firstPromise = renderPreviewWithWorkerFallback({
      ...request,
      signal: firstController.signal,
    });
    const secondPromise = renderPreviewWithWorkerFallback({
      ...request,
      signal: secondController.signal,
    });

    await previewStarted.promise;
    firstController.abort();

    await expect(firstPromise).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondPromise).resolves.toMatchObject({ width: 8, height: 4 });
    expect(workerMessages.filter((message) => message.kind === "preview")).toHaveLength(1);
    expect(workerMessages.filter((message) => message.kind === "cancel")).toHaveLength(0);
  });

  it("shares one fallback preview execution across identical requests", async () => {
    vi.stubGlobal("Worker", undefined);
    const deferred = createDeferred<Awaited<ReturnType<typeof previewRendererMocks.renderPreview>>>();
    previewRendererMocks.renderPreview.mockReturnValueOnce(deferred.promise);

    const { renderPreviewWithWorkerFallback } = await import("@/lib/image-pipeline/worker-client");

    const firstPromise = renderPreviewWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: false,
    });
    const secondPromise = renderPreviewWithWorkerFallback({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [],
      previewWidth: 128,
      includeHistogram: false,
    });

    expect(previewRendererMocks.renderPreview).toHaveBeenCalledTimes(1);

    deferred.resolve({
      width: 16,
      height: 16,
      imageData: { data: new Uint8ClampedArray(16 * 16 * 4) },
      histogram: emptyHistogram(),
    });

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.width).toBe(16);
    expect(second.width).toBe(16);
  });
});
