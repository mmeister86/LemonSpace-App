// @vitest-environment jsdom

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { CANVAS_NODE_DND_MIME } from "@/lib/canvas-connection-policy";
import { NODE_DEFAULTS } from "@/lib/canvas-utils";
import { useCanvasDrop } from "@/components/canvas/use-canvas-drop";

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/canvas/canvas-media-utils", () => ({
  getImageDimensions: vi.fn(async () => ({ width: 1600, height: 900 })),
}));

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDrop> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

type HookHarnessProps = {
  isSyncOnline?: boolean;
  generateUploadUrl?: ReturnType<typeof vi.fn>;
  runCreateNodeOnlineOnly?: ReturnType<typeof vi.fn>;
  notifyOfflineUnsupported?: ReturnType<typeof vi.fn>;
  syncPendingMoveForClientRequest?: ReturnType<typeof vi.fn>;
  screenToFlowPosition?: (position: { x: number; y: number }) => { x: number; y: number };
};

function HookHarness({
  isSyncOnline = true,
  generateUploadUrl = vi.fn(async () => "https://upload.test"),
  runCreateNodeOnlineOnly = vi.fn(async () => "node-1"),
  notifyOfflineUnsupported = vi.fn(),
  syncPendingMoveForClientRequest = vi.fn(async () => undefined),
  screenToFlowPosition = (position) => position,
}: HookHarnessProps) {
  const handlers = useCanvasDrop({
    canvasId: asCanvasId("canvas-1"),
    isSyncOnline,
    t: ((key: string) => key) as (key: string) => string,
    screenToFlowPosition,
    generateUploadUrl,
    runCreateNodeOnlineOnly,
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

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ storageId: "storage-1" }),
    })));
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "req-1"),
    });
  });

  afterEach(async () => {
    latestHandlersRef.current = null;
    vi.clearAllMocks();
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

    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://upload.test", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: file,
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
        filename: "photo.png",
        mimeType: "image/png",
        width: 1600,
        height: 900,
        canvasId: "canvas-1",
      },
      clientRequestId: "req-1",
    });
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledWith(
      "req-1",
      "node-image",
    );
  });
});
