// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFreepikAssetDedupeKey } from "@/lib/media-archive";

const mocks = vi.hoisted(() => ({
  searchFreepik: vi.fn(async () => ({ results: [], totalPages: 1, currentPage: 1 })),
  upsertMedia: vi.fn(async () => undefined),
  getNode: vi.fn(() => ({ id: "node-1", data: {} })),
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
}));

vi.mock("convex/react", () => ({
  useAction: () => mocks.searchFreepik,
  useMutation: () => mocks.upsertMedia,
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getNode: mocks.getNode,
  }),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    queueNodeResize: mocks.queueNodeResize,
    status: { isOffline: false },
  }),
}));

import { AssetBrowserPanel } from "@/components/canvas/asset-browser-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AssetBrowserPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.searchFreepik.mockClear();
    mocks.upsertMedia.mockClear();
    mocks.getNode.mockClear();
    mocks.queueNodeDataUpdate.mockClear();
    mocks.queueNodeResize.mockClear();

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
    container = null;
    root = null;
  });

  it("upserts selected Freepik asset into media archive", async () => {
    const onClose = vi.fn();
    const asset = {
      id: 123,
      title: "Forest texture",
      assetType: "photo" as const,
      previewUrl: "https://cdn.freepik.test/preview.jpg",
      intrinsicWidth: 1600,
      intrinsicHeight: 900,
      sourceUrl: "https://www.freepik.com/asset/123",
      license: "freemium" as const,
      authorName: "Alice",
      orientation: "landscape",
    };

    await act(async () => {
      root?.render(
        <AssetBrowserPanel
          nodeId="node-1"
          canvasId="canvas-1"
          onClose={onClose}
          initialState={{
            term: "forest",
            assetType: "photo",
            results: [asset],
            page: 1,
            totalPages: 1,
          }}
        />,
      );
    });

    const selectButton = document.querySelector('[aria-label="Select asset: Forest texture"]');
    if (!(selectButton instanceof HTMLButtonElement)) {
      throw new Error("Asset select button not found");
    }

    await act(async () => {
      selectButton.click();
    });

    expect(mocks.upsertMedia).toHaveBeenCalledTimes(1);
    expect(mocks.upsertMedia).toHaveBeenCalledWith({
      input: {
        kind: "asset",
        source: "freepik-asset",
        dedupeKey: buildFreepikAssetDedupeKey("photo", 123),
        title: "Forest texture",
        previewUrl: "https://cdn.freepik.test/preview.jpg",
        originalUrl: "https://cdn.freepik.test/preview.jpg",
        sourceUrl: "https://www.freepik.com/asset/123",
        providerAssetId: "123",
        width: 1600,
        height: 900,
        metadata: {
          provider: "freepik",
          assetId: 123,
          assetType: "photo",
          license: "freemium",
          authorName: "Alice",
          orientation: "landscape",
        },
        firstSourceCanvasId: "canvas-1",
        firstSourceNodeId: "node-1",
      },
    });
  });
});
