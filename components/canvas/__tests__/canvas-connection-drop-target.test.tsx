// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { resolveDroppedConnectionTarget } from "@/components/canvas/canvas-helpers";

function createNode(overrides: Partial<RFNode> & Pick<RFNode, "id">): RFNode {
  return {
    id: overrides.id,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as RFNode;
}

function createEdge(
  overrides: Partial<RFEdge> & Pick<RFEdge, "id" | "source" | "target">,
): RFEdge {
  return {
    ...overrides,
  } as RFEdge;
}

function makeNodeElement(id: string, rect: Partial<DOMRect> = {}): HTMLElement {
  const element = document.createElement("div");
  element.className = "react-flow__node";
  element.dataset.id = id;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: rect.width ?? 200,
    bottom: rect.height ?? 120,
    width: rect.width ?? 200,
    height: rect.height ?? 120,
    toJSON: () => ({}),
  } as DOMRect);
  return element;
}

describe("resolveDroppedConnectionTarget", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("resolves a source-start body drop into a direct connection", () => {
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const targetNode = createNode({
      id: "node-target",
      type: "text",
      position: { x: 320, y: 200 },
    });
    const targetElement = makeNodeElement("node-target");
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [targetElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 340, y: 220 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, targetNode],
      edges: [],
    });

    expect(result).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
  });

  it("returns null when the pointer is over the canvas background", () => {
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 10, y: 10 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode],
      edges: [],
    });

    expect(result).toBeNull();
  });

  it("uses the free compare slot when dropping on a compare node body", () => {
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const compareNode = createNode({
      id: "node-compare",
      type: "compare",
      position: { x: 320, y: 200 },
    });
    const compareElement = makeNodeElement("node-compare", {
      width: 500,
      height: 380,
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [compareElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 380, y: 290 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, compareNode],
      edges: [
        createEdge({
          id: "edge-left",
          source: "node-source",
          target: "node-compare",
          targetHandle: "left",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-compare",
      sourceHandle: undefined,
      targetHandle: "right",
    });
  });

  it("reverses the connection when the drag starts from a target handle", () => {
    const droppedNode = createNode({
      id: "node-dropped",
      type: "text",
      position: { x: 0, y: 0 },
    });
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 320, y: 200 },
    });
    const droppedElement = makeNodeElement("node-dropped");
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [droppedElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 60, y: 60 },
      fromNodeId: "node-source",
      fromHandleId: "target-handle",
      fromHandleType: "target",
      nodes: [droppedNode, sourceNode],
      edges: [],
    });

    expect(result).toEqual({
      sourceNodeId: "node-dropped",
      targetNodeId: "node-source",
      sourceHandle: undefined,
      targetHandle: "target-handle",
    });
  });
});
