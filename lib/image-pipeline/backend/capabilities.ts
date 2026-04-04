export type BackendCapabilities = {
  webgl: boolean;
  wasmSimd: boolean;
  offscreenCanvas: boolean;
};

type CapabilityProbes = {
  probeWebgl: () => boolean;
  probeWasmSimd: () => boolean;
  probeOffscreenCanvas: () => boolean;
};

export const WASM_SIMD_PROBE_MODULE = new Uint8Array([
  0x00,
  0x61,
  0x73,
  0x6d,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x05,
  0x01,
  0x60,
  0x00,
  0x01,
  0x7b,
  0x03,
  0x02,
  0x01,
  0x00,
  0x0a,
  0x0a,
  0x01,
  0x08,
  0x00,
  0x41,
  0x00,
  0xfd,
  0x0f,
  0x0b,
]);

function probeOffscreenCanvasAvailability(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

function probeWebglAvailability(): boolean {
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (context) {
        return true;
      }
    }

    if (typeof OffscreenCanvas !== "undefined") {
      const offscreenCanvas = new OffscreenCanvas(1, 1);
      const context = offscreenCanvas.getContext("webgl2") ?? offscreenCanvas.getContext("webgl");
      return Boolean(context);
    }

    return false;
  } catch {
    return false;
  }
}

function probeWasmSimdAvailability(): boolean {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    return false;
  }

  try {
    return WebAssembly.validate(WASM_SIMD_PROBE_MODULE);
  } catch {
    return false;
  }
}

export function detectBackendCapabilities(probes?: Partial<CapabilityProbes>): BackendCapabilities {
  const probeWebgl = probes?.probeWebgl ?? probeWebglAvailability;
  const probeWasmSimd = probes?.probeWasmSimd ?? probeWasmSimdAvailability;
  const probeOffscreenCanvas = probes?.probeOffscreenCanvas ?? probeOffscreenCanvasAvailability;

  return {
    webgl: probeWebgl(),
    wasmSimd: probeWasmSimd(),
    offscreenCanvas: probeOffscreenCanvas(),
  };
}
