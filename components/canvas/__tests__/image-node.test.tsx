// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
  mediaLibraryPickItem: null as null | Record<string, unknown>,
  decodedImageSizes: new Map<string, { width: number; height: number }>(),
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useViewport: () => ({ x: 0, y: 0, zoom: mockViewportZoom }),
}));

let mockViewportZoom = 1;

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(async () => undefined),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    queueNodeResize: mocks.queueNodeResize,
    status: { isOffline: false },
  }),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({
    children,
  }: {
    children: React.ReactNode;
    backlight?: React.ReactNode;
  }) => (
    <div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/media/media-library-dialog", () => ({
  MediaLibraryDialog: ({
    onPick,
  }: {
    onPick?: (item: Record<string, unknown>) => void | Promise<void>;
  }) => (
    <button
      type="button"
      data-testid="mock-media-library-pick"
      onClick={() => {
        if (!mocks.mediaLibraryPickItem) {
          return;
        }
        void onPick?.(mocks.mediaLibraryPickItem);
      }}
    >
      Pick media
    </button>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ImageNode from "@/components/canvas/nodes/image-node";
import { computeMediaNodeSize } from "@/lib/canvas-utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ImageNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mockViewportZoom = 1;
    mocks.queueNodeDataUpdate.mockClear();
    mocks.queueNodeResize.mockClear();
    mocks.mediaLibraryPickItem = null;
    mocks.decodedImageSizes.clear();
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;

      set src(value: string) {
        const size = mocks.decodedImageSizes.get(value);
        queueMicrotask(() => {
          if (!size) {
            this.onerror?.();
            return;
          }
          this.naturalWidth = size.width;
          this.naturalHeight = size.height;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal("Image", MockImage);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  async function renderImageNode(data: Record<string, unknown>) {
    await act(async () => {
      root?.render(
        <ImageNode
          {...({
            id: "node-1",
            data,
            selected: false,
            dragging: false,
            zIndex: 0,
            isConnectable: true,
            type: "image",
            width: 280,
            height: 200,
            sourcePosition: undefined,
            targetPosition: undefined,
          } as React.ComponentProps<typeof ImageNode>)}
        />,
      );
    });
  }

  it("shows an uploading state for dropped images without a resolved URL", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      _uploadState: "uploading",
    });

    expect(container?.textContent).toContain("Bild wird hochgeladen…");
    expect(container?.textContent).not.toContain("Klicken oder hierhin ziehen");
  });

  it("shows a resolving state while waiting for the storage URL", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      _uploadState: "resolving-url",
    });

    expect(container?.textContent).toContain("Bild wird geladen…");
  });

  it("renders the image when a URL is available even if the upload marker remains", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      url: "https://cdn.example.com/photo.png",
      _uploadState: "resolving-url",
    });

    const images = Array.from(container?.querySelectorAll("img") ?? []);
    const image = images.at(-1);
    expect(image).toBeTruthy();
    expect(image?.getAttribute("src")).toBe("https://cdn.example.com/photo.png");
    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
    expect(container?.textContent).not.toContain("Bild wird geladen…");
  });

  it("uses preview URLs for the in-canvas image at low zoom while keeping full URLs available", async () => {
    mockViewportZoom = 0.5;

    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      url: "https://cdn.example.com/photo-full.png",
      previewUrl: "https://cdn.example.com/photo-preview.webp",
    });

    const imageSources = Array.from(container?.querySelectorAll("img") ?? []).map((image) =>
      image.getAttribute("src"),
    );

    expect(imageSources).toContain("https://cdn.example.com/photo-preview.webp");
    expect(imageSources).toContain("https://cdn.example.com/photo-full.png");
  });

  it("uses full URLs for the in-canvas image at high zoom", async () => {
    mockViewportZoom = 4;

    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      url: "https://cdn.example.com/photo-full.png",
      previewUrl: "https://cdn.example.com/photo-preview.webp",
    });

    const primaryImage = Array.from(container?.querySelectorAll("img") ?? []).find(
      (image) => image.getAttribute("alt") === "photo.png",
    );

    expect(primaryImage?.getAttribute("src")).toBe("https://cdn.example.com/photo-full.png");
  });

  it("does not render the media backlight before an image URL is available", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      _uploadState: "uploading",
    });

    expect(container?.querySelector('[data-testid="canvas-media-backlight"]')).toBeNull();
  });

  it("keeps the filename visible while the dropped image is loading", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      _uploadState: "uploading",
    });

    expect(container?.textContent).toContain("photo.png");
  });

  it("disables the media library entry while a dropped image is pending", async () => {
    await renderImageNode({
      filename: "photo.png",
      mimeType: "image/png",
      _uploadState: "uploading",
    });

    const mediaLibraryButton = Array.from(container?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent?.includes("openButton"),
    );

    expect(mediaLibraryButton).toBeTruthy();
    expect((mediaLibraryButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("resizes media library picks from decoded image dimensions when metadata is missing", async () => {
    const fullUrl = "https://cdn.example.com/library-full.png";
    const expectedSize = computeMediaNodeSize("image", {
      intrinsicWidth: 1200,
      intrinsicHeight: 800,
    });
    mocks.decodedImageSizes.set(fullUrl, { width: 1200, height: 800 });
    mocks.mediaLibraryPickItem = {
      kind: "image",
      storageId: "storage-1",
      filename: "library.png",
      mimeType: "image/png",
      resolvedOriginalUrl: fullUrl,
    };

    await renderImageNode({});

    const pickButton = container?.querySelector<HTMLButtonElement>(
      '[data-testid="mock-media-library-pick"]',
    );
    if (!pickButton) {
      throw new Error("media library pick button missing");
    }

    await act(async () => {
      pickButton.click();
      await Promise.resolve();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: expect.objectContaining({
        storageId: "storage-1",
        width: 1200,
        height: 800,
      }),
    });
    expect(mocks.queueNodeResize).toHaveBeenCalledWith({
      nodeId: "node-1",
      width: expectedSize.width,
      height: expectedSize.height,
    });
  });

  it("prefers decoded media library dimensions over stale archived dimensions", async () => {
    const fullUrl = "https://cdn.example.com/stale-full.png";
    const expectedSize = computeMediaNodeSize("image", {
      intrinsicWidth: 1200,
      intrinsicHeight: 800,
    });
    mocks.decodedImageSizes.set(fullUrl, { width: 1200, height: 800 });
    mocks.mediaLibraryPickItem = {
      kind: "image",
      storageId: "storage-1",
      filename: "stale.png",
      mimeType: "image/png",
      width: 640,
      height: 640,
      resolvedOriginalUrl: fullUrl,
    };

    await renderImageNode({});

    const pickButton = container?.querySelector<HTMLButtonElement>(
      '[data-testid="mock-media-library-pick"]',
    );
    if (!pickButton) {
      throw new Error("media library pick button missing");
    }

    await act(async () => {
      pickButton.click();
      await Promise.resolve();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: expect.objectContaining({
        storageId: "storage-1",
        width: 1200,
        height: 800,
      }),
    });
    expect(mocks.queueNodeResize).toHaveBeenCalledWith({
      nodeId: "node-1",
      width: expectedSize.width,
      height: expectedSize.height,
    });
  });

  it("applies media library picks without resizing when dimensions cannot be decoded", async () => {
    mocks.mediaLibraryPickItem = {
      kind: "image",
      storageId: "storage-1",
      filename: "unknown.png",
      mimeType: "image/png",
      resolvedOriginalUrl: "https://cdn.example.com/missing.png",
    };

    await renderImageNode({});

    const pickButton = container?.querySelector<HTMLButtonElement>(
      '[data-testid="mock-media-library-pick"]',
    );
    if (!pickButton) {
      throw new Error("media library pick button missing");
    }

    await act(async () => {
      pickButton.click();
      await Promise.resolve();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "node-1",
      data: expect.objectContaining({
        storageId: "storage-1",
        filename: "unknown.png",
      }),
    });
    expect(mocks.queueNodeResize).not.toHaveBeenCalled();
  });
});
