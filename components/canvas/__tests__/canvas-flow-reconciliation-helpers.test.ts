import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import {
  reconcileCanvasFlowEdges,
  reconcileCanvasFlowNodes,
} from "@/components/canvas/canvas-flow-reconciliation-helpers";

const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;

describe("canvas flow reconciliation helpers", () => {
  it("carries an optimistic edge while a pending connection create awaits convex edge sync", () => {
    const previousEdges: RFEdge[] = [
      {
        id: "optimistic_edge_req-1",
        source: "node-source",
        target: "optimistic_req-1",
      },
    ];

    const result = reconcileCanvasFlowEdges({
      previousEdges,
      convexEdges: [],
      convexNodes: [
        { _id: asNodeId("node-source"), type: "image" },
        { _id: asNodeId("node-real"), type: "prompt" },
      ],
      previousConvexNodeIdsSnapshot: new Set(["node-source"]),
      pendingRemovedEdgeIds: new Set(),
      pendingConnectionCreateIds: new Set(["req-1"]),
      resolvedRealIdByClientRequest: new Map(),
      localNodeIds: new Set(["node-source"]),
      isAnyNodeDragging: false,
      colorMode: "light",
    });

    expect(result.edges).toEqual([
      {
        id: "optimistic_edge_req-1",
        source: "node-source",
        target: "node-real",
      },
    ]);
    expect(result.inferredRealIdByClientRequest).toEqual(
      new Map([["req-1", "node-real"]]),
    );
  });

  it("remaps optimistic endpoints to resolved real node ids", () => {
    const previousEdges: RFEdge[] = [
      {
        id: "optimistic_edge_req-2",
        source: "optimistic_req-2",
        target: "node-target",
      },
    ];

    const result = reconcileCanvasFlowEdges({
      previousEdges,
      convexEdges: [],
      convexNodes: [
        { _id: asNodeId("node-real"), type: "image" },
        { _id: asNodeId("node-target"), type: "prompt" },
      ],
      previousConvexNodeIdsSnapshot: new Set(["node-real", "node-target"]),
      pendingRemovedEdgeIds: new Set(),
      pendingConnectionCreateIds: new Set(),
      resolvedRealIdByClientRequest: new Map([["req-2", asNodeId("node-real")]]),
      localNodeIds: new Set(["node-target"]),
      isAnyNodeDragging: false,
      colorMode: "light",
    });

    expect(result.edges).toEqual([
      {
        id: "optimistic_edge_req-2",
        source: "node-real",
        target: "node-target",
      },
    ]);
  });

  it("cleans up matched local position pins once convex catches up", () => {
    const previousNodes: RFNode[] = [
      {
        id: "node-1",
        type: "image",
        position: { x: 120, y: 80 },
        data: {},
      },
    ];
    const incomingNodes: RFNode[] = [
      {
        id: "node-1",
        type: "image",
        position: { x: 120, y: 80 },
        data: {},
      },
    ];

    const result = reconcileCanvasFlowNodes({
      previousNodes,
      incomingNodes,
      convexNodes: [{ _id: asNodeId("node-1"), type: "image" }],
      deletingNodeIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map([["node-1", { x: 120, y: 80 }]]),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual(incomingNodes);
    expect(result.nextPendingLocalPositionPins.size).toBe(0);
  });
});
