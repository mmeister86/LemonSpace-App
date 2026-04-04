import { applyPipelineStep, applyPipelineSteps } from "@/lib/image-pipeline/render-core";
import type {
  BackendPipelineRequest,
  BackendStepRequest,
  ImagePipelineBackend,
} from "@/lib/image-pipeline/backend/backend-types";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const CURVES_FRAGMENT_SHADER_SOURCE = `#version 100
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uGamma;

void main() {
  vec4 color = texture2D(uSource, vUv);
  color.rgb = pow(max(color.rgb, vec3(0.0)), vec3(max(uGamma, 0.001)));
  gl_FragColor = color;
}
`;

const COLOR_ADJUST_FRAGMENT_SHADER_SOURCE = `#version 100
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform vec3 uColorShift;

void main() {
  vec4 color = texture2D(uSource, vUv);
  color.rgb = clamp(color.rgb + uColorShift, 0.0, 1.0);
  gl_FragColor = color;
}
`;

const VERTEX_SHADER_SOURCE = `#version 100
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  vUv = (aPosition + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

type SupportedPreviewStepType = "curves" | "color-adjust";

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

function createGlContext(): WebGLRenderingContext | WebGL2RenderingContext {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    return (
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      (() => {
        throw new Error("WebGL context is unavailable.");
      })()
    );
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(1, 1);
    return (
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      (() => {
        throw new Error("WebGL context is unavailable.");
      })()
    );
  }

  throw new Error("WebGL context is unavailable.");
}

function compileShader(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
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
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  fragmentShaderSource: string,
): void {
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
    gl.deleteProgram(program);
    return;
  }

  const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
  gl.deleteProgram(program);
  throw new Error(`WebGL program link failed: ${info}`);
}

export function isWebglPreviewStepSupported(step: PipelineStep): boolean {
  return SUPPORTED_PREVIEW_STEP_TYPES.has(step.type as SupportedPreviewStepType);
}

export function isWebglPreviewPipelineSupported(steps: readonly PipelineStep[]): boolean {
  return steps.every((step) => isWebglPreviewStepSupported(step));
}

export function createWebglPreviewBackend(): ImagePipelineBackend {
  let initialized = false;

  function ensureInitialized(): void {
    if (initialized) {
      return;
    }

    const gl = createGlContext();
    compileProgram(gl, CURVES_FRAGMENT_SHADER_SOURCE);
    compileProgram(gl, COLOR_ADJUST_FRAGMENT_SHADER_SOURCE);
    initialized = true;
  }

  return {
    id: "webgl",
    runPreviewStep(request: BackendStepRequest): void {
      assertSupportedStep(request.step);
      ensureInitialized();
      applyPipelineStep(
        request.pixels,
        request.step,
        request.width,
        request.height,
        request.executionOptions,
      );
    },
    runFullPipeline(request: BackendPipelineRequest): void {
      if (!isWebglPreviewPipelineSupported(request.steps)) {
        throw new Error("WebGL backend does not support all pipeline steps.");
      }

      ensureInitialized();
      applyPipelineSteps(
        request.pixels,
        request.steps,
        request.width,
        request.height,
        request.executionOptions,
      );
    },
  };
}
