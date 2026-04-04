import type {
  BackendPipelineRequest,
  BackendStepRequest,
  ImagePipelineBackend,
} from "@/lib/image-pipeline/backend/backend-types";
import {
  normalizeDetailAdjustData,
  normalizeLightAdjustData,
} from "@/lib/image-pipeline/adjustment-types";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import colorAdjustFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/color-adjust.frag.glsl?raw";
import curvesFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/curves.frag.glsl?raw";
import detailAdjustFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/detail-adjust.frag.glsl?raw";
import lightAdjustFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/light-adjust.frag.glsl?raw";

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = (aPosition + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

type SupportedPreviewStepType = "curves" | "color-adjust" | "light-adjust" | "detail-adjust";

type WebglBackendContext = {
  gl: WebGLRenderingContext;
  curvesProgram: WebGLProgram;
  colorAdjustProgram: WebGLProgram;
  lightAdjustProgram: WebGLProgram;
  detailAdjustProgram: WebGLProgram;
  quadBuffer: WebGLBuffer;
};

const SUPPORTED_PREVIEW_STEP_TYPES = new Set<SupportedPreviewStepType>([
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

function assertSupportedStep(step: PipelineStep): void {
  if (SUPPORTED_PREVIEW_STEP_TYPES.has(step.type as SupportedPreviewStepType)) {
    return;
  }

  throw new Error(`WebGL backend does not support step type '${step.type}'.`);
}

function createGlContext(): WebGLRenderingContext {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const contextOptions: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    };
    const context =
      canvas.getContext("webgl2", contextOptions) ?? canvas.getContext("webgl", contextOptions);
    if (context) {
      return context;
    }
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (context) {
      return context;
    }
  }

  throw new Error("WebGL context is unavailable.");
}

function compileShader(
  gl: WebGLRenderingContext,
  source: string,
  shaderType: number,
): WebGLShader {
  const shader = gl.createShader(shaderType);
  if (!shader) {
    throw new Error("WebGL shader allocation failed.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }

  const info = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
  gl.deleteShader(shader);
  throw new Error(`WebGL shader compile failed: ${info}`);
}

function compileProgram(
  gl: WebGLRenderingContext,
  fragmentShaderSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("WebGL program allocation failed.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program;
  }

  const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
  gl.deleteProgram(program);
  throw new Error(`WebGL program link failed: ${info}`);
}

function createQuadBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) {
    throw new Error("WebGL quad buffer allocation failed.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  return quadBuffer;
}

function mapCurvesGamma(step: PipelineStep): number {
  const gamma = (step.params as { levels?: { gamma?: unknown } })?.levels?.gamma;
  if (typeof gamma === "number" && Number.isFinite(gamma)) {
    return Math.max(gamma, 0.001);
  }
  return 1;
}

function mapColorShift(step: PipelineStep): [number, number, number] {
  const params = step.params as {
    hsl?: { luminance?: unknown };
    temperature?: unknown;
    tint?: unknown;
  };

  const luminance = typeof params?.hsl?.luminance === "number" ? params.hsl.luminance : 0;
  const temperature = typeof params?.temperature === "number" ? params.temperature : 0;
  const tint = typeof params?.tint === "number" ? params.tint : 0;

  return [
    (luminance + temperature) / 255,
    (luminance + tint) / 255,
    (luminance - temperature) / 255,
  ];
}

function applyStepUniforms(
  gl: WebGLRenderingContext,
  shaderProgram: WebGLProgram,
  request: BackendStepRequest,
): void {
  if (request.step.type === "curves") {
    const gammaLocation = gl.getUniformLocation(shaderProgram, "uGamma");
    if (gammaLocation) {
      gl.uniform1f(gammaLocation, mapCurvesGamma(request.step));
    }
    return;
  }

  if (request.step.type === "color-adjust") {
    const colorShiftLocation = gl.getUniformLocation(shaderProgram, "uColorShift");
    if (colorShiftLocation) {
      const [r, g, b] = mapColorShift(request.step);
      gl.uniform3f(colorShiftLocation, r, g, b);
    }
    return;
  }

  if (request.step.type === "light-adjust") {
    const light = normalizeLightAdjustData(request.step.params);
    const exposureFactorLocation = gl.getUniformLocation(shaderProgram, "uExposureFactor");
    if (exposureFactorLocation) {
      gl.uniform1f(exposureFactorLocation, Math.pow(2, light.exposure / 2));
    }

    const contrastFactorLocation = gl.getUniformLocation(shaderProgram, "uContrastFactor");
    if (contrastFactorLocation) {
      gl.uniform1f(contrastFactorLocation, 1 + light.contrast / 100);
    }

    const brightnessShiftLocation = gl.getUniformLocation(shaderProgram, "uBrightnessShift");
    if (brightnessShiftLocation) {
      gl.uniform1f(brightnessShiftLocation, light.brightness * 1.8);
    }

    const highlightsLocation = gl.getUniformLocation(shaderProgram, "uHighlights");
    if (highlightsLocation) {
      gl.uniform1f(highlightsLocation, light.highlights / 100);
    }

    const shadowsLocation = gl.getUniformLocation(shaderProgram, "uShadows");
    if (shadowsLocation) {
      gl.uniform1f(shadowsLocation, light.shadows / 100);
    }

    const whitesLocation = gl.getUniformLocation(shaderProgram, "uWhites");
    if (whitesLocation) {
      gl.uniform1f(whitesLocation, light.whites / 100);
    }

    const blacksLocation = gl.getUniformLocation(shaderProgram, "uBlacks");
    if (blacksLocation) {
      gl.uniform1f(blacksLocation, light.blacks / 100);
    }

    const vignetteAmountLocation = gl.getUniformLocation(shaderProgram, "uVignetteAmount");
    if (vignetteAmountLocation) {
      gl.uniform1f(vignetteAmountLocation, light.vignette.amount);
    }

    const vignetteSizeLocation = gl.getUniformLocation(shaderProgram, "uVignetteSize");
    if (vignetteSizeLocation) {
      gl.uniform1f(vignetteSizeLocation, light.vignette.size);
    }

    const vignetteRoundnessLocation = gl.getUniformLocation(shaderProgram, "uVignetteRoundness");
    if (vignetteRoundnessLocation) {
      gl.uniform1f(vignetteRoundnessLocation, light.vignette.roundness);
    }
    return;
  }

  if (request.step.type === "detail-adjust") {
    const detail = normalizeDetailAdjustData(request.step.params);

    const sharpenBoostLocation = gl.getUniformLocation(shaderProgram, "uSharpenBoost");
    if (sharpenBoostLocation) {
      gl.uniform1f(sharpenBoostLocation, detail.sharpen.amount / 500);
    }

    const clarityBoostLocation = gl.getUniformLocation(shaderProgram, "uClarityBoost");
    if (clarityBoostLocation) {
      gl.uniform1f(clarityBoostLocation, detail.clarity / 100);
    }

    const denoiseLumaLocation = gl.getUniformLocation(shaderProgram, "uDenoiseLuma");
    if (denoiseLumaLocation) {
      gl.uniform1f(denoiseLumaLocation, detail.denoise.luminance / 100);
    }

    const denoiseColorLocation = gl.getUniformLocation(shaderProgram, "uDenoiseColor");
    if (denoiseColorLocation) {
      gl.uniform1f(denoiseColorLocation, detail.denoise.color / 100);
    }

    const grainAmountLocation = gl.getUniformLocation(shaderProgram, "uGrainAmount");
    if (grainAmountLocation) {
      gl.uniform1f(grainAmountLocation, detail.grain.amount / 100);
    }

    const grainScaleLocation = gl.getUniformLocation(shaderProgram, "uGrainScale");
    if (grainScaleLocation) {
      gl.uniform1f(grainScaleLocation, Math.max(0.5, detail.grain.size));
    }
  }
}

function runStepOnGpu(context: WebglBackendContext, request: BackendStepRequest): void {
  const { gl } = context;
  const shaderProgram =
    request.step.type === "curves"
      ? context.curvesProgram
      : request.step.type === "color-adjust"
        ? context.colorAdjustProgram
        : request.step.type === "light-adjust"
          ? context.lightAdjustProgram
          : context.detailAdjustProgram;
  gl.useProgram(shaderProgram);

  gl.bindBuffer(gl.ARRAY_BUFFER, context.quadBuffer);
  const positionLocation = gl.getAttribLocation(shaderProgram, "aPosition");
  if (positionLocation >= 0) {
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }

  const sourceTexture = gl.createTexture();
  if (!sourceTexture) {
    throw new Error("WebGL source texture allocation failed.");
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    request.width,
    request.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    request.pixels,
  );

  const outputTexture = gl.createTexture();
  if (!outputTexture) {
    gl.deleteTexture(sourceTexture);
    throw new Error("WebGL output texture allocation failed.");
  }

  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    request.width,
    request.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(sourceTexture);
    gl.deleteTexture(outputTexture);
    throw new Error("WebGL framebuffer allocation failed.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(sourceTexture);
    gl.deleteTexture(outputTexture);
    throw new Error("WebGL framebuffer is incomplete.");
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

  const sourceLocation = gl.getUniformLocation(shaderProgram, "uSource");
  if (sourceLocation) {
    gl.uniform1i(sourceLocation, 0);
  }

  applyStepUniforms(gl, shaderProgram, request);

  gl.viewport(0, 0, request.width, request.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const readback = new Uint8Array(request.pixels.length);
  gl.readPixels(0, 0, request.width, request.height, gl.RGBA, gl.UNSIGNED_BYTE, readback);
  request.pixels.set(readback);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(sourceTexture);
  gl.deleteTexture(outputTexture);
}

export function isWebglPreviewStepSupported(step: PipelineStep): boolean {
  return SUPPORTED_PREVIEW_STEP_TYPES.has(step.type as SupportedPreviewStepType);
}

export function isWebglPreviewPipelineSupported(steps: readonly PipelineStep[]): boolean {
  return steps.every((step) => isWebglPreviewStepSupported(step));
}

export function createWebglPreviewBackend(): ImagePipelineBackend {
  let context: WebglBackendContext | null = null;

  function ensureInitialized(): WebglBackendContext {
    if (context) {
      return context;
    }

    const gl = createGlContext();
    context = {
      gl,
      curvesProgram: compileProgram(gl, curvesFragmentShaderSource),
      colorAdjustProgram: compileProgram(gl, colorAdjustFragmentShaderSource),
      lightAdjustProgram: compileProgram(gl, lightAdjustFragmentShaderSource),
      detailAdjustProgram: compileProgram(gl, detailAdjustFragmentShaderSource),
      quadBuffer: createQuadBuffer(gl),
    };

    return context;
  }

  return {
    id: "webgl",
    runPreviewStep(request: BackendStepRequest): void {
      assertSupportedStep(request.step);
      runStepOnGpu(ensureInitialized(), request);
    },
    runFullPipeline(request: BackendPipelineRequest): void {
      if (!isWebglPreviewPipelineSupported(request.steps)) {
        throw new Error("WebGL backend does not support all pipeline steps.");
      }

      const initializedContext = ensureInitialized();
      for (const step of request.steps) {
        runStepOnGpu(initializedContext, {
          pixels: request.pixels,
          step,
          width: request.width,
          height: request.height,
          executionOptions: request.executionOptions,
        });
      }
    },
  };
}
