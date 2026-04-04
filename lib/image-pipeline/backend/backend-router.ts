import { applyPipelineStep, applyPipelineSteps } from "@/lib/image-pipeline/render-core";

import {
  CPU_BACKEND_ID,
  type BackendHint,
  type BackendRouter,
  type FullBackendRequest,
  type ImagePipelineBackend,
  type PreviewBackendRequest,
} from "@/lib/image-pipeline/backend/backend-types";

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
}): BackendRouter {
  const configuredBackends = options?.backends?.length ? [...options.backends] : [cpuBackend];
  const byId = new Map(configuredBackends.map((backend) => [backend.id.toLowerCase(), backend]));
  const defaultBackend =
    byId.get(options?.defaultBackendId?.toLowerCase() ?? "") ??
    byId.get(CPU_BACKEND_ID) ??
    configuredBackends[0] ??
    cpuBackend;

  return {
    resolveBackend(backendHint) {
      const normalizedHint = normalizeBackendHint(backendHint);
      if (!normalizedHint) {
        return defaultBackend;
      }

      return byId.get(normalizedHint) ?? defaultBackend;
    },
    runPreviewStep(request) {
      const backend = this.resolveBackend(request.backendHint);
      backend.runPreviewStep(request);
    },
    runFullPipeline(request) {
      const backend = this.resolveBackend(request.backendHint);
      backend.runFullPipeline(request);
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
