// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(async () => undefined),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: vi.fn(async () => undefined),
    queueNodeResize: vi.fn(async () => undefined),
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
  MediaLibraryDialog: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ImageNode from "@/components/canvas/nodes/image-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ImageNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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
});
