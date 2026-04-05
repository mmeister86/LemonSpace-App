// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { enforceCpuWebglParityGates } from "@/tests/image-pipeline/parity/fixtures";

function createCurvesStep(): PipelineStep {
  return {
    nodeId: "curves-1",
    type: "curves",
    params: {
      channelMode: "master",
      levels: {
        blackPoint: 0,
        whitePoint: 255,
        gamma: 1,
      },
      points: {
        rgb: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        red: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        green: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        blue: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
      },
    },
  };
}

function createCurvesPressureStep(): PipelineStep {
  return {
    nodeId: "curves-pressure-1",
    type: "curves",
    params: {
      channelMode: "master",
      levels: {
        blackPoint: 12,
        whitePoint: 232,
        gamma: 2.5,
      },
      points: {
        rgb: [
          { x: 0, y: 0 },
          { x: 64, y: 52 },
          { x: 196, y: 228 },
          { x: 255, y: 255 },
        ],
        red: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        green: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        blue: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
      },
    },
  };
}

function createColorAdjustStep(): PipelineStep {
  return {
    nodeId: "color-1",
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
  };
}

function createColorAdjustPressureStep(): PipelineStep {
  return {
    nodeId: "color-pressure-1",
    type: "color-adjust",
    params: {
      hsl: {
        hue: 48,
        saturation: 64,
        luminance: 18,
      },
      temperature: 24,
      tint: -28,
      vibrance: 52,
    },
  };
}

function createUnsupportedStep(): PipelineStep {
  return {
    nodeId: "light-1",
    type: "unsupported-adjust" as PipelineStep["type"],
    params: {
      exposure: 0,
    },
  };
}

function createDetailAdjustStep(): PipelineStep {
  return {
    nodeId: "detail-1",
    type: "detail-adjust",
    params: {
      sharpen: { amount: 20, radius: 1.4, detail: 10, masking: 0 },
      clarity: 15,
      denoise: { luminance: 12, color: 18, detail: 50 },
      grain: { amount: 35, size: 2.5, roughness: 50 },
    },
  };
}

