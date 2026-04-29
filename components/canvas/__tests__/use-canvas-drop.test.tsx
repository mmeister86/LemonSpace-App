// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { CANVAS_NODE_DND_MIME } from "@/lib/canvas-connection-policy";
import { computeMediaNodeSize, NODE_DEFAULTS } from "@/lib/canvas-utils";
import {
  emitDashboardSnapshotCacheInvalidationSignal,
  invalidateDashboardSnapshotForLastSignedInUser,
} from "@/lib/dashboard-snapshot-cache";
import { toast } from "@/lib/toast";
import {
  createDroppedImageMetadata,
  createDroppedVideoMetadata,
  useCanvasDrop,
} from "@/components/canvas/use-canvas-drop";
import {
  createCompressedImagePreview,
  getVideoMetadata,
} from "@/components/canvas/canvas-media-utils";

const mocks = vi.hoisted(() => ({
  getNode: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getNode: mocks.getNode,
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/canvas/canvas-media-utils", () => ({
  getImageDimensions: vi.fn(async () => ({ width: 1600, height: 900 })),
  getVideoMetadata: vi.fn(async () => ({
    width: 1920,
    height: 1080,
    durationSeconds: 12,
  })),
  createCompressedImagePreview: vi.fn(async () => ({
    blob: new Blob(["preview"], { type: "image/webp" }),
    width: 640,
    height: 360,
  })),
}));

vi.mock("@/lib/dashboard-snapshot-cache", () => ({
  invalidateDashboardSnapshotForLastSignedInUser: vi.fn(),
  emitDashboardSnapshotCacheInvalidationSignal: vi.fn(),
}));

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDrop> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

describe("dropped media metadata adapters", () => {
  it("keeps image and video metadata mapping explicit", () => {
    const imageFile = new File(["image-bytes"], "photo.png", { type: "image/png" });
    const videoFile = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });

    expect(
      createDroppedImageMetadata({
        canvasId: asCanvasId("canvas-1"),
        file: imageFile,
        dimensions: { width: 1600, height: 900 },
        previewUpload: {
          previewStorageId: "preview-storage-1",
          previewWidth: 640,
          previewHeight: 360,
        },
        storageId: "storage-1",
      }),
    ).toEqual({
      storageId: "storage-1",
      previewStorageId: "preview-storage-1",
      filename: "photo.png",
      mimeType: "image/png",
      canvasId: "canvas-1",
      width: 1600,
      height: 900,
      previewWidth: 640,
      previewHeight: 360,
    });

    expect(
      createDroppedVideoMetadata({
        canvasId: asCanvasId("canvas-1"),
        file: videoFile,
        metadata: { width: 1920, height: 1080, durationSeconds: 12 },
        storageId: "video-storage-1",
      }),
    ).toEqual({
      storageId: "video-storage-1",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      canvasId: "canvas-1",
      width: 1920,
      height: 1080,
      durationSeconds: 12,
    });
  });
});

type HookHarnessProps = {
  isSyncOnline?: boolean;
  generateUploadUrl?: ReturnType<typeof vi.fn>;
  registerUploadedImageMedia?: ReturnType<typeof vi.fn>;
  registerUploadedVideoMedia?: ReturnType<typeof vi.fn>;
  runCreateNodeOnlineOnly?: ReturnType<typeof vi.fn>;
  runCreateNodeWithEdgeSplitOnlineOnly?: ReturnType<typeof vi.fn>;
  notifyOfflineUnsupported?: ReturnType<typeof vi.fn>;
  queueNodeDataUpdate?: ReturnType<typeof vi.fn>;
  queueNodeResize?: ReturnType<typeof vi.fn>;
  syncPendingMoveForClientRequest?: ReturnType<typeof vi.fn>;
  screenToFlowPosition?: (position: { x: number; y: number }) => { x: number; y: number };
  edges?: RFEdge[];
};

