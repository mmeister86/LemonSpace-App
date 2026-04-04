import { applyPipelineStep, applyPipelineSteps } from "@/lib/image-pipeline/render-core";

import {
  CPU_BACKEND_ID,
  type BackendExecutionOptions,
  type BackendHint,
  type BackendRouter,
  type FullBackendRequest,
  type ImagePipelineBackend,
  type PreviewBackendRequest,
} from "@/lib/image-pipeline/backend/backend-types";

type BackendFallbackReason = "unsupported_api" | "flag_disabled" | "runtime_error";

type BackendFallbackEvent = {
  reason: BackendFallbackReason;
  requestedBackend: string;
  fallbackBackend: string;
  error?: Error;
};

type BackendAvailability = {
  supported?: boolean;
  enabled?: boolean;
};

const cpuBackend: ImagePipelineBackend = {
  id: CPU_BACKEND_ID,
  runPreviewStep(request) {
    applyPipelineStep(
      request.pixels,
      request.step,
      request.width,
      request.height,
      request.executionOptions,
    );
  },
  runFullPipeline(request) {
    applyPipelineSteps(
      request.pixels,
      request.steps,
      request.width,
      request.height,
      request.executionOptions,
    );
  },
};

function normalizeBackendHint(value: BackendHint): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function createBackendRouter(options?: {
  backends?: readonly ImagePipelineBackend[];
  defaultBackendId?: string;
  backendAvailability?: Readonly<Record<string, BackendAvailability>>;
  onFallback?: (event: BackendFallbackEvent) => void;
}): BackendRouter {
  const configuredBackends = options?.backends?.length ? [...options.backends] : [cpuBackend];
  const byId = new Map(configuredBackends.map((backend) => [backend.id.toLowerCase(), backend]));
  const defaultBackend =
    byId.get(options?.defaultBackendId?.toLowerCase() ?? "") ??
    byId.get(CPU_BACKEND_ID) ??
    configuredBackends[0] ??
    cpuBackend;
  const normalizedDefaultId = defaultBackend.id.toLowerCase();

  function readAvailability(backendId: string): BackendAvailability | undefined {
    return options?.backendAvailability?.[backendId.toLowerCase()];
  }

  function emitFallback(event: BackendFallbackEvent): void {
    options?.onFallback?.(event);
  }

  function resolveBackendWithFallbackReason(backendHint: BackendHint): {
    backend: ImagePipelineBackend;
    fallbackReason: BackendFallbackReason | null;
    requestedBackend: string | null;
  } {
    const normalizedHint = normalizeBackendHint(backendHint);
    if (!normalizedHint) {
      return {
        backend: defaultBackend,
        fallbackReason: null,
        requestedBackend: null,
      };
    }

    const hintedBackend = byId.get(normalizedHint);
    if (!hintedBackend) {
      return {
        backend: defaultBackend,
        fallbackReason: "unsupported_api",
        requestedBackend: normalizedHint,
      };
    }

    const availability = readAvailability(normalizedHint);
    if (availability?.enabled === false) {
      return {
        backend: defaultBackend,
        fallbackReason: "flag_disabled",
        requestedBackend: normalizedHint,
      };
    }

    if (availability?.supported === false) {
      return {
        backend: defaultBackend,
        fallbackReason: "unsupported_api",
        requestedBackend: normalizedHint,
      };
    }

    return {
      backend: hintedBackend,
      fallbackReason: null,
      requestedBackend: normalizedHint,
    };
  }

  function runWithRuntimeFallback(args: {
    backendHint: BackendHint;
    runBackend: (backend: ImagePipelineBackend) => void;
    executionOptions?: BackendExecutionOptions;
  }): void {
    const selection = resolveBackendWithFallbackReason(args.backendHint);

    if (selection.fallbackReason && selection.requestedBackend) {
      emitFallback({
        reason: selection.fallbackReason,
        requestedBackend: selection.requestedBackend,
        fallbackBackend: defaultBackend.id,
      });
    }

    try {
      args.runBackend(selection.backend);
      return;
    } catch (error: unknown) {
      const shouldAbort = args.executionOptions?.shouldAbort;
      if (shouldAbort?.()) {
        throw error;
      }

      if (selection.backend.id.toLowerCase() === normalizedDefaultId) {
        throw error;
      }

      const normalizedError =
        error instanceof Error ? error : new Error("Image pipeline backend execution failed.");
      emitFallback({
        reason: "runtime_error",
        requestedBackend: selection.backend.id.toLowerCase(),
        fallbackBackend: defaultBackend.id,
        error: normalizedError,
      });
      args.runBackend(defaultBackend);
    }
  }

  return {
    resolveBackend(backendHint) {
      return resolveBackendWithFallbackReason(backendHint).backend;
    },
    runPreviewStep(request) {
      runWithRuntimeFallback({
        backendHint: request.backendHint,
        executionOptions: request.executionOptions,
        runBackend: (backend) => {
          backend.runPreviewStep(request);
        },
      });
    },
    runFullPipeline(request) {
      runWithRuntimeFallback({
        backendHint: request.backendHint,
        executionOptions: request.executionOptions,
        runBackend: (backend) => {
          backend.runFullPipeline(request);
        },
      });
    },
  };
}

const defaultRouter = createBackendRouter();

export function runPreviewStepWithBackendRouter(request: PreviewBackendRequest): void {
  defaultRouter.runPreviewStep(request);
}

export function runFullPipelineWithBackendRouter(request: FullBackendRequest): void {
  defaultRouter.runFullPipeline(request);
}
