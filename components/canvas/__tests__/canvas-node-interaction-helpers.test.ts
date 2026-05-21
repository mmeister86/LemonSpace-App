import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeResizeChangesToPersist,
  updateResizeInteractionState,
} from "@/components/canvas/canvas-node-resize-persistence";
import { adjustNodeDimensionChanges } from "@/components/canvas/canvas-node-change-helpers";
import {
  computeContentAwareNodeMinimumSize,
  getCanvasNodeStaticMinimumSize,
  resolveNextContentMinimumSize,
  type NodeMinimumSize,
} from "@/components/canvas/canvas-node-size-helpers";
import {
  findOverlappingGroupTarget,
  markGroupDropTarget,
} from "@/components/canvas/canvas-node-group-drop-target";
import { computeParentChangeForNode } from "@/components/canvas/canvas-node-parent-changes";
import {
  buildPendingEdgeSplit,
  getEffectiveSplitMiddleNode,
  getSplitCandidateEdge,
} from "@/components/canvas/canvas-edge-intersection-split";

describe("canvas node interaction helpers", () => {
  const projectRoot = process.cwd();

  it("tracks resize interaction state and persists only completed dimensions", () => {
    const isResizing = { current: false };
    const historyCaptured = { current: false };
    let historyCaptures = 0;

    updateResizeInteractionState(
      [
        { type: "dimensions", id: "node-a", resizing: true },
        {
          type: "dimensions",
          id: "node-a",
          resizing: false,
          dimensions: { width: 180, height: 120 },
        },
      ],
      isResizing,
      historyCaptured,
      () => {
        historyCaptures += 1;
      },
    );

    expect(isResizing.current).toBe(false);
    expect(historyCaptured.current).toBe(false);
    expect(historyCaptures).toBe(1);
    expect(
      computeResizeChangesToPersist(
        [
          {
            type: "dimensions",
            id: "node-a",
            resizing: false,
            dimensions: { width: 180, height: 120 },
          },
          {
            type: "dimensions",
            id: "node-b",
            resizing: true,
            dimensions: { width: 80, height: 60 },
          },
          {
            type: "dimensions",
            id: "node-c",
            resizing: false,
            dimensions: { width: 10, height: 10 },
          },
        ],
        new Set(["node-c"]),
      ),
    ).toEqual([{ nodeId: "node-a", width: 180, height: 120 }]);
  });

  it("clamps generic node dimension changes to the configured node minimum", () => {
    const promptMinimum = getCanvasNodeStaticMinimumSize("prompt");
    const promptNode: RFNode = {
      id: "prompt-1",
      type: "prompt",
      position: { x: 0, y: 0 },
      style: { width: 288, height: 220 },
      data: {},
    };

    expect(
      adjustNodeDimensionChanges(
        [
          {
            type: "dimensions",
            id: "prompt-1",
            resizing: false,
            dimensions: { width: 120, height: 80 },
          },
        ],
        [promptNode],
      ),
    ).toEqual([
      {
        type: "dimensions",
        id: "prompt-1",
        resizing: false,
        dimensions: {
          width: promptMinimum.minWidth,
          height: promptMinimum.minHeight,
        },
      },
    ]);
  });

  it("does not clamp collapsed node dimension changes to expanded minimums", () => {
    const collapsedColorAdjustNode: RFNode = {
      id: "color-adjust-1",
      type: "color-adjust",
      position: { x: 0, y: 0 },
      width: 300,
      height: 36,
      measured: { width: 300, height: 36 },
      style: { width: 300, height: 36 },
      data: {
        isCollapsed: true,
        expandedSize: { width: 300, height: 760 },
      },
    };
    const collapsedPromptNode: RFNode = {
      id: "prompt-1",
      type: "prompt",
      position: { x: 0, y: 60 },
      width: 288,
      height: 36,
      measured: { width: 288, height: 36 },
      style: { width: 288, height: 36 },
      data: {
        isCollapsed: true,
        expandedSize: { width: 288, height: 260 },
      },
    };

    expect(
      adjustNodeDimensionChanges(
        [
          {
            type: "dimensions",
            id: "color-adjust-1",
            dimensions: { width: 300, height: 36 },
          },
          {
            type: "dimensions",
            id: "prompt-1",
            dimensions: { width: 288, height: 36 },
          },
        ],
        [collapsedColorAdjustNode, collapsedPromptNode],
      ),
    ).toEqual([
      {
        type: "dimensions",
        id: "color-adjust-1",
        dimensions: { width: 300, height: 36 },
      },
      {
        type: "dimensions",
        id: "prompt-1",
        dimensions: { width: 288, height: 36 },
      },
    ]);
  });

  it("does not request a content minimum state update when measured size is unchanged", () => {
    const current: NodeMinimumSize = { minWidth: 320, minHeight: 240 };

    expect(resolveNextContentMinimumSize(current, current)).toBeNull();
    expect(
      resolveNextContentMinimumSize(current, {
        minWidth: 300,
        minHeight: 220,
      }),
    ).toBeNull();
  });

  it("returns the grown content minimum when measured content needs more space", () => {
    expect(
      resolveNextContentMinimumSize(
        { minWidth: 320, minHeight: 240 },
        { minWidth: 348, minHeight: 812 },
      ),
    ).toEqual({ minWidth: 348, minHeight: 812 });
  });

  it("does not grow text nodes horizontally from chrome overflow", () => {
    expect(
      computeContentAwareNodeMinimumSize({
        nodeType: "text",
        clientWidth: 300,
        scrollWidth: 306,
        clientHeight: 120,
        scrollHeight: 180,
      }),
    ).toEqual({ minWidth: 220, minHeight: 180 });
  });

  it("does not grow media nodes horizontally from self-scaling content", () => {
    expect(
      computeContentAwareNodeMinimumSize({
        nodeType: "asset-video",
        clientWidth: 320,
        scrollWidth: 1888,
        clientHeight: 180,
        scrollHeight: 180,
      }),
    ).toEqual({ minWidth: 200, minHeight: 120 });
  });

  it("keeps prompt widths stable while allowing vertical content growth", () => {
    expect(
      computeContentAwareNodeMinimumSize({
        nodeType: "video-prompt",
        clientWidth: 260,
        scrollWidth: 640,
        clientHeight: 260,
        scrollHeight: 318,
      }),
    ).toEqual({ minWidth: 260, minHeight: 318 });
  });

  it("keeps dynamic text-heavy node widths stable while allowing vertical growth", () => {
    const cases = [
      ["ai-text", 320, 640],
      ["ai-text-output", 320, 560],
      ["agent", 300, 700],
      ["agent-output", 320, 620],
    ] as const;

    for (const [nodeType, expectedMinWidth, expectedMinHeight] of cases) {
      expect(
        computeContentAwareNodeMinimumSize({
          nodeType,
          clientWidth: 360,
          scrollWidth: 428,
          clientHeight: 280,
          scrollHeight: expectedMinHeight,
        }),
      ).toEqual({
        minWidth: expectedMinWidth,
        minHeight: expectedMinHeight,
      });
    }
  });

  it("uses measured autosize content bounds when scrollHeight misses flex overflow", () => {
    const args = {
      nodeType: "ai-text",
      clientWidth: 460,
      scrollWidth: 460,
      clientHeight: 520,
      scrollHeight: 520,
      contentBoundsHeight: 610,
    } as Parameters<typeof computeContentAwareNodeMinimumSize>[0] & {
      contentBoundsHeight: number;
    };

    expect(computeContentAwareNodeMinimumSize(args)).toEqual({
      minWidth: 320,
      minHeight: 610,
    });
  });

  it("keeps dynamic AI and agent node content in measurable flow layouts", () => {
    const aiTextSource = readFileSync(
      join(projectRoot, "components/canvas/nodes/ai-text-node.tsx"),
      "utf8",
    );
    const aiTextOutputSource = readFileSync(
      join(projectRoot, "components/canvas/nodes/ai-text-output-node.tsx"),
      "utf8",
    );
    const agentSource = readFileSync(
      join(projectRoot, "components/canvas/nodes/agent-node.tsx"),
      "utf8",
    );
    const agentOutputSource = readFileSync(
      join(projectRoot, "components/canvas/nodes/agent-output-node.tsx"),
      "utf8",
    );

    expect(aiTextSource).not.toContain("className=\"flex h-full min-h-0 w-full min-w-0 flex-col\"");
    expect(aiTextSource).not.toContain("className=\"flex min-h-0 flex-1 flex-col gap-3 p-3\"");
    expect(aiTextSource).toContain("data-canvas-node-autosize-content");
    expect(aiTextSource).toContain("className=\"flex shrink-0 flex-col gap-3 p-3\"");

    expect(aiTextOutputSource).toContain("className=\"relative min-h-32 shrink-0 bg-muted/20\"");

    expect(agentSource).not.toContain("className=\"flex h-full flex-col gap-3 p-3\"");
    expect(agentSource).toContain("className=\"flex shrink-0 flex-col gap-3 p-3\"");

    expect(agentOutputSource).not.toContain("className=\"flex h-full flex-col gap-3 p-3\"");
    expect(agentOutputSource).toContain("className=\"flex shrink-0 flex-col gap-3 p-3\"");
  });

  it("selects the deepest overlapping group target and marks it", () => {
    const nodes: RFNode[] = [
      {
        id: "outer",
        type: "group",
        position: { x: 0, y: 0 },
        style: { width: 300, height: 300 },
        data: {},
      },
      {
        id: "inner",
        type: "group",
        parentId: "outer",
        position: { x: 50, y: 50 },
        style: { width: 180, height: 180 },
        data: {},
      },
      {
        id: "dragged",
        type: "image",
        position: { x: 80, y: 80 },
        style: { width: 40, height: 40 },
        data: {},
      },
    ];

    expect(findOverlappingGroupTarget(nodes[2], nodes)?.id).toBe("inner");
    expect(markGroupDropTarget(nodes, "inner").find((node) => node.id === "inner")?.data).toMatchObject({
      _groupDropTarget: true,
    });
  });

  it("computes relative parent assignment and absolute ungroup positions", () => {
    const group: RFNode = {
      id: "group",
      type: "group",
      position: { x: 100, y: 100 },
      style: { width: 200, height: 200 },
      data: {},
    };
    const overlappingNode: RFNode = {
      id: "image",
      type: "image",
      position: { x: 120, y: 140 },
      style: { width: 80, height: 80 },
      data: {},
    };
    const outsideChild: RFNode = {
      ...overlappingNode,
      parentId: "group",
      position: { x: 260, y: 260 },
    };

    expect(computeParentChangeForNode(overlappingNode, [group, overlappingNode])).toEqual({
      nodeId: "image",
      parentId: "group",
      position: { x: 20, y: 40 },
    });
    expect(computeParentChangeForNode(outsideChild, [group, outsideChild])).toEqual({
      nodeId: "image",
      parentId: undefined,
      position: { x: 360, y: 360 },
    });
  });

  it("resolves optimistic split nodes and builds pending split payloads", () => {
    const node: RFNode = {
      id: "optimistic_req-1",
      type: "image",
      position: { x: 10, y: 20 },
      data: {},
    };
    const edge: RFEdge = {
      id: "edge-a",
      source: "source",
      sourceHandle: "source-out",
      target: "target",
      targetHandle: "target-in",
    };

    expect(getEffectiveSplitMiddleNode(node, new Map([["req-1", "node-real"]]))).toMatchObject({
      id: "node-real",
    });
    expect(getSplitCandidateEdge("edge-a", [edge])).toBe(edge);
    expect(
      buildPendingEdgeSplit({
        intersectedEdge: edge,
        splitHandles: { source: "middle-out", target: "middle-in" },
        position: node.position,
      }),
    ).toEqual({
      intersectedEdgeId: "edge-a",
      sourceNodeId: "source",
      targetNodeId: "target",
      intersectedSourceHandle: "source-out",
      intersectedTargetHandle: "target-in",
      middleSourceHandle: "middle-out",
      middleTargetHandle: "middle-in",
      positionX: 10,
      positionY: 20,
    });
  });
});
