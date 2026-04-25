// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  ungroupNodes: vi.fn(async () => undefined),
  notifyOfflineUnsupported: vi.fn(),
  getNodes: vi.fn(() => [] as RFNode[]),
  setNodes: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  NodeToolbar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="node-toolbar">{children}</div>
  ),
  NodeResizeControl: () => null,
  Position: { Left: "left", Right: "right", Top: "top" },
  useNodeId: () => "group-1",
  useReactFlow: () => ({
    getNode: vi.fn(() => ({ id: "group-1", data: {} })),
    getNodes: mocks.getNodes,
    getEdges: vi.fn(() => []),
    setNodes: mocks.setNodes,
    deleteElements: vi.fn(async () => undefined),
  }),
  getConnectedEdges: () => [],
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    ungroupNodes: mocks.ungroupNodes,
    notifyOfflineUnsupported: mocks.notifyOfflineUnsupported,
    status: {
      pendingCount: 0,
      isSyncing: false,
      isOffline: false,
    },
  }),
}));

vi.mock("@/components/canvas/canvas-placement-context", () => ({
  useCanvasPlacement: () => ({
    createNodeWithIntersection: vi.fn(async () => undefined),
  }),
}));

import GroupNode from "@/components/canvas/nodes/group-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("GroupNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    mocks.ungroupNodes.mockClear();
    mocks.notifyOfflineUnsupported.mockClear();
    mocks.getNodes.mockReset();
    mocks.setNodes.mockClear();
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

  it("exposes an ungroup toolbar action and moves direct children to the group parent", async () => {
    mocks.getNodes.mockReturnValue([
      {
        id: "parent-group",
        type: "group",
        position: { x: 100, y: 100 },
        style: { width: 300, height: 240 },
        data: {},
      },
      {
        id: "group-1",
        type: "group",
        parentId: "parent-group",
        position: { x: 30, y: 40 },
        style: { width: 200, height: 160 },
        data: {},
      },
      {
        id: "node-child",
        type: "image",
        parentId: "group-1",
        position: { x: 10, y: 20 },
        style: { width: 80, height: 40 },
        data: {},
      },
    ]);

    await act(async () => {
      root?.render(
        <GroupNode
          id="group-1"
          type="group"
          data={{ label: "Gruppe" }}
          selected
          dragging={false}
          selectable
          deletable
          draggable
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />,
      );
    });

    const ungroupButton = container?.querySelector('button[title="Ungroup"]');
    expect(ungroupButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      ungroupButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.ungroupNodes).toHaveBeenCalledWith({
      groupNodeIds: ["group-1"],
      childPositions: [
        {
          nodeId: "node-child",
          parentId: "parent-group",
          positionX: 40,
          positionY: 60,
        },
      ],
    });
  });

  it("calls ungroup mutation without applying a delayed local node update", async () => {
    const nodes: RFNode[] = [
      {
        id: "parent-group",
        type: "group",
        position: { x: 100, y: 100 },
        style: { width: 300, height: 240 },
        data: {},
      },
      {
        id: "group-1",
        type: "group",
        parentId: "parent-group",
        position: { x: 30, y: 40 },
        style: { width: 200, height: 160 },
        data: {},
        zIndex: 20,
      },
      {
        id: "node-child",
        type: "image",
        parentId: "group-1",
        position: { x: 10, y: 20 },
        style: { width: 80, height: 40 },
        data: {},
        zIndex: 1,
      },
    ];
    mocks.getNodes.mockReturnValue(nodes);

    await act(async () => {
      root?.render(
        <GroupNode
          id="group-1"
          type="group"
          data={{ label: "Gruppe" }}
          selected
          dragging={false}
          selectable
          deletable
          draggable
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />,
      );
    });

    const ungroupButton = container?.querySelector('button[title="Ungroup"]');
    expect(ungroupButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      ungroupButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.ungroupNodes).toHaveBeenCalledWith({
      groupNodeIds: ["group-1"],
      childPositions: [
        {
          nodeId: "node-child",
          parentId: "parent-group",
          positionX: 40,
          positionY: 60,
        },
      ],
    });
    expect(mocks.setNodes).not.toHaveBeenCalled();
  });
});
