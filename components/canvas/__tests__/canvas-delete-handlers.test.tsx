// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const toastInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/toast", () => ({
  toast: {
    warning: vi.fn(),
    info: toastInfoMock,
  },
}));

import { useCanvasDeleteHandlers } from "@/components/canvas/canvas-delete-handlers";

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDeleteHandlers> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookHarnessProps = {
  runBatchRemoveNodesMutation: ReturnType<typeof vi.fn>;
  runCreateEdgeMutation: ReturnType<typeof vi.fn>;
};

function HookHarness({
  runBatchRemoveNodesMutation,
  runCreateEdgeMutation,
}: HookHarnessProps) {
  const [nodes] = useState<RFNode[]>([
    { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
    { id: "node-middle", type: "note", position: { x: 120, y: 0 }, data: {} },
    { id: "node-target", type: "text", position: { x: 240, y: 0 }, data: {} },
  ]);
  const [edges] = useState<RFEdge[]>([
    { id: "edge-source-middle", source: "node-source", target: "node-middle" },
    { id: "edge-middle-target", source: "node-middle", target: "node-target" },
  ]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const deletingNodeIds = useRef(new Set<string>());
  const [, setAssetBrowserTargetNodeId] = useState<string | null>(null);

  const handlers = useCanvasDeleteHandlers({
    t: ((key: string) => key) as never,
    canvasId: asCanvasId("canvas-1"),
    nodesRef,
    edgesRef,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation,
    runCreateEdgeMutation,
    runRemoveEdgeMutation: vi.fn(async () => undefined),
  });

  useEffect(() => {
    latestHandlersRef.current = handlers;
  }, [handlers]);

  return null;
}

describe("useCanvasDeleteHandlers", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    latestHandlersRef.current = null;
    vi.useRealTimers();
    vi.clearAllMocks();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("retries bridge edge creation when the first create fails", async () => {
    vi.useFakeTimers();
    const runBatchRemoveNodesMutation = vi.fn(async () => undefined);
    const runCreateEdgeMutation = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error("incoming limit reached"));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <HookHarness
          runBatchRemoveNodesMutation={runBatchRemoveNodesMutation}
          runCreateEdgeMutation={runCreateEdgeMutation}
        />,
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([
        {
          id: "node-middle",
          type: "note",
          position: { x: 120, y: 0 },
          data: {},
        },
      ]);
      await Promise.resolve();
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runBatchRemoveNodesMutation).toHaveBeenCalledTimes(1);
    expect(runCreateEdgeMutation).toHaveBeenCalledTimes(2);
    expect(toastInfoMock).toHaveBeenCalledWith("canvas.nodesRemoved");
  });
});
