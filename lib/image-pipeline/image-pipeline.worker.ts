import { renderFull } from "@/lib/image-pipeline/bridge";
import { renderPreview } from "@/lib/image-pipeline/preview-renderer";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import type { HistogramData } from "@/lib/image-pipeline/histogram";
import type {
  RenderFullOptions,
  RenderFullResult,
  RenderSourceComposition,
} from "@/lib/image-pipeline/render-types";
import {
  IMAGE_PIPELINE_BACKEND_FLAG_KEYS,
  type BackendFeatureFlags,
} from "@/lib/image-pipeline/backend/feature-flags";

type PreviewWorkerPayload = {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  previewWidth: number;
  includeHistogram?: boolean;
  featureFlags?: BackendFeatureFlags;
};

type FullWorkerPayload = RenderFullOptions & {
  featureFlags?: BackendFeatureFlags;
};

type WorkerRequestMessage =
  | {
      kind: "preview";
      requestId: number;
      payload: PreviewWorkerPayload;
    }
  | {
      kind: "full";
      requestId: number;
      payload: FullWorkerPayload;
    }
  | {
      kind: "cancel";
      requestId: number;
    };

type WorkerResultPreviewPayload = {
  width: number;
  height: number;
  histogram: HistogramData;
  pixels: ArrayBuffer;
};

type WorkerResponseMessage =
  | {
      kind: "preview-result";
      requestId: number;
      payload: WorkerResultPreviewPayload;
    }
  | {
      kind: "full-result";
      requestId: number;
      payload: RenderFullResult;
    }
  | {
      kind: "error";
      requestId: number;
      payload: {
        name: string;
        message: string;
      };
    };

type WorkerScope = {
  postMessage: (message: WorkerResponseMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerRequestMessage>) => void) | null;
};

const workerScope = self as unknown as WorkerScope;
const runningControllers = new Map<number, AbortController>();

function applyWorkerFeatureFlags(featureFlags: BackendFeatureFlags | undefined): void {
  (globalThis as typeof globalThis & {
    __LEMONSPACE_FEATURE_FLAGS__?: Record<string, unknown>;
  }).__LEMONSPACE_FEATURE_FLAGS__ = {
    [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.forceCpu]: featureFlags?.forceCpu ?? false,
    [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.webglEnabled]: featureFlags?.webglEnabled ?? false,
    [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.wasmEnabled]: featureFlags?.wasmEnabled ?? false,
  };
}

function postMessageSafe(message: WorkerResponseMessage, transfer?: Transferable[]): void {
  if (transfer) {
    workerScope.postMessage(message, transfer);
    return;
  }

  workerScope.postMessage(message);
}

function normalizeErrorPayload(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "Error",
    message: "Image pipeline worker failed",
  };
}

async function handlePreviewRequest(requestId: number, payload: PreviewWorkerPayload): Promise<void> {
  const controller = new AbortController();
  runningControllers.set(requestId, controller);

  try {
    applyWorkerFeatureFlags(payload.featureFlags);
    const result = await renderPreview({
      sourceUrl: payload.sourceUrl,
      sourceComposition: payload.sourceComposition,
      steps: payload.steps,
      previewWidth: payload.previewWidth,
      includeHistogram: payload.includeHistogram,
      signal: controller.signal,
    });

    const pixels = result.imageData.data.buffer;
    postMessageSafe(
      {
        kind: "preview-result",
        requestId,
        payload: {
          width: result.width,
          height: result.height,
          histogram: result.histogram,
          pixels,
        },
      },
      [pixels],
    );
  } catch (error: unknown) {
    if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
      console.error("[image-pipeline.worker] preview request failed", {
        requestId,
        sourceUrl: payload.sourceUrl,
        previewWidth: payload.previewWidth,
        includeHistogram: payload.includeHistogram,
        error,
      });
    }

    postMessageSafe({
      kind: "error",
      requestId,
      payload: normalizeErrorPayload(error),
    });
  } finally {
    runningControllers.delete(requestId);
  }
}

async function handleFullRequest(requestId: number, payload: FullWorkerPayload): Promise<void> {
  const controller = new AbortController();
  runningControllers.set(requestId, controller);

  try {
    applyWorkerFeatureFlags(payload.featureFlags);
    const result = await renderFull({
      sourceUrl: payload.sourceUrl,
      sourceComposition: payload.sourceComposition,
      steps: payload.steps,
      render: payload.render,
      signal: controller.signal,
    });

    postMessageSafe({
      kind: "full-result",
      requestId,
      payload: result,
    });
  } catch (error: unknown) {
    if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
      console.error("[image-pipeline.worker] full request failed", {
        requestId,
        sourceUrl: payload.sourceUrl,
        render: payload.render,
        error,
      });
    }

    postMessageSafe({
      kind: "error",
      requestId,
      payload: normalizeErrorPayload(error),
    });
  } finally {
    runningControllers.delete(requestId);
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const message = event.data;

  if (message.kind === "cancel") {
    runningControllers.get(message.requestId)?.abort();
    return;
  }

  if (message.kind === "preview") {
    void handlePreviewRequest(message.requestId, message.payload);
    return;
  }

  void handleFullRequest(message.requestId, message.payload);
};

export {};
