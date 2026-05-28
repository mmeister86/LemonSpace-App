import { describe, expect, it } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  computeCanvasDagreLayout,
  type CanvasDagreLayoutDirection,
} from "../canvas-dagre-layout";

function node(overrides: Partial<RFNode> & Pick<RFNode, "id">): RFNode {
  return {
    type: "image",
    position: { x: 0, y: 0 },
    data: {},
    width: 100,
    height: 80,
    ...overrides,
  } as RFNode;
}

function edge(overrides: Pick<RFEdge, "id" | "source" | "target">): RFEdge {
  return overrides as RFEdge;
}

function layout(direction: CanvasDagreLayoutDirection, nodes: RFNode[], edges: RFEdge[]) {
  const result = computeCanvasDagreLayout({ direction, nodes, edges });
  if (result.status !== "ok") {
    throw new Error(`Expected layout result, received ${result.reason}`);
  }
  return result;
}

describe("computeCanvasDagreLayout", () => {
  it("lays connected root nodes left to right", () => {
    const result = layout(
      "LR",
      [
        node({ id: "source", position: { x: 300, y: 200 } }),
        node({ id: "target", position: { x: 100, y: 50 } }),
      ],
      [edge({ id: "source-target", source: "source", target: "target" })],
    );

    const source = result.nodes.find((candidate) => candidate.id === "source");
    const target = result.nodes.find((candidate) => candidate.id === "target");

    expect(result.moves.map((move) => move.nodeId).sort()).toEqual(["source", "target"]);
    expect(source?.position.x).toBeLessThan(target?.position.x ?? 0);
    expect(Math.min(...result.nodes.map((candidate) => candidate.position.x))).toBe(100);
    expect(Math.min(...result.nodes.map((candidate) => candidate.position.y))).toBe(50);
  });

  it("lays connected root nodes top to bottom", () => {
    const result = layout(
      "TB",
      [
        node({ id: "source", position: { x: 300, y: 200 } }),
        node({ id: "target", position: { x: 100, y: 50 } }),
      ],
      [edge({ id: "source-target", source: "source", target: "target" })],
    );

    const source = result.nodes.find((candidate) => candidate.id === "source");
    const target = result.nodes.find((candidate) => candidate.id === "target");

    expect(source?.position.y).toBeLessThan(target?.position.y ?? 0);
    expect(Math.min(...result.nodes.map((candidate) => candidate.position.x))).toBe(100);
    expect(Math.min(...result.nodes.map((candidate) => candidate.position.y))).toBe(50);
  });

  it("keeps top-to-bottom rank spacing compact", () => {
    const result = layout(
      "TB",
      [
        node({ id: "source", position: { x: 100, y: 50 }, width: 100, height: 80 }),
        node({ id: "target", position: { x: 300, y: 200 }, width: 100, height: 80 }),
      ],
      [edge({ id: "source-target", source: "source", target: "target" })],
    );

    const source = result.nodes.find((candidate) => candidate.id === "source");
    const target = result.nodes.find((candidate) => candidate.id === "target");
    if (!source || !target) {
      throw new Error("Expected both layouted nodes");
    }

    const verticalGap = target.position.y - (source.position.y + 80);
    expect(verticalGap).toBeGreaterThanOrEqual(40);
    expect(verticalGap).toBeLessThanOrEqual(56);
  });

  it("uses selected nodes instead of all root nodes", () => {
    const result = layout(
      "LR",
      [
        node({ id: "selected-a", selected: true, position: { x: 10, y: 10 } }),
        node({ id: "selected-b", selected: true, position: { x: 20, y: 20 } }),
        node({ id: "unselected", position: { x: 900, y: 900 } }),
      ],
      [
        edge({ id: "selected-edge", source: "selected-a", target: "selected-b" }),
        edge({ id: "unselected-edge", source: "selected-b", target: "unselected" }),
      ],
    );

    const unselected = result.nodes.find((candidate) => candidate.id === "unselected");

    expect(result.laidOutNodeIds.sort()).toEqual(["selected-a", "selected-b"]);
    expect(result.moves.map((move) => move.nodeId).sort()).toEqual([
      "selected-a",
      "selected-b",
    ]);
    expect(unselected?.position).toEqual({ x: 900, y: 900 });
  });

  it("rejects selected nodes from mixed parent contexts", () => {
    const result = computeCanvasDagreLayout({
      direction: "LR",
      nodes: [
        node({ id: "root", selected: true }),
        node({ id: "child", selected: true, parentId: "group-1" }),
      ],
      edges: [],
    });

    expect(result).toMatchObject({
      status: "noop",
      reason: "mixed-parent-context",
      moves: [],
    });
  });

  it("rejects optimistic candidate nodes", () => {
    const result = computeCanvasDagreLayout({
      direction: "TB",
      nodes: [node({ id: "optimistic_request-1" }), node({ id: "real-node" })],
      edges: [edge({ id: "edge-1", source: "optimistic_request-1", target: "real-node" })],
    });

    expect(result).toMatchObject({
      status: "noop",
      reason: "optimistic-nodes",
      moves: [],
    });
  });

  it("uses measured and style dimensions when direct dimensions are unavailable", () => {
    const result = layout(
      "LR",
      [
        node({
          id: "wide",
          width: undefined,
          height: undefined,
          measured: { width: 400, height: 120 },
        }),
        node({
          id: "styled",
          width: undefined,
          height: undefined,
          measured: undefined,
          style: { width: 160, height: 90 },
        }),
      ],
      [edge({ id: "wide-styled", source: "wide", target: "styled" })],
    );

    const wide = result.nodes.find((candidate) => candidate.id === "wide");
    const styled = result.nodes.find((candidate) => candidate.id === "styled");

    expect((styled?.position.x ?? 0) - (wide?.position.x ?? 0)).toBeGreaterThan(400);
  });

  it("does not keep stale Dagre nodes across repeated layout runs", () => {
    const first = layout(
      "LR",
      [
        node({ id: "a", position: { x: 0, y: 0 } }),
        node({ id: "b", position: { x: 0, y: 0 } }),
        node({ id: "c", position: { x: 0, y: 0 } }),
      ],
      [
        edge({ id: "a-b", source: "a", target: "b" }),
        edge({ id: "b-c", source: "b", target: "c" }),
      ],
    );
    const second = layout(
      "LR",
      [node({ id: "a", position: { x: 0, y: 0 } }), node({ id: "b", position: { x: 0, y: 0 } })],
      [edge({ id: "a-b", source: "a", target: "b" })],
    );

    expect(first.laidOutNodeIds.sort()).toEqual(["a", "b", "c"]);
    expect(second.laidOutNodeIds.sort()).toEqual(["a", "b"]);
    expect(second.nodes).toHaveLength(2);
  });
});
