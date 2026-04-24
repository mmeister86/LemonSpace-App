/* @vitest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const getImageDimensionsMock = vi.hoisted(() => vi.fn());
const createCompressedImagePreviewMock = vi.hoisted(() => vi.fn());
const invalidateDashboardSnapshotForLastSignedInUserMock = vi.hoisted(() => vi.fn());
const emitDashboardSnapshotCacheInvalidationSignalMock = vi.hoisted(() => vi.fn());
const getNodeMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/canvas/canvas-media-utils", () => ({
  getImageDimensions: getImageDimensionsMock,
  createCompressedImagePreview: createCompressedImagePreviewMock,
}));

vi.mock("@/lib/dashboard-snapshot-cache", () => ({
  invalidateDashboardSnapshotForLastSignedInUser:
    invalidateDashboardSnapshotForLastSignedInUserMock,
  emitDashboardSnapshotCacheInvalidationSignal:
    emitDashboardSnapshotCacheInvalidationSignalMock,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    getNode: getNodeMock,
  }),
}));

import { useCanvasDrop } from "@/components/canvas/use-canvas-drop";

const latestHandlers: {
  current: ReturnType<typeof useCanvasDrop> | null;
} = { current: null };

type RunCreateNodeOnlineOnly = Parameters<typeof useCanvasDrop>[0]["runCreateNodeOnlineOnly"];

type HarnessProps = {
  runCreateNodeOnlineOnly: RunCreateNodeOnlineOnly;
  registerUploadedImageMedia?: Parameters<typeof useCanvasDrop>[0]["registerUploadedImageMedia"];
};

function HookHarness({
  runCreateNodeOnlineOnly,
  registerUploadedImageMedia = async () => ({ ok: true }),
}: HarnessProps) {
  const value = useCanvasDrop({
    canvasId: "canvas_1" as Id<"canvases">,
    isSyncOnline: true,
    t: (key: string) => key,
    edges: [],
    screenToFlowPosition: ({ x, y }) => ({ x, y }),
    generateUploadUrl: async () => "https://upload.example.com",
    registerUploadedImageMedia,
    runCreateNodeOnlineOnly,
    runCreateNodeWithEdgeSplitOnlineOnly: async () => "node_split_1" as Id<"nodes">,
    notifyOfflineUnsupported: () => {},
    queueNodeDataUpdate: async () => {},
    queueNodeResize: async () => {},
    syncPendingMoveForClientRequest: async () => {},
  });

  useEffect(() => {
    latestHandlers.current = value;
    return () => {
      latestHandlers.current = null;
    };
  }, [value]);

  return null;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useCanvasDrop image upload path", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
    latestHandlers.current = null;
    getImageDimensionsMock.mockReset();
    createCompressedImagePreviewMock.mockReset();
    getNodeMock.mockReset();
    getNodeMock.mockReturnValue(undefined);
    invalidateDashboardSnapshotForLastSignedInUserMock.mockReset();
    emitDashboardSnapshotCacheInvalidationSignalMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("invalidates dashboard snapshot after successful dropped image upload", async () => {
    getImageDimensionsMock.mockResolvedValue({ width: 640, height: 480 });
    createCompressedImagePreviewMock.mockResolvedValue({
      blob: new Blob(["preview"], { type: "image/webp" }),
      width: 640,
      height: 480,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ storageId: "storage_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ storageId: "preview_storage_1" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", {
      randomUUID: () => "client-request-id",
    });

    const runCreateNodeOnlineOnly = vi
      .fn<HarnessProps["runCreateNodeOnlineOnly"]>()
      .mockResolvedValue("node_1" as Id<"nodes">);
    const registerUploadedImageMedia = vi.fn(async () => ({ ok: true as const }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          runCreateNodeOnlineOnly,
          registerUploadedImageMedia,
        }),
      );
    });

    const file = new File(["file"], "drop.png", { type: "image/png" });

    await act(async () => {
      await latestHandlers.current?.onDrop({
        preventDefault: () => {},
        clientX: 120,
        clientY: 80,
        dataTransfer: {
          getData: () => "",
          files: [file],
        },
      } as unknown as React.DragEvent);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runCreateNodeOnlineOnly).toHaveBeenCalledTimes(1);
    expect(registerUploadedImageMedia).toHaveBeenCalledWith({
      canvasId: "canvas_1",
      nodeId: "node_1",
      storageId: "storage_1",
      filename: "drop.png",
      mimeType: "image/png",
      width: 640,
      height: 480,
    });
    expect(invalidateDashboardSnapshotForLastSignedInUserMock).toHaveBeenCalledTimes(1);
    expect(emitDashboardSnapshotCacheInvalidationSignalMock).toHaveBeenCalledTimes(1);
  });
});
