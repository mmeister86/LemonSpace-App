import { describe, expect, it } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import { resolveAdjustmentAutoSplit } from "@/components/canvas/canvas-connection-auto-split";

describe("resolveAdjustmentAutoSplit", () => {
  it("returns split mutation handles for a valid adjustment incoming-limit drop", () => {
    const nodes: RFNode[] = [
      { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
      { id: "node-curves", type: "curves", position: { x: 180, y: 120 }, data: {} },
      { id: "node-light", type: "light-adjust", position: { x: 360, y: 120 }, data: {} },
    ];
    const edges: RFEdge[] = [
      {
        id: "edge-image-light",
        source: "node-image",
        target: "node-light",
      } as RFEdge,
    ];

    const result = resolveAdjustmentAutoSplit({
      validationError: "adjustment-incoming-limit",
      droppedConnection: {
        sourceNodeId: "node-curves",
        targetNodeId: "node-light",
      },
      fromNodeId: "node-curves",
      fromHandleType: "source",
      nodes,
      edges,
    });

    expect(result).toEqual({
      splitEdge: edges[0],
      middleNode: nodes[1],
      splitSourceHandle: undefined,
      splitTargetHandle: undefined,
      newNodeSourceHandle: undefined,
      newNodeTargetHandle: undefined,
      splitValidationError: null,
    });
  });

  it("does not auto-split non-adjustment validation failures", () => {
    const nodes: RFNode[] = [
      { id: "node-image", type: "image", position: { x: 0, y: 0 }, data: {} },
      { id: "node-note", type: "note", position: { x: 180, y: 120 }, data: {} },
    ];

    const result = resolveAdjustmentAutoSplit({
      validationError: "self-loop",
      droppedConnection: {
        sourceNodeId: "node-note",
        targetNodeId: "node-note",
      },
      fromNodeId: "node-note",
      fromHandleType: "source",
      nodes,
      edges: [
        {
          id: "edge-image-note",
          source: "node-image",
          target: "node-note",
        } as RFEdge,
      ],
    });

    expect(result).toBeNull();
  });
});
