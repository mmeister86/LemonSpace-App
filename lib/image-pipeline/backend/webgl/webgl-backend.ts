/**
 * Onboarding note:
 * Image pipeline utility for webgl backend. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

import type {
  BackendPipelineRequest,
  BackendStepRequest,
  ImagePipelineBackend,
} from "@/lib/image-pipeline/backend/backend-types";
import {
  normalizeColorAdjustData,
  normalizeCurvesData,
  normalizeDetailAdjustData,
  normalizeLightAdjustData,
  type CurvePoint,
} from "@/lib/image-pipeline/adjustment-types";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const CURVES_FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uRgbLut;
uniform sampler2D uRedLut;
uniform sampler2D uGreenLut;
uniform sampler2D uBlueLut;
uniform float uBlackPoint;
uniform float uWhitePoint;
uniform float uInvGamma;
uniform float uChannelMode;

float sampleLut(sampler2D lut, float value) {
  return texture2D(lut, vec2(clamp(value, 0.0, 1.0), 0.5)).r;
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  float levelRange = max(uWhitePoint - uBlackPoint, 1.0);
  vec3 leveled = clamp((color.rgb * 255.0 - vec3(uBlackPoint)) / levelRange, 0.0, 1.0);
  vec3 mapped = pow(max(leveled, vec3(0.0)), vec3(max(uInvGamma, 0.001)));

  vec3 rgbCurve = vec3(
    sampleLut(uRgbLut, mapped.r),
    sampleLut(uRgbLut, mapped.g),
    sampleLut(uRgbLut, mapped.b)
  );

  vec3 result = rgbCurve;
  if (uChannelMode < 0.5) {
    result = vec3(
      sampleLut(uRedLut, rgbCurve.r),
      sampleLut(uGreenLut, rgbCurve.g),
      sampleLut(uBlueLut, rgbCurve.b)
    );
  } else if (uChannelMode < 1.5) {
    result.r = sampleLut(uRedLut, rgbCurve.r);
  } else if (uChannelMode < 2.5) {
    result.g = sampleLut(uGreenLut, rgbCurve.g);
  } else {
    result.b = sampleLut(uBlueLut, rgbCurve.b);
  }

  gl_FragColor = vec4(result, color.a);
}
`;

const COLOR_ADJUST_FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uHueShift;
uniform float uSaturationFactor;
uniform float uLuminanceShift;
uniform float uTemperatureShift;
uniform float uTintShift;
uniform float uVibranceBoost;

vec3 rgbToHsl(vec3 color) {
  float maxChannel = max(max(color.r, color.g), color.b);
  float minChannel = min(min(color.r, color.g), color.b);
  float delta = maxChannel - minChannel;
  float lightness = (maxChannel + minChannel) * 0.5;

  if (delta == 0.0) {
    return vec3(0.0, 0.0, lightness);
  }

  float saturation = delta / (1.0 - abs(2.0 * lightness - 1.0));
  float hue;

  if (maxChannel == color.r) {
    hue = mod((color.g - color.b) / delta, 6.0);
  } else if (maxChannel == color.g) {
    hue = (color.b - color.r) / delta + 2.0;
  } else {
    hue = (color.r - color.g) / delta + 4.0;
  }

  hue *= 60.0;
  if (hue < 0.0) {
    hue += 360.0;
  }

  return vec3(hue, saturation, lightness);
}

vec3 hslToRgb(float hue, float saturation, float lightness) {
  float chroma = (1.0 - abs(2.0 * lightness - 1.0)) * saturation;
  float x = chroma * (1.0 - abs(mod(hue / 60.0, 2.0) - 1.0));
  float m = lightness - chroma * 0.5;
  vec3 rgbPrime;

  if (hue < 60.0) {
    rgbPrime = vec3(chroma, x, 0.0);
  } else if (hue < 120.0) {
    rgbPrime = vec3(x, chroma, 0.0);
  } else if (hue < 180.0) {
    rgbPrime = vec3(0.0, chroma, x);
  } else if (hue < 240.0) {
    rgbPrime = vec3(0.0, x, chroma);
  } else if (hue < 300.0) {
    rgbPrime = vec3(x, 0.0, chroma);
  } else {
    rgbPrime = vec3(chroma, 0.0, x);
  }

  return clamp(rgbPrime + vec3(m), 0.0, 1.0);
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  vec3 hsl = rgbToHsl(color.rgb);
  float shiftedHue = mod(hsl.x + uHueShift + 360.0, 360.0);
  float shiftedSaturation = clamp(hsl.y * uSaturationFactor, 0.0, 1.0);
  float shiftedLuminance = clamp(hsl.z + uLuminanceShift, 0.0, 1.0);
  float saturationDelta = (1.0 - hsl.y) * uVibranceBoost;
  vec3 vivid = hslToRgb(
    shiftedHue,
    clamp(shiftedSaturation + saturationDelta, 0.0, 1.0),
    shiftedLuminance
  );

  vec3 shiftedBytes = vivid * 255.0;
  shiftedBytes.r += uTemperatureShift;
  shiftedBytes.g += uTintShift;
  shiftedBytes.b -= uTemperatureShift + uTintShift * 0.3;

  gl_FragColor = vec4(clamp(shiftedBytes / 255.0, 0.0, 1.0), color.a);
}
`;

const LIGHT_ADJUST_FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uExposureFactor;
uniform float uContrastFactor;
uniform float uBrightnessShift;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uVignetteAmount;
uniform float uVignetteSize;
uniform float uVignetteRoundness;

float toByte(float value) {
  return clamp(floor(value + 0.5), 0.0, 255.0);
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  vec3 rgb = color.rgb * 255.0;

  rgb *= uExposureFactor;
  rgb = (rgb - 128.0) * uContrastFactor + 128.0 + uBrightnessShift;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float highlightsBoost = (luma / 255.0) * uHighlights * 40.0;
  float shadowsBoost = ((255.0 - luma) / 255.0) * uShadows * 40.0;
  float whitesBoost = (luma / 255.0) * uWhites * 35.0;
  float blacksBoost = ((255.0 - luma) / 255.0) * uBlacks * 35.0;
  float totalBoost = highlightsBoost + shadowsBoost + whitesBoost + blacksBoost;
  rgb = vec3(
    toByte(rgb.r + totalBoost),
    toByte(rgb.g + totalBoost),
    toByte(rgb.b + totalBoost)
  );

  if (uVignetteAmount > 0.0) {
    vec2 centeredUv = (vUv - vec2(0.5)) / vec2(0.5);
    float radialDistance = length(centeredUv);
    float softEdge = pow(1.0 - clamp(radialDistance, 0.0, 1.0), 1.0 + uVignetteRoundness);
    float strength = 1.0 - uVignetteAmount * (1.0 - softEdge) * (1.5 - uVignetteSize);
    rgb = vec3(
      toByte(rgb.r * strength),
      toByte(rgb.g * strength),
      toByte(rgb.b * strength)
    );
  }

  gl_FragColor = vec4(clamp(rgb / 255.0, 0.0, 1.0), color.a);
}
`;

const DETAIL_ADJUST_FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 vUv;
uniform sampler2D uSource;
uniform float uSharpenBoost;
uniform float uClarityBoost;
uniform float uDenoiseLuma;
uniform float uDenoiseColor;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uImageWidth;

float pseudoNoise(float seed) {
  float x = sin(seed * 12.9898) * 43758.5453;
  return fract(x);
}

void main() {
  vec4 color = texture2D(uSource, vUv);
  vec3 rgb = color.rgb * 255.0;

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));

  rgb.r = rgb.r + (rgb.r - luma) * uSharpenBoost * 0.6;
  rgb.g = rgb.g + (rgb.g - luma) * uSharpenBoost * 0.6;
  rgb.b = rgb.b + (rgb.b - luma) * uSharpenBoost * 0.6;

  float midtoneFactor = 1.0 - abs(luma / 255.0 - 0.5) * 2.0;
  float clarityScale = 1.0 + uClarityBoost * midtoneFactor * 0.7;
  rgb = (rgb - 128.0) * clarityScale + 128.0;

  if (uDenoiseLuma > 0.0 || uDenoiseColor > 0.0) {
    rgb = rgb * (1.0 - uDenoiseLuma * 0.2) + vec3(luma) * uDenoiseLuma * 0.2;

    float average = (rgb.r + rgb.g + rgb.b) / 3.0;
    rgb = rgb * (1.0 - uDenoiseColor * 0.2) + vec3(average) * uDenoiseColor * 0.2;
  }

  if (uGrainAmount > 0.0) {
    float pixelX = floor(gl_FragCoord.x);
    float pixelY = floor(gl_FragCoord.y);
    float pixelIndex = ((pixelY * max(1.0, uImageWidth)) + pixelX) * 4.0;
    float grainSeed = (pixelIndex + 1.0) / max(0.5, uGrainScale);
    float grain = (pseudoNoise(grainSeed) - 0.5) * uGrainAmount * 40.0;
    rgb += vec3(grain);
  }

  gl_FragColor = vec4(clamp(rgb / 255.0, 0.0, 1.0), color.a);
}
`;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const normalized = [...points].sort((left, right) => left.x - right.x);

  for (let input = 0; input < 256; input += 1) {
    const first = normalized[0] ?? { x: 0, y: 0 };
    const last = normalized[normalized.length - 1] ?? { x: 255, y: 255 };
    if (input <= first.x) {
      lut[input] = toByte(first.y);
      continue;
    }

    if (input >= last.x) {
      lut[input] = toByte(last.y);
      continue;
    }

    for (let index = 1; index < normalized.length; index += 1) {
      const left = normalized[index - 1]!;
      const right = normalized[index]!;
      if (input < left.x || input > right.x) {
        continue;
      }

      const span = Math.max(1, right.x - left.x);
      const progress = (input - left.x) / span;
      lut[input] = toByte(left.y + (right.y - left.y) * progress);
      break;
    }
  }

  return lut;
}

function createLutTexture(
  gl: WebGLRenderingContext,
  lut: Uint8Array,
  textureUnit: number,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("WebGL LUT texture allocation failed.");
  }

  const rgba = new Uint8Array(256 * 4);
  for (let index = 0; index < 256; index += 1) {
    const value = lut[index] ?? 0;
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }

  gl.activeTexture(gl.TEXTURE0 + textureUnit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

  return texture;
}

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

function applyStepUniforms(
  gl: WebGLRenderingContext,
  shaderProgram: WebGLProgram,
  request: BackendStepRequest,
): WebGLTexture[] {
  const disposableTextures: WebGLTexture[] = [];

  if (request.step.type === "curves") {
    const curves = normalizeCurvesData(request.step.params);

    const blackPointLocation = gl.getUniformLocation(shaderProgram, "uBlackPoint");
    if (blackPointLocation) {
      gl.uniform1f(blackPointLocation, curves.levels.blackPoint);
    }

    const whitePointLocation = gl.getUniformLocation(shaderProgram, "uWhitePoint");
    if (whitePointLocation) {
      gl.uniform1f(whitePointLocation, curves.levels.whitePoint);
    }

    const invGammaLocation = gl.getUniformLocation(shaderProgram, "uInvGamma");
    if (invGammaLocation) {
      gl.uniform1f(invGammaLocation, 1 / Math.max(curves.levels.gamma, 0.001));
    }

    const channelModeLocation = gl.getUniformLocation(shaderProgram, "uChannelMode");
    if (channelModeLocation) {
      const channelMode =
        curves.channelMode === "red"
          ? 1
          : curves.channelMode === "green"
            ? 2
            : curves.channelMode === "blue"
              ? 3
              : 0;
      gl.uniform1f(channelModeLocation, channelMode);
    }

    const lutBindings = [
      { uniform: "uRgbLut", unit: 1, lut: buildCurveLut(curves.points.rgb) },
      { uniform: "uRedLut", unit: 2, lut: buildCurveLut(curves.points.red) },
      { uniform: "uGreenLut", unit: 3, lut: buildCurveLut(curves.points.green) },
      { uniform: "uBlueLut", unit: 4, lut: buildCurveLut(curves.points.blue) },
    ] as const;

    for (const binding of lutBindings) {
      const texture = createLutTexture(gl, binding.lut, binding.unit);
      disposableTextures.push(texture);
      const location = gl.getUniformLocation(shaderProgram, binding.uniform);
      if (location) {
        gl.uniform1i(location, binding.unit);
      }
    }

    gl.activeTexture(gl.TEXTURE0);
    return disposableTextures;
  }

  if (request.step.type === "color-adjust") {
    const color = normalizeColorAdjustData(request.step.params);

    const hueShiftLocation = gl.getUniformLocation(shaderProgram, "uHueShift");
    if (hueShiftLocation) {
      gl.uniform1f(hueShiftLocation, color.hsl.hue);
    }

    const saturationFactorLocation = gl.getUniformLocation(shaderProgram, "uSaturationFactor");
    if (saturationFactorLocation) {
      gl.uniform1f(saturationFactorLocation, 1 + color.hsl.saturation / 100);
    }

    const luminanceShiftLocation = gl.getUniformLocation(shaderProgram, "uLuminanceShift");
    if (luminanceShiftLocation) {
      gl.uniform1f(luminanceShiftLocation, color.hsl.luminance / 100);
    }

    const temperatureShiftLocation = gl.getUniformLocation(shaderProgram, "uTemperatureShift");
    if (temperatureShiftLocation) {
      gl.uniform1f(temperatureShiftLocation, color.temperature * 0.6);
    }

    const tintShiftLocation = gl.getUniformLocation(shaderProgram, "uTintShift");
    if (tintShiftLocation) {
      gl.uniform1f(tintShiftLocation, color.tint * 0.4);
    }

    const vibranceBoostLocation = gl.getUniformLocation(shaderProgram, "uVibranceBoost");
    if (vibranceBoostLocation) {
      gl.uniform1f(vibranceBoostLocation, color.vibrance / 100);
    }

    return disposableTextures;
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
    return disposableTextures;
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

    const imageWidthLocation = gl.getUniformLocation(shaderProgram, "uImageWidth");
    if (imageWidthLocation) {
      gl.uniform1f(imageWidthLocation, request.width);
    }
  }

  return disposableTextures;
}

function runStepOnGpu(context: WebglBackendContext, request: BackendStepRequest): void {
  const { gl } = context;
  const startedAtMs = performance.now();
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

  const disposableTextures = applyStepUniforms(gl, shaderProgram, request);

  gl.viewport(0, 0, request.width, request.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const readback = new Uint8Array(request.pixels.length);
  const readbackStartedAtMs = performance.now();
  gl.readPixels(0, 0, request.width, request.height, gl.RGBA, gl.UNSIGNED_BYTE, readback);
  const readbackDurationMs = performance.now() - readbackStartedAtMs;
  request.pixels.set(readback);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(sourceTexture);
  gl.deleteTexture(outputTexture);
  for (const texture of disposableTextures) {
    gl.deleteTexture(texture);
  }
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
      curvesProgram: compileProgram(gl, CURVES_FRAGMENT_SHADER_SOURCE),
      colorAdjustProgram: compileProgram(gl, COLOR_ADJUST_FRAGMENT_SHADER_SOURCE),
      lightAdjustProgram: compileProgram(gl, LIGHT_ADJUST_FRAGMENT_SHADER_SOURCE),
      detailAdjustProgram: compileProgram(gl, DETAIL_ADJUST_FRAGMENT_SHADER_SOURCE),
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
