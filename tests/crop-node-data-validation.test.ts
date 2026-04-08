import { describe, expect, it } from "vitest";

import {
  DEFAULT_CROP_NODE_DATA,
  normalizeCropNodeData,
} from "@/lib/image-pipeline/crop-node-data";

describe("crop node data validation", () => {
  it("normalizes and clamps crop rectangle data", () => {
    expect(
      normalizeCropNodeData({
        crop: {
          x: -0.2,
          y: 0.9,
          width: 0.8,
          height: 0.4,
        },
        resize: {
          mode: "custom",
          width: 2048,
          height: 1024,
          fit: "cover",
          keepAspect: false,
        },
      }),
    ).toEqual({
      crop: {
        x: 0,
        y: 0.6,
        width: 0.8,
        height: 0.4,
      },
      resize: {
        mode: "custom",
        width: 2048,
        height: 1024,
        fit: "cover",
        keepAspect: false,
      },
    });
  });

  it("falls back to defaults for invalid values", () => {
    expect(
      normalizeCropNodeData({
        crop: {
          x: Number.NaN,
          y: "foo",
          width: 2,
          height: -1,
        },
        resize: {
          mode: "invalid",
          width: 0,
          height: Number.NaN,
          fit: "invalid",
          keepAspect: "invalid",
        },
      }),
    ).toEqual(DEFAULT_CROP_NODE_DATA);
  });

  it("rejects destructive payload fields", () => {
    expect(() =>
      normalizeCropNodeData(
        {
          ...DEFAULT_CROP_NODE_DATA,
          storageId: "storage_123",
        },
        { rejectDisallowedPayloadFields: true },
      ),
    ).toThrow("Crop node accepts parameter data only. 'storageId' is not allowed in data.");

    expect(() =>
      normalizeCropNodeData(
        {
          ...DEFAULT_CROP_NODE_DATA,
          imageData: "...",
        },
        { rejectDisallowedPayloadFields: true },
      ),
    ).toThrow("Crop node accepts parameter data only. 'imageData' is not allowed in data.");
  });
});
