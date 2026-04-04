import type {
  BackendPipelineRequest,
  BackendStepRequest,
  ImagePipelineBackend,
} from "@/lib/image-pipeline/backend/backend-types";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import colorAdjustFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/color-adjust.frag.glsl?raw";
import curvesFragmentShaderSource from "@/lib/image-pipeline/backend/webgl/shaders/curves.frag.glsl?raw";

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = (aPosition + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

type SupportedPreviewStepType = "curves" | "color-adjust";

type WebglBackendContext = {
  gl: WebGLRenderingContext;
  curvesProgram: WebGLProgram;
  colorAdjustProgram: WebGLProgram;
  quadBuffer: WebGLBuffer;
};

const SUPPORTED_PREVIEW_STEP_TYPES = new Set<SupportedPreviewStepType>([
  "curves",
  "color-adjust",
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
    const context = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (context) {
      return context;
    }
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("webgl");
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

function runStepOnGpu(context: WebglBackendContext, request: BackendStepRequest): void {
  const { gl } = context;
  const shaderProgram = request.step.type === "curves" ? context.curvesProgram : context.colorAdjustProgram;
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

  const sourceLocation = gl.getUniformLocation(shaderProgram, "uSource");
  if (sourceLocation) {
    gl.uniform1i(sourceLocation, 0);
  }

  if (request.step.type === "curves") {
    const gammaLocation = gl.getUniformLocation(shaderProgram, "uGamma");
    if (gammaLocation) {
      gl.uniform1f(gammaLocation, mapCurvesGamma(request.step));
    }
  } else {
    const colorShiftLocation = gl.getUniformLocation(shaderProgram, "uColorShift");
    if (colorShiftLocation) {
      const [r, g, b] = mapColorShift(request.step);
      gl.uniform3f(colorShiftLocation, r, g, b);
    }
  }

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
