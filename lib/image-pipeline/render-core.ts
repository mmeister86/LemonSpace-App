import type { PipelineStep } from "@/lib/image-pipeline/contracts";
import {
  normalizeColorAdjustData,
  normalizeCurvesData,
  normalizeDetailAdjustData,
  normalizeLightAdjustData,
  type CurvePoint,
} from "@/lib/image-pipeline/adjustment-types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

function buildLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const normalized = [...points].sort((a, b) => a.x - b.x);

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
      if (input < left.x || input > right.x) continue;
      const span = Math.max(1, right.x - left.x);
      const progress = (input - left.x) / span;
      lut[input] = toByte(left.y + (right.y - left.y) * progress);
      break;
    }
  }

  return lut;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
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
    r: toByte((rp + m) * 255),
    g: toByte((gp + m) * 255),
    b: toByte((bp + m) * 255),
  };
}

function applyCurves(pixels: Uint8ClampedArray, params: unknown): void {
  const curves = normalizeCurvesData(params);
  const rgbLut = buildLut(curves.points.rgb);
  const redLut = buildLut(curves.points.red);
  const greenLut = buildLut(curves.points.green);
  const blueLut = buildLut(curves.points.blue);

  const whitePoint = Math.max(curves.levels.whitePoint, curves.levels.blackPoint + 1);
  const levelRange = whitePoint - curves.levels.blackPoint;
  const invGamma = 1 / curves.levels.gamma;

  for (let index = 0; index < pixels.length; index += 4) {
    const applyLevels = (value: number) => {
      const normalized = clamp((value - curves.levels.blackPoint) / levelRange, 0, 1);
      return toByte(Math.pow(normalized, invGamma) * 255);
    };

    let red = applyLevels(pixels[index] ?? 0);
    let green = applyLevels(pixels[index + 1] ?? 0);
    let blue = applyLevels(pixels[index + 2] ?? 0);

    red = rgbLut[red];
    green = rgbLut[green];
    blue = rgbLut[blue];

    if (curves.channelMode === "red") {
      red = redLut[red];
    } else if (curves.channelMode === "green") {
      green = greenLut[green];
    } else if (curves.channelMode === "blue") {
      blue = blueLut[blue];
    } else {
      red = redLut[red];
      green = greenLut[green];
      blue = blueLut[blue];
    }

    pixels[index] = red;
    pixels[index + 1] = green;
    pixels[index + 2] = blue;
  }
}

function applyColorAdjust(pixels: Uint8ClampedArray, params: unknown): void {
  const color = normalizeColorAdjustData(params);
  const saturationFactor = 1 + color.hsl.saturation / 100;
  const luminanceShift = color.hsl.luminance / 100;
  const hueShift = color.hsl.hue;

  for (let index = 0; index < pixels.length; index += 4) {
    const currentRed = pixels[index] ?? 0;
    const currentGreen = pixels[index + 1] ?? 0;
    const currentBlue = pixels[index + 2] ?? 0;

    const hsl = rgbToHsl(currentRed, currentGreen, currentBlue);
    const shiftedHue = (hsl.h + hueShift + 360) % 360;
    const shiftedSaturation = clamp(hsl.s * saturationFactor, 0, 1);
    const shiftedLuminance = clamp(hsl.l + luminanceShift, 0, 1);
    const tempShift = color.temperature * 0.6;
    const tintShift = color.tint * 0.4;
    const vibranceBoost = color.vibrance / 100;
    const saturationDelta = (1 - hsl.s) * vibranceBoost;

    const vivid = hslToRgb(
      shiftedHue,
      clamp(shiftedSaturation + saturationDelta, 0, 1),
      shiftedLuminance,
    );

    pixels[index] = toByte(vivid.r + tempShift);
    pixels[index + 1] = toByte(vivid.g + tintShift);
    pixels[index + 2] = toByte(vivid.b - tempShift - tintShift * 0.3);
  }
}

