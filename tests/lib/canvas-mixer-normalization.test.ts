import { describe, expect, it } from "vitest";

import {
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerCompositionData,
} from "@/lib/canvas-mixer-normalization";

describe("canvas mixer normalization", () => {
  it("normalizes mixer composition values from one shared helper", () => {
    expect(
      normalizeMixerCompositionData({
        blendMode: "unknown",
        opacity: 180,
        overlayX: -3,
        overlayY: "1.4",
        overlayWidth: 2,
        overlayHeight: 0,
        cropLeft: "0.95",
        cropTop: -2,
        cropRight: "4",
        cropBottom: "0",
      }),
    ).toEqual({
      blendMode: "normal",
      opacity: 100,
      overlayX: 0,
      overlayY: 0.9,
      overlayWidth: 1,
      overlayHeight: 0.1,
      cropLeft: 0.9,
      cropTop: 0,
      cropRight: 0,
      cropBottom: 0,
    });
  });

  it("keeps mixer layer source eligibility centralized", () => {
    expect(MIXER_SOURCE_NODE_TYPES.has("text")).toBe(true);
    expect(MIXER_SOURCE_NODE_TYPES.has("video")).toBe(false);
  });
});
