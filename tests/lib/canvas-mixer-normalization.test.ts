import { describe, expect, it } from "vitest";

import {
  MIXER_SOURCE_NODE_TYPES,
  normalizeMixerLayerCompositionData,
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

  it("normalizes v2 mixer layer data with transform, crop, opacity, and blend mode", () => {
    expect(
      normalizeMixerLayerCompositionData({
        mixerVersion: 2,
        stage: { width: "1920", height: 1080 },
        layers: [
          {
            id: "hero",
            handleId: "layer-in",
            x: -0.2,
            y: "0.25",
            width: 1.4,
            height: 0,
            rotation: "370",
            crop: { left: "0.2", top: -1, right: "0.95", bottom: 0.1 },
            opacity: -20,
            blendMode: "multiply",
            visible: false,
            locked: true,
          },
          {
            id: "",
            handleId: "layer-in-9",
            x: 0.1,
          },
        ],
      }),
    ).toEqual({
      mixerVersion: 2,
      stage: { width: 1920, height: 1080 },
      layers: [
        {
          id: "hero",
          handleId: "layer-in",
          x: -0.2,
          y: 0.25,
          width: 1.4,
          height: 0.01,
          rotation: 10,
          crop: { left: 0.2, top: 0, right: 0.7, bottom: 0.1 },
          opacity: 0,
          blendMode: "multiply",
          visible: false,
          locked: true,
        },
      ],
    });
  });

  it("preserves stage-relative v2 layer frames that extend outside the stage", () => {
    expect(
      normalizeMixerLayerCompositionData({
        mixerVersion: 2,
        layers: [
          {
            id: "oversized",
            handleId: "layer-in-2",
            x: 0.36,
            y: -0.2,
            width: 1.25,
            height: 1.1,
            rotation: 0,
          },
        ],
      }).layers[0],
    ).toMatchObject({
      id: "oversized",
      handleId: "layer-in-2",
      x: 0.36,
      y: -0.2,
      width: 1.25,
      height: 1.1,
    });
  });

  it("migrates legacy base and overlay mixer data into two v2 layers", () => {
    expect(
      normalizeMixerLayerCompositionData({
        blendMode: "screen",
        opacity: 64,
        overlayX: 0.12,
        overlayY: 0.2,
        overlayWidth: 0.6,
        overlayHeight: 0.5,
        cropLeft: 0.08,
        cropTop: 0.15,
        cropRight: 0.22,
        cropBottom: 0.1,
      }),
    ).toEqual({
      mixerVersion: 2,
      stage: null,
      layers: [
        {
          id: "legacy-base",
          handleId: "layer-in",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          crop: { left: 0, top: 0, right: 0, bottom: 0 },
          opacity: 100,
          blendMode: "normal",
          visible: true,
          locked: false,
        },
        {
          id: "legacy-overlay",
          handleId: "layer-in-2",
          x: 0.12,
          y: 0.2,
          width: 0.6,
          height: 0.5,
          rotation: 0,
          crop: { left: 0.08, top: 0.15, right: 0.22, bottom: 0.1 },
          opacity: 64,
          blendMode: "screen",
          visible: true,
          locked: false,
        },
      ],
    });
  });
});
