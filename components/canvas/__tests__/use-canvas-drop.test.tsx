// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { CANVAS_NODE_DND_MIME } from "@/lib/canvas-connection-policy";
import { NODE_DEFAULTS } from "@/lib/canvas-utils";
import { toast } from "@/lib/toast";
import { useCanvasDrop } from "@/components/canvas/use-canvas-drop";
import { createCompressedImagePreview } from "@/components/canvas/canvas-media-utils";

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/canvas/canvas-media-utils", () => ({
  getImageDimensions: vi.fn(async () => ({ width: 1600, height: 900 })),
  createCompressedImagePreview: vi.fn(async () => ({
    blob: new Blob(["preview"], { type: "image/webp" }),
    width: 640,
    height: 360,
  })),
}));

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDrop> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

type HookHarnessProps = {
  isSyncOnline?: boolean;
  generateUploadUrl?: ReturnType<typeof vi.fn>;
  registerUploadedImageMedia?: ReturnType<typeof vi.fn>;
  runCreateNodeOnlineOnly?: ReturnType<typeof vi.fn>;
  runCreateNodeWithEdgeSplitOnlineOnly?: ReturnType<typeof vi.fn>;
  notifyOfflineUnsupported?: ReturnType<typeof vi.fn>;
  syncPendingMoveForClientRequest?: ReturnType<typeof vi.fn>;
  screenToFlowPosition?: (position: { x: number; y: number }) => { x: number; y: number };
  edges?: RFEdge[];
};

function HookHarness({
  isSyncOnline = true,
  generateUploadUrl = vi.fn(async () => "https://upload.test"),
  registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const })),
  runCreateNodeOnlineOnly = vi.fn(async () => "node-1"),
  runCreateNodeWithEdgeSplitOnlineOnly = vi.fn(async () => "node-1"),
  notifyOfflineUnsupported = vi.fn(),
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
    runCreateNodeOnlineOnly,
    runCreateNodeWithEdgeSplitOnlineOnly,
    notifyOfflineUnsupported,
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

  it("creates an image node from a dropped image file", async () => {
    const generateUploadUrl = vi.fn(async () => "https://upload.test");
    const registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const }));
    const runCreateNodeOnlineOnly = vi.fn(async () => "node-image");
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          registerUploadedImageMedia={registerUploadedImageMedia}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
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
        storageId: "storage-1",
        previewStorageId: "preview-storage-1",
        filename: "photo.png",
        mimeType: "image/png",
        width: 1600,
        height: 900,
        previewWidth: 640,
        previewHeight: 360,
        canvasId: "canvas-1",
      },
      clientRequestId: "req-1",
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
    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          generateUploadUrl={generateUploadUrl}
          runCreateNodeOnlineOnly={runCreateNodeOnlineOnly}
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
          storageId: "storage-1",
        }),
      }),
    );
    expect(runCreateNodeOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          previewStorageId: expect.anything(),
        }),
      }),
    );
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

    expect(runCreateNodeOnlineOnly).not.toHaveBeenCalled();
    expect(syncPendingMoveForClientRequest).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to upload dropped file:",
      expect.any(Error),
    );
    expect(toast.error).toHaveBeenCalledWith("canvas.uploadFailed", "Upload failed");
  });
});
