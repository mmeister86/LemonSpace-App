import { renderFull } from "@/lib/image-pipeline/bridge";
import { renderPreview } from "@/lib/image-pipeline/preview-renderer";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import type { HistogramData } from "@/lib/image-pipeline/histogram";
import type { RenderFullOptions, RenderFullResult } from "@/lib/image-pipeline/render-types";

type PreviewWorkerPayload = {
  sourceUrl: string;
  steps: readonly PipelineStep[];
  previewWidth: number;
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
      payload: RenderFullOptions;
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
    const result = await renderPreview({
      sourceUrl: payload.sourceUrl,
      steps: payload.steps,
      previewWidth: payload.previewWidth,
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
    postMessageSafe({
      kind: "error",
      requestId,
      payload: normalizeErrorPayload(error),
    });
  } finally {
    runningControllers.delete(requestId);
  }
}

async function handleFullRequest(requestId: number, payload: RenderFullOptions): Promise<void> {
  const controller = new AbortController();
  runningControllers.set(requestId, controller);

  try {
    const result = await renderFull({
      ...payload,
      signal: controller.signal,
    });

    postMessageSafe({
      kind: "full-result",
      requestId,
      payload: result,
    });
  } catch (error: unknown) {
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
