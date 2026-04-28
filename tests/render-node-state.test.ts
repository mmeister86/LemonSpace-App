import { describe, expect, it } from "vitest";

import { sanitizeRenderData } from "@/components/canvas/nodes/render-node-state";

describe("sanitizeRenderData", () => {
  it("preserves render and upload metadata while cleaning invalid options", () => {
    expect(
      sanitizeRenderData({
        outputResolution: "custom",
        customWidth: 1024.4,
        customHeight: 512.2,
        format: "jpeg",
        jpegQuality: 140,
        lastRenderedAt: 123,
        lastRenderedHash: "render-hash",
        lastRenderWidth: 2048.6,
        lastRenderHeight: 1024.1,
        lastRenderFormat: "webp",
        lastRenderMimeType: "image/webp",
        lastRenderSizeBytes: 1234.6,
        lastRenderQuality: null,
        lastRenderSourceWidth: 1000.4,
        lastRenderSourceHeight: 500.4,
        lastRenderWasSizeClamped: true,
        storageId: "storage-id",
        url: "https://cdn.example.com/render.webp",
        lastUploadedAt: 456,
        lastUploadedHash: "upload-hash",
        lastUploadStorageId: "upload-storage-id",
        lastUploadUrl: "https://cdn.example.com/upload.webp",
        lastUploadMimeType: "image/webp",
        lastUploadSizeBytes: 4321.4,
        lastUploadFilename: "render.webp",
        lastUploadError: "Upload failed",
        lastUploadErrorHash: "upload-error-hash",
        isFavorite: true,
      }),
    ).toEqual({
      outputResolution: "custom",
      customWidth: 1024,
      customHeight: 512,
      format: "jpeg",
      jpegQuality: 100,
      lastRenderedAt: 123,
      lastRenderedHash: "render-hash",
      lastRenderWidth: 2049,
      lastRenderHeight: 1024,
      lastRenderFormat: "webp",
      lastRenderMimeType: "image/webp",
      lastRenderSizeBytes: 1235,
      lastRenderQuality: null,
      lastRenderSourceWidth: 1000,
      lastRenderSourceHeight: 500,
      lastRenderWasSizeClamped: true,
      storageId: "storage-id",
      url: "https://cdn.example.com/render.webp",
      lastUploadedAt: 456,
      lastUploadedHash: "upload-hash",
      lastUploadStorageId: "upload-storage-id",
      lastUploadUrl: "https://cdn.example.com/upload.webp",
      lastUploadMimeType: "image/webp",
      lastUploadSizeBytes: 4321,
      lastUploadFilename: "render.webp",
      lastUploadError: "Upload failed",
      lastUploadErrorHash: "upload-error-hash",
      isFavorite: true,
    });
  });

  it("falls back to safe defaults and preserves current render errors", () => {
    expect(
      sanitizeRenderData({
        outputResolution: "invalid",
        customWidth: 0,
        customHeight: 20_000,
        format: "gif",
        jpegQuality: Number.NaN,
        lastRenderError: "Render failed",
        lastRenderErrorHash: "render-error-hash",
      }),
    ).toEqual({
      outputResolution: "original",
      format: "png",
      jpegQuality: 90,
      lastRenderError: "Render failed",
      lastRenderErrorHash: "render-error-hash",
    });
  });
});
