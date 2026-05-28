import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLOR_ADJUST_DATA,
  DEFAULT_CURVES_DATA,
  DEFAULT_DETAIL_ADJUST_DATA,
  DEFAULT_LIGHT_ADJUST_DATA,
} from "@/lib/image-pipeline/adjustment-types";
import { applyPipelineStep, applyPipelineSteps } from "@/lib/image-pipeline/render-core";
import type { PipelineStep } from "@/lib/image-pipeline/contracts";

const SOURCE_ALPHA = [0, 64, 128, 255];

function createAlphaFixture(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    10, 20, 30, SOURCE_ALPHA[0]!,
    90, 120, 150, SOURCE_ALPHA[1]!,
    180, 90, 40, SOURCE_ALPHA[2]!,
    250, 230, 190, SOURCE_ALPHA[3]!,
  ]);
}

function readAlpha(pixels: Uint8ClampedArray): number[] {
  return [pixels[3]!, pixels[7]!, pixels[11]!, pixels[15]!];
}

describe("image pipeline alpha preservation", () => {
  it.each<PipelineStep>([
    {
      nodeId: "curves-1",
      type: "curves",
      params: {
        ...DEFAULT_CURVES_DATA,
        levels: { blackPoint: 32, whitePoint: 230, gamma: 0.72 },
      },
    },
    {
      nodeId: "color-1",
      type: "color-adjust",
      params: {
        ...DEFAULT_COLOR_ADJUST_DATA,
        hsl: { hue: 36, saturation: 24, luminance: -8 },
        temperature: 18,
        tint: -12,
        vibrance: 22,
      },
    },
    {
      nodeId: "light-1",
      type: "light-adjust",
      params: {
        ...DEFAULT_LIGHT_ADJUST_DATA,
        brightness: 18,
        contrast: 22,
        exposure: 0.35,
        highlights: -16,
        shadows: 24,
      },
    },
    {
      nodeId: "detail-1",
      type: "detail-adjust",
      params: {
        ...DEFAULT_DETAIL_ADJUST_DATA,
        clarity: 28,
        grain: { amount: 20, size: 1.4 },
      },
    },
  ])("keeps alpha unchanged for $type", (step) => {
    const pixels = createAlphaFixture();

    applyPipelineStep(pixels, step, 2, 2);

    expect(readAlpha(pixels)).toEqual(SOURCE_ALPHA);
  });

  it("keeps alpha unchanged through chained adjustments", () => {
    const pixels = createAlphaFixture();

    applyPipelineSteps(
      pixels,
      [
        {
          nodeId: "curves-1",
          type: "curves",
          params: {
            ...DEFAULT_CURVES_DATA,
            levels: { blackPoint: 18, whitePoint: 242, gamma: 1.24 },
          },
        },
        {
          nodeId: "color-1",
          type: "color-adjust",
          params: {
            ...DEFAULT_COLOR_ADJUST_DATA,
            hsl: { hue: -120, saturation: 18, luminance: 8 },
          },
        },
        {
          nodeId: "light-1",
          type: "light-adjust",
          params: {
            ...DEFAULT_LIGHT_ADJUST_DATA,
            brightness: -12,
            contrast: 34,
            shadows: 18,
            whites: 12,
          },
        },
        {
          nodeId: "detail-1",
          type: "detail-adjust",
          params: {
            ...DEFAULT_DETAIL_ADJUST_DATA,
            sharpen: { amount: 42, radius: 1, threshold: 0 },
            denoise: { luminance: 12, color: 8 },
          },
        },
      ],
      2,
      2,
    );

    expect(readAlpha(pixels)).toEqual(SOURCE_ALPHA);
  });
});
