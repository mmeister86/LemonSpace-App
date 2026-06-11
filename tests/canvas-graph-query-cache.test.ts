import { describe, expect, it, vi } from "vitest";

vi.mock("@/convex/_generated/api", () => ({
  api: {
    canvasGraph: { get: "canvasGraph.get" },
  },
}));

import {
  getCanvasGraphEdgesFromQuery,
  getCanvasGraphNodesFromQuery,
  setCanvasGraphEdgesInQuery,
  setCanvasGraphNodesInQuery,
} from "@/components/canvas/canvas-graph-query-cache";

describe("canvas graph query cache helpers", () => {
  it("returns cached nodes and edges from the shared graph query", () => {
    const graph = {
      canvas: { _id: "canvas_1", name: "Launch Canvas" },
      nodes: [{ _id: "node_1" }],
      edges: [{ _id: "edge_1" }],
    };
    const localStore = {
      getQuery: vi.fn((_query, args) =>
        args.canvasId === "canvas_1" ? graph : undefined,
      ),
    };

    expect(getCanvasGraphNodesFromQuery(localStore as never, { canvasId: "canvas_1" as never })).toEqual(graph.nodes);
    expect(getCanvasGraphEdgesFromQuery(localStore as never, { canvasId: "canvas_1" as never })).toEqual(graph.edges);
  });

  it("preserves the sibling collection when replacing nodes or edges", () => {
    const graph = {
      canvas: { _id: "canvas_1", name: "Launch Canvas" },
      nodes: [{ _id: "node_1" }],
      edges: [{ _id: "edge_1" }],
    };
    const localStore = {
      getQuery: vi.fn((_query, args) =>
        Object.keys(args).length === 1 && args.canvasId === "canvas_1"
          ? graph
          : undefined,
      ),
      setQuery: vi.fn(),
    };

    setCanvasGraphNodesInQuery(localStore as never, {
      canvasId: "canvas_1" as never,
      nodes: [{ _id: "node_2" }] as never,
    });
    setCanvasGraphEdgesInQuery(localStore as never, {
      canvasId: "canvas_1" as never,
      edges: [{ _id: "edge_2" }] as never,
    });

    expect(localStore.getQuery).toHaveBeenNthCalledWith(1, "canvasGraph.get", { canvasId: "canvas_1" });
    expect(localStore.getQuery).toHaveBeenNthCalledWith(2, "canvasGraph.get", { canvasId: "canvas_1" });
    expect(localStore.setQuery).toHaveBeenNthCalledWith(1, "canvasGraph.get", { canvasId: "canvas_1" }, {
      canvas: graph.canvas,
      nodes: [{ _id: "node_2" }],
      edges: [{ _id: "edge_1" }],
    });
    expect(localStore.setQuery).toHaveBeenNthCalledWith(2, "canvasGraph.get", { canvasId: "canvas_1" }, {
      canvas: graph.canvas,
      nodes: [{ _id: "node_1" }],
      edges: [{ _id: "edge_2" }],
    });
  });
});
