// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  selectedNodes: [] as RFNode[],
  getNodes: vi.fn(() => [] as RFNode[]),
  setNodes: vi.fn(),
  createGroupFromSelection: vi.fn(async () => "group-new" as Id<"nodes">),
  ungroupNodes: vi.fn(async () => undefined),
  notifyOfflineUnsupported: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  NodeToolbar: ({
    children,
    isVisible,
  }: {
    children: React.ReactNode;
    isVisible?: boolean;
  }) => (isVisible === false ? null : <div data-testid="selection-toolbar">{children}</div>),
  Position: { Top: "top" },
  useOnSelectionChange: ({ onChange }: { onChange: (selection: { nodes: RFNode[] }) => void }) => {
    React.useEffect(() => {
      onChange({ nodes: mocks.selectedNodes });
    }, [onChange]);
  },
  useReactFlow: () => ({
    getNodes: mocks.getNodes,
    setNodes: mocks.setNodes,
  }),
}));

import { CanvasSelectionToolbar } from "@/components/canvas/canvas-selection-toolbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasSelectionToolbar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.selectedNodes = [];
    mocks.getNodes.mockReset();
    mocks.getNodes.mockReturnValue([]);
    mocks.setNodes.mockClear();
    mocks.createGroupFromSelection.mockClear();
    mocks.createGroupFromSelection.mockResolvedValue("group-new" as Id<"nodes">);
    mocks.ungroupNodes.mockClear();
    mocks.notifyOfflineUnsupported.mockClear();
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

  async function renderToolbar(nodes: RFNode[], options: { online?: boolean } = {}) {
    mocks.selectedNodes = nodes.filter((node) => node.selected);
    mocks.getNodes.mockReturnValue(nodes);
    await act(async () => {
      root?.render(
        <CanvasSelectionToolbar
          canvasId={"canvas-1" as Id<"canvases">}
          disabled={false}
          isSyncOnline={options.online ?? true}
          createGroupFromSelection={mocks.createGroupFromSelection}
          ungroupNodes={mocks.ungroupNodes}
          notifyOfflineUnsupported={mocks.notifyOfflineUnsupported}
        />,
      );
    });
  }

  it("renders group action only for two or more effective selected roots", async () => {
    await renderToolbar([
      { id: "node-a", type: "image", position: { x: 0, y: 0 }, data: {}, selected: true },
    ]);
    expect(container?.querySelector('button[title="Group"]')).toBeFalsy();

    await renderToolbar([
      { id: "node-a", type: "image", position: { x: 0, y: 0 }, data: {}, selected: true },
      { id: "node-b", type: "text", position: { x: 200, y: 0 }, data: {}, selected: true },
    ]);
    expect(container?.querySelector('button[title="Group"]')).toBeTruthy();
  });

  it("calls create group mutation with padded bounds and relative child positions", async () => {
    await renderToolbar([
      {
        id: "node-a",
        type: "image",
        position: { x: 100, y: 120 },
        style: { width: 80, height: 40 },
        data: {},
        selected: true,
        zIndex: 4,
      },
      {
        id: "node-b",
        type: "text",
        position: { x: 260, y: 180 },
        style: { width: 120, height: 90 },
        data: {},
        selected: true,
        zIndex: 5,
      },
    ]);

    const groupButton = container?.querySelector('button[title="Group"]');
    if (!(groupButton instanceof HTMLButtonElement)) throw new Error("Group button not found");

    await act(async () => {
      groupButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.createGroupFromSelection).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      nodeIds: ["node-a", "node-b"],
      group: {
        positionX: 76,
        positionY: 76,
        width: 328,
        height: 218,
        label: "Gruppe",
        zIndex: 3,
        clientRequestId: expect.any(String),
      },
      childPositions: [
        { nodeId: "node-a", positionX: 24, positionY: 44 },
        { nodeId: "node-b", positionX: 184, positionY: 104 },
      ],
    });
    expect(mocks.setNodes).not.toHaveBeenCalled();
  });

  it("does not apply a delayed local grouping result", async () => {
    const nodes: RFNode[] = [
      {
        id: "node-a",
        type: "image",
        position: { x: 100, y: 120 },
        style: { width: 80, height: 40 },
        data: {},
        selected: true,
      },
      {
        id: "node-b",
        type: "text",
        position: { x: 260, y: 180 },
        style: { width: 120, height: 90 },
        data: {},
        selected: true,
      },
    ];
    await renderToolbar(nodes);

    const groupButton = container?.querySelector('button[title="Group"]');
    if (!(groupButton instanceof HTMLButtonElement)) throw new Error("Group button not found");

    await act(async () => {
      groupButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.createGroupFromSelection).toHaveBeenCalledTimes(1);
    expect(mocks.setNodes).not.toHaveBeenCalled();
  });

  it("disables grouping when selected nodes include optimistic ids", async () => {
    await renderToolbar([
      {
        id: "optimistic_req-1",
        type: "image",
        position: { x: 0, y: 0 },
        style: { width: 80, height: 40 },
        data: {},
        selected: true,
      },
      {
        id: "node-b",
        type: "text",
        position: { x: 200, y: 0 },
        style: { width: 120, height: 90 },
        data: {},
        selected: true,
      },
    ]);

    const groupButton = container?.querySelector('button[title="Group"]');
    expect(groupButton).toBeInstanceOf(HTMLButtonElement);
    expect((groupButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("handles selected group nodes as groupable roots", async () => {
    await renderToolbar([
      {
        id: "group-a",
        type: "group",
        position: { x: 0, y: 0 },
        style: { width: 200, height: 160 },
        data: {},
        selected: true,
      },
      {
        id: "node-b",
        type: "image",
        position: { x: 260, y: 0 },
        style: { width: 120, height: 90 },
        data: {},
        selected: true,
      },
    ]);

    expect(container?.querySelector('button[title="Group"]')).toBeTruthy();
  });

  it("calls ungroup mutation without applying a delayed local node update", async () => {
    const nodes: RFNode[] = [
      {
        id: "group-a",
        type: "group",
        position: { x: 20, y: 30 },
        style: { width: 200, height: 160 },
        data: {},
        selected: true,
        zIndex: 20,
      },
      {
        id: "node-child",
        type: "image",
        parentId: "group-a",
        position: { x: 12, y: 18 },
        style: { width: 80, height: 40 },
        data: {},
        zIndex: 1,
      },
      {
        id: "node-b",
        type: "text",
        position: { x: 300, y: 30 },
        style: { width: 120, height: 90 },
        data: {},
        selected: true,
      },
    ];
    await renderToolbar(nodes);

    const ungroupButton = container?.querySelector('button[title="Ungroup"]');
    if (!(ungroupButton instanceof HTMLButtonElement)) {
      throw new Error("Ungroup button not found");
    }

    await act(async () => {
      ungroupButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.ungroupNodes).toHaveBeenCalledWith({
      groupNodeIds: ["group-a"],
      childPositions: [
        {
          nodeId: "node-child",
          parentId: undefined,
          positionX: 32,
          positionY: 48,
        },
      ],
    });
    expect(mocks.setNodes).not.toHaveBeenCalled();
  });
});
