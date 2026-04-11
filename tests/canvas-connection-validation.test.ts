import { describe, expect, it } from "vitest";

import { validateCanvasEdgeSplit } from "@/components/canvas/canvas-connection-validation";

describe("validateCanvasEdgeSplit", () => {
  it("uses middle-node target handle for first split leg", () => {
    const reason = validateCanvasEdgeSplit({
      nodes: [
        { id: "node-source", type: "image", position: { x: 0, y: 0 }, data: {} },
        { id: "node-target", type: "compare", position: { x: 400, y: 0 }, data: {} },
      ],
      edges: [
        {
          id: "edge-source-target",
          source: "node-source",
          target: "node-target",
          targetHandle: "left",
        },
      ],
      splitEdge: {
        id: "edge-source-target",
        source: "node-source",
        target: "node-target",
        targetHandle: "left",
      },
      middleNode: { id: "node-middle", type: "mixer", position: { x: 200, y: 0 }, data: {} },
    });

    expect(reason).toBeNull();
  });
});
