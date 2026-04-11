import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RenderFullResult, RenderSourceComposition } from "@/lib/image-pipeline/render-types";

const bridgeMocks = vi.hoisted(() => ({
  renderFull: vi.fn(),
}));

const previewRendererMocks = vi.hoisted(() => ({
  renderPreview: vi.fn(),
}));

vi.mock("@/lib/image-pipeline/bridge", () => ({
  renderFull: bridgeMocks.renderFull,
}));

vi.mock("@/lib/image-pipeline/preview-renderer", () => ({
  renderPreview: previewRendererMocks.renderPreview,
}));

type WorkerMessage = {
  kind: "full";
  requestId: number;
  payload: {
    sourceUrl?: string;
    sourceComposition?: RenderSourceComposition;
    steps: [];
    render: {
      resolution: "original";
      format: "png";
    };
  };
};

type WorkerScopeMock = {
  postMessage: ReturnType<typeof vi.fn>;
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
};

function createFullResult(): RenderFullResult {
  return {
    blob: new Blob(["rendered"]),
    width: 64,
    height: 64,
    mimeType: "image/png",
    format: "png",
    quality: null,
    sizeBytes: 8,
    sourceWidth: 64,
    sourceHeight: 64,
    wasSizeClamped: false,
  };
}

function createWorkerScope(): WorkerScopeMock {
  return {
    postMessage: vi.fn(),
    onmessage: null,
  };
}

describe("image-pipeline.worker full render", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    bridgeMocks.renderFull.mockReset();
    bridgeMocks.renderFull.mockResolvedValue(createFullResult());
    previewRendererMocks.renderPreview.mockReset();
  });

  it("forwards sourceComposition to renderFull for full requests", async () => {
    const workerScope = createWorkerScope();
    vi.stubGlobal("self", workerScope);
    await import("@/lib/image-pipeline/image-pipeline.worker");

    const sourceComposition: RenderSourceComposition = {
      kind: "mixer",
      baseUrl: "https://cdn.example.com/base.png",
      overlayUrl: "https://cdn.example.com/overlay.png",
      blendMode: "overlay",
      opacity: 0.5,
      overlayX: 32,
      overlayY: 16,
      overlayWidth: 128,
      overlayHeight: 64,
    };

    workerScope.onmessage?.({
      data: {
        kind: "full",
        requestId: 41,
        payload: {
          sourceComposition,
          steps: [],
          render: {
            resolution: "original",
            format: "png",
          },
        },
      },
    } as MessageEvent<WorkerMessage>);

    await vi.waitFor(() => {
      expect(bridgeMocks.renderFull).toHaveBeenCalledTimes(1);
    });

    expect(bridgeMocks.renderFull).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceComposition,
      }),
    );
  });
});
