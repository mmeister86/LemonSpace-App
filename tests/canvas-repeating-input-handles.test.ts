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
  ["ai-text-1", "ai-text"],
  ["mixer-1", "mixer"],
  ["image-1", "image"],
  ["image-2", "image"],
  ["image-3", "image"],
  ["image-4", "image"],
  ["image-5", "image"],
  ["image-6", "image"],
  ["image-7", "image"],
  ["image-8", "image"],
  ["image-9", "image"],
  ["asset-1", "asset"],
  ["ai-image-1", "ai-image"],
  ["render-1", "render"],
  ["text-1", "text"],
  ["text-2", "text"],
  ["text-3", "text"],
  ["text-4", "text"],
  ["text-5", "text"],
  ["text-6", "text"],
  ["text-7", "text"],
  ["ai-text-output-1", "ai-text-output"],
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

  it("omits the free prompt handle once six visual references and three text inputs are connected", () => {
    const edges = [
      "image-1",
      "image-2",
      "image-3",
      "image-4",
      "image-5",
      "image-6",
      "text-1",
      "text-2",
      "text-3",
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

    expect(handles).toHaveLength(9);
    expect(handles.every((handle) => handle.isOccupied)).toBe(true);
    expect(handles.map((handle) => handle.handleId)).toEqual([
      "image-in",
      "image-in-2",
      "image-in-3",
      "image-in-4",
      "image-in-5",
      "image-in-6",
      "image-in-7",
      "image-in-8",
      "image-in-9",
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

    const visualAndTextEdges = [
      ...visualEdges,
      { id: "edge-text-1", source: "text-1", target: "prompt-1", targetHandle: "image-in-7" },
      { id: "edge-text-2", source: "text-2", target: "prompt-1", targetHandle: "image-in-8" },
    ];

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "text",
        targetType: "prompt",
        targetNodeId: "prompt-1",
        edges: visualAndTextEdges,
        nodeTypeById,
      }),
    ).toBe("image-in-9");

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "ai-text-output",
        targetType: "prompt",
        targetNodeId: "prompt-1",
        edges: [
          ...visualAndTextEdges,
          { id: "edge-text-3", source: "text-3", target: "prompt-1", targetHandle: "image-in-9" },
        ],
        nodeTypeById,
      }),
    ).toBeNull();
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

  it("starts ai-text nodes with one free instruction handle and one free draft handle", () => {
    expect(
      resolveVisibleRepeatingInputHandles({
        nodeType: "ai-text",
        nodeId: "ai-text-1",
        edges: [],
        nodeTypeById,
      }),
    ).toEqual([
      {
        handleId: "ai-text-instruction-in",
        isOccupied: false,
        topPercent: 30,
      },
      {
        handleId: "ai-text-in",
        isOccupied: false,
        topPercent: 70,
      },
    ]);
  });

  it("renders occupied ai-text role handles plus one free handle per role while capacity remains", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "ai-text",
      nodeId: "ai-text-1",
      edges: [
        {
          id: "edge-instruction",
          source: "text-1",
          target: "ai-text-1",
          targetHandle: "ai-text-instruction-in",
        },
        {
          id: "edge-draft",
          source: "text-2",
          target: "ai-text-1",
          targetHandle: "ai-text-in",
        },
      ],
      nodeTypeById,
    });

    expect(handles).toEqual([
      {
        edgeId: "edge-instruction",
        handleId: "ai-text-instruction-in",
        isOccupied: true,
        topPercent: 26,
      },
      {
        handleId: "ai-text-instruction-in-2",
        isOccupied: false,
        topPercent: 34,
      },
      {
        edgeId: "edge-draft",
        handleId: "ai-text-in",
        isOccupied: true,
        topPercent: 66,
      },
      {
        handleId: "ai-text-in-2",
        isOccupied: false,
        topPercent: 74,
      },
    ]);
  });

  it("renders visual ai-text sources as draft handles only", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "ai-text",
      nodeId: "ai-text-1",
      edges: [
        {
          id: "edge-image",
          source: "image-1",
          target: "ai-text-1",
          targetHandle: "ai-text-in",
        },
        {
          id: "edge-asset",
          source: "asset-1",
          target: "ai-text-1",
          targetHandle: "ai-text-in-2",
        },
        {
          id: "edge-render-instruction",
          source: "render-1",
          target: "ai-text-1",
          targetHandle: "ai-text-instruction-in",
        },
      ],
      nodeTypeById,
    });

    expect(handles).toEqual([
      {
        handleId: "ai-text-instruction-in",
        isOccupied: false,
        topPercent: 30,
      },
      {
        edgeId: "edge-image",
        handleId: "ai-text-in",
        isOccupied: true,
        topPercent: 64,
      },
      {
        edgeId: "edge-asset",
        handleId: "ai-text-in-2",
        isOccupied: true,
        topPercent: 70,
      },
      {
        handleId: "ai-text-in-3",
        isOccupied: false,
        topPercent: 76,
      },
    ]);
  });

  it("omits free ai-text handles once each role has three inputs", () => {
    const edges = [
      { source: "text-1", targetHandle: "ai-text-instruction-in" },
      { source: "text-2", targetHandle: "ai-text-instruction-in-2" },
      { source: "text-3", targetHandle: "ai-text-instruction-in-3" },
      { source: "text-4", targetHandle: "ai-text-in" },
      { source: "text-5", targetHandle: "ai-text-in-2" },
      { source: "text-6", targetHandle: "ai-text-in-3" },
    ].map((edge, index) => ({
      id: `edge-${index + 1}`,
      source: edge.source,
      target: "ai-text-1",
      targetHandle: edge.targetHandle,
    }));

    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "ai-text",
      nodeId: "ai-text-1",
      edges,
      nodeTypeById,
    });

    expect(handles).toHaveLength(6);
    expect(handles.every((handle) => handle.isOccupied)).toBe(true);
    expect(handles.map((handle) => handle.handleId)).toEqual([
      "ai-text-instruction-in",
      "ai-text-instruction-in-2",
      "ai-text-instruction-in-3",
      "ai-text-in",
      "ai-text-in-2",
      "ai-text-in-3",
    ]);
  });

  it("assigns compact display handles to ai-text roles and keeps legacy edges as draft inputs", () => {
    const edges = assignDisplayHandlesToRepeatingInputEdges(
      [
        {
          id: "edge-instruction-1",
          source: "text-1",
          target: "ai-text-1",
          targetHandle: "ai-text-instruction-in",
        },
        {
          id: "edge-instruction-2",
          source: "text-2",
          target: "ai-text-1",
          targetHandle: "ai-text-instruction-in",
        },
        {
          id: "edge-legacy-draft",
          source: "text-3",
          target: "ai-text-1",
          targetHandle: undefined,
        },
        {
          id: "edge-draft",
          source: "ai-text-output-1",
          target: "ai-text-1",
          targetHandle: "ai-text-in",
        },
      ],
      nodeTypeById,
    );

    expect(edges.map((edge) => edge.targetHandle)).toEqual([
      "ai-text-instruction-in",
      "ai-text-instruction-in-2",
      "ai-text-in",
      "ai-text-in-2",
    ]);
  });

  it("chooses the next ai-text handle by requested role and defaults body drops to draft", () => {
    const edges = [
      {
        id: "edge-instruction",
        source: "text-1",
        target: "ai-text-1",
        targetHandle: "ai-text-instruction-in",
      },
      {
        id: "edge-draft",
        source: "text-2",
        target: "ai-text-1",
        targetHandle: "ai-text-in",
      },
    ];

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "text",
        targetType: "ai-text",
        targetNodeId: "ai-text-1",
        targetHandle: "ai-text-instruction-in-2",
        edges,
        nodeTypeById,
      }),
    ).toBe("ai-text-instruction-in-2");

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "text",
        targetType: "ai-text",
        targetNodeId: "ai-text-1",
        edges,
        nodeTypeById,
      }),
    ).toBe("ai-text-in-2");

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "ai-image",
        targetType: "ai-text",
        targetNodeId: "ai-text-1",
        targetHandle: "ai-text-instruction-in-2",
        edges,
        nodeTypeById,
      }),
    ).toBeNull();
  });

  it("starts mixer nodes with a single free centered layer handle", () => {
    expect(
      resolveVisibleRepeatingInputHandles({
        nodeType: "mixer",
        nodeId: "mixer-1",
        edges: [],
        nodeTypeById,
      }),
    ).toEqual([
      {
        handleId: "layer-in",
        isOccupied: false,
        topPercent: 50,
      },
    ]);
  });

  it("renders occupied mixer layer handles plus one free handle while capacity remains", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "mixer",
      nodeId: "mixer-1",
      edges: [
        { id: "edge-1", source: "image-1", target: "mixer-1", targetHandle: "layer-in" },
        { id: "edge-2", source: "text-1", target: "mixer-1", targetHandle: "layer-in-2" },
      ],
      nodeTypeById,
    });

    expect(handles).toEqual([
      {
        edgeId: "edge-1",
        handleId: "layer-in",
        isOccupied: true,
        topPercent: 35,
      },
      {
        edgeId: "edge-2",
        handleId: "layer-in-2",
        isOccupied: true,
        topPercent: 50,
      },
      {
        handleId: "layer-in-3",
        isOccupied: false,
        topPercent: 65,
      },
    ]);
  });

  it("omits the free mixer handle once eight layers are connected", () => {
    const handles = resolveVisibleRepeatingInputHandles({
      nodeType: "mixer",
      nodeId: "mixer-1",
      edges: Array.from({ length: 8 }, (_, index) => ({
        id: `edge-${index + 1}`,
        source: `image-${index + 1}`,
        target: "mixer-1",
        targetHandle: buildRepeatingInputHandleId("layer-in", index),
      })),
      nodeTypeById,
    });

    expect(handles).toHaveLength(8);
    expect(handles.every((handle) => handle.isOccupied)).toBe(true);
    expect(handles.map((handle) => handle.handleId)).toEqual([
      "layer-in",
      "layer-in-2",
      "layer-in-3",
      "layer-in-4",
      "layer-in-5",
      "layer-in-6",
      "layer-in-7",
      "layer-in-8",
    ]);
  });

  it("chooses the next compact free mixer handle and rejects invalid sources", () => {
    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "asset",
        targetType: "mixer",
        targetNodeId: "mixer-1",
        edges: [
          { id: "edge-1", source: "image-1", target: "mixer-1", targetHandle: "layer-in" },
        ],
        nodeTypeById,
      }),
    ).toBe("layer-in-2");

    expect(
      resolveNextRepeatingInputHandleId({
        sourceType: "video",
        targetType: "mixer",
        targetNodeId: "mixer-1",
        edges: [],
        nodeTypeById,
      }),
    ).toBeNull();
  });
});
