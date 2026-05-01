/**
 * Onboarding note:
 * Image pipeline utility for capabilities. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

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

let cachedDefaultCapabilities: BackendCapabilities | null = null;

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

function releaseProbeWebglContext(
  context: WebGLRenderingContext | WebGL2RenderingContext | null,
): void {
  if (!context) {
    return;
  }

  try {
    context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Ignore cleanup failures in capability probes.
  }
}

function probeWebglAvailability(): boolean {
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (context) {
        releaseProbeWebglContext(context);
        return true;
      }
    }

    if (typeof OffscreenCanvas !== "undefined") {
      const offscreenCanvas = new OffscreenCanvas(1, 1);
      const context = offscreenCanvas.getContext("webgl2") ?? offscreenCanvas.getContext("webgl");
      releaseProbeWebglContext(context);
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

export function resetBackendCapabilitiesCache(): void {
  cachedDefaultCapabilities = null;
}

export function detectBackendCapabilities(probes?: Partial<CapabilityProbes>): BackendCapabilities {
  if (!probes && cachedDefaultCapabilities) {
    return cachedDefaultCapabilities;
  }

  const probeWebgl = probes?.probeWebgl ?? probeWebglAvailability;
  const probeWasmSimd = probes?.probeWasmSimd ?? probeWasmSimdAvailability;
  const probeOffscreenCanvas = probes?.probeOffscreenCanvas ?? probeOffscreenCanvasAvailability;

  const capabilities = {
    webgl: probeWebgl(),
    wasmSimd: probeWasmSimd(),
    offscreenCanvas: probeOffscreenCanvas(),
  };

  if (!probes) {
    cachedDefaultCapabilities = capabilities;
  }

  return capabilities;
}