function applyLightAdjust(
  pixels: Uint8ClampedArray,
  params: unknown,
  width: number,
  height: number,
): void {
  const light = normalizeLightAdjustData(params);
  const exposureFactor = Math.pow(2, light.exposure / 2);
  const contrastFactor = 1 + light.contrast / 100;
  const brightnessShift = light.brightness * 1.8;

  const centerX = width / 2;
  const centerY = height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let red = pixels[index] ?? 0;
      let green = pixels[index + 1] ?? 0;
      let blue = pixels[index + 2] ?? 0;

      red = red * exposureFactor;
      green = green * exposureFactor;
      blue = blue * exposureFactor;

      red = (red - 128) * contrastFactor + 128 + brightnessShift;
      green = (green - 128) * contrastFactor + 128 + brightnessShift;
      blue = (blue - 128) * contrastFactor + 128 + brightnessShift;

      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const highlightsBoost = (luma / 255) * (light.highlights / 100) * 40;
      const shadowsBoost = ((255 - luma) / 255) * (light.shadows / 100) * 40;
      const whitesBoost = (luma / 255) * (light.whites / 100) * 35;
      const blacksBoost = ((255 - luma) / 255) * (light.blacks / 100) * 35;

      const totalBoost = highlightsBoost + shadowsBoost + whitesBoost + blacksBoost;
      red = toByte(red + totalBoost);
      green = toByte(green + totalBoost);
      blue = toByte(blue + totalBoost);

      if (light.vignette.amount > 0) {
        const dx = (x - centerX) / Math.max(1, centerX);
        const dy = (y - centerY) / Math.max(1, centerY);
        const radialDistance = Math.sqrt(dx * dx + dy * dy);
        const softEdge = Math.pow(1 - clamp(radialDistance, 0, 1), 1 + light.vignette.roundness);
        const strength = 1 - light.vignette.amount * (1 - softEdge) * (1.5 - light.vignette.size);
        red = toByte(red * strength);
        green = toByte(green * strength);
        blue = toByte(blue * strength);
      }

      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
    }
  }
}

function pseudoNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function applyDetailAdjust(pixels: Uint8ClampedArray, params: unknown): void {
  const detail = normalizeDetailAdjustData(params);
  const sharpenBoost = detail.sharpen.amount / 500;
  const clarityBoost = detail.clarity / 100;
  const denoiseLuma = detail.denoise.luminance / 100;
  const denoiseColor = detail.denoise.color / 100;
  const grainAmount = detail.grain.amount / 100;
  const grainScale = Math.max(0.5, detail.grain.size);

  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index] ?? 0;
    let green = pixels[index + 1] ?? 0;
    let blue = pixels[index + 2] ?? 0;

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
      const grain = (pseudoNoise((index + 1) / grainScale) - 0.5) * grainAmount * 40;
      red += grain;
      green += grain;
      blue += grain;
    }

    pixels[index] = toByte(red);
    pixels[index + 1] = toByte(green);
    pixels[index + 2] = toByte(blue);
  }
}

export function applyPipelineStep(
  pixels: Uint8ClampedArray,
  step: PipelineStep<string, unknown>,
  width: number,
  height: number,
): void {
  if (step.type === "curves") {
    applyCurves(pixels, step.params);
    return;
  }
  if (step.type === "color-adjust") {
    applyColorAdjust(pixels, step.params);
    return;
  }
  if (step.type === "light-adjust") {
    applyLightAdjust(pixels, step.params, width, height);
    return;
  }
  if (step.type === "detail-adjust") {
    applyDetailAdjust(pixels, step.params);
  }
}

export function applyPipelineSteps(
  pixels: Uint8ClampedArray,
  steps: readonly PipelineStep[],
  width: number,
  height: number,
): void {
  for (let index = 0; index < steps.length; index += 1) {
    applyPipelineStep(pixels, steps[index]!, width, height);
  }
}
