import { createWebglPreviewBackend } from "@/lib/image-pipeline/backend/webgl/webgl-backend";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { applyPipelineStep } from "@/lib/image-pipeline/render-core";
import { vi } from "vitest";

type ParityPipelineKey =
  | "curvesOnly"
  | "colorAdjustOnly"
  | "curvesPlusColorAdjust"
  | "curvesChannelPressure"
  | "colorAdjustPressure"
  | "curvesColorPressureChain";

type HistogramBundle = {
  red: number[];
  green: number[];
  blue: number[];
  rgb: number[];
};

export type ParityMetrics = {
  maxChannelDelta: number;
  histogramSimilarity: number;
  spatialRmse: number;
};

type ParityPipeline = {
  key: ParityPipelineKey;
  steps: PipelineStep[];
};

type ParityTolerance = {
  maxChannelDelta: number;
  histogramSimilarity: number;
  spatialRmse: number;
};

const FIXTURE_WIDTH = 8;
const FIXTURE_HEIGHT = 8;

let contextSpy: { mockRestore: () => void } | null = null;

export const parityTolerances: Record<ParityPipelineKey, ParityTolerance> = {
  // Tightened against measured jsdom+mock outputs (2026-04-04 baseline):
  // - maxChannelDelta / spatialRmse gates use ~+2 delta and ~+1.3 RMSE headroom.
  // - histogramSimilarity gates use ~0.005-0.01 headroom below measured values.
  // This intentionally validates backend-contract parity in deterministic jsdom mocks,
  // not driver-level GPU conformance.
  curvesOnly: {
    maxChannelDelta: 33,
    histogramSimilarity: 0.16,
    spatialRmse: 24.7,
  },
  colorAdjustOnly: {
    maxChannelDelta: 42,
    histogramSimilarity: 0.15,
    spatialRmse: 21.6,
  },
  curvesPlusColorAdjust: {
    maxChannelDelta: 71,
    histogramSimilarity: 0.16,
    spatialRmse: 43.5,
  },
  curvesChannelPressure: {
    maxChannelDelta: 99,
    histogramSimilarity: 0.08,
    spatialRmse: 52.5,
  },
  colorAdjustPressure: {
    maxChannelDelta: 203,
    histogramSimilarity: 0.17,
    spatialRmse: 75.8,
  },
  curvesColorPressureChain: {
    maxChannelDelta: 203,
    histogramSimilarity: 0.18,
    spatialRmse: 75.5,
  },
};

