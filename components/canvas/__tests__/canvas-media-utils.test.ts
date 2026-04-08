// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCompressedImagePreview } from "@/components/canvas/canvas-media-utils";

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;

  set src(_value: string) {
    queueMicrotask(() => {
      this.naturalWidth = 4000;
      this.naturalHeight = 2000;
      this.onload?.();
    });
  }
}

describe("createCompressedImagePreview", () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const drawImage = vi.fn();
  const toBlob = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("Image", MockImage);
    URL.createObjectURL = vi.fn(() => "blob:preview") as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        toBlob();
        callback(new Blob(["preview"], { type: "image/webp" }));
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    drawImage.mockReset();
    toBlob.mockReset();
    vi.stubGlobal("Image", originalImage);
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("clamps dimensions to the configured max edge", async () => {
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const preview = await createCompressedImagePreview(file);

    expect(preview.width).toBe(640);
    expect(preview.height).toBe(320);
    expect(preview.blob.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it("returns fallback mime type when encoder does not produce webp", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["preview"], { type: "image/png" }));
    });

    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const preview = await createCompressedImagePreview(file);

    expect(preview.blob.type).toBe("image/png");
  });
});
