// @vitest-environment jsdom

import React, { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Connection, Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";
import { useCanvasConnections } from "@/components/canvas/use-canvas-connections";

const {
  validateCanvasConnectionMock,
  validateCanvasConnectionByTypeMock,
  useCanvasReconnectHandlersMock,
  getConnectEndClientPointMock,
} = vi.hoisted(() => ({
  validateCanvasConnectionMock: vi.fn(),
  validateCanvasConnectionByTypeMock: vi.fn(),
  useCanvasReconnectHandlersMock: vi.fn(),
  getConnectEndClientPointMock: vi.fn(),
}));

vi.mock("@/components/canvas/canvas-connection-validation", () => ({
  validateCanvasConnection: validateCanvasConnectionMock,
  validateCanvasConnectionByType: validateCanvasConnectionByTypeMock,
}));

vi.mock("@/components/canvas/canvas-reconnect", () => ({
  useCanvasReconnectHandlers: useCanvasReconnectHandlersMock,
}));

vi.mock("@/components/canvas/canvas-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/canvas/canvas-helpers")
  >("@/components/canvas/canvas-helpers");

  return {
    ...actual,
    getConnectEndClientPoint: getConnectEndClientPointMock,
  };
});

const asCanvasId = (id: string): Id<"canvases"> => id as Id<"canvases">;
const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;

type HarnessProps = {
  nodes: RFNode[];
  edges: RFEdge[];
  runCreateEdgeMutation?: ReturnType<typeof vi.fn>;
  runRemoveEdgeMutation?: ReturnType<typeof vi.fn>;
  runCreateNodeWithEdgeFromSourceOnlineOnly?: ReturnType<typeof vi.fn>;
  runCreateNodeWithEdgeToTargetOnlineOnly?: ReturnType<typeof vi.fn>;
  syncPendingMoveForClientRequest?: ReturnType<typeof vi.fn>;
  showConnectionRejectedToast?: ReturnType<typeof vi.fn>;
  isReconnectDragActive?: boolean;
};

const latestHookRef: {
  current: ReturnType<typeof useCanvasConnections> | null;
} = { current: null };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness(props: HarnessProps) {
  const nodesRef = useRef(props.nodes);
  const edgesRef = useRef(props.edges);
  const pendingConnectionCreatesRef = useRef(new Set<string>());
  const resolvedRealIdByClientRequestRef = useRef(new Map<string, Id<"nodes">>());
  const edgeReconnectSuccessful = useRef(true);
  const isReconnectDragActiveRef = useRef(Boolean(props.isReconnectDragActive));

  useEffect(() => {
    nodesRef.current = props.nodes;
    edgesRef.current = props.edges;
  }, [props.edges, props.nodes]);

  const hookValue = useCanvasConnections({
    canvasId: asCanvasId("canvas-1"),
    nodes: props.nodes,
    edges: props.edges,
    nodesRef,
    edgesRef,
    edgeReconnectSuccessful,
    isReconnectDragActiveRef,
    pendingConnectionCreatesRef,
    resolvedRealIdByClientRequestRef,
    setEdges: vi.fn(),
    setEdgeSyncNonce: vi.fn(),
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 10, y: y - 20 }),
    syncPendingMoveForClientRequest:
      props.syncPendingMoveForClientRequest ?? vi.fn(async () => undefined),
    runCreateEdgeMutation: props.runCreateEdgeMutation ?? vi.fn(async () => undefined),
    runRemoveEdgeMutation: props.runRemoveEdgeMutation ?? vi.fn(async () => undefined),
    runCreateNodeWithEdgeFromSourceOnlineOnly:
      props.runCreateNodeWithEdgeFromSourceOnlineOnly ?? vi.fn(async () => asNodeId("node-new")),
    runCreateNodeWithEdgeToTargetOnlineOnly:
      props.runCreateNodeWithEdgeToTargetOnlineOnly ?? vi.fn(async () => asNodeId("node-new")),
    showConnectionRejectedToast:
      props.showConnectionRejectedToast ?? vi.fn(),
  });

  useEffect(() => {
    latestHookRef.current = hookValue;
  }, [hookValue]);

  return null;
}

