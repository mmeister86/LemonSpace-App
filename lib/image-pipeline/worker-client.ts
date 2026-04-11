import { renderFull } from "@/lib/image-pipeline/bridge";
import {
  renderPreview,
  type PreviewRenderResult,
} from "@/lib/image-pipeline/preview-renderer";
import { hashPipeline, type PipelineStep } from "@/lib/image-pipeline/contracts";
import type { HistogramData } from "@/lib/image-pipeline/histogram";
import type {
  RenderFullOptions,
  RenderFullResult,
  RenderSourceComposition,
} from "@/lib/image-pipeline/render-types";
import {
  getBackendFeatureFlags,
  type BackendFeatureFlags,
} from "@/lib/image-pipeline/backend/feature-flags";

export type { PreviewRenderResult };

export type BackendDiagnosticsMetadata = {
  backendId?: string;
  fallbackReason?: string;
  details?: Record<string, unknown>;
};

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
  diagnostics?: BackendDiagnosticsMetadata;
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
      payload: RenderFullResult & {
        diagnostics?: BackendDiagnosticsMetadata;
      };
    }
  | {
      kind: "error";
      requestId: number;
      payload: {
        name: string;
        message: string;
        diagnostics?: BackendDiagnosticsMetadata;
      };
    };

class WorkerUnavailableError extends Error {
  constructor(causeMessage?: string) {
    super(causeMessage ?? "Image pipeline worker is unavailable.");
    this.name = "WorkerUnavailableError";
  }
}

type PendingRequest = {
  kind: "preview" | "full";
  resolve: (value: PreviewRenderResult | RenderFullResult) => void;
  reject: (reason?: unknown) => void;
};

let workerInstance: Worker | null = null;
let workerInitError: Error | null = null;
let requestIdCounter = 0;
const pendingRequests = new Map<number, PendingRequest>();
const inFlightPreviewRequests = new Map<string, SharedPreviewRequest>();
let lastBackendDiagnostics: BackendDiagnosticsMetadata | null = null;

type SharedPreviewRequest = {
  promise: Promise<PreviewRenderResult>;
  abortController: AbortController;
  consumers: Set<symbol>;
  settled: boolean;
};

function nextRequestId(): number {
  requestIdCounter += 1;
  return requestIdCounter;
}

function makeAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

function handleWorkerFailure(error: Error): void {
  const normalized =
    error instanceof WorkerUnavailableError ? error : new WorkerUnavailableError(error.message);
  workerInitError = normalized;

  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }

  for (const [requestId, pending] of pendingRequests.entries()) {
    pending.reject(normalized);
    pendingRequests.delete(requestId);
  }
}

function shouldFallbackToMainThread(error: unknown): error is WorkerUnavailableError {
  return error instanceof WorkerUnavailableError;
}

function logWorkerClientDebug(event: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.error(`[worker-client] ${event}`, details);
}

function updateLastBackendDiagnostics(metadata: BackendDiagnosticsMetadata | undefined): void {
  if (!metadata) {
    return;
  }

  lastBackendDiagnostics = metadata;
}

export function getLastBackendDiagnostics(): BackendDiagnosticsMetadata | null {
  return lastBackendDiagnostics;
}

