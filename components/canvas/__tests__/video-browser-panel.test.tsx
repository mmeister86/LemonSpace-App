// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPexelsVideoDedupeKey } from "@/lib/media-archive";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  let promotedInitialFalseState = false;
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      if (!promotedInitialFalseState && initial === false) {
        promotedInitialFalseState = true;
        return actual.useState(true as T);
      }
      return actual.useState(initial);
    },
  };
});

const mocks = vi.hoisted(() => ({
  searchVideos: vi.fn(async () => ({ videos: [], total_results: 0, per_page: 20 })),
  popularVideos: vi.fn(async () => ({ videos: [], total_results: 0, per_page: 20 })),
  upsertMedia: vi.fn(async () => undefined),
  getNode: vi.fn(() => ({ id: "node-1", data: {} })),
  queueNodeDataUpdate: vi.fn(async () => undefined),
  queueNodeResize: vi.fn(async () => undefined),
}));

vi.mock("convex/react", () => ({
  useAction: (() => {
    let callIndex = 0;
    return () => {
      callIndex += 1;
      return callIndex === 1 ? mocks.searchVideos : mocks.popularVideos;
    };
  })(),
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

import { VideoBrowserPanel } from "@/components/canvas/video-browser-panel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("VideoBrowserPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.searchVideos.mockClear();
    mocks.popularVideos.mockClear();
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

  it("upserts selected Pexels video into media archive", async () => {
    const onClose = vi.fn();
    const video = {
      id: 987,
      width: 1920,
      height: 1080,
      url: "https://www.pexels.com/video/987/",
      image: "https://images.pexels.test/987.jpeg",
      duration: 42,
      user: {
        id: 777,
        name: "Filmmaker",
        url: "https://www.pexels.com/@filmmaker",
      },
      video_files: [
        {
          id: 501,
          quality: "hd" as const,
          file_type: "video/mp4",
          width: 1920,
          height: 1080,
          fps: 30,
          link: "https://player.pexels.test/987-hd.mp4",
        },
      ],
    };

    await act(async () => {
      root?.render(
        <VideoBrowserPanel
          nodeId="node-1"
          canvasId="canvas-1"
          onClose={onClose}
          initialState={{
            term: "nature",
            orientation: "",
            durationFilter: "all",
            results: [video],
            page: 1,
            totalPages: 1,
          }}
        />,
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const selectButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.getAttribute("aria-label")?.includes("auswählen"),
    );
    if (!(selectButton instanceof HTMLButtonElement)) {
      throw new Error("Video select button not found");
    }

    await act(async () => {
      selectButton.click();
    });

    expect(mocks.upsertMedia).toHaveBeenCalledTimes(1);
    expect(mocks.upsertMedia).toHaveBeenCalledWith({
      input: {
        kind: "video",
        source: "pexels-video",
        dedupeKey: buildPexelsVideoDedupeKey(987),
        providerAssetId: "987",
        originalUrl: "https://player.pexels.test/987-hd.mp4",
        previewUrl: "https://images.pexels.test/987.jpeg",
        sourceUrl: "https://www.pexels.com/video/987/",
        width: 1920,
        height: 1080,
        durationSeconds: 42,
        metadata: {
          provider: "pexels",
          videoId: 987,
          userId: 777,
          userName: "Filmmaker",
          userUrl: "https://www.pexels.com/@filmmaker",
          selectedFile: {
            id: 501,
            quality: "hd",
            fileType: "video/mp4",
            width: 1920,
            height: 1080,
            fps: 30,
          },
        },
        firstSourceCanvasId: "canvas-1",
        firstSourceNodeId: "node-1",
      },
    });
  });
});
