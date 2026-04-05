import { createWebglPreviewBackend } from "@/lib/image-pipeline/backend/webgl/webgl-backend";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import { applyPipelineStep } from "@/lib/image-pipeline/render-core";
import { vi } from "vitest";

type ParityPipelineKey =
  | "curvesOnly"
  | "colorAdjustOnly"
  | "curvesPlusColorAdjust"
  | "lightAdjustOnly"
  | "detailAdjustOnly"
  | "curvesColorLightDetailChain"
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
  lightAdjustOnly: {
    maxChannelDelta: 52,
    histogramSimilarity: 0.5,
    spatialRmse: 20.0,
  },
  detailAdjustOnly: {
    maxChannelDelta: 2,
    histogramSimilarity: 0.99,
    spatialRmse: 1.2,
  },
  curvesColorLightDetailChain: {
    maxChannelDelta: 130,
    histogramSimilarity: 0.17,
    spatialRmse: 57.5,
  },
  curvesChannelPressure: {
    maxChannelDelta: 99,
    histogramSimilarity: 0.08,
    spatialRmse: 52.5,
  },
  colorAdjustPressure: {
    maxChannelDelta: 64,
    histogramSimilarity: 0.5,
    spatialRmse: 24,
  },
  curvesColorPressureChain: {
    maxChannelDelta: 96,
    histogramSimilarity: 0.35,
    spatialRmse: 36,
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

function createLightAdjustStep(): PipelineStep {
  return {
    nodeId: "light-adjust-parity",
    type: "light-adjust",
    params: {
      brightness: 14,
      contrast: 22,
      exposure: 0.8,
      highlights: -16,
      shadows: 24,
      whites: 8,
      blacks: -10,
      vignette: {
        amount: 0.25,
        size: 0.72,
        roundness: 0.85,
      },
    },
  };
}

function createDetailAdjustStep(): PipelineStep {
  return {
    nodeId: "detail-adjust-parity",
    type: "detail-adjust",
    params: {
      sharpen: {
        amount: 210,
        radius: 1.4,
        threshold: 6,
      },
      clarity: 32,
      denoise: {
        luminance: 18,
        color: 14,
      },
      grain: {
        amount: 12,
        size: 1.3,
      },
    },
  };
}

function createCurvesColorLightDetailChainSteps(): PipelineStep[] {
  return [createCurvesStep(), createColorAdjustStep(), createLightAdjustStep(), createDetailAdjustStep()];
}

export function createParityPipelines(): Record<ParityPipelineKey, ParityPipeline> {
  const curvesStep = createCurvesStep();
  const colorAdjustStep = createColorAdjustStep();
  const lightAdjustStep = createLightAdjustStep();
  const detailAdjustStep = createDetailAdjustStep();
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
    lightAdjustOnly: {
      key: "lightAdjustOnly",
      steps: [lightAdjustStep],
    },
    detailAdjustOnly: {
      key: "detailAdjustOnly",
      steps: [detailAdjustStep],
    },
    curvesColorLightDetailChain: {
      key: "curvesColorLightDetailChain",
      steps: createCurvesColorLightDetailChainSteps(),
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

type ShaderKind =
  | "curves"
  | "color-adjust"
  | "light-adjust"
  | "detail-adjust"
  | "vertex"
  | "unknown";

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

type FakeTextureImageSource = {
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
  if (source.includes("uInvGamma") || source.includes("uRgbLut")) {
    return "curves";
  }
  if (source.includes("uHueShift") || source.includes("uVibranceBoost")) {
    return "color-adjust";
  }
  if (source.includes("uExposureFactor")) {
    return "light-adjust";
  }
  if (source.includes("uSharpenBoost")) {
    return "detail-adjust";
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

function sampleLutTexture(texture: FakeTexture | null, value: number): number {
  if (!texture) {
    return value;
  }

  const index = Math.max(0, Math.min(255, Math.round(value * 255)));
  return texture.data[index * 4] / 255;
}

function runCurvesShader(
  input: Uint8Array,
  uniforms: Map<string, number | [number, number, number]>,
  textures: {
    rgb: FakeTexture | null;
    red: FakeTexture | null;
    green: FakeTexture | null;
    blue: FakeTexture | null;
  },
): Uint8Array {
  const output = new Uint8Array(input.length);
  const blackPoint = Number(uniforms.get("uBlackPoint") ?? 0);
  const whitePoint = Number(uniforms.get("uWhitePoint") ?? 255);
  const invGamma = Number(uniforms.get("uInvGamma") ?? 1);
  const channelMode = Number(uniforms.get("uChannelMode") ?? 0);
  const levelRange = Math.max(1, whitePoint - blackPoint);

  for (let index = 0; index < input.length; index += 4) {
    const mappedRed = Math.pow(
      Math.max(Math.min(((input[index] - blackPoint) / levelRange), 1), 0),
      Math.max(invGamma, 0.001),
    );
    const mappedGreen = Math.pow(
      Math.max(Math.min(((input[index + 1] - blackPoint) / levelRange), 1), 0),
      Math.max(invGamma, 0.001),
    );
    const mappedBlue = Math.pow(
      Math.max(Math.min(((input[index + 2] - blackPoint) / levelRange), 1), 0),
      Math.max(invGamma, 0.001),
    );

    const rgbRed = sampleLutTexture(textures.rgb, mappedRed);
    const rgbGreen = sampleLutTexture(textures.rgb, mappedGreen);
    const rgbBlue = sampleLutTexture(textures.rgb, mappedBlue);

    let red = rgbRed;
    let green = rgbGreen;
    let blue = rgbBlue;

    if (channelMode < 0.5) {
      red = sampleLutTexture(textures.red, rgbRed);
      green = sampleLutTexture(textures.green, rgbGreen);
      blue = sampleLutTexture(textures.blue, rgbBlue);
    } else if (channelMode < 1.5) {
      red = sampleLutTexture(textures.red, rgbRed);
    } else if (channelMode < 2.5) {
      green = sampleLutTexture(textures.green, rgbGreen);
    } else {
      blue = sampleLutTexture(textures.blue, rgbBlue);
    }

    output[index] = toByte(red);
    output[index + 1] = toByte(green);
    output[index + 2] = toByte(blue);
    output[index + 3] = input[index + 3] ?? 255;
  }

  return output;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    h = (bn - rn) / delta + 2;
  } else {
    h = (rn - gn) / delta + 4;
  }

  h *= 60;
  if (h < 0) {
    h += 360;
  }

  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.max(0, Math.min(255, Math.round((rp + m) * 255))),
    g: Math.max(0, Math.min(255, Math.round((gp + m) * 255))),
    b: Math.max(0, Math.min(255, Math.round((bp + m) * 255))),
  };
}

function runColorAdjustShader(
  input: Uint8Array,
  uniforms: Map<string, number | [number, number, number]>,
): Uint8Array {
  const output = new Uint8Array(input.length);
  const hueShift = Number(uniforms.get("uHueShift") ?? 0);
  const saturationFactor = Number(uniforms.get("uSaturationFactor") ?? 1);
  const luminanceShift = Number(uniforms.get("uLuminanceShift") ?? 0);
  const temperatureShift = Number(uniforms.get("uTemperatureShift") ?? 0);
  const tintShift = Number(uniforms.get("uTintShift") ?? 0);
  const vibranceBoost = Number(uniforms.get("uVibranceBoost") ?? 0);

  for (let index = 0; index < input.length; index += 4) {
    const hsl = rgbToHsl(input[index] ?? 0, input[index + 1] ?? 0, input[index + 2] ?? 0);
    const shiftedHue = (hsl.h + hueShift + 360) % 360;
    const shiftedSaturation = Math.max(0, Math.min(1, hsl.s * saturationFactor));
    const shiftedLuminance = Math.max(0, Math.min(1, hsl.l + luminanceShift));
    const saturationDelta = (1 - hsl.s) * vibranceBoost;
    const vivid = hslToRgb(
      shiftedHue,
      Math.max(0, Math.min(1, shiftedSaturation + saturationDelta)),
      shiftedLuminance,
    );

    const red = Math.max(0, Math.min(1, (vivid.r + temperatureShift) / 255));
    const green = Math.max(0, Math.min(1, (vivid.g + tintShift) / 255));
    const blue = Math.max(0, Math.min(1, (vivid.b - temperatureShift - tintShift * 0.3) / 255));

    output[index] = toByte(red);
    output[index + 1] = toByte(green);
    output[index + 2] = toByte(blue);
    output[index + 3] = input[index + 3] ?? 255;
  }

  return output;
}

function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function runLightAdjustShader(
  input: Uint8Array,
  width: number,
  height: number,
  uniforms: Map<string, number | [number, number, number]>,
): Uint8Array {
  const output = new Uint8Array(input.length);
  const centerX = width / 2;
  const centerY = height / 2;

  const exposureFactor = Number(uniforms.get("uExposureFactor") ?? 1);
  const contrastFactor = Number(uniforms.get("uContrastFactor") ?? 1);
  const brightnessShift = Number(uniforms.get("uBrightnessShift") ?? 0);
  const highlights = Number(uniforms.get("uHighlights") ?? 0);
  const shadows = Number(uniforms.get("uShadows") ?? 0);
  const whites = Number(uniforms.get("uWhites") ?? 0);
  const blacks = Number(uniforms.get("uBlacks") ?? 0);
  const vignetteAmount = Number(uniforms.get("uVignetteAmount") ?? 0);
  const vignetteSize = Number(uniforms.get("uVignetteSize") ?? 0.5);
  const vignetteRoundness = Number(uniforms.get("uVignetteRoundness") ?? 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      let red = input[index] ?? 0;
      let green = input[index + 1] ?? 0;
      let blue = input[index + 2] ?? 0;

      red *= exposureFactor;
      green *= exposureFactor;
      blue *= exposureFactor;

      red = (red - 128) * contrastFactor + 128 + brightnessShift;
      green = (green - 128) * contrastFactor + 128 + brightnessShift;
      blue = (blue - 128) * contrastFactor + 128 + brightnessShift;

      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const highlightsBoost = (luma / 255) * highlights * 40;
      const shadowsBoost = ((255 - luma) / 255) * shadows * 40;
      const whitesBoost = (luma / 255) * whites * 35;
      const blacksBoost = ((255 - luma) / 255) * blacks * 35;
      const totalBoost = highlightsBoost + shadowsBoost + whitesBoost + blacksBoost;

      red += totalBoost;
      green += totalBoost;
      blue += totalBoost;

      if (vignetteAmount > 0) {
        const dx = (x - centerX) / Math.max(1, centerX);
        const dy = (y - centerY) / Math.max(1, centerY);
        const radialDistance = Math.sqrt(dx * dx + dy * dy);
        const softEdge = Math.pow(1 - Math.max(0, Math.min(1, radialDistance)), 1 + vignetteRoundness);
        const strength = 1 - vignetteAmount * (1 - softEdge) * (1.5 - vignetteSize);

        red *= strength;
        green *= strength;
        blue *= strength;
      }

      output[index] = toByte(red / 255);
      output[index + 1] = toByte(green / 255);
      output[index + 2] = toByte(blue / 255);
      output[index + 3] = input[index + 3] ?? 255;
    }
  }

  return output;
}

function runDetailAdjustShader(
  input: Uint8Array,
  width: number,
  uniforms: Map<string, number | [number, number, number]>,
): Uint8Array {
  const output = new Uint8Array(input.length);

  const sharpenBoost = Number(uniforms.get("uSharpenBoost") ?? 0);
  const clarityBoost = Number(uniforms.get("uClarityBoost") ?? 0);
  const denoiseLuma = Number(uniforms.get("uDenoiseLuma") ?? 0);
  const denoiseColor = Number(uniforms.get("uDenoiseColor") ?? 0);
  const grainAmount = Number(uniforms.get("uGrainAmount") ?? 0);
  const grainScale = Math.max(0.5, Number(uniforms.get("uGrainScale") ?? 1));
  const imageWidth = Math.max(1, Number(uniforms.get("uImageWidth") ?? width));

  for (let index = 0; index < input.length; index += 4) {
    let red = input[index] ?? 0;
    let green = input[index + 1] ?? 0;
    let blue = input[index + 2] ?? 0;

    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    red = red + (red - luma) * sharpenBoost * 0.6;
    green = green + (green - luma) * sharpenBoost * 0.6;
    blue = blue + (blue - luma) * sharpenBoost * 0.6;

    const midtoneFactor = 1 - Math.abs(luma / 255 - 0.5) * 2;
    const clarityScale = 1 + clarityBoost * midtoneFactor * 0.7;

    red = (red - 128) * clarityScale + 128;
    green = (green - 128) * clarityScale + 128;
    blue = (blue - 128) * clarityScale + 128;

    if (denoiseLuma > 0 || denoiseColor > 0) {
      red = red * (1 - denoiseLuma * 0.2) + luma * denoiseLuma * 0.2;
      green = green * (1 - denoiseLuma * 0.2) + luma * denoiseLuma * 0.2;
      blue = blue * (1 - denoiseLuma * 0.2) + luma * denoiseLuma * 0.2;

      const average = (red + green + blue) / 3;
      red = red * (1 - denoiseColor * 0.2) + average * denoiseColor * 0.2;
      green = green * (1 - denoiseColor * 0.2) + average * denoiseColor * 0.2;
      blue = blue * (1 - denoiseColor * 0.2) + average * denoiseColor * 0.2;
    }

    if (grainAmount > 0) {
      const pixel = index / 4;
      const x = pixel % imageWidth;
      const y = Math.floor(pixel / imageWidth);
      const pixelIndex = (y * imageWidth + x) * 4;
      const grain = (pseudoNoise((pixelIndex + 1) / grainScale) - 0.5) * grainAmount * 40;
      red += grain;
      green += grain;
      blue += grain;
    }

    output[index] = toByte(red / 255);
    output[index + 1] = toByte(green / 255);
    output[index + 2] = toByte(blue / 255);
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
  let activeTextureUnit = 0;
  const boundTextures = new Map<number, FakeTexture | null>();
  let drawWidth = 1;
  let drawHeight = 1;

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
      boundTextures.set(activeTextureUnit, texture);
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
      pixels: ArrayBufferView | FakeTextureImageSource | null,
    ) {
      if (!currentTexture) {
        return;
      }

      if (pixels) {
        currentTexture.width = width;
        currentTexture.height = height;
        if ("buffer" in pixels) {
          const byteOffset = pixels.byteOffset ?? 0;
          const byteLength = pixels.byteLength ?? pixels.buffer.byteLength;
          currentTexture.data = new Uint8Array(pixels.buffer.slice(byteOffset, byteOffset + byteLength));
        } else {
          currentTexture.data = new Uint8Array(pixels.data);
        }
        return;
      }

      currentTexture.width = width;
      currentTexture.height = height;
      currentTexture.data = new Uint8Array(width * height * 4);
    },
    activeTexture(textureUnit: number) {
      activeTextureUnit = textureUnit - glConstants.TEXTURE0;
    },
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
    viewport(_x: number, _y: number, width: number, height: number) {
      drawWidth = width;
      drawHeight = height;
    },
    drawArrays() {
      const sourceTexture = boundTextures.get(0) ?? null;
      if (!currentProgram || !sourceTexture || !currentFramebuffer?.attachment) {
        throw new Error("Parity WebGL mock is missing required render state.");
      }

      if (currentProgram.kind === "curves") {
        const rgbUnit = Number(currentProgram.uniforms.get("uRgbLut") ?? 1);
        const redUnit = Number(currentProgram.uniforms.get("uRedLut") ?? 2);
        const greenUnit = Number(currentProgram.uniforms.get("uGreenLut") ?? 3);
        const blueUnit = Number(currentProgram.uniforms.get("uBlueLut") ?? 4);
        currentFramebuffer.attachment.data = runCurvesShader(sourceTexture.data, currentProgram.uniforms, {
          rgb: boundTextures.get(rgbUnit) ?? null,
          red: boundTextures.get(redUnit) ?? null,
          green: boundTextures.get(greenUnit) ?? null,
          blue: boundTextures.get(blueUnit) ?? null,
        });
        return;
      }

      if (currentProgram.kind === "color-adjust") {
        currentFramebuffer.attachment.data = runColorAdjustShader(
          sourceTexture.data,
          currentProgram.uniforms,
        );
        return;
      }

      if (currentProgram.kind === "light-adjust") {
        currentFramebuffer.attachment.data = runLightAdjustShader(
          sourceTexture.data,
          drawWidth,
          drawHeight,
          currentProgram.uniforms,
        );
        return;
      }

      if (currentProgram.kind === "detail-adjust") {
        currentFramebuffer.attachment.data = runDetailAdjustShader(
          sourceTexture.data,
          drawWidth,
          currentProgram.uniforms,
        );
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

      output.set(currentFramebuffer.attachment.data.subarray(0, output.length));
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
