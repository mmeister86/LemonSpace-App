import type { Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  computeGroupFrameForNodes,
  getAbsoluteNodePosition,
  getSelectedRootNodes,
  wouldCreateParentCycle,
} from "@/components/canvas/canvas-grouping-helpers";

describe("canvas grouping helpers", () => {
  it("computes absolute positions through nested parents", () => {
    const nodes: RFNode[] = [
      {
        id: "group-a",
        type: "group",
        position: { x: 100, y: 50 },
        style: { width: 300, height: 200 },
        data: {},
      },
      {
        id: "group-b",
        type: "group",
        parentId: "group-a",
        position: { x: 20, y: 30 },
        style: { width: 120, height: 100 },
        data: {},
      },
      {
        id: "node-c",
        type: "image",
        parentId: "group-b",
        position: { x: 7, y: 9 },
        style: { width: 50, height: 40 },
        data: {},
      },
    ];

    expect(getAbsoluteNodePosition(nodes[2], new Map(nodes.map((node) => [node.id, node])))).toEqual({
      x: 127,
      y: 89,
    });
  });

  it("filters selected descendants when an ancestor is selected", () => {
    const nodes: RFNode[] = [
      { id: "group-a", type: "group", position: { x: 0, y: 0 }, data: {}, selected: true },
      {
        id: "group-b",
        type: "group",
        parentId: "group-a",
        position: { x: 10, y: 10 },
        data: {},
        selected: true,
      },
      {
        id: "node-c",
        type: "image",
        parentId: "group-b",
        position: { x: 10, y: 10 },
        data: {},
        selected: true,
      },
      { id: "node-d", type: "text", position: { x: 300, y: 0 }, data: {}, selected: true },
    ];

    expect(getSelectedRootNodes(nodes).map((node) => node.id)).toEqual([
      "group-a",
      "node-d",
    ]);
  });

  it("detects parent cycles", () => {
    const nodes: RFNode[] = [
      { id: "group-a", type: "group", position: { x: 0, y: 0 }, data: {} },
      {
        id: "group-b",
        type: "group",
        parentId: "group-a",
        position: { x: 10, y: 10 },
        data: {},
      },
      {
        id: "node-c",
        type: "image",
        parentId: "group-b",
        position: { x: 10, y: 10 },
        data: {},
      },
    ];

    expect(wouldCreateParentCycle("group-a", "node-c", nodes)).toBe(true);
    expect(wouldCreateParentCycle("node-c", "group-a", nodes)).toBe(false);
  });

  it("computes padded group bounds and relative child positions", () => {
    const selected: RFNode[] = [
      {
        id: "node-a",
        type: "image",
        position: { x: 100, y: 120 },
        style: { width: 80, height: 40 },
        data: {},
      },
      {
        id: "node-b",
        type: "text",
        position: { x: 260, y: 180 },
        style: { width: 120, height: 90 },
        data: {},
      },
    ];

    const frame = computeGroupFrameForNodes(selected, selected);

    expect(frame).toEqual({
      positionX: 76,
      positionY: 76,
      width: 328,
      height: 218,
      childPositions: [
        { nodeId: "node-a", positionX: 24, positionY: 44 },
        { nodeId: "node-b", positionX: 184, positionY: 104 },
      ],
    });
  });
});
