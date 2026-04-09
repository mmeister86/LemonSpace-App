import { describe, expect, it } from "vitest";

import {
  preserveNodeFavorite,
  readNodeFavorite,
  setNodeFavorite,
} from "@/lib/canvas-node-favorite";

describe("canvas node favorite helpers", () => {
  it("reads favorite from object data", () => {
    expect(readNodeFavorite({ isFavorite: true })).toBe(true);
  });

  it("returns false when favorite flag is missing", () => {
    expect(readNodeFavorite({})).toBe(false);
  });

  it("persists favorite when enabled", () => {
    expect(setNodeFavorite(true, { label: "Frame" })).toEqual({
      label: "Frame",
      isFavorite: true,
    });
  });

  it("removes favorite key when disabled", () => {
    expect(setNodeFavorite(false, { label: "Frame", isFavorite: true })).toEqual({
      label: "Frame",
    });
  });

  it("preserves favorite after strict normalization", () => {
    expect(
      preserveNodeFavorite(
        {
          crop: {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
          },
        },
        { isFavorite: true },
      ),
    ).toEqual({
      crop: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      isFavorite: true,
    });
  });
});