function createCurvesStep(): PipelineStep {
  return {
    nodeId: "curves-parity",
    type: "curves",
    params: {
      channelMode: "master",
      levels: {
        blackPoint: 0,
        whitePoint: 255,
        gamma: 1.18,
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

function createColorAdjustStep(): PipelineStep {
  return {
    nodeId: "color-adjust-parity",
    type: "color-adjust",
    params: {
      hsl: {
        hue: 0,
        saturation: 0,
        luminance: 9,
      },
      temperature: 6,
      tint: -4,
      vibrance: 0,
    },
  };
}

function createCurvesChannelPressureStep(): PipelineStep {
  return {
    nodeId: "curves-channel-pressure-parity",
    type: "curves",
    params: {
      channelMode: "red",
      levels: {
        blackPoint: 20,
        whitePoint: 230,
        gamma: 0.72,
      },
      points: {
        rgb: [
          { x: 0, y: 0 },
          { x: 80, y: 68 },
          { x: 190, y: 224 },
          { x: 255, y: 255 },
        ],
        red: [
          { x: 0, y: 0 },
          { x: 60, y: 36 },
          { x: 180, y: 228 },
          { x: 255, y: 255 },
        ],
        green: [
          { x: 0, y: 0 },
          { x: 124, y: 104 },
          { x: 255, y: 255 },
        ],
        blue: [
          { x: 0, y: 0 },
          { x: 120, y: 146 },
          { x: 255, y: 255 },
        ],
      },
    },
  };
}

function createColorAdjustPressureStep(): PipelineStep {
  return {
    nodeId: "color-adjust-pressure-parity",
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

function createCurvesColorPressureChainSteps(): PipelineStep[] {
  return [
    createCurvesChannelPressureStep(),
    {
      nodeId: "curves-master-pressure-parity",
      type: "curves",
      params: {
        channelMode: "master",
        levels: {
          blackPoint: 10,
          whitePoint: 246,
          gamma: 1.36,
        },
        points: {
          rgb: [
            { x: 0, y: 0 },
            { x: 62, y: 40 },
            { x: 172, y: 214 },
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
    },
    createColorAdjustPressureStep(),
  ];
}

export function createParityPipelines(): Record<ParityPipelineKey, ParityPipeline> {
  const curvesStep = createCurvesStep();
  const colorAdjustStep = createColorAdjustStep();
  const curvesChannelPressureStep = createCurvesChannelPressureStep();
  const colorAdjustPressureStep = createColorAdjustPressureStep();

  return {
    curvesOnly: {
      key: "curvesOnly",
      steps: [curvesStep],
    },
    colorAdjustOnly: {
      key: "colorAdjustOnly",
      steps: [colorAdjustStep],
    },
    curvesPlusColorAdjust: {
      key: "curvesPlusColorAdjust",
      steps: [curvesStep, colorAdjustStep],
    },
    curvesChannelPressure: {
      key: "curvesChannelPressure",
      steps: [curvesChannelPressureStep],
    },
    colorAdjustPressure: {
      key: "colorAdjustPressure",
      steps: [colorAdjustPressureStep],
    },
    curvesColorPressureChain: {
      key: "curvesColorPressureChain",
      steps: createCurvesColorPressureChainSteps(),
    },
  };
}

function createFixturePixels(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(FIXTURE_WIDTH * FIXTURE_HEIGHT * 4);

  for (let y = 0; y < FIXTURE_HEIGHT; y += 1) {
    for (let x = 0; x < FIXTURE_WIDTH; x += 1) {
      const offset = (y * FIXTURE_WIDTH + x) * 4;
      pixels[offset] = (x * 31 + y * 17) % 256;
      pixels[offset + 1] = (x * 13 + y * 47) % 256;
      pixels[offset + 2] = (x * 57 + y * 19) % 256;
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function clonePixels(pixels: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels);
}

type ShaderKind = "curves" | "color-adjust" | "vertex" | "unknown";

type FakeShader = {
  type: number;
  source: string;
  kind: ShaderKind;
};

type FakeProgram = {
  attachedShaders: FakeShader[];
  kind: ShaderKind;
  uniforms: Map<string, number | [number, number, number]>;
};

type FakeTexture = {
  width: number;
  height: number;
  data: Uint8Array;
};

type FakeFramebuffer = {
  attachment: FakeTexture | null;
};

function createEmptyTexture(width: number, height: number): FakeTexture {
  return {
    width,
    height,
    data: new Uint8Array(width * height * 4),
  };
}

function inferShaderKind(source: string): ShaderKind {
  if (source.includes("uGamma")) {
    return "curves";
  }
  if (source.includes("uColorShift")) {
    return "color-adjust";
  }
  if (source.includes("aPosition")) {
    return "vertex";
  }
  return "unknown";
}

function toNormalized(value: number): number {
  return Math.max(0, Math.min(1, value / 255));
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function runCurvesShader(input: Uint8Array, gamma: number): Uint8Array {
  const output = new Uint8Array(input.length);

  for (let index = 0; index < input.length; index += 4) {
    const red = Math.pow(Math.max(toNormalized(input[index]), 0), Math.max(gamma, 0.001));
    const green = Math.pow(Math.max(toNormalized(input[index + 1]), 0), Math.max(gamma, 0.001));
    const blue = Math.pow(Math.max(toNormalized(input[index + 2]), 0), Math.max(gamma, 0.001));

    output[index] = toByte(red);
    output[index + 1] = toByte(green);
    output[index + 2] = toByte(blue);
    output[index + 3] = input[index + 3] ?? 255;
  }

  return output;
}

function runColorAdjustShader(input: Uint8Array, shift: [number, number, number]): Uint8Array {
  const output = new Uint8Array(input.length);

  for (let index = 0; index < input.length; index += 4) {
    const red = Math.max(0, Math.min(1, toNormalized(input[index]) + shift[0]));
    const green = Math.max(0, Math.min(1, toNormalized(input[index + 1]) + shift[1]));
    const blue = Math.max(0, Math.min(1, toNormalized(input[index + 2]) + shift[2]));

    output[index] = toByte(red);
    output[index + 1] = toByte(green);
    output[index + 2] = toByte(blue);
    output[index + 3] = input[index + 3] ?? 255;
  }

  return output;
}

function createParityWebglContext(): WebGLRenderingContext {
  const glConstants = {
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
  } as const;

  let currentProgram: FakeProgram | null = null;
  let currentTexture: FakeTexture | null = null;
  let currentFramebuffer: FakeFramebuffer | null = null;

  const gl = {
    ...glConstants,
    createShader(shaderType: number): FakeShader {
      return {
        type: shaderType,
        source: "",
        kind: "unknown",
      };
    },
    shaderSource(shader: FakeShader, source: string) {
      shader.source = source;
      shader.kind = inferShaderKind(source);
    },
    compileShader() {},
    getShaderParameter() {
      return true;
    },
    getShaderInfoLog() {
      return null;
    },
    deleteShader() {},
    createProgram(): FakeProgram {
      return {
        attachedShaders: [],
        kind: "unknown",
        uniforms: new Map(),
      };
    },
    attachShader(program: FakeProgram, shader: FakeShader) {
      program.attachedShaders.push(shader);
    },
    linkProgram(program: FakeProgram) {
      const fragmentShader = program.attachedShaders.find((shader) => shader.type === glConstants.FRAGMENT_SHADER);
      program.kind = fragmentShader?.kind ?? "unknown";
    },
    getProgramParameter() {
      return true;
    },
    getProgramInfoLog() {
      return null;
    },
    deleteProgram() {},
    useProgram(program: FakeProgram) {
      currentProgram = program;
    },
    createBuffer() {
      return {};
    },
    bindBuffer() {},
    bufferData() {},
    getAttribLocation() {
      return 0;
    },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    createTexture(): FakeTexture {
      return createEmptyTexture(1, 1);
    },
    bindTexture(_target: number, texture: FakeTexture | null) {
      currentTexture = texture;
    },
    texParameteri() {},
    texImage2D(
      _target: number,
      _level: number,
      _internalformat: number,
      width: number,
      height: number,
      _border: number,
      _format: number,
      _type: number,
      pixels: ArrayBufferView | null,
    ) {
      if (!currentTexture) {
        return;
      }

      if (pixels) {
        currentTexture.width = width;
        currentTexture.height = height;
        currentTexture.data = new Uint8Array(pixels.buffer.slice(0));
        return;
      }

      currentTexture.width = width;
      currentTexture.height = height;
      currentTexture.data = new Uint8Array(width * height * 4);
    },
    activeTexture() {},
    getUniformLocation(program: FakeProgram, name: string) {
      return {
        program,
        name,
      };
    },
    uniform1i(location: { program: FakeProgram; name: string }, value: number) {
      location.program.uniforms.set(location.name, value);
    },
    uniform1f(location: { program: FakeProgram; name: string }, value: number) {
      location.program.uniforms.set(location.name, value);
    },
    uniform3f(location: { program: FakeProgram; name: string }, x: number, y: number, z: number) {
      location.program.uniforms.set(location.name, [x, y, z]);
    },
    createFramebuffer(): FakeFramebuffer {
      return {
        attachment: null,
      };
    },
    bindFramebuffer(_target: number, framebuffer: FakeFramebuffer | null) {
      currentFramebuffer = framebuffer;
    },
    framebufferTexture2D(
      _target: number,
      _attachment: number,
      _textarget: number,
      texture: FakeTexture | null,
    ) {
      if (!currentFramebuffer) {
        return;
      }
      currentFramebuffer.attachment = texture;
    },
    checkFramebufferStatus() {
      return glConstants.FRAMEBUFFER_COMPLETE;
    },
    deleteFramebuffer() {},
    viewport() {},
    drawArrays() {
      if (!currentProgram || !currentTexture || !currentFramebuffer?.attachment) {
        throw new Error("Parity WebGL mock is missing required render state.");
      }

      if (currentProgram.kind === "curves") {
        const gamma = Number(currentProgram.uniforms.get("uGamma") ?? 1);
        currentFramebuffer.attachment.data = runCurvesShader(currentTexture.data, gamma);
        return;
      }

      if (currentProgram.kind === "color-adjust") {
        const colorShift = currentProgram.uniforms.get("uColorShift");
        const shift: [number, number, number] = Array.isArray(colorShift)
          ? [colorShift[0] ?? 0, colorShift[1] ?? 0, colorShift[2] ?? 0]
          : [0, 0, 0];
        currentFramebuffer.attachment.data = runColorAdjustShader(currentTexture.data, shift);
        return;
      }

      throw new Error(`Unsupported parity shader kind '${currentProgram.kind}'.`);
    },
    deleteTexture() {},
    readPixels(
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      _format: number,
      _type: number,
      output: Uint8Array,
    ) {
      if (!currentFramebuffer?.attachment) {
        throw new Error("Parity WebGL mock has no framebuffer attachment to read from.");
      }

      output.set(currentFramebuffer.attachment.data);
    },
  };

  return gl as unknown as WebGLRenderingContext;
}

export function installParityWebglContextMock(): void {
  if (contextSpy) {
    return;
  }

  contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((contextId) => {
    if (contextId === "webgl" || contextId === "webgl2") {
      return createParityWebglContext();
    }
    return null;
  });
}

export function restoreParityWebglContextMock(): void {
  if (!contextSpy) {
    return;
  }

  contextSpy.mockRestore();
  contextSpy = null;
}

function buildHistogram(pixels: Uint8ClampedArray): HistogramBundle {
  const histogram: HistogramBundle = {
    red: Array.from({ length: 256 }, () => 0),
    green: Array.from({ length: 256 }, () => 0),
    blue: Array.from({ length: 256 }, () => 0),
    rgb: Array.from({ length: 256 }, () => 0),
  };

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luma = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);

    histogram.red[red] += 1;
    histogram.green[green] += 1;
    histogram.blue[blue] += 1;
    histogram.rgb[Math.max(0, Math.min(255, luma))] += 1;
  }

  return histogram;
}

function channelIntersectionSimilarity(lhs: number[], rhs: number[], denominator: number): number {
  let overlap = 0;
  for (let index = 0; index < lhs.length; index += 1) {
    overlap += Math.min(lhs[index] ?? 0, rhs[index] ?? 0);
  }
  return overlap / Math.max(1, denominator);
}

function calculateHistogramSimilarity(lhs: Uint8ClampedArray, rhs: Uint8ClampedArray): number {
  const lhsHistogram = buildHistogram(lhs);
  const rhsHistogram = buildHistogram(rhs);
  const totalPixels = lhs.length / 4;

  const channels = [
    channelIntersectionSimilarity(lhsHistogram.red, rhsHistogram.red, totalPixels),
    channelIntersectionSimilarity(lhsHistogram.green, rhsHistogram.green, totalPixels),
    channelIntersectionSimilarity(lhsHistogram.blue, rhsHistogram.blue, totalPixels),
    channelIntersectionSimilarity(lhsHistogram.rgb, rhsHistogram.rgb, totalPixels),
  ];

  const sum = channels.reduce((acc, value) => acc + value, 0);
  return sum / channels.length;
}

function calculateMaxChannelDelta(lhs: Uint8ClampedArray, rhs: Uint8ClampedArray): number {
  let maxDelta = 0;

  for (let index = 0; index < lhs.length; index += 4) {
    const redDelta = Math.abs((lhs[index] ?? 0) - (rhs[index] ?? 0));
    const greenDelta = Math.abs((lhs[index + 1] ?? 0) - (rhs[index + 1] ?? 0));
    const blueDelta = Math.abs((lhs[index + 2] ?? 0) - (rhs[index + 2] ?? 0));
    maxDelta = Math.max(maxDelta, redDelta, greenDelta, blueDelta);
  }

  return maxDelta;
}

function calculateSpatialRmse(lhs: Uint8ClampedArray, rhs: Uint8ClampedArray): number {
  let squaredErrorSum = 0;
  let sampleCount = 0;

  for (let index = 0; index < lhs.length; index += 4) {
    const redDelta = (lhs[index] ?? 0) - (rhs[index] ?? 0);
    const greenDelta = (lhs[index + 1] ?? 0) - (rhs[index + 1] ?? 0);
    const blueDelta = (lhs[index + 2] ?? 0) - (rhs[index + 2] ?? 0);

    squaredErrorSum += redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
    sampleCount += 3;
  }

  return Math.sqrt(squaredErrorSum / Math.max(1, sampleCount));
}

export function evaluateCpuWebglParity(pipeline: ParityPipeline): ParityMetrics {
  const source = createFixturePixels();
  const cpuPixels = clonePixels(source);
  const webglPixels = clonePixels(source);

  for (const step of pipeline.steps) {
    applyPipelineStep(cpuPixels, step, FIXTURE_WIDTH, FIXTURE_HEIGHT);
  }

  const webglBackend = createWebglPreviewBackend();
  for (const step of pipeline.steps) {
    webglBackend.runPreviewStep({
      pixels: webglPixels,
      step,
      width: FIXTURE_WIDTH,
      height: FIXTURE_HEIGHT,
    });
  }

  return {
    maxChannelDelta: calculateMaxChannelDelta(cpuPixels, webglPixels),
    histogramSimilarity: calculateHistogramSimilarity(cpuPixels, webglPixels),
    spatialRmse: calculateSpatialRmse(cpuPixels, webglPixels),
  };
}

export function enforceCpuWebglParityGates(): Record<ParityPipelineKey, ParityMetrics> {
  const pipelines = createParityPipelines();
  const metricsByPipeline = {} as Record<ParityPipelineKey, ParityMetrics>;

  installParityWebglContextMock();
  try {
    for (const pipeline of Object.values(pipelines)) {
      const metrics = evaluateCpuWebglParity(pipeline);
      const tolerance = parityTolerances[pipeline.key];
      metricsByPipeline[pipeline.key] = metrics;

      if (metrics.maxChannelDelta > tolerance.maxChannelDelta) {
        throw new Error(
          `${pipeline.key} parity max delta ${metrics.maxChannelDelta} exceeded tolerance ${tolerance.maxChannelDelta}`,
        );
      }

      if (metrics.histogramSimilarity < tolerance.histogramSimilarity) {
        throw new Error(
          `${pipeline.key} histogram similarity ${metrics.histogramSimilarity.toFixed(4)} below tolerance ${tolerance.histogramSimilarity.toFixed(4)}`,
        );
      }

      if (metrics.spatialRmse > tolerance.spatialRmse) {
        throw new Error(
          `${pipeline.key} spatial RMSE ${metrics.spatialRmse.toFixed(4)} exceeded tolerance ${tolerance.spatialRmse.toFixed(4)}`,
        );
      }
    }
  } finally {
    restoreParityWebglContextMock();
  }

  return metricsByPipeline;
}
