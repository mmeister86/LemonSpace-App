// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { ImagePipelineBackend } from "@/lib/image-pipeline/backend/backend-types";
import { createBackendRouter } from "@/lib/image-pipeline/backend/backend-router";
import {
  type BackendFeatureFlags,
  getBackendFeatureFlags,
} from "@/lib/image-pipeline/backend/feature-flags";

function createStep() {
  return {
    nodeId: "n1",
    type: "color-adjust",
    params: {
      hsl: {
        hue: 0,
        saturation: 0,
        luminance: 0,
      },
      temperature: 0,
      tint: 0,
      vibrance: 0,
    },
  } as const;
}

function createBackends() {
  const cpuPreview = vi.fn();
  const cpuFull = vi.fn();
  const webglPreview = vi.fn();
  const webglFull = vi.fn();
  const wasmPreview = vi.fn();
  const wasmFull = vi.fn();

  const backends: readonly ImagePipelineBackend[] = [
    {
      id: "cpu",
      runPreviewStep: cpuPreview,
      runFullPipeline: cpuFull,
    },
    {
      id: "webgl",
      runPreviewStep: webglPreview,
      runFullPipeline: webglFull,
    },
    {
      id: "wasm",
      runPreviewStep: wasmPreview,
      runFullPipeline: wasmFull,
    },
  ];

  return {
    backends,
    cpuPreview,
    cpuFull,
    webglPreview,
    webglFull,
    wasmPreview,
    wasmFull,
  };
}

function createRouterFlags(overrides: Partial<BackendFeatureFlags>): BackendFeatureFlags {
  return {
    ...getBackendFeatureFlags(),
    ...overrides,
  };
}

describe("backend feature flags", () => {
  it("forceCpu overrides all backend choices", () => {
    const reasons: string[] = [];
    const backend = createBackends();
    const router = createBackendRouter({
      backends: backend.backends,
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
        wasm: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: createRouterFlags({
        forceCpu: true,
        webglEnabled: true,
        wasmEnabled: true,
      }),
      onFallback: (event) => {
        reasons.push(event.reason);
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });

    router.runFullPipeline({
      pixels: new Uint8ClampedArray(4),
      steps: [createStep()],
      width: 1,
      height: 1,
      backendHint: "wasm",
    });

    expect(backend.cpuPreview).toHaveBeenCalledTimes(1);
    expect(backend.cpuFull).toHaveBeenCalledTimes(1);
    expect(backend.webglPreview).not.toHaveBeenCalled();
    expect(backend.webglFull).not.toHaveBeenCalled();
    expect(backend.wasmPreview).not.toHaveBeenCalled();
    expect(backend.wasmFull).not.toHaveBeenCalled();
    expect(reasons).toEqual(["flag_disabled", "flag_disabled"]);
  });

  it("webgl and wasm can be independently enabled or disabled", () => {
    const reasonA: string[] = [];
    const backendA = createBackends();
    const routerA = createBackendRouter({
      backends: backendA.backends,
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
        wasm: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: createRouterFlags({
        forceCpu: false,
        webglEnabled: true,
        wasmEnabled: false,
      }),
      onFallback: (event) => {
        reasonA.push(event.reason);
      },
    });

    routerA.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });
    routerA.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "wasm",
    });

    expect(backendA.webglPreview).toHaveBeenCalledTimes(1);
    expect(backendA.wasmPreview).not.toHaveBeenCalled();
    expect(backendA.cpuPreview).toHaveBeenCalledTimes(1);
    expect(reasonA).toEqual(["flag_disabled"]);

    const reasonB: string[] = [];
    const backendB = createBackends();
    const routerB = createBackendRouter({
      backends: backendB.backends,
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
        wasm: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: createRouterFlags({
        forceCpu: false,
        webglEnabled: false,
        wasmEnabled: true,
      }),
      onFallback: (event) => {
        reasonB.push(event.reason);
      },
    });

    routerB.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });
    routerB.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "wasm",
    });

    expect(backendB.webglPreview).not.toHaveBeenCalled();
    expect(backendB.wasmPreview).toHaveBeenCalledTimes(1);
    expect(backendB.cpuPreview).toHaveBeenCalledTimes(1);
    expect(reasonB).toEqual(["flag_disabled"]);
  });

  it("defaults preserve cpu behavior when no explicit flags are set", () => {
    const reasons: string[] = [];
    const backend = createBackends();
    const router = createBackendRouter({
      backends: backend.backends,
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
        wasm: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: getBackendFeatureFlags(),
      onFallback: (event) => {
        reasons.push(event.reason);
      },
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "webgl",
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
      backendHint: "wasm",
    });

    router.runPreviewStep({
      pixels: new Uint8ClampedArray(4),
      step: createStep(),
      width: 1,
      height: 1,
    });

    expect(backend.cpuPreview).toHaveBeenCalledTimes(3);
    expect(backend.webglPreview).not.toHaveBeenCalled();
    expect(backend.wasmPreview).not.toHaveBeenCalled();
    expect(reasons).toEqual(["flag_disabled", "flag_disabled"]);
  });
});
