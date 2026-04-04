import type { PipelineStep } from "@/lib/image-pipeline/contracts";

export const CPU_BACKEND_ID = "cpu" as const;

export type BackendHint = string | undefined;

export type BackendExecutionOptions = {
  shouldAbort?: () => boolean;
};

export type PreviewBackendRequest = {
  pixels: Uint8ClampedArray;
  step: PipelineStep<string, unknown>;
  width: number;
  height: number;
  backendHint?: BackendHint;
  executionOptions?: BackendExecutionOptions;
};

export type FullBackendRequest = {
  pixels: Uint8ClampedArray;
  steps: readonly PipelineStep[];
  width: number;
  height: number;
  backendHint?: BackendHint;
  executionOptions?: BackendExecutionOptions;
};

export type BackendStepRequest = Omit<PreviewBackendRequest, "backendHint">;
export type BackendPipelineRequest = Omit<FullBackendRequest, "backendHint">;

export type ImagePipelineBackend = {
  id: string;
  runPreviewStep: (request: BackendStepRequest) => void;
  runFullPipeline: (request: BackendPipelineRequest) => void;
};

export type BackendRouter = {
  resolveBackend: (backendHint?: BackendHint) => ImagePipelineBackend;
  runPreviewStep: (request: PreviewBackendRequest) => void;
  runFullPipeline: (request: FullBackendRequest) => void;
};
