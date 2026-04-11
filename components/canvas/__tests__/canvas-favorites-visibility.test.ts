import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { projectCanvasFavoritesVisibility } from "../canvas-favorites-visibility";

function createNode(
  id: string,
  data: Record<string, unknown>,
  options?: {
    style?: RFNode<Record<string, unknown>>["style"];
    className?: string;
  },
): RFNode<Record<string, unknown>> {
  return {
    id,
    position: { x: 0, y: 0 },
    data,
    style: options?.style,
    className: options?.className,
    type: "note",
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  options?: {
    style?: RFEdge<Record<string, unknown>>["style"];
    className?: string;
  },
): RFEdge<Record<string, unknown>> {
  return {
    id,
    source,
    target,
    style: options?.style,
    className: options?.className,
    type: "default",
  };
}

describe("projectCanvasFavoritesVisibility", () => {
  it("keeps nodes and edges unchanged when favorites focus mode is inactive", () => {
    const nodes = [
      createNode("node-a", { isFavorite: true }),
      createNode("node-b", { label: "normal" }, { style: { width: 280, height: 200 } }),
    ];
    const edges = [
      createEdge("edge-a", "node-a", "node-b", {
        style: { stroke: "rgb(0, 0, 0)", strokeWidth: 2 },
      }),
    ];

    const result = projectCanvasFavoritesVisibility({
      nodes,
      edges,
      favoritesOnly: false,
    });

    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.nodes[1]).toBe(nodes[1]);
    expect(result.edges[0]).toBe(edges[0]);
    expect(result.favoriteCount).toBe(1);
    expect(Array.from(result.favoriteNodeIds)).toEqual(["node-a"]);
    expect(result.nodes[1]?.style).toEqual({ width: 280, height: 200 });
    expect(result.edges[0]?.style).toEqual({ stroke: "rgb(0, 0, 0)", strokeWidth: 2 });
  });

  it("dims non-favorite nodes when favorites focus mode is active", () => {
    const nodes = [
      createNode("node-a", { isFavorite: true }),
      createNode("node-b", { label: "normal" }, { className: "custom-node" }),
      createNode("node-c", { isFavorite: true }),
    ];
    const edges: RFEdge<Record<string, unknown>>[] = [];

    const result = projectCanvasFavoritesVisibility({
      nodes,
      edges,
      favoritesOnly: true,
    });

    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.nodes[2]).toBe(nodes[2]);
    expect(result.nodes[1]).not.toBe(nodes[1]);
    expect(result.nodes[1]?.style).toMatchObject({
      opacity: 0.28,
      filter: "saturate(0.55)",
    });
    expect(result.nodes[1]?.className).toContain("custom-node");
    expect(result.favoriteCount).toBe(2);
    expect(Array.from(result.favoriteNodeIds)).toEqual(["node-a", "node-c"]);
  });

  it("dims edges when source and target are not both favorite", () => {
    const nodes = [
      createNode("node-a", { isFavorite: true }),
      createNode("node-b", { label: "normal" }),
      createNode("node-c", { isFavorite: true }),
    ];
    const edges = [
      createEdge("edge-aa", "node-a", "node-c", {
        style: { stroke: "rgb(10, 10, 10)", strokeWidth: 2 },
      }),
      createEdge("edge-ab", "node-a", "node-b", {
        style: { stroke: "rgb(20, 20, 20)", strokeWidth: 2 },
      }),
      createEdge("edge-bc", "node-b", "node-c", {
        style: { stroke: "rgb(30, 30, 30)", strokeWidth: 2 },
      }),
    ];

    const result = projectCanvasFavoritesVisibility({
      nodes,
      edges,
      favoritesOnly: true,
    });

    expect(result.edges[0]).toBe(edges[0]);
    expect(result.edges[1]).not.toBe(edges[1]);
    expect(result.edges[2]).not.toBe(edges[2]);
    expect(result.edges[0]?.style).toEqual({ stroke: "rgb(10, 10, 10)", strokeWidth: 2 });
    expect(result.edges[1]?.style).toMatchObject({
      stroke: "rgb(20, 20, 20)",
      strokeWidth: 2,
      opacity: 0.18,
    });
    expect(result.edges[2]?.style).toMatchObject({
      stroke: "rgb(30, 30, 30)",
      strokeWidth: 2,
      opacity: 0.18,
    });
    expect(result.edges[0]).toBe(edges[0]);
  });

  it("does not mutate input nodes or edges and only changes affected items", () => {
    const nodes = [
      createNode("node-a", { isFavorite: true }),
      createNode("node-b", { label: "normal" }, { style: { width: 240 } }),
      createNode("node-c", { isFavorite: true }, { style: { width: 180 } }),
    ];
    const edges = [
      createEdge("edge-ab", "node-a", "node-b", { style: { stroke: "red" } }),
      createEdge("edge-ac", "node-a", "node-c", { style: { stroke: "green" } }),
      createEdge("edge-bc", "node-b", "node-c", { style: { stroke: "blue" } }),
    ];

    const nodesBefore = structuredClone(nodes);
    const edgesBefore = structuredClone(edges);

    const result = projectCanvasFavoritesVisibility({
      nodes,
      edges,
      favoritesOnly: true,
    });

    expect(nodes).toEqual(nodesBefore);
    expect(edges).toEqual(edgesBefore);
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.nodes[1]).not.toBe(nodes[1]);
    expect(result.nodes[2]).toBe(nodes[2]);
    expect(result.edges[0]).not.toBe(edges[0]);
    expect(result.edges[1]).toBe(edges[1]);
    expect(result.edges[2]).not.toBe(edges[2]);
  });

  it("dims all nodes and edges when focus mode is active with zero favorites", () => {
    const nodes = [createNode("node-a", { label: "first" }), createNode("node-b", { label: "second" })];
    const edges = [createEdge("edge-ab", "node-a", "node-b")];

    const result = projectCanvasFavoritesVisibility({
      nodes,
      edges,
      favoritesOnly: true,
    });

    expect(result.favoriteCount).toBe(0);
    expect(result.favoriteNodeIds.size).toBe(0);
    expect(result.nodes[0]?.style).toMatchObject({ opacity: 0.28, filter: "saturate(0.55)" });
    expect(result.nodes[1]?.style).toMatchObject({ opacity: 0.28, filter: "saturate(0.55)" });
    expect(result.edges[0]?.style).toMatchObject({ opacity: 0.18 });
  });
});
