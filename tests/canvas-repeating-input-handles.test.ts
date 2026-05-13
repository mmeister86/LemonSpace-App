import { describe, expect, it } from "vitest";

import {
  assignDisplayHandlesToRepeatingInputEdges,
  buildRepeatingInputHandleId,
  resolveNextRepeatingInputHandleId,
  resolveVisibleRepeatingInputHandles,
} from "@/lib/canvas-repeating-input-handles";

const nodeTypeById = new Map<string, string>([
  ["prompt-1", "prompt"],
  ["agent-1", "agent"],
  ["image-1", "image"],
  ["image-2", "image"],
  ["image-3", "image"],
  ["image-4", "image"],
  ["image-5", "image"],
  ["image-6", "image"],
  ["image-7", "image"],
  ["image-8", "image"],
  ["image-9", "image"],
  ["text-1", "text"],
  ["prompt-source", "prompt"],
]);

describe("canvas repeating input handles", () => {
  it("builds compact handle ids from a base handle", () => {
    expect(buildRepeatingInputHandleId("image-in", 0)).toBe("image-in");
    expect(buildRepeatingInputHandleId("image-in", 1)).toBe("image-in-2");
    expect(buildRepeatingInputHandleId("image-in", 6)).toBe("image-in-7");
  });

  it("starts prompt nodes with a single free centered input handle", () => {
    expect(
      resolveVisibleRepeatingInputHandles({
        nodeType: "prompt",
        nodeId: "prompt-1",
        edges: [],
        nodeTypeById,
      }),
    ).toEqual([
      {
        handleId: "image-in",
        isOccupied: false,
        topPercent: 50,
      },
    ]);
  });

  it("renders occupied prompt handles plus one free handle while capacity remains", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "prompt",
      nodeId: "prompt-1",
      edges: [
        { id: "edge-1", source: "image-1", target: "prompt-1", targetHandle: "image-in" },
        { id: "edge-2", source: "text-1", target: "prompt-1", targetHandle: "image-in" },
      ],
      nodeTypeById,
    });

    expect(handles).toEqual([
      {
        edgeId: "edge-1",
        handleId: "image-in",
        isOccupied: true,
        topPercent: 35,
      },
      {
        edgeId: "edge-2",
        handleId: "image-in-2",
        isOccupied: true,
        topPercent: 50,
      },
      {
        handleId: "image-in-3",
        isOccupied: false,
        topPercent: 65,
      },
    ]);
  });

  it("omits the free prompt handle once six visual references and one text input are connected", () => {
    const edges = [
      "image-1",
      "image-2",
      "image-3",
      "image-4",
      "image-5",
      "image-6",
      "text-1",
    ].map((source, index) => ({
      id: `edge-${index + 1}`,
      source,
      target: "prompt-1",
      targetHandle: "image-in",
    }));

    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "prompt",
      nodeId: "prompt-1",
      edges,
      nodeTypeById,
    });

    expect(handles).toHaveLength(7);
    expect(handles.every((handle) => handle.isOccupied)).toBe(true);
    expect(handles.map((handle) => handle.handleId)).toEqual([
      "image-in",
      "image-in-2",
      "image-in-3",
      "image-in-4",
      "image-in-5",
      "image-in-6",
      "image-in-7",
    ]);
  });

  it("assigns compact display handles to legacy prompt edges without mutating other targets", () => {
    const edges = assignDisplayHandlesToRepeatingInputEdges(
      [
        { id: "edge-1", source: "image-1", target: "prompt-1", targetHandle: undefined },
        { id: "edge-2", source: "image-2", target: "prompt-1", targetHandle: "image-in" },
        { id: "edge-3", source: "image-3", target: "prompt-1", targetHandle: "image-in" },
        { id: "edge-other", source: "image-1", target: "image-7", targetHandle: undefined },
      ],
      nodeTypeById,
    );

    expect(edges.map((edge) => edge.targetHandle)).toEqual([
      "image-in",
      "image-in-2",
      "image-in-3",
      undefined,
    ]);
  });

  it("chooses the next compact free prompt handle for compatible source types", () => {
    const handleId = resolveNextRepeatingInputHandleId({
      sourceType: "image",
      targetType: "prompt",
      targetNodeId: "prompt-1",
      edges: [
        { id: "edge-1", source: "image-1", target: "prompt-1", targetHandle: "image-in" },
      ],
      nodeTypeById,
    });

    expect(handleId).toBe("image-in-2");
  });

  it("returns null when the source type has reached its prompt-specific limit", () => {
    const visualEdges = ["image-1", "image-2", "image-3", "image-4", "image-5", "image-6"].map(
      (source, index) => ({
        id: `edge-${index + 1}`,
        source,
        target: "prompt-1",
        targetHandle: buildRepeatingInputHandleId("image-in", index),
      }),
    );

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "image",
        targetType: "prompt",
        targetNodeId: "prompt-1",
        edges: visualEdges,
        nodeTypeById,
      }),
    ).toBeNull();

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "text",
        targetType: "prompt",
        targetNodeId: "prompt-1",
        edges: visualEdges,
        nodeTypeById,
      }),
    ).toBe("image-in-7");
  });

  it("starts agent nodes with a single free centered input handle", () => {
    expect(
      resolveVisibleRepeatingInputHandles({
        nodeType: "agent",
        nodeId: "agent-1",
        edges: [],
        nodeTypeById,
      }),
    ).toEqual([
      {
        handleId: "agent-in",
        isOccupied: false,
        topPercent: 50,
      },
    ]);
  });

  it("renders occupied agent handles plus one free handle while capacity remains", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "agent",
      nodeId: "agent-1",
      edges: [
        { id: "edge-1", source: "image-1", target: "agent-1", targetHandle: "agent-in" },
        { id: "edge-2", source: "text-1", target: "agent-1", targetHandle: "agent-in" },
      ],
      nodeTypeById,
    });

    expect(handles).toEqual([
      {
        edgeId: "edge-1",
        handleId: "agent-in",
        isOccupied: true,
        topPercent: 35,
      },
      {
        edgeId: "edge-2",
        handleId: "agent-in-2",
        isOccupied: true,
        topPercent: 50,
      },
      {
        handleId: "agent-in-3",
        isOccupied: false,
        topPercent: 65,
      },
    ]);
  });

  it("omits the free agent handle once eight context inputs are connected", () => {
    const edges = Array.from({ length: 8 }, (_, index) => ({
      id: `edge-${index + 1}`,
      source: `image-${index + 1}`,
      target: "agent-1",
      targetHandle: "agent-in",
    }));

    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "agent",
      nodeId: "agent-1",
      edges,
      nodeTypeById,
    });

    expect(handles).toHaveLength(8);
    expect(handles.every((handle) => handle.isOccupied)).toBe(true);
    expect(handles.map((handle) => handle.handleId)).toEqual([
      "agent-in",
      "agent-in-2",
      "agent-in-3",
      "agent-in-4",
      "agent-in-5",
      "agent-in-6",
      "agent-in-7",
      "agent-in-8",
    ]);
  });

  it("assigns compact display handles to legacy agent edges without mutating invalid sources", () => {
    const edges = assignDisplayHandlesToRepeatingInputEdges(
      [
        { id: "edge-1", source: "image-1", target: "agent-1", targetHandle: undefined },
        { id: "edge-2", source: "text-1", target: "agent-1", targetHandle: "agent-in" },
        { id: "edge-invalid", source: "prompt-source", target: "agent-1", targetHandle: "agent-in" },
      ],
      nodeTypeById,
    );

    expect(edges.map((edge) => edge.targetHandle)).toEqual([
      "agent-in",
      "agent-in-2",
      "agent-in",
    ]);
  });

  it("chooses the next compact free agent handle and returns null at capacity", () => {
    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "text",
        targetType: "agent",
        targetNodeId: "agent-1",
        edges: [
          { id: "edge-1", source: "image-1", target: "agent-1", targetHandle: "agent-in" },
        ],
        nodeTypeById,
      }),
    ).toBe("agent-in-2");

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "image",
        targetType: "agent",
        targetNodeId: "agent-1",
        edges: Array.from({ length: 8 }, (_, index) => ({
          id: `edge-${index + 1}`,
          source: `image-${index + 1}`,
          target: "agent-1",
          targetHandle: buildRepeatingInputHandleId("agent-in", index),
        })),
        nodeTypeById,
      }),
    ).toBeNull();

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "prompt",
        targetType: "agent",
        targetNodeId: "agent-1",
        edges: [],
        nodeTypeById,
      }),
    ).toBeNull();
  });
});
