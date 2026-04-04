import type {
  BackendPipelineRequest,
  BackendStepRequest,
  ImagePipelineBackend,
} from "@/lib/image-pipeline/backend/backend-types";
import {
  loadWasmKernelModule,
  type WasmKernelModule,
} from "@/lib/image-pipeline/backend/wasm/wasm-loader";

type WasmBackendOptions = {
  loadModule?: () => WasmKernelModule;
};

export function createWasmSimdBackend(options?: WasmBackendOptions): ImagePipelineBackend {
  const loadModule = options?.loadModule ?? loadWasmKernelModule;
  let kernelModule: WasmKernelModule | null = null;

  function ensureModule(): WasmKernelModule {
    if (kernelModule) {
      return kernelModule;
    }

    kernelModule = loadModule();
    return kernelModule;
  }

  return {
    id: "wasm",
    runPreviewStep(request: BackendStepRequest): void {
      ensureModule().applyPreviewStep(request);
    },
    runFullPipeline(request: BackendPipelineRequest): void {
      ensureModule().applyFullPipeline(request);
    },
  };
}
