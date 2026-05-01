/**
 * Onboarding note:
 * Image pipeline utility for feature flags. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

export const IMAGE_PIPELINE_BACKEND_FLAG_KEYS = {
  forceCpu: "imagePipeline.backend.forceCpu",
  webglEnabled: "imagePipeline.backend.webgl.enabled",
  wasmEnabled: "imagePipeline.backend.wasm.enabled",
} as const;

export type BackendFeatureFlags = {
  forceCpu: boolean;
  webglEnabled: boolean;
  wasmEnabled: boolean;
};

export type BackendFeatureFlagReader = (
  key: (typeof IMAGE_PIPELINE_BACKEND_FLAG_KEYS)[keyof typeof IMAGE_PIPELINE_BACKEND_FLAG_KEYS],
) => unknown;

const DEFAULT_BACKEND_FEATURE_FLAGS: BackendFeatureFlags = {
  forceCpu: false,
  webglEnabled: false,
  wasmEnabled: false,
};

type RuntimeFeatureFlagStore = {
  [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.forceCpu]?: unknown;
  [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.webglEnabled]?: unknown;
  [IMAGE_PIPELINE_BACKEND_FLAG_KEYS.wasmEnabled]?: unknown;
};

declare global {
  interface Window {
    __LEMONSPACE_FEATURE_FLAGS__?: RuntimeFeatureFlagStore;
  }

  var __LEMONSPACE_FEATURE_FLAGS__: RuntimeFeatureFlagStore | undefined;
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
      return false;
    }
  }

  return undefined;
}

function readFlagFromRuntimeStore(
  key: (typeof IMAGE_PIPELINE_BACKEND_FLAG_KEYS)[keyof typeof IMAGE_PIPELINE_BACKEND_FLAG_KEYS],
): unknown {
  const runtimeStore = (globalThis as typeof globalThis & {
    __LEMONSPACE_FEATURE_FLAGS__?: RuntimeFeatureFlagStore;
  }).__LEMONSPACE_FEATURE_FLAGS__;

  if (runtimeStore && key in runtimeStore) {
    return runtimeStore[key];
  }

  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getBackendFeatureFlags(readFlag?: BackendFeatureFlagReader): BackendFeatureFlags {
  const reader = readFlag ?? readFlagFromRuntimeStore;

  return {
    forceCpu:
      parseBooleanFlag(reader(IMAGE_PIPELINE_BACKEND_FLAG_KEYS.forceCpu)) ??
      DEFAULT_BACKEND_FEATURE_FLAGS.forceCpu,
    webglEnabled:
      parseBooleanFlag(reader(IMAGE_PIPELINE_BACKEND_FLAG_KEYS.webglEnabled)) ??
      DEFAULT_BACKEND_FEATURE_FLAGS.webglEnabled,
    wasmEnabled:
      parseBooleanFlag(reader(IMAGE_PIPELINE_BACKEND_FLAG_KEYS.wasmEnabled)) ??
      DEFAULT_BACKEND_FEATURE_FLAGS.wasmEnabled,
  };
}
