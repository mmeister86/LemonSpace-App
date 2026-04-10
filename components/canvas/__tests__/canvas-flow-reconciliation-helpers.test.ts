import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import {
  reconcileCanvasFlowEdges,
  reconcileCanvasFlowNodes,
} from "@/components/canvas/canvas-flow-reconciliation-helpers";

const asNodeId = (id: string): Id<"nodes"> => id as Id<"nodes">;
const asEdgeId = (id: string) => id as Id<"edges">;

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

  it("suppresses carried optimistic edges when convex already has the same connection signature", () => {
    const result = reconcileCanvasFlowEdges({
      previousEdges: [
        {
          id: "optimistic_edge_req-3",
          source: "optimistic_req-3",
          target: "node-target",
        },
      ],
      convexEdges: [
        {
          _id: asEdgeId("edge-1"),
          sourceNodeId: asNodeId("node-real"),
          targetNodeId: asNodeId("node-target"),
          sourceHandle: undefined,
          targetHandle: undefined,
        },
      ],
      convexNodes: [
        { _id: asNodeId("node-real"), type: "image" },
        { _id: asNodeId("node-target"), type: "prompt" },
      ],
      previousConvexNodeIdsSnapshot: new Set(["node-real", "node-target"]),
      pendingRemovedEdgeIds: new Set(),
      pendingConnectionCreateIds: new Set(),
      resolvedRealIdByClientRequest: new Map([["req-3", asNodeId("node-real")]]),
      localNodeIds: new Set(),
      isAnyNodeDragging: false,
      colorMode: "light",
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      id: "edge-1",
      source: "node-real",
      target: "node-target",
    });
  });

  it("preserves temp edges while filtering pending removed convex edges", () => {
    const result = reconcileCanvasFlowEdges({
      previousEdges: [
        {
          id: "temp-edge-1",
          source: "node-a",
          target: "node-b",
          className: "temp",
        },
      ],
      convexEdges: [
        {
          _id: asEdgeId("edge-removed"),
          sourceNodeId: asNodeId("node-a"),
          targetNodeId: asNodeId("node-b"),
          sourceHandle: undefined,
          targetHandle: undefined,
        },
      ],
      convexNodes: [
        { _id: asNodeId("node-a"), type: "image" },
        { _id: asNodeId("node-b"), type: "prompt" },
      ],
      previousConvexNodeIdsSnapshot: new Set(["node-a", "node-b"]),
      pendingRemovedEdgeIds: new Set(["edge-removed"]),
      pendingConnectionCreateIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      localNodeIds: new Set(),
      isAnyNodeDragging: false,
      colorMode: "light",
    });

    expect(result.edges).toEqual([
      {
        id: "temp-edge-1",
        source: "node-a",
        target: "node-b",
        className: "temp",
      },
    ]);
  });

  it("keeps optimistic endpoints for local dragging nodes and still carries the edge", () => {
    const result = reconcileCanvasFlowEdges({
      previousEdges: [
        {
          id: "optimistic_edge_req-drag",
          source: "node-source",
          target: "optimistic_req-drag",
        },
      ],
      convexEdges: [],
      convexNodes: [{ _id: asNodeId("node-source"), type: "image" }],
      previousConvexNodeIdsSnapshot: new Set(["node-source"]),
      pendingRemovedEdgeIds: new Set(),
      pendingConnectionCreateIds: new Set(["req-drag"]),
      resolvedRealIdByClientRequest: new Map([["req-drag", asNodeId("node-real")]]),
      localNodeIds: new Set(["optimistic_req-drag"]),
      isAnyNodeDragging: true,
      colorMode: "light",
    });

    expect(result.edges).toEqual([
      {
        id: "optimistic_edge_req-drag",
        source: "node-source",
        target: "optimistic_req-drag",
      },
    ]);
  });

  it("reports settled pending connection creates once convex has the real node and edge", () => {
    const result = reconcileCanvasFlowEdges({
      previousEdges: [],
      convexEdges: [
        {
          _id: asEdgeId("edge-settled"),
          sourceNodeId: asNodeId("node-source"),
          targetNodeId: asNodeId("node-real"),
          sourceHandle: undefined,
          targetHandle: undefined,
        },
      ],
      convexNodes: [
        { _id: asNodeId("node-source"), type: "image" },
        { _id: asNodeId("node-real"), type: "prompt" },
      ],
      previousConvexNodeIdsSnapshot: new Set(["node-source", "node-real"]),
      pendingRemovedEdgeIds: new Set(),
      pendingConnectionCreateIds: new Set(["req-settled"]),
      resolvedRealIdByClientRequest: new Map([
        ["req-settled", asNodeId("node-real")],
      ]),
      localNodeIds: new Set(),
      isAnyNodeDragging: false,
      colorMode: "light",
    });

    expect(result.settledPendingConnectionCreateIds).toEqual(["req-settled"]);
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

  it("keeps pinned local node data until convex catches up", () => {
    const pinnedData = { blackPoint: 209, whitePoint: 255 };
    const staleIncomingData = { blackPoint: 124, whitePoint: 255 };

    const result = reconcileCanvasFlowNodes({
      previousNodes: [
        {
          id: "node-1",
          type: "curves",
          position: { x: 120, y: 80 },
          data: pinnedData,
        },
      ],
      incomingNodes: [
        {
          id: "node-1",
          type: "curves",
          position: { x: 120, y: 80 },
          data: staleIncomingData,
        },
      ],
      convexNodes: [{ _id: asNodeId("node-1"), type: "curves" }],
      deletingNodeIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map(),
      pendingLocalNodeDataPins: new Map([["node-1", pinnedData]]),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual([
      {
        id: "node-1",
        type: "curves",
        position: { x: 120, y: 80 },
        data: pinnedData,
      },
    ]);
    expect(result.nextPendingLocalNodeDataPins).toEqual(
      new Map([["node-1", pinnedData]]),
    );
  });

  it("clears pinned local node data once incoming data includes the persisted values", () => {
    const pinnedData = { blackPoint: 209, whitePoint: 255 };
    const incomingData = {
      blackPoint: 209,
      whitePoint: 255,
      _status: "idle",
    };

    const result = reconcileCanvasFlowNodes({
      previousNodes: [
        {
          id: "node-1",
          type: "curves",
          position: { x: 120, y: 80 },
          data: pinnedData,
        },
      ],
      incomingNodes: [
        {
          id: "node-1",
          type: "curves",
          position: { x: 120, y: 80 },
          data: incomingData,
        },
      ],
      convexNodes: [{ _id: asNodeId("node-1"), type: "curves" }],
      deletingNodeIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map(),
      pendingLocalNodeDataPins: new Map([["node-1", pinnedData]]),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual([
      {
        id: "node-1",
        type: "curves",
        position: { x: 120, y: 80 },
        data: incomingData,
      },
    ]);
    expect(result.nextPendingLocalNodeDataPins.size).toBe(0);
  });

  it("keeps pinned local node size until convex catches up", () => {
    const pinnedSize = { width: 419, height: 466 };

    const result = reconcileCanvasFlowNodes({
      previousNodes: [
        {
          id: "node-1",
          type: "render",
          position: { x: 120, y: 80 },
          data: {},
          style: pinnedSize,
        },
      ],
      incomingNodes: [
        {
          id: "node-1",
          type: "render",
          position: { x: 120, y: 80 },
          data: {},
          style: { width: 640, height: 360 },
        },
      ],
      convexNodes: [{ _id: asNodeId("node-1"), type: "render" }],
      deletingNodeIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map(),
      pendingLocalNodeSizePins: new Map([["node-1", pinnedSize]]),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual([
      {
        id: "node-1",
        type: "render",
        position: { x: 120, y: 80 },
        data: {},
        style: pinnedSize,
      },
    ]);
    expect(result.nextPendingLocalNodeSizePins).toEqual(
      new Map([["node-1", pinnedSize]]),
    );
  });

  it("clears pinned local node size once convex matches the persisted size", () => {
    const pinnedSize = { width: 419, height: 466 };

    const result = reconcileCanvasFlowNodes({
      previousNodes: [
        {
          id: "node-1",
          type: "render",
          position: { x: 120, y: 80 },
          data: {},
          style: pinnedSize,
        },
      ],
      incomingNodes: [
        {
          id: "node-1",
          type: "render",
          position: { x: 120, y: 80 },
          data: {},
          style: pinnedSize,
        },
      ],
      convexNodes: [{ _id: asNodeId("node-1"), type: "render" }],
      deletingNodeIds: new Set(),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map(),
      pendingLocalNodeSizePins: new Map([["node-1", pinnedSize]]),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual([
      {
        id: "node-1",
        type: "render",
        position: { x: 120, y: 80 },
        data: {},
        style: pinnedSize,
      },
    ]);
    expect(result.nextPendingLocalNodeSizePins.size).toBe(0);
  });

  it("filters deleting nodes from incoming reconciliation results", () => {
    const result = reconcileCanvasFlowNodes({
      previousNodes: [
        {
          id: "node-keep",
          type: "image",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "node-delete",
          type: "image",
          position: { x: 40, y: 40 },
          data: {},
        },
      ],
      incomingNodes: [
        {
          id: "node-keep",
          type: "image",
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: "node-delete",
          type: "image",
          position: { x: 40, y: 40 },
          data: {},
        },
      ],
      convexNodes: [
        { _id: asNodeId("node-keep"), type: "image" },
        { _id: asNodeId("node-delete"), type: "image" },
      ],
      deletingNodeIds: new Set(["node-delete"]),
      resolvedRealIdByClientRequest: new Map(),
      pendingConnectionCreateIds: new Set(),
      preferLocalPositionNodeIds: new Set(),
      pendingLocalPositionPins: new Map(),
      pendingMovePins: new Map(),
    });

    expect(result.nodes).toEqual([
      {
        id: "node-keep",
        type: "image",
        position: { x: 0, y: 0 },
        data: {},
      },
    ]);
  });
});