describe("webgl backend poc", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unmock("@/lib/image-pipeline/backend/capabilities");
    vi.unmock("@/lib/image-pipeline/backend/feature-flags");
    vi.unmock("@/lib/image-pipeline/backend/webgl/webgl-backend");
    vi.unmock("@/lib/image-pipeline/backend/backend-router");
    vi.unmock("@/lib/image-pipeline/source-loader");
    vi.unmock("@/lib/image-pipeline/render-core");
  });

  function createFakeWebglContext(options?: {
    compileSuccess?: boolean;
    linkSuccess?: boolean;
    readbackPixels?: Uint8Array;
  }): WebGLRenderingContext {
    const compileSuccess = options?.compileSuccess ?? true;
    const linkSuccess = options?.linkSuccess ?? true;
    const readbackPixels = options?.readbackPixels ?? new Uint8Array([0, 0, 0, 255]);

    return {
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      LINK_STATUS: 0x8b82,
      ARRAY_BUFFER: 0x8892,
      STATIC_DRAW: 0x88e4,
      TRIANGLE_STRIP: 0x0005,
      FLOAT: 0x1406,
      TEXTURE_2D: 0x0de1,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      TEXTURE0: 0x84c0,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      CLAMP_TO_EDGE: 0x812f,
      NEAREST: 0x2600,
      FRAMEBUFFER: 0x8d40,
      COLOR_ATTACHMENT0: 0x8ce0,
      FRAMEBUFFER_COMPLETE: 0x8cd5,
      createShader: vi.fn(() => ({ shader: true })),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn((_shader: unknown, pname: number) => {
        if (pname === 0x8b81) {
          return compileSuccess;
        }
        return true;
      }),
      getShaderInfoLog: vi.fn(() => "compile error"),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({ program: true })),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn((_program: unknown, pname: number) => {
        if (pname === 0x8b82) {
          return linkSuccess;
        }
        return true;
      }),
      getProgramInfoLog: vi.fn(() => "link error"),
      deleteProgram: vi.fn(),
      useProgram: vi.fn(),
      createBuffer: vi.fn(() => ({ buffer: true })),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      createTexture: vi.fn(() => ({ texture: true })),
      bindTexture: vi.fn(),
      texParameteri: vi.fn(),
      texImage2D: vi.fn(),
      activeTexture: vi.fn(),
      getUniformLocation: vi.fn((_program: unknown, name: string) => ({ uniform: true, name })),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      uniform3f: vi.fn(),
      createFramebuffer: vi.fn(() => ({ framebuffer: true })),
      bindFramebuffer: vi.fn(),
      framebufferTexture2D: vi.fn(),
      checkFramebufferStatus: vi.fn(() => 0x8cd5),
      deleteFramebuffer: vi.fn(),
      viewport: vi.fn(),
      drawArrays: vi.fn(),
      deleteTexture: vi.fn(),
      readPixels: vi.fn(
        (
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          _format: number,
          _type: number,
          pixels: Uint8Array,
        ) => {
          pixels.set(readbackPixels);
        },
      ),
    } as unknown as WebGLRenderingContext;
  }

  it("selects webgl for preview when webgl is available and enabled", async () => {
    // Parity gate in jsdom with mocked WebGL verifies backend contract behavior,
    // not GPU-driver conformance.
    enforceCpuWebglParityGates();

    const webglPreview = vi.fn();

    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/feature-flags")>(
        "@/lib/image-pipeline/backend/feature-flags",
      );
      return {
        ...actual,
        getBackendFeatureFlags: () => ({
          forceCpu: false,
          webglEnabled: true,
          wasmEnabled: false,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/capabilities")>(
        "@/lib/image-pipeline/backend/capabilities",
      );
      return {
        ...actual,
        detectBackendCapabilities: () => ({
          webgl: true,
          wasmSimd: false,
          offscreenCanvas: true,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/webgl/webgl-backend", () => ({
      createWebglPreviewBackend: () => ({
        id: "webgl",
        runPreviewStep: webglPreview,
        runFullPipeline: vi.fn(),
      }),
    }));

    const { runPreviewStepWithBackendRouter } = await import("@/lib/image-pipeline/backend/backend-router");

    runPreviewStepWithBackendRouter({
      pixels: new Uint8ClampedArray(4),
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(webglPreview).toHaveBeenCalledTimes(1);
  });

  it("uses cpu for every step in a mixed pipeline request", async () => {
    // Keep backend-contract parity gate explicit for mocked jsdom runs.
    enforceCpuWebglParityGates();

    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/feature-flags")>(
        "@/lib/image-pipeline/backend/feature-flags",
      );
      return {
        ...actual,
        getBackendFeatureFlags: () => ({
          forceCpu: false,
          webglEnabled: true,
          wasmEnabled: false,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/capabilities")>(
        "@/lib/image-pipeline/backend/capabilities",
      );
      return {
        ...actual,
        detectBackendCapabilities: () => ({
          webgl: true,
          wasmSimd: false,
          offscreenCanvas: true,
        }),
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/webgl/webgl-backend", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/webgl/webgl-backend")>(
        "@/lib/image-pipeline/backend/webgl/webgl-backend",
      );
      return {
        ...actual,
      };
    });

    const backendRouterModule = await import("@/lib/image-pipeline/backend/backend-router");
    const runPreviewStepWithBackendRouter = vi
      .spyOn(backendRouterModule, "runPreviewStepWithBackendRouter")
      .mockImplementation(() => {});

    vi.doMock("@/lib/image-pipeline/source-loader", () => ({
      loadSourceBitmap: vi.fn().mockResolvedValue({ width: 2, height: 2 }),
    }));

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(16),
      })),
    } as unknown as CanvasRenderingContext2D);

    vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);

    const { renderPreview } = await import("@/lib/image-pipeline/preview-renderer");

    await renderPreview({
      sourceUrl: "https://cdn.example.com/source.png",
      steps: [createColorAdjustStep(), createUnsupportedStep()],
      previewWidth: 2,
      includeHistogram: false,
    });

    expect(runPreviewStepWithBackendRouter).toHaveBeenCalledTimes(2);
    for (const call of runPreviewStepWithBackendRouter.mock.calls) {
      expect(call[0]).toMatchObject({
        backendHint: "cpu",
      });
    }
  });

  it("runs a supported preview step through gpu shader path with readback", async () => {
    const cpuPreview = vi.fn();

    vi.doMock("@/lib/image-pipeline/render-core", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/render-core")>(
        "@/lib/image-pipeline/render-core",
      );
      return {
        ...actual,
        applyPipelineStep: cpuPreview,
      };
    });

    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([10, 20, 30, 255]),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");

    const pixels = new Uint8ClampedArray([200, 100, 50, 255]);
    const backend = createWebglPreviewBackend();

    backend.runPreviewStep({
      pixels,
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(Array.from(pixels)).toEqual([10, 20, 30, 255]);
    expect(cpuPreview).not.toHaveBeenCalled();
    expect(fakeGl.readPixels).toHaveBeenCalledTimes(1);
  });

  it("keeps source texture bound on sampler unit when drawing", async () => {
    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([1, 2, 3, 255]),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const backend = createWebglPreviewBackend();
    backend.runPreviewStep({
      pixels: new Uint8ClampedArray([9, 9, 9, 255]),
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    const createTextureMock = vi.mocked(fakeGl.createTexture);
    const sourceTexture = createTextureMock.mock.results[0]?.value;
    const outputTexture = createTextureMock.mock.results[1]?.value;
    expect(sourceTexture).toBeTruthy();
    expect(outputTexture).toBeTruthy();

    expect(fakeGl.framebufferTexture2D).toHaveBeenCalledWith(
      fakeGl.FRAMEBUFFER,
      fakeGl.COLOR_ATTACHMENT0,
      fakeGl.TEXTURE_2D,
      outputTexture,
      0,
    );

    const bindTextureMock = vi.mocked(fakeGl.bindTexture);
    const drawArraysMock = vi.mocked(fakeGl.drawArrays);
    const bindTextureCalls = bindTextureMock.mock.calls;
    const bindTextureOrder = bindTextureMock.mock.invocationCallOrder;
    const drawOrder = drawArraysMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const lastBindBeforeDrawIndex = bindTextureOrder
      .map((callOrder, index) => ({ callOrder, index }))
      .filter(({ callOrder, index }) => callOrder < drawOrder && bindTextureCalls[index]?.[0] === fakeGl.TEXTURE_2D)
      .at(-1)?.index;

    expect(lastBindBeforeDrawIndex).toBeTypeOf("number");
    expect(bindTextureCalls[lastBindBeforeDrawIndex as number]?.[1]).toStrictEqual(sourceTexture);
    expect(bindTextureCalls[lastBindBeforeDrawIndex as number]?.[1]).not.toBe(outputTexture);
  });

  it("initializes backend with webgl2-only context availability", async () => {
    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([11, 22, 33, 255]),
    });
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((contextId) => {
        if (contextId === "webgl2") {
          return fakeGl;
        }
        if (contextId === "webgl") {
          return null;
        }
        return null;
      });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const backend = createWebglPreviewBackend();
    const pixels = new Uint8ClampedArray([200, 100, 50, 255]);

    backend.runPreviewStep({
      pixels,
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(Array.from(pixels)).toEqual([11, 22, 33, 255]);
    expect(fakeGl.drawArrays).toHaveBeenCalledTimes(1);
    expect(getContextSpy).toHaveBeenCalledWith("webgl2", expect.any(Object));
  });

  it("passes image width uniform for detail-adjust grain parity", async () => {
    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([11, 22, 33, 255]),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const backend = createWebglPreviewBackend();
    backend.runPreviewStep({
      pixels: new Uint8ClampedArray(7 * 3 * 4),
      step: createDetailAdjustStep(),
      width: 7,
      height: 3,
    });

    expect(fakeGl.uniform1f).toHaveBeenCalledWith(expect.anything(), 7);
  });

  it("passes curves levels uniforms for non-default curves settings", async () => {
    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([11, 22, 33, 255]),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const backend = createWebglPreviewBackend();

    backend.runPreviewStep({
      pixels: new Uint8ClampedArray([200, 100, 50, 255]),
      step: createCurvesPressureStep(),
      width: 1,
      height: 1,
    });

    expect(fakeGl.uniform1f).toHaveBeenCalledWith(
      expect.objectContaining({ name: "uBlackPoint" }),
      12,
    );
    expect(fakeGl.uniform1f).toHaveBeenCalledWith(
      expect.objectContaining({ name: "uWhitePoint" }),
      232,
    );
    expect(fakeGl.uniform1f).toHaveBeenCalledWith(
      expect.objectContaining({ name: "uInvGamma" }),
      0.4,
    );
  });

  it("passes hue, saturation, luminance, temperature, tint, and vibrance uniforms", async () => {
    const fakeGl = createFakeWebglContext({
      readbackPixels: new Uint8Array([11, 22, 33, 255]),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const backend = createWebglPreviewBackend();

    backend.runPreviewStep({
      pixels: new Uint8ClampedArray([200, 100, 50, 255]),
      step: createColorAdjustPressureStep(),
      width: 1,
      height: 1,
    });

    const uniform1fCalls = vi.mocked(fakeGl.uniform1f).mock.calls;

    expect(fakeGl.uniform1f).toHaveBeenCalledWith(
      expect.objectContaining({ name: "uHueShift" }),
      48,
    );
    expect(uniform1fCalls).toContainEqual([
      expect.objectContaining({ name: "uSaturationFactor" }),
      expect.closeTo(1.64, 5),
    ]);
    expect(uniform1fCalls).toContainEqual([
      expect.objectContaining({ name: "uLuminanceShift" }),
      expect.closeTo(0.18, 5),
    ]);
    expect(uniform1fCalls).toContainEqual([
      expect.objectContaining({ name: "uTemperatureShift" }),
      expect.closeTo(14.4, 5),
    ]);
    expect(uniform1fCalls).toContainEqual([
      expect.objectContaining({ name: "uTintShift" }),
      expect.closeTo(-11.2, 5),
    ]);
    expect(uniform1fCalls).toContainEqual([
      expect.objectContaining({ name: "uVibranceBoost" }),
      expect.closeTo(0.52, 5),
    ]);
  });

  it("downgrades compile/link failures to cpu with runtime_error reason", async () => {
    const { createBackendRouter } = await import("@/lib/image-pipeline/backend/backend-router");
    const { createWebglPreviewBackend } = await import("@/lib/image-pipeline/backend/webgl/webgl-backend");
    const cpuPreview = vi.fn();
    const fallbackEvents: Array<{
      reason: string;
      requestedBackend: string;
      fallbackBackend: string;
    }> = [];

    const fakeGl = createFakeWebglContext({
      compileSuccess: false,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
      if (contextId === "webgl") {
        return fakeGl;
      }
      return null;
    });

    const router = createBackendRouter({
      backends: [
        {
          id: "cpu",
          runPreviewStep: cpuPreview,
          runFullPipeline: vi.fn(),
        },
        createWebglPreviewBackend(),
      ],
      defaultBackendId: "webgl",
      backendAvailability: {
        webgl: {
          supported: true,
          enabled: true,
        },
      },
      featureFlags: {
        forceCpu: false,
        webglEnabled: true,
        wasmEnabled: false,
      },
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
      step: createCurvesStep(),
      width: 1,
      height: 1,
    });

    expect(cpuPreview).toHaveBeenCalledTimes(1);
    expect(fallbackEvents).toEqual([
      {
        reason: "runtime_error",
        requestedBackend: "webgl",
        fallbackBackend: "cpu",
      },
    ]);
  });

  it("re-evaluates rollout flags and capabilities at runtime", async () => {
    const runtimeState = {
      flags: {
        forceCpu: false,
        webglEnabled: false,
        wasmEnabled: false,
      },
      capabilities: {
        webgl: false,
        wasmSimd: false,
        offscreenCanvas: false,
      },
    };

    vi.doMock("@/lib/image-pipeline/backend/feature-flags", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/feature-flags")>(
        "@/lib/image-pipeline/backend/feature-flags",
      );
      return {
        ...actual,
        getBackendFeatureFlags: () => runtimeState.flags,
      };
    });

    vi.doMock("@/lib/image-pipeline/backend/capabilities", async () => {
      const actual = await vi.importActual<typeof import("@/lib/image-pipeline/backend/capabilities")>(
        "@/lib/image-pipeline/backend/capabilities",
      );
      return {
        ...actual,
        detectBackendCapabilities: () => runtimeState.capabilities,
      };
    });

    const { getPreviewBackendHintForSteps } = await import("@/lib/image-pipeline/backend/backend-router");
    const steps = [createCurvesStep()] as const;

    expect(getPreviewBackendHintForSteps(steps)).toBe("cpu");

    runtimeState.flags.webglEnabled = true;
    runtimeState.capabilities.webgl = true;

    expect(getPreviewBackendHintForSteps(steps)).toBe("webgl");
  });
});