describe("useCanvasConnections", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    validateCanvasConnectionMock.mockReturnValue(null);
    validateCanvasConnectionByTypeMock.mockReturnValue(null);
    getConnectEndClientPointMock.mockReturnValue({ x: 140, y: 220 });
    useCanvasReconnectHandlersMock.mockReturnValue({
      onReconnectStart: vi.fn(),
      onReconnect: vi.fn(),
      onReconnectEnd: vi.fn(),
    });
  });

  afterEach(async () => {
    latestHookRef.current = null;
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

  async function renderHook(props: HarnessProps) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<HookHarness {...props} />);
    });
  }

  it("creates a valid edge through centralized validation", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);

    await renderHook({
      nodes: [
        { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
        { id: "node-text", type: "text", position: { x: 10, y: 10 }, data: {} },
      ],
      edges: [],
      runCreateEdgeMutation,
    });

    const connection: Connection = {
      source: "node-image",
      target: "node-text",
      sourceHandle: null,
      targetHandle: null,
    };

    await act(async () => {
      latestHookRef.current?.onConnect(connection);
    });

    expect(validateCanvasConnectionMock).toHaveBeenCalledWith(connection, expect.any(Array), []);
    expect(runCreateEdgeMutation).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      sourceNodeId: "node-image",
      targetNodeId: "node-text",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
  });

  it("rejects invalid connections without mutating edges", async () => {
    const runCreateEdgeMutation = vi.fn(async () => undefined);
    const showConnectionRejectedToast = vi.fn();
    validateCanvasConnectionMock.mockReturnValue("self-loop");

    await renderHook({
      nodes: [
        { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      runCreateEdgeMutation,
      showConnectionRejectedToast,
    });

    await act(async () => {
      latestHookRef.current?.onConnect({
        source: "node-image",
        target: "node-image",
        sourceHandle: null,
        targetHandle: null,
      });
    });

    expect(showConnectionRejectedToast).toHaveBeenCalledWith("self-loop");
    expect(runCreateEdgeMutation).not.toHaveBeenCalled();
  });

  it("opens the connection drop menu from an invalid connect end", async () => {
    await renderHook({
      nodes: [
        { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    await act(async () => {
      latestHookRef.current?.onConnectEnd({} as MouseEvent, {
        isValid: false,
        fromNode: { id: "node-image" },
        fromHandle: { id: "source", type: "source" },
      } as never);
    });

    expect(latestHookRef.current?.connectionDropMenu).toEqual({
      screenX: 140,
      screenY: 220,
      flowX: 130,
      flowY: 200,
      fromNodeId: "node-image",
      fromHandleId: "source",
      fromHandleType: "source",
    });
  });

  it("routes connection-drop creation through type validation and source creation", async () => {
    const runCreateNodeWithEdgeFromSourceOnlineOnly = vi.fn(async () => asNodeId("node-new"));
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);

    await renderHook({
      nodes: [
        { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      runCreateNodeWithEdgeFromSourceOnlineOnly,
      syncPendingMoveForClientRequest,
    });

    await act(async () => {
      latestHookRef.current?.onConnectEnd({} as MouseEvent, {
        isValid: false,
        fromNode: { id: "node-image" },
        fromHandle: { id: "source", type: "source" },
      } as never);
    });

    const template = {
      ...CANVAS_NODE_TEMPLATES.find((entry) => entry.type === "text")!,
      defaultData: { content: "Hello" },
    } as unknown as CanvasNodeTemplate;

    await act(async () => {
      latestHookRef.current?.handleConnectionDropPick(template);
      await Promise.resolve();
    });

    expect(validateCanvasConnectionByTypeMock).toHaveBeenCalledWith({
      sourceType: "image",
      targetType: "text",
      targetNodeId: expect.stringMatching(/^__pending_text_/),
      edges: [],
    });
    expect(runCreateNodeWithEdgeFromSourceOnlineOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasId: "canvas-1",
        type: "text",
        positionX: 130,
        positionY: 200,
        sourceNodeId: "node-image",
        sourceHandle: "source",
        data: expect.objectContaining({
          canvasId: "canvas-1",
          content: "Hello",
        }),
      }),
    );
    expect(syncPendingMoveForClientRequest).toHaveBeenCalled();
  });

  it("adapts reconnect handlers through the shared connection validation", async () => {
    const showConnectionRejectedToast = vi.fn();

    await renderHook({
      nodes: [
        { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
        { id: "node-text", type: "text", position: { x: 10, y: 10 }, data: {} },
      ],
      edges: [{ id: "edge-1", source: "node-image", target: "node-text" }],
      showConnectionRejectedToast,
    });

    const reconnectArgs = useCanvasReconnectHandlersMock.mock.calls[0][0];
    const reconnectValidation = reconnectArgs.validateConnection(
      { id: "edge-1", source: "node-image", target: "node-text" },
      { source: "node-image", target: "node-text" },
    );

    reconnectArgs.onInvalidConnection("unknown-node");

    expect(validateCanvasConnectionMock).toHaveBeenCalledWith(
      { source: "node-image", target: "node-text" },
      expect.any(Array),
      expect.any(Array),
      "edge-1",
    );
    expect(reconnectValidation).toBeNull();
    expect(showConnectionRejectedToast).toHaveBeenCalledWith("unknown-node");
    expect(latestHookRef.current?.onReconnect).toBe(
      useCanvasReconnectHandlersMock.mock.results[0]?.value.onReconnect,
    );
  });
});
