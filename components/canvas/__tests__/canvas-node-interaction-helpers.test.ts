import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  computeResizeChangesToPersist,
  updateResizeInteractionState,
} from "@/components/canvas/canvas-node-resize-persistence";
import {
  findOverlappingGroupTarget,
  markGroupDropTarget,
} from "@/components/canvas/canvas-node-group-drop-target";
import { computeParentChangeForNode } from "@/components/canvas/canvas-node-parent-changes";
import {
  buildPendingEdgeSplit,
  getEffectiveSplitMiddleNode,
  getSplitCandidateEdge,
} from "@/components/canvas/canvas-edge-intersection-split";

describe("canvas node interaction helpers", () => {
  it("tracks resize interaction state and persists only completed dimensions", () => {
    const isResizing = { current: false };
    const historyCaptured = { current: false };
    let historyCaptures = 0;

    updateResizeInteractionState(
      [
        { type: "dimensions", id: "node-a", resizing: true },
        {
          type: "dimensions",
          id: "node-a",
          resizing: false,
          dimensions: { width: 180, height: 120 },
        },
      ],
      isResizing,
      historyCaptured,
      () => {
        historyCaptures += 1;
      },
    );

    expect(isResizing.current).toBe(false);
    expect(historyCaptured.current).toBe(false);
    expect(historyCaptures).toBe(1);
    expect(
      computeResizeChangesToPersist(
        [
          {
            type: "dimensions",
            id: "node-a",
            resizing: false,
            dimensions: { width: 180, height: 120 },
          },
          {
            type: "dimensions",
            id: "node-b",
            resizing: true,
            dimensions: { width: 80, height: 60 },
          },
          {
            type: "dimensions",
            id: "node-c",
            resizing: false,
            dimensions: { width: 10, height: 10 },
          },
        ],
        new Set(["node-c"]),
      ),
    ).toEqual([{ nodeId: "node-a", width: 180, height: 120 }]);
  });

  it("selects the deepest overlapping group target and marks it", () => {
    const nodes: RFNode[] = [
      {
        id: "outer",
        type: "group",
        position: { x: 0, y: 0 },
        style: { width: 300, height: 300 },
        data: {},
      },
      {
        id: "inner",
        type: "group",
        parentId: "outer",
        position: { x: 50, y: 50 },
        style: { width: 180, height: 180 },
        data: {},
      },
      {
        id: "dragged",
        type: "image",
        position: { x: 80, y: 80 },
        style: { width: 40, height: 40 },
        data: {},
      },
    ];

    expect(findOverlappingGroupTarget(nodes[2], nodes)?.id).toBe("inner");
    expect(markGroupDropTarget(nodes, "inner").find((node) => node.id === "inner")?.data).toMatchObject({
      _groupDropTarget: true,
    });
  });

  it("computes relative parent assignment and absolute ungroup positions", () => {
    const group: RFNode = {
      id: "group",
      type: "group",
      position: { x: 100, y: 100 },
      style: { width: 200, height: 200 },
      data: {},
    };
    const overlappingNode: RFNode = {
      id: "image",
      type: "image",
      position: { x: 120, y: 140 },
      style: { width: 80, height: 80 },
      data: {},
    };
    const outsideChild: RFNode = {
      ...overlappingNode,
      parentId: "group",
      position: { x: 260, y: 260 },
    };

    expect(computeParentChangeForNode(overlappingNode, [group, overlappingNode])).toEqual({
      nodeId: "image",
      parentId: "group",
      position: { x: 20, y: 40 },
    });
    expect(computeParentChangeForNode(outsideChild, [group, outsideChild])).toEqual({
      nodeId: "image",
      parentId: undefined,
      position: { x: 360, y: 360 },
    });
  });

  it("resolves optimistic split nodes and builds pending split payloads", () => {
    const node: RFNode = {
      id: "optimistic_req-1",
      type: "image",
      position: { x: 10, y: 20 },
      data: {},
    };
    const edge: RFEdge = {
      id: "edge-a",
      source: "source",
      sourceHandle: "source-out",
      target: "target",
      targetHandle: "target-in",
    };

    expect(getEffectiveSplitMiddleNode(node, new Map([["req-1", "node-real"]]))).toMatchObject({
      id: "node-real",
    });
    expect(getSplitCandidateEdge("edge-a", [edge])).toBe(edge);
    expect(
      buildPendingEdgeSplit({
        intersectedEdge: edge,
        splitHandles: { source: "middle-out", target: "middle-in" },
        position: node.position,
      }),
    ).toEqual({
      intersectedEdgeId: "edge-a",
      sourceNodeId: "source",
      targetNodeId: "target",
      intersectedSourceHandle: "source-out",
      intersectedTargetHandle: "target-in",
      middleSourceHandle: "middle-out",
      middleTargetHandle: "middle-in",
      positionX: 10,
      positionY: 20,
    });
  });
});
