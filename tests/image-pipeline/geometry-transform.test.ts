// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { normalizeCropResizeStepParams } from "@/lib/image-pipeline/adjustment-types";
import { applyGeometryStepsToSource } from "@/lib/image-pipeline/geometry-transform";

describe("crop/resize normalization", () => {
  it("falls back to default full-frame crop when params are invalid", () => {
    expect(normalizeCropResizeStepParams(null)).toEqual({
      cropRect: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
      resize: null,
    });
  });

  it("clamps normalized crop rect and rounds resize dimensions", () => {
    expect(
      normalizeCropResizeStepParams({
        cropRect: {
          x: -0.25,
          y: 0.2,
          width: 1.75,
          height: 0.5,
        },
        resize: {
          width: 99.7,
          height: 0,
        },
      }),
    ).toEqual({
      cropRect: {
        x: 0,
        y: 0.2,
        width: 1,
        height: 0.5,
      },
      resize: {
        width: 100,
        height: null,
      },
    });
  });
});

describe("geometry transform", () => {
  it("applies crop before tonal execution and updates output dimensions", () => {
    const contexts: Array<{ drawImage: ReturnType<typeof vi.fn> }> = [];
    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() !== "canvas") {
        return nativeCreateElement(tagName);
      }

      const context = {
        drawImage: vi.fn(),
      };
      contexts.push(context);

      return {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(context),
      } as unknown as HTMLCanvasElement;
    });

    const source = { width: 4, height: 2 } as CanvasImageSource;

    const result = applyGeometryStepsToSource({
      source,
      steps: [
        {
          nodeId: "crop-1",
          type: "crop",
          params: {
            cropRect: {
              x: 0.5,
              y: 0,
              width: 0.5,
              height: 1,
            },
          },
        },
      ],
    });

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(contexts).toHaveLength(2);
    expect(contexts[0]!.drawImage).toHaveBeenCalledWith(source, 0, 0, 4, 2);
    expect(contexts[1]!.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4, height: 2 }),
      2,
      0,
      2,
      2,
      0,
      0,
      2,
      2,
    );
  });

  it("applies resize dimensions from crop params", () => {
    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() !== "canvas") {
        return nativeCreateElement(tagName);
      }

      return {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      } as unknown as HTMLCanvasElement;
    });

    const source = { width: 4, height: 4 } as CanvasImageSource;

    const result = applyGeometryStepsToSource({
      source,
      steps: [
        {
          nodeId: "crop-1",
          type: "crop",
          params: {
            cropRect: {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
            resize: {
              width: 3,
              height: 2,
            },
          },
        },
      ],
    });

    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });
});
