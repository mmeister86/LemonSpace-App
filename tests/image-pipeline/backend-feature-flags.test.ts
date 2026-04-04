// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function createLocalStorageStub(): Storage {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      values.set(key, String(value));
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    clear(): void {
      values.clear();
    },
    key(index: number): string | null {
      return Array.from(values.keys())[index] ?? null;
    },
    get length(): number {
      return values.size;
    },
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", createLocalStorageStub());
  globalThis.__LEMONSPACE_FEATURE_FLAGS__ = undefined;
  window.__LEMONSPACE_FEATURE_FLAGS__ = undefined;
  localStorage.clear();
});

afterEach(() => {
  globalThis.__LEMONSPACE_FEATURE_FLAGS__ = undefined;
  window.__LEMONSPACE_FEATURE_FLAGS__ = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backend feature flags", () => {
  it("parses accepted truthy and falsy string and numeric variants", () => {
    const cases: Array<{ value: unknown; expected: boolean }> = [
      { value: true, expected: true },
      { value: false, expected: false },
      { value: 1, expected: true },
      { value: 0, expected: false },
      { value: "true", expected: true },
      { value: "false", expected: false },
      { value: "1", expected: true },
      { value: "0", expected: false },
      { value: "on", expected: true },
      { value: "off", expected: false },
      { value: "  TrUe  ", expected: true },
      { value: " Off ", expected: false },
    ];

    for (const testCase of cases) {
      expect(
        getBackendFeatureFlags((key) => {
          if (key === "imagePipeline.backend.forceCpu") {
            return testCase.value;
          }
          return false;
        }).forceCpu,
      ).toBe(testCase.expected);

      expect(
        getBackendFeatureFlags((key) => {
          if (key === "imagePipeline.backend.webgl.enabled") {
            return testCase.value;
          }
          return false;
        }).webglEnabled,
      ).toBe(testCase.expected);

      expect(
        getBackendFeatureFlags((key) => {
          if (key === "imagePipeline.backend.wasm.enabled") {
            return testCase.value;
          }
          return false;
        }).wasmEnabled,
      ).toBe(testCase.expected);
    }
  });

  it("falls back to defaults for invalid values", () => {
    const invalidValues: unknown[] = [
      2,
      -1,
      Number.NaN,
      "yes",
      "no",
      "enabled",
      "disabled",
      "",
      " ",
      null,
      undefined,
      {},
      [],
    ];

    for (const value of invalidValues) {
      expect(
        getBackendFeatureFlags(() => value),
      ).toEqual({
        forceCpu: false,
        webglEnabled: false,
        wasmEnabled: false,
      });
    }
  });

  it("prefers runtime store values over localStorage", () => {
    globalThis.__LEMONSPACE_FEATURE_FLAGS__ = {
      "imagePipeline.backend.forceCpu": true,
      "imagePipeline.backend.webgl.enabled": "1",
      "imagePipeline.backend.wasm.enabled": "off",
    };

    localStorage.setItem("imagePipeline.backend.forceCpu", "false");
    localStorage.setItem("imagePipeline.backend.webgl.enabled", "0");
    localStorage.setItem("imagePipeline.backend.wasm.enabled", "on");

    expect(getBackendFeatureFlags()).toEqual({
      forceCpu: true,
      webglEnabled: true,
      wasmEnabled: false,
    });
  });

  it("returns defaults when localStorage access throws", () => {
    const failingStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        // no-op
      },
      removeItem() {
        // no-op
      },
      clear() {
        // no-op
      },
      key() {
        return null;
      },
      get length() {
        return 0;
      },
    } as Storage;

    globalThis.__LEMONSPACE_FEATURE_FLAGS__ = undefined;
    vi.stubGlobal("localStorage", failingStorage);

    expect(getBackendFeatureFlags()).toEqual({
      forceCpu: false,
      webglEnabled: false,
      wasmEnabled: false,
    });
  });

  it("forceCpu overrides all backend choices", () => {
    const fallbackEvents: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];
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
        fallbackEvents.push({
          reason: event.reason,
          requestedBackend: event.requestedBackend,
          fallbackBackend: event.fallbackBackend,
        });
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
    expect(fallbackEvents).toEqual([
      {
        reason: "flag_disabled",
        requestedBackend: "webgl",
        fallbackBackend: "cpu",
      },
      {
        reason: "flag_disabled",
        requestedBackend: "wasm",
        fallbackBackend: "cpu",
      },
    ]);
  });

  it("webgl and wasm can be independently enabled or disabled", () => {
    const reasonA: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];
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
        reasonA.push({
          reason: event.reason,
          requestedBackend: event.requestedBackend,
          fallbackBackend: event.fallbackBackend,
        });
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
    expect(reasonA).toEqual([
      {
        reason: "flag_disabled",
        requestedBackend: "wasm",
        fallbackBackend: "cpu",
      },
    ]);

    const reasonB: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];
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
        reasonB.push({
          reason: event.reason,
          requestedBackend: event.requestedBackend,
          fallbackBackend: event.fallbackBackend,
        });
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
    expect(reasonB).toEqual([
      {
        reason: "flag_disabled",
        requestedBackend: "webgl",
        fallbackBackend: "cpu",
      },
    ]);
  });

  it("defaults preserve cpu behavior when no explicit flags are set", () => {
    const fallbackEvents: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];
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
        fallbackEvents.push({
          reason: event.reason,
          requestedBackend: event.requestedBackend,
          fallbackBackend: event.fallbackBackend,
        });
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
    expect(fallbackEvents).toEqual([
      {
        reason: "flag_disabled",
        requestedBackend: "webgl",
        fallbackBackend: "cpu",
      },
      {
        reason: "flag_disabled",
        requestedBackend: "wasm",
        fallbackBackend: "cpu",
      },
    ]);
  });
});
