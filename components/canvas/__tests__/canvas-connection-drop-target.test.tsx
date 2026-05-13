// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  resolveConnectionDropTarget,
  resolveDroppedConnectionTarget,
  toDroppedConnectionFromMagnetTarget,
} from "@/components/canvas/canvas-connection-drop-target";

function createNode(overrides: Partial<RFNode> & Pick<RFNode, "id">): RFNode {
  return {
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

function makeHandleElement(args: {
  nodeId: string;
  handleType: "source" | "target";
  handleId?: string;
  rect: Partial<DOMRect>;
}): HTMLElement {
  const element = document.createElement("div");
  element.className = "react-flow__handle";
  element.dataset.nodeId = args.nodeId;
  element.dataset.handleType = args.handleType;
  if (args.handleId !== undefined) {
    element.dataset.handleId = args.handleId;
  }
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: args.rect.left ?? 0,
    y: args.rect.top ?? 0,
    top: args.rect.top ?? 0,
    left: args.rect.left ?? 0,
    right: args.rect.right ?? 10,
    bottom: args.rect.bottom ?? 10,
    width: args.rect.width ?? 10,
    height: args.rect.height ?? 10,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(element);
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

  it("uses the next free repeating prompt slot when dropping on a prompt node body", () => {
    const sourceNode = createNode({
      id: "image-2",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const existingImageNode = createNode({
      id: "image-1",
      type: "image",
      position: { x: 80, y: 0 },
    });
    const promptNode = createNode({
      id: "prompt-1",
      type: "prompt",
      position: { x: 320, y: 200 },
    });
    const promptElement = makeNodeElement("prompt-1");
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [promptElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 340, y: 220 },
      fromNodeId: "image-2",
      fromHandleType: "source",
      nodes: [sourceNode, existingImageNode, promptNode],
      edges: [
        createEdge({
          id: "edge-existing",
          source: "image-1",
          target: "prompt-1",
          targetHandle: "image-in",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "image-2",
      targetNodeId: "prompt-1",
      sourceHandle: undefined,
      targetHandle: "image-in-2",
    });
  });

  it("uses the next free repeating agent slot when dropping on an agent node body", () => {
    const sourceNode = createNode({
      id: "text-2",
      type: "text",
      position: { x: 0, y: 0 },
    });
    const existingTextNode = createNode({
      id: "text-1",
      type: "text",
      position: { x: 80, y: 0 },
    });
    const agentNode = createNode({
      id: "agent-1",
      type: "agent",
      position: { x: 320, y: 200 },
    });
    const agentElement = makeNodeElement("agent-1");
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [agentElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 340, y: 220 },
      fromNodeId: "text-2",
      fromHandleType: "source",
      nodes: [sourceNode, existingTextNode, agentNode],
      edges: [
        createEdge({
          id: "edge-existing",
          source: "text-1",
          target: "agent-1",
          targetHandle: "agent-in",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "text-2",
      targetNodeId: "agent-1",
      sourceHandle: undefined,
      targetHandle: "agent-in-2",
    });
  });

  it("does not resolve body drops onto non-connectable comment nodes", () => {
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const commentNode = createNode({
      id: "node-comment",
      type: "comment",
      position: { x: 320, y: 200 },
    });
    const commentElement = makeNodeElement("node-comment");
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [commentElement]),
      configurable: true,
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 340, y: 220 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, commentNode],
      edges: [],
    });

    expect(result).toBeNull();
  });

  it("resolves nearest valid target handle even without a node body hit", () => {
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
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "node-compare",
      handleType: "target",
      handleId: "left",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "node-compare",
      handleType: "target",
      handleId: "right",
      rect: { left: 438, top: 332, width: 12, height: 12, right: 450, bottom: 344 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, compareNode],
      edges: [],
    });

    expect(result).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-compare",
      sourceHandle: undefined,
      targetHandle: "left",
    });
  });

  it("does not magnetize a visual source to a prompt that already has six visual references", () => {
    const sourceNode = createNode({
      id: "image-new",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const promptNode = createNode({
      id: "prompt-1",
      type: "prompt",
      position: { x: 320, y: 200 },
    });
    const existingImageNodes = Array.from({ length: 6 }, (_, index) =>
      createNode({
        id: `image-${index + 1}`,
        type: "image",
        position: { x: index * 20, y: 0 },
      }),
    );
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "prompt-1",
      handleType: "target",
      handleId: "image-in-7",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "image-new",
      fromHandleType: "source",
      nodes: [sourceNode, promptNode, ...existingImageNodes],
      edges: existingImageNodes.map((node, index) =>
        createEdge({
          id: `edge-${index + 1}`,
          source: node.id,
          target: "prompt-1",
          targetHandle: index === 0 ? "image-in" : `image-in-${index + 1}`,
        }),
      ),
    });

    expect(result).toBeNull();
  });

  it("magnetizes a text source to the remaining prompt slot after six visual references", () => {
    const sourceNode = createNode({
      id: "text-1",
      type: "text",
      position: { x: 0, y: 0 },
    });
    const promptNode = createNode({
      id: "prompt-1",
      type: "prompt",
      position: { x: 320, y: 200 },
    });
    const existingImageNodes = Array.from({ length: 6 }, (_, index) =>
      createNode({
        id: `image-${index + 1}`,
        type: "image",
        position: { x: index * 20, y: 0 },
      }),
    );
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "prompt-1",
      handleType: "target",
      handleId: "image-in-7",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "text-1",
      fromHandleType: "source",
      nodes: [sourceNode, promptNode, ...existingImageNodes],
      edges: existingImageNodes.map((node, index) =>
        createEdge({
          id: `edge-${index + 1}`,
          source: node.id,
          target: "prompt-1",
          targetHandle: index === 0 ? "image-in" : `image-in-${index + 1}`,
        }),
      ),
    });

    expect(result).toEqual({
      sourceNodeId: "text-1",
      targetNodeId: "prompt-1",
      sourceHandle: undefined,
      targetHandle: "image-in-7",
    });
  });

  it("skips an occupied repeating prompt handle and magnetizes to the free slot", () => {
    const sourceNode = createNode({
      id: "image-2",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const existingImageNode = createNode({
      id: "image-1",
      type: "image",
      position: { x: 80, y: 0 },
    });
    const promptNode = createNode({
      id: "prompt-1",
      type: "prompt",
      position: { x: 320, y: 200 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "prompt-1",
      handleType: "target",
      handleId: "image-in",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "prompt-1",
      handleType: "target",
      handleId: "image-in-2",
      rect: { left: 378, top: 252, width: 12, height: 12, right: 390, bottom: 264 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "image-2",
      fromHandleType: "source",
      nodes: [sourceNode, existingImageNode, promptNode],
      edges: [
        createEdge({
          id: "edge-existing",
          source: "image-1",
          target: "prompt-1",
          targetHandle: "image-in",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "image-2",
      targetNodeId: "prompt-1",
      sourceHandle: undefined,
      targetHandle: "image-in-2",
    });
  });

  it("skips an occupied repeating agent handle and magnetizes to the free slot", () => {
    const sourceNode = createNode({
      id: "text-2",
      type: "text",
      position: { x: 0, y: 0 },
    });
    const existingTextNode = createNode({
      id: "text-1",
      type: "text",
      position: { x: 80, y: 0 },
    });
    const agentNode = createNode({
      id: "agent-1",
      type: "agent",
      position: { x: 320, y: 200 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "agent-1",
      handleType: "target",
      handleId: "agent-in",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "agent-1",
      handleType: "target",
      handleId: "agent-in-2",
      rect: { left: 378, top: 252, width: 12, height: 12, right: 390, bottom: 264 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "text-2",
      fromHandleType: "source",
      nodes: [sourceNode, existingTextNode, agentNode],
      edges: [
        createEdge({
          id: "edge-existing",
          source: "text-1",
          target: "agent-1",
          targetHandle: "agent-in",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "text-2",
      targetNodeId: "agent-1",
      sourceHandle: undefined,
      targetHandle: "agent-in-2",
    });
  });

  it("does not magnetize to an agent node that already has eight context inputs", () => {
    const sourceNode = createNode({
      id: "text-new",
      type: "text",
      position: { x: 0, y: 0 },
    });
    const agentNode = createNode({
      id: "agent-1",
      type: "agent",
      position: { x: 320, y: 200 },
    });
    const existingTextNodes = Array.from({ length: 8 }, (_, index) =>
      createNode({
        id: `text-${index + 1}`,
        type: "text",
        position: { x: index * 20, y: 0 },
      }),
    );
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "agent-1",
      handleType: "target",
      handleId: "agent-in-8",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "text-new",
      fromHandleType: "source",
      nodes: [sourceNode, agentNode, ...existingTextNodes],
      edges: existingTextNodes.map((node, index) =>
        createEdge({
          id: `edge-${index + 1}`,
          source: node.id,
          target: "agent-1",
          targetHandle: index === 0 ? "agent-in" : `agent-in-${index + 1}`,
        }),
      ),
    });

    expect(result).toBeNull();
  });

  it("skips a closer invalid handle and picks the nearest valid handle", () => {
    const sourceNode = createNode({
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
    });
    const mixerNode = createNode({
      id: "node-mixer",
      type: "mixer",
      position: { x: 320, y: 200 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "node-mixer",
      handleType: "target",
      handleId: "base",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "node-mixer",
      handleType: "target",
      handleId: "overlay",
      rect: { left: 386, top: 278, width: 12, height: 12, right: 398, bottom: 290 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, mixerNode],
      edges: [
        createEdge({
          id: "edge-base-taken",
          source: "node-source",
          target: "node-mixer",
          targetHandle: "base",
        }),
      ],
    });

    expect(result).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-mixer",
      sourceHandle: undefined,
      targetHandle: "overlay",
    });
  });

  it("prefers the actually nearest handle for compare and mixer targets", () => {
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
    const mixerNode = createNode({
      id: "node-mixer",
      type: "mixer",
      position: { x: 640, y: 200 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "node-compare",
      handleType: "target",
      handleId: "left",
      rect: { left: 358, top: 252, width: 12, height: 12, right: 370, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "node-compare",
      handleType: "target",
      handleId: "right",
      rect: { left: 438, top: 332, width: 12, height: 12, right: 450, bottom: 344 },
    });
    makeHandleElement({
      nodeId: "node-mixer",
      handleType: "target",
      handleId: "base",
      rect: { left: 678, top: 252, width: 12, height: 12, right: 690, bottom: 264 },
    });
    makeHandleElement({
      nodeId: "node-mixer",
      handleType: "target",
      handleId: "overlay",
      rect: { left: 678, top: 292, width: 12, height: 12, right: 690, bottom: 304 },
    });

    const compareResult = resolveDroppedConnectionTarget({
      point: { x: 364, y: 258 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, compareNode, mixerNode],
      edges: [],
    });

    const mixerResult = resolveDroppedConnectionTarget({
      point: { x: 684, y: 299 },
      fromNodeId: "node-source",
      fromHandleType: "source",
      nodes: [sourceNode, compareNode, mixerNode],
      edges: [],
    });

    expect(compareResult?.targetHandle).toBe("left");
    expect(mixerResult?.targetHandle).toBe("overlay");
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

  it("resolves nearest source handle when drag starts from target handle", () => {
    const fromNode = createNode({
      id: "node-compare-target",
      type: "compare",
      position: { x: 0, y: 0 },
    });
    const compareNode = createNode({
      id: "node-compare-source",
      type: "compare",
      position: { x: 320, y: 200 },
    });
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    makeHandleElement({
      nodeId: "node-compare-source",
      handleType: "source",
      handleId: "compare-out",
      rect: { left: 478, top: 288, width: 12, height: 12, right: 490, bottom: 300 },
    });

    const result = resolveDroppedConnectionTarget({
      point: { x: 484, y: 294 },
      fromNodeId: "node-compare-target",
      fromHandleId: "left",
      fromHandleType: "target",
      nodes: [fromNode, compareNode],
      edges: [],
    });

    expect(result).toEqual({
      sourceNodeId: "node-compare-source",
      targetNodeId: "node-compare-target",
      sourceHandle: "compare-out",
      targetHandle: "left",
    });
  });

  it("converts an active magnet target into a dropped connection fallback", () => {
    expect(
      toDroppedConnectionFromMagnetTarget("source", "node-source", "source-out", {
        nodeId: "node-target",
        handleId: "target-in",
        handleType: "target",
        centerX: 120,
        centerY: 80,
        distancePx: 8,
      }),
    ).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      sourceHandle: "source-out",
      targetHandle: "target-in",
    });
  });

  it("uses active magnet target when direct drop target resolution misses", () => {
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
    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => []),
      configurable: true,
    });

    const result = resolveConnectionDropTarget({
      point: { x: 340, y: 220 },
      fromNodeId: "node-source",
      fromHandleId: "source-out",
      fromHandleType: "source",
      nodes: [sourceNode, targetNode],
      edges: [],
      activeMagnetTarget: {
        nodeId: "node-target",
        handleId: undefined,
        handleType: "target",
        centerX: 340,
        centerY: 220,
        distancePx: 4,
      },
    });

    expect(result).toEqual({
      sourceNodeId: "node-source",
      targetNodeId: "node-target",
      sourceHandle: "source-out",
      targetHandle: undefined,
    });
  });
});
