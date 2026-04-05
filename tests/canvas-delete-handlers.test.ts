// @vitest-environment jsdom

import React, { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { useCanvasDeleteHandlers } from "@/components/canvas/canvas-delete-handlers";

vi.mock("@/lib/toast", () => ({
  toast: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;

const latestHandlersRef: {
  current: ReturnType<typeof useCanvasDeleteHandlers> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HarnessProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  runBatchRemoveNodesMutation: ReturnType<typeof vi.fn>;
  runCreateEdgeMutation: ReturnType<typeof vi.fn>;
};

function HookHarness(props: HarnessProps) {
  const deletingNodeIds = useRef(new Set<string>());
  const [, setAssetBrowserTargetNodeId] = useState<string | null>(null);

  const handlers = useCanvasDeleteHandlers({
    t: ((key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key) as never,
    canvasId: asCanvasId("canvas-1"),
    nodes: props.nodes,
    edges: props.edges,
    deletingNodeIds,
    setAssetBrowserTargetNodeId,
    runBatchRemoveNodesMutation: props.runBatchRemoveNodesMutation,
    runCreateEdgeMutation: props.runCreateEdgeMutation,
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

  it("creates bridge edges only after batch node removal resolves", async () => {
    let resolveBatchRemove: (() => void) | null = null;
    const runBatchRemoveNodesMutation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBatchRemove = resolve;
        }),
    );
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    const imageNode: RFNode = { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} };
    const deletedNode: RFNode = {
      id: "node-color",
      type: "color-adjust",
      position: { x: 200, y: 0 },
      data: {},
    };
    const renderNode: RFNode = { id: "node-render", type: "render", position: { x: 400, y: 0 }, data: {} };

    const edges: RFEdge[] = [
      { id: "edge-in", source: "node-image", target: "node-color" },
      { id: "edge-out", source: "node-color", target: "node-render" },
    ];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(HookHarness, {
          nodes: [imageNode, deletedNode, renderNode],
          edges,
          runBatchRemoveNodesMutation,
          runCreateEdgeMutation,
        }),
      );
    });

    await act(async () => {
      latestHandlersRef.current?.onNodesDelete([deletedNode]);
    });

    expect(runBatchRemoveNodesMutation).toHaveBeenCalledWith({
      nodeIds: ["node-color"],
    });
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();

    await act(async () => {
      resolveBatchRemove?.();
      await Promise.resolve();
    });

    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-image",
      targetNodeId: "node-render",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
  });
});