function getWorker(): Worker {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new WorkerUnavailableError("Worker API is not available.");
  }

  if (workerInitError) {
    throw new WorkerUnavailableError(workerInitError.message);
  }

  if (workerInstance) {
    return workerInstance;
  }

  try {
    const created = new Worker(new URL("./image-pipeline.worker.ts", import.meta.url), {
      type: "module",
    });

    created.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      const pending = pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }

      pendingRequests.delete(message.requestId);

      if (message.kind === "error") {
        updateLastBackendDiagnostics(message.payload.diagnostics);
        logWorkerClientDebug("worker response error", {
          requestId: message.requestId,
          pendingKind: pending.kind,
          errorName: message.payload.name,
          errorMessage: message.payload.message,
          diagnostics: message.payload.diagnostics,
        });
        const workerError = new Error(message.payload.message);
        workerError.name = message.payload.name;
        pending.reject(workerError);
        return;
      }

      if (pending.kind === "preview" && message.kind === "preview-result") {
        updateLastBackendDiagnostics(message.payload.diagnostics);
        const pixels = new Uint8ClampedArray(message.payload.pixels);
        pending.resolve({
          width: message.payload.width,
          height: message.payload.height,
          imageData: new ImageData(pixels, message.payload.width, message.payload.height),
          histogram: message.payload.histogram,
        });
        return;
      }

      if (pending.kind === "full" && message.kind === "full-result") {
        updateLastBackendDiagnostics(message.payload.diagnostics);
        pending.resolve(message.payload);
        return;
      }

      pending.reject(new Error("Image pipeline worker response type mismatch."));
    };

    created.onerror = () => {
      handleWorkerFailure(new Error("Image pipeline worker crashed."));
    };

    created.onmessageerror = () => {
      handleWorkerFailure(new Error("Image pipeline worker message deserialization failed."));
    };

    workerInstance = created;
    return created;
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error("Worker initialization failed.");
    workerInitError = normalized;
    throw new WorkerUnavailableError(normalized.message);
  }
}

function runWorkerRequest<TResponse extends PreviewRenderResult | RenderFullResult>(args: {
  kind: "preview" | "full";
  payload: PreviewWorkerPayload | FullWorkerPayload;
  signal?: AbortSignal;
}): Promise<TResponse> {
  if (args.signal?.aborted) {
    return Promise.reject(makeAbortError());
  }

  const worker = getWorker();
  lastBackendDiagnostics = null;
  const requestId = nextRequestId();

  return new Promise<TResponse>((resolve, reject) => {
    let isSettled = false;
    const settleOnce = (callback: () => void): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      callback();
    };

    const abortHandler = () => {
      settleOnce(() => {
        pendingRequests.delete(requestId);
        worker.postMessage({ kind: "cancel", requestId } satisfies WorkerRequestMessage);
        reject(makeAbortError());
      });
    };

    if (args.signal) {
      args.signal.addEventListener("abort", abortHandler, { once: true });
    }

    const wrappedResolve = (value: TResponse) => {
      settleOnce(() => {
        if (args.signal) {
          args.signal.removeEventListener("abort", abortHandler);
        }
        resolve(value);
      });
    };

    const wrappedReject = (error: unknown) => {
      settleOnce(() => {
        if (args.signal) {
          args.signal.removeEventListener("abort", abortHandler);
        }
        reject(error);
      });
    };

    pendingRequests.set(requestId, {
      kind: args.kind,
      resolve: wrappedResolve as PendingRequest["resolve"],
      reject: wrappedReject,
    });

    if (args.kind === "preview") {
      worker.postMessage({
        kind: "preview",
        requestId,
        payload: args.payload as PreviewWorkerPayload,
      } satisfies WorkerRequestMessage);
      return;
    }

    worker.postMessage({
      kind: "full",
      requestId,
      payload: args.payload as RenderFullOptions,
    } satisfies WorkerRequestMessage);
  });
}

function getPreviewRequestKey(options: {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  previewWidth: number;
  includeHistogram?: boolean;
}): string {
  return [
    hashPipeline(options.sourceComposition ?? options.sourceUrl ?? null, options.steps),
    options.previewWidth,
    options.includeHistogram === true ? 1 : 0,
  ].join(":");
}

function getWorkerFeatureFlagsSnapshot(): BackendFeatureFlags {
  return getBackendFeatureFlags();
}

