import type {
  BackendPipelineRequest,
  BackendStepRequest,
} from "@/lib/image-pipeline/backend/backend-types";
import { WASM_SIMD_PROBE_MODULE } from "@/lib/image-pipeline/backend/capabilities";
import { applyPipelineStep, applyPipelineSteps } from "@/lib/image-pipeline/render-core";

export type WasmKernelModule = {
  applyPreviewStep: (request: BackendStepRequest) => void;
  applyFullPipeline: (request: BackendPipelineRequest) => void;
};

let cachedModule: WasmKernelModule | null = null;

function assertWasmSimdRuntimeSupport(): void {
  if (typeof WebAssembly === "undefined") {
    throw new Error("WebAssembly runtime is unavailable.");
  }

  if (typeof WebAssembly.validate !== "function") {
    throw new Error("WebAssembly validation API is unavailable.");
  }

  if (!WebAssembly.validate(WASM_SIMD_PROBE_MODULE)) {
    throw new Error("WebAssembly SIMD is unavailable.");
  }

  const wasmModule = new WebAssembly.Module(WASM_SIMD_PROBE_MODULE);
  void new WebAssembly.Instance(wasmModule);
}

export function loadWasmKernelModule(): WasmKernelModule {
  if (cachedModule) {
    return cachedModule;
  }

  assertWasmSimdRuntimeSupport();

  cachedModule = {
    applyPreviewStep(request): void {
      applyPipelineStep(
        request.pixels,
        request.step,
        request.width,
        request.height,
        request.executionOptions,
      );
    },
    applyFullPipeline(request): void {
      applyPipelineSteps(
        request.pixels,
        request.steps,
        request.width,
        request.height,
        request.executionOptions,
      );
    },
  };

  return cachedModule;
}

export function resetWasmKernelModuleCache(): void {
  cachedModule = null;
}