function HookHarness({
  isSyncOnline = true,
  generateUploadUrl = vi.fn(async () => "https://upload.test"),
  registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const })),
  registerUploadedVideoMedia = vi.fn(async () => ({ ok: true as const })),
  runCreateNodeOnlineOnly = vi.fn(async () => "node-1"),
  runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-1"),
  notifyOfflineUnsupported = vi.fn(),
  queueNodeDataUpdate = vi.fn(async () => undefined),
  queueNodeResize = vi.fn(async () => undefined),
  syncPendingMoveForClientRequest = vi.fn(async () => undefined),
  screenToFlowPosition = (position) => position,
  edges = [],
}: HookHarnessProps) {
  const handlers = useCanvasDrop({
    canvasId: asCanvasId("canvas-1"),
    isSyncOnline,
    t: ((key: string) => key) as (key: string) => string,
    edges,
    screenToFlowPosition,
    generateUploadUrl,
    registerUploadedImageMedia,
    registerUploadedVideoMedia,
    runCreateNodeOnlineOnly,
    runCreateNodeWithEdgeSplitOnlineOnly,
    notifyOfflineUnsupported,
    queueNodeDataUpdate,
    queueNodeResize,
    syncPendingMoveForClientRequest,
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasDrop", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getNode.mockReset();
    mocks.getNode.mockReturnValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ storageId: "storage-1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ storageId: "preview-storage-1" }),
        }),
    );
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "req-1"),
    });
  });

  afterEach(async () => {
    latestHandlersRef.current = null;
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("creates a node from a raw sidebar node type drop", async () => {
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-1");
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 120,
        clientY: 340,
        dataTransfer: {
          getData: vi.fn((type: string) =>
            type === CANVAS_NODE_DND_MIME ? "image" : "",
          ),
          files: [],
        },
      } as unknown as React.DragEvent);
    });

    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "image",
      positionX: 120,
      positionY: 340,
      width: NODE_DEFAULTS.image.width,
      height: NODE_DEFAULTS.image.height,
      data: {
        ...NODE_DEFAULTS.image.data,
        canvasId: "canvas-1",
      },
      clientRequestId: "req-1",
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1", "node-1");
  });

  it("creates a comment node from a raw sidebar node type drop", async () => {
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-comment");
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 120,
        clientY: 340,
        dataTransfer: {
          getData: vi.fn((type: string) =>
            type === CANVAS_NODE_DND_MIME ? "comment" : "",
          ),
          files: [],
        },
      } as unknown as React.DragEvent);
    });

    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "comment",
      positionX: 120,
      positionY: 340,
      width: NODE_DEFAULTS.comment.width,
      height: NODE_DEFAULTS.comment.height,
      data: {
        ...NODE_DEFAULTS.comment.data,
        canvasId: "canvas-1",
      },
      clientRequestId: "req-1",
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1", "node-comment");
  });

  it("creates an image node from a dropped image file", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test");
    const registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const }));
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-image");
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const queueNodeResize = vi.fn(async () => undefined);
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });
    const resized = computeMediaNodeSize("image", {
      intrinsicWidth: 1600,
      intrinsicHeight: 900,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          registerUploadedImageMedia={registerUploadedImageMedia}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          queueNodeDataUpdate={queueNodeDataUpdate}
          queueNodeResize={queueNodeResize}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    expect(generateUploadUrl).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(1, "https://upload.test", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: file,
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "https://upload.test", {
      method: "POST",
      headers: { "Content-Type": "image/webp" },
      body: expect.any(Blob),
    });
    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "image",
      positionX: 240,
      positionY: 180,
      width: NODE_DEFAULTS.image.width,
      height: NODE_DEFAULTS.image.height,
      data: {
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
        _uploadState: "uploading",
      },
      clientRequestId: "req-1",
    });
    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: {
        storageId: "storage-1",
        previewStorageId: "preview-storage-1",
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
        width: 1600,
        height: 900,
        previewWidth: 640,
        previewHeight: 360,
        _uploadState: "resolving-url",
      },
    });
    expect(queueNodeResize).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      width: resized.width,
      height: resized.height,
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith(
      "req-1",
      "node-image",
    );
    expect(registerUploadedImageMedia).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      nodeId: "node-image",
      storageId: "storage-1",
      filename: "photo.png",
      mimeType: "image/png",
      width: 1600,
      height: 900,
    });
    expect(invalidateDashboardSnapshotForLastSignedInUser).toHaveBeenCalledTimes(1);
    expect(emitDashboardSnapshotCacheInvalidationSignal).toHaveBeenCalledTimes(1);
  });

  it("creates a video node from a dropped video file and registers it", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test");
    const registerUploadedVideoMedia = vi.fn(async () => ({ ok: true as const }));
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-video");
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const queueNodeResize = vi.fn(async () => undefined);
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const file = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
    const resized = computeMediaNodeSize("video", {
      intrinsicWidth: 1920,
      intrinsicHeight: 1080,
    });

    vi.mocked(getVideoMetadata).mockResolvedValueOnce({
      width: 1920,
      height: 1080,
      durationSeconds: 12,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ storageId: "video-storage-1" }),
      }),
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          registerUploadedVideoMedia={registerUploadedVideoMedia}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          queueNodeDataUpdate={queueNodeDataUpdate}
          queueNodeResize={queueNodeResize}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://upload.test", {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: file,
    });
    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "video",
      positionX: 240,
      positionY: 180,
      width: NODE_DEFAULTS.video.width,
      height: NODE_DEFAULTS.video.height,
      data: {
        filename: "clip.mp4",
        mimeType: "video/mp4",
        canvasId: "canvas-1",
        _uploadState: "uploading",
      },
      clientRequestId: "req-1",
    });
    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: {
        storageId: "video-storage-1",
        filename: "clip.mp4",
        mimeType: "video/mp4",
        canvasId: "canvas-1",
        width: 1920,
        height: 1080,
        durationSeconds: 12,
        _uploadState: "resolving-url",
      },
    });
    expect(queueNodeResize).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      width: resized.width,
      height: resized.height,
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith(
      "req-1",
      "node-video",
    );
    expect(registerUploadedVideoMedia).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      nodeId: "node-video",
      storageId: "video-storage-1",
      filename: "clip.mp4",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationSeconds: 12,
    });
  });

  it("registers dropped image media when node creation fails", async () => {
    const registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const }));
    const runCreateNodeOnlineOnly = vi.fn(async () => {
      throw new Error("create failed");
    });
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const queueNodeResize = vi.fn(async () => undefined);
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          registerUploadedImageMedia={registerUploadedImageMedia}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          queueNodeDataUpdate={queueNodeDataUpdate}
          queueNodeResize={queueNodeResize}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(syncPendingMoveForClientRequest).not.toHaveBeenCalled();
    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: {
        storageId: "storage-1",
        previewStorageId: "preview-storage-1",
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
        width: 1600,
        height: 900,
        previewWidth: 640,
        previewHeight: 360,
        _uploadState: "resolving-url",
      },
    });
    expect(queueNodeResize).toHaveBeenCalledTimes(1);
    expect(registerUploadedImageMedia).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      storageId: "storage-1",
      filename: "photo.png",
      mimeType: "image/png",
      width: 1600,
      height: 900,
    });
    expect(registerUploadedImageMedia).not.toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: expect.anything() }),
    );
    expect(invalidateDashboardSnapshotForLastSignedInUser).toHaveBeenCalledTimes(1);
    expect(emitDashboardSnapshotCacheInvalidationSignal).toHaveBeenCalledTimes(1);
  });

  it("creates a node from a JSON payload drop", async () => {
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-video");
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 90,
        clientY: 75,
        dataTransfer: {
          getData: vi.fn((type: string) =>
            type === CANVAS_NODE_DND_MIME
              ? JSON.stringify({
                  type: "video",
                  data: {
                    assetId: "asset-42",
                    label: "Clip",
                  },
                })
              : "",
          ),
          files: [],
        },
      } as unknown as React.DragEvent);
    });

    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "video",
      positionX: 90,
      positionY: 75,
      width: NODE_DEFAULTS.video.width,
      height: NODE_DEFAULTS.video.height,
      data: {
        ...NODE_DEFAULTS.video.data,
        assetId: "asset-42",
        label: "Clip",
        canvasId: "canvas-1",
      },
      clientRequestId: "req-1",
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1", "node-video");
  });

  it("continues with original upload when preview generation fails", async () => {
    vi.mocked(createCompressedImagePreview).mockRejectedValueOnce(
      new Error("preview failed"),
    );

    const generateUploadUrl = vi.fn(async () => "https://upload.test");
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-image");
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          queueNodeDataUpdate={queueNodeDataUpdate}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 20,
        clientY: 10,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: "photo.png",
          _uploadState: "uploading",
        }),
      }),
    );
    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: {
        storageId: "storage-1",
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
        width: 1600,
        height: 900,
        _uploadState: "resolving-url",
      },
    });
  });

  it("splits an intersected persisted edge for sidebar node drops", async () => {
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-note");
    const runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-note");
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const edgeContainer = document.createElement("g");
    edgeContainer.classList.add("react-flow__edge");
    edgeContainer.setAttribute("data-id", "edge-a");
    const interaction = document.createElement("path");
    interaction.classList.add("react-flow__edge-interaction");
    edgeContainer.appendChild(interaction);
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [interaction]),
      configurable: true,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          runCreateNodeWithEdgeSplitOnlineOnly={runCreateNodeWithEdgeSplitOnlineOnly}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
          edges={[{ id: "edge-a", source: "node-1", target: "node-2" } as RFEdge]}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 120,
        clientY: 340,
        dataTransfer: {
          getData: vi.fn((type: string) =>
            type === CANVAS_NODE_DND_MIME ? "note" : "",
          ),
          files: [],
        },
      } as unknown as React.DragEvent);
    });

    expect(runCreateNodeWithEdgeSplitOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "note",
      positionX: 120,
      positionY: 340,
      width: NODE_DEFAULTS.note.width,
      height: NODE_DEFAULTS.note.height,
      data: {
        ...NODE_DEFAULTS.note.data,
        canvasId: "canvas-1",
      },
      splitEdgeId: "edge-a",
      newNodeTargetHandle: undefined,
      newNodeSourceHandle: undefined,
      splitSourceHandle: undefined,
      splitTargetHandle: undefined,
      clientRequestId: "req-1",
    });
    expect(runCreateNodeOnlineOnly).not.toHaveBeenCalled();
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1", "node-note");
  });

  it("shows an upload failure toast when the dropped file upload fails", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test");
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-image");
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const queueNodeResize = vi.fn(async () => undefined);
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ storageId: "storage-1" }),
      })),
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
          queueNodeDataUpdate={queueNodeDataUpdate}
          queueNodeResize={queueNodeResize}
          syncPendingMoveForClientRequest={syncPendingMoveForClientRequest}
        />,
      );
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: "photo.png",
          _uploadState: "uploading",
        }),
      }),
    );
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith("req-1", "node-image");
    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: {
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
      },
    });
    expect(queueNodeResize).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to upload dropped file:",
      expect.any(Error),
    );
    expect(toast.error).toHaveBeenCalledWith("canvas.uploadFailed", "Upload failed");
  });

  it("creates the optimistic image node before the upload request resolves", async () => {
    const fetchPromise = new Promise<Response>(() => {});
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-image");
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    vi.stubGlobal("fetch", vi.fn(() => fetchPromise));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness runCreateNodeOnlineOnly={runCreateNodeOnlineOnly} />);
    });

    await act(async () => {
      void latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
      await Promise.resolve();
    });

    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      type: "image",
      positionX: 240,
      positionY: 180,
      width: NODE_DEFAULTS.image.width,
      height: NODE_DEFAULTS.image.height,
      data: {
        filename: "photo.png",
        mimeType: "image/png",
        canvasId: "canvas-1",
        _uploadState: "uploading",
      },
      clientRequestId: "req-1",
    });
  });

  it("merges existing optimistic node data when patching upload results", async () => {
    const queueNodeDataUpdate = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    mocks.getNode.mockImplementation((nodeId: string) =>
      nodeId === "optimistic_req-1"
        ? {
            id: nodeId,
            data: {
              filename: "photo.png",
              mimeType: "image/png",
              canvasId: "canvas-1",
              isFavorite: true,
              _uploadState: "uploading",
            },
          }
        : undefined,
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness queueNodeDataUpdate={queueNodeDataUpdate} />);
    });

    await act(async () => {
      await latestHandlersRef.current?.onDrop({
        preventDefault: vi.fn(),
        clientX: 240,
        clientY: 180,
        dataTransfer: {
          getData: vi.fn(() => ""),
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    expect(queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "optimistic_req-1",
      data: expect.objectContaining({
        isFavorite: true,
        storageId: "storage-1",
        _uploadState: "resolving-url",
      }),
    });
  });
});