async function runPreviewRequest(options: {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  previewWidth: number;
  includeHistogram?: boolean;
  signal?: AbortSignal;
}): Promise<PreviewRenderResult> {
  try {
    return await runWorkerRequest<PreviewRenderResult>({
      kind: "preview",
      payload: {
        sourceUrl: options.sourceUrl,
        sourceComposition: options.sourceComposition,
        steps: options.steps,
        previewWidth: options.previewWidth,
        includeHistogram: options.includeHistogram,
        featureFlags: getWorkerFeatureFlagsSnapshot(),
      },
      signal: options.signal,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    if (!shouldFallbackToMainThread(error)) {
      logWorkerClientDebug("preview request failed without fallback", {
        sourceUrl: options.sourceUrl,
        sourceComposition: options.sourceComposition,
        previewWidth: options.previewWidth,
        includeHistogram: options.includeHistogram,
        diagnostics: getLastBackendDiagnostics(),
        error,
      });
      throw error;
    }

    logWorkerClientDebug("preview request falling back to main-thread", {
      sourceUrl: options.sourceUrl,
      sourceComposition: options.sourceComposition,
      previewWidth: options.previewWidth,
      includeHistogram: options.includeHistogram,
      error,
    });

    return await renderPreview(options);
  }
}

function getOrCreateSharedPreviewRequest(options: {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  previewWidth: number;
  includeHistogram?: boolean;
}): SharedPreviewRequest {
  const key = getPreviewRequestKey(options);
  const existing = inFlightPreviewRequests.get(key);
  if (existing) {
    return existing;
  }

  const abortController = new AbortController();
  const sharedRequest: SharedPreviewRequest = {
    abortController,
    consumers: new Set(),
    settled: false,
    promise: Promise.resolve(undefined as never),
  };

  sharedRequest.promise = runPreviewRequest({
    ...options,
    signal: abortController.signal,
  }).finally(() => {
    sharedRequest.settled = true;
    inFlightPreviewRequests.delete(key);
  });

  inFlightPreviewRequests.set(key, sharedRequest);
  return sharedRequest;
}

export async function renderPreviewWithWorkerFallback(options: {
  sourceUrl?: string;
  sourceComposition?: RenderSourceComposition;
  steps: readonly PipelineStep[];
  previewWidth: number;
  includeHistogram?: boolean;
  signal?: AbortSignal;
}): Promise<PreviewRenderResult> {
  if (options.signal?.aborted) {
    throw makeAbortError();
  }

  const sharedRequest = getOrCreateSharedPreviewRequest({
    sourceUrl: options.sourceUrl,
    sourceComposition: options.sourceComposition,
    steps: options.steps,
    previewWidth: options.previewWidth,
    includeHistogram: options.includeHistogram,
  });

  return await new Promise<PreviewRenderResult>((resolve, reject) => {
    const consumerId = Symbol("preview-consumer");
    let settled = false;

    const settleOnce = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      sharedRequest.consumers.delete(consumerId);
      if (options.signal) {
        options.signal.removeEventListener("abort", abortHandler);
      }

      if (!sharedRequest.settled && sharedRequest.consumers.size === 0) {
        sharedRequest.abortController.abort();
      }

      callback();
    };

    const abortHandler = () => {
      settleOnce(() => {
        reject(makeAbortError());
      });
    };

    sharedRequest.consumers.add(consumerId);

    if (options.signal) {
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    sharedRequest.promise.then(
      (result) => {
        settleOnce(() => {
          resolve(result);
        });
      },
      (error: unknown) => {
        settleOnce(() => {
          reject(error);
        });
      },
    );
  });
}

export async function renderFullWithWorkerFallback(
  options: RenderFullOptions,
): Promise<RenderFullResult> {
  try {
    return await runWorkerRequest<RenderFullResult>({
      kind: "full",
      payload: {
        ...options,
        featureFlags: getWorkerFeatureFlagsSnapshot(),
      },
      signal: options.signal,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }

    if (!shouldFallbackToMainThread(error)) {
      throw error;
    }

    return await renderFull(options);
  }
}

export function isPipelineAbortError(error: unknown): boolean {
  return isAbortError(error);
}
