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

describe("worker-client fallbacks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
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
});
