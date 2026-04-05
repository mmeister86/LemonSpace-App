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
import {
  getBackendFeatureFlags,
  type BackendFeatureFlags,
} from "@/lib/image-pipeline/backend/feature-flags";
import { detectBackendCapabilities } from "@/lib/image-pipeline/backend/capabilities";
import {
  createWebglPreviewBackend,
  isWebglPreviewPipelineSupported,
} from "@/lib/image-pipeline/backend/webgl/webgl-backend";
import { createWasmSimdBackend } from "@/lib/image-pipeline/backend/wasm/wasm-backend";

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
  featureFlags?: BackendFeatureFlags;
  onFallback?: (event: BackendFallbackEvent) => void;
}): BackendRouter {
  const configuredBackends = options?.backends?.length ? [...options.backends] : [cpuBackend];
  const byId = new Map(configuredBackends.map((backend) => [backend.id.toLowerCase(), backend]));
  const configuredDefaultBackend =
    byId.get(options?.defaultBackendId?.toLowerCase() ?? "") ??
    byId.get(CPU_BACKEND_ID) ??
    configuredBackends[0] ??
    cpuBackend;
  const cpuFallbackBackend = byId.get(CPU_BACKEND_ID) ?? configuredDefaultBackend;
  const featureFlags = options?.featureFlags;

  function isBackendEnabledByFlags(backendId: string): boolean {
    if (!featureFlags) {
      return true;
    }

    const normalizedBackendId = backendId.toLowerCase();

    if (featureFlags.forceCpu) {
      return normalizedBackendId === CPU_BACKEND_ID;
    }

    if (normalizedBackendId === "webgl") {
      return featureFlags.webglEnabled;
    }

    if (normalizedBackendId === "wasm") {
      return featureFlags.wasmEnabled;
    }

    return true;
  }

  function resolveDefaultBackend(): ImagePipelineBackend {
    if (!isBackendEnabledByFlags(configuredDefaultBackend.id)) {
      return cpuFallbackBackend;
    }

    const availability = readAvailability(configuredDefaultBackend.id);
    if (availability?.enabled === false || availability?.supported === false) {
      return cpuFallbackBackend;
    }

    return configuredDefaultBackend;
  }

  const defaultBackend = resolveDefaultBackend();
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
    if (!isBackendEnabledByFlags(normalizedHint)) {
      return {
        backend: defaultBackend,
        fallbackReason: "flag_disabled",
        requestedBackend: normalizedHint,
      };
    }

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

    const shouldAbort = args.executionOptions?.shouldAbort;
    let backend = selection.backend;

    while (true) {
      try {
        args.runBackend(backend);
        return;
      } catch (error: unknown) {
        if (shouldAbort?.()) {
          throw error;
        }

        if (backend.id.toLowerCase() === cpuFallbackBackend.id.toLowerCase()) {
          throw error;
        }

        const fallbackBackend = resolveRuntimeFallbackBackend(backend.id);
        if (!fallbackBackend || fallbackBackend.id.toLowerCase() === backend.id.toLowerCase()) {
          throw error;
        }

        const normalizedError =
          error instanceof Error ? error : new Error("Image pipeline backend execution failed.");
        emitFallback({
          reason: "runtime_error",
          requestedBackend: backend.id.toLowerCase(),
          fallbackBackend: fallbackBackend.id,
          error: normalizedError,
        });

        backend = fallbackBackend;
      }
    }
  }

  function resolveRuntimeFallbackBackend(failedBackendId: string): ImagePipelineBackend | null {
    const normalizedFailedBackendId = failedBackendId.toLowerCase();

    if (normalizedFailedBackendId === "webgl") {
      const wasmBackend = byId.get("wasm");
      const wasmAvailability = readAvailability("wasm");
      if (
        wasmBackend &&
        isBackendEnabledByFlags("wasm") &&
        wasmAvailability?.enabled !== false &&
        wasmAvailability?.supported !== false
      ) {
        return wasmBackend;
      }
    }

    return cpuFallbackBackend;
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

type RolloutRouterState = {
  router: BackendRouter;
  webglAvailable: boolean;
  webglEnabled: boolean;
  wasmAvailable: boolean;
  wasmEnabled: boolean;
};

let cachedRolloutState: RolloutRouterState | null = null;
let cachedRolloutKey: string | null = null;

function getRolloutRouterState(): RolloutRouterState {
  const featureFlags = getBackendFeatureFlags();
  const capabilities = detectBackendCapabilities();
  const webglAvailable = capabilities.webgl;
  const wasmAvailable = capabilities.wasmSimd;
  const webglEnabled = featureFlags.webglEnabled && !featureFlags.forceCpu;
  const wasmEnabled = featureFlags.wasmEnabled && !featureFlags.forceCpu;
  const rolloutKey = JSON.stringify({
    forceCpu: featureFlags.forceCpu,
    webglEnabled: featureFlags.webglEnabled,
    wasmEnabled: featureFlags.wasmEnabled,
    webglAvailable,
    wasmAvailable,
  });

  if (cachedRolloutState && cachedRolloutKey === rolloutKey) {
    return cachedRolloutState;
  }

  cachedRolloutState = {
    router: createBackendRouter({
      backends: [cpuBackend, createWasmSimdBackend(), createWebglPreviewBackend()],
      defaultBackendId:
        webglEnabled && webglAvailable ? "webgl" : wasmEnabled && wasmAvailable ? "wasm" : CPU_BACKEND_ID,
      backendAvailability: {
        webgl: {
          supported: webglAvailable,
          enabled: webglEnabled,
        },
        wasm: {
          supported: wasmAvailable,
          enabled: wasmEnabled,
        },
      },
      featureFlags,
    }),
    webglAvailable,
    webglEnabled,
    wasmAvailable,
    wasmEnabled,
  };
  cachedRolloutKey = rolloutKey;

  return cachedRolloutState;
}

export function getPreviewBackendHintForSteps(steps: readonly PreviewBackendRequest["step"][]): BackendHint {
  const rolloutState = getRolloutRouterState();

  let backendHint: BackendHint;

  if (rolloutState.webglEnabled && rolloutState.webglAvailable) {
    if (isWebglPreviewPipelineSupported(steps)) {
      backendHint = "webgl";
    } else if (rolloutState.wasmEnabled && rolloutState.wasmAvailable) {
      backendHint = "wasm";
    } else {
      backendHint = CPU_BACKEND_ID;
    }
  } else if (rolloutState.wasmEnabled && rolloutState.wasmAvailable) {
    backendHint = "wasm";
  } else {
    backendHint = CPU_BACKEND_ID;
  }

  return backendHint;
}

export function runPreviewStepWithBackendRouter(request: PreviewBackendRequest): void {
  getRolloutRouterState().router.runPreviewStep(request);
}

export function runFullPipelineWithBackendRouter(request: FullBackendRequest): void {
  getRolloutRouterState().router.runFullPipeline(request);
}
