import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  convexEdgeToRF,
  convexEdgeToRFWithSourceGlow,
  convexNodeDocWithMergedStorageUrl,
  convexNodeToRF,
} from "@/lib/canvas-rf-adapters";
import {
  canvasHandleAccentColor,
  canvasHandleAccentColorWithAlpha,
  canvasHandleAccentRgb,
  canvasHandleGlowShadow,
  connectionLineAccentRgb,
  connectionLineGlowFilter,
  NODE_HANDLE_MAP,
  SOURCE_NODE_GLOW_RGB,
} from "@/lib/canvas-handle-style";
import {
  computeMediaNodeSize,
  NODE_DEFAULTS,
  resolveMediaAspectRatio,
} from "@/lib/canvas-node-defaults";
import { getCanvasNodeStaticMinimumSize } from "@/components/canvas/canvas-node-size-helpers";
import { computeBridgeCreatesForDeletedNodes } from "@/lib/canvas-bridge-edges";
import * as facade from "@/lib/canvas-utils";

function nodeDoc(overrides: Partial<Doc<"nodes">>): Doc<"nodes"> {
  return {
    _id: "node-1" as Id<"nodes">,
    _creationTime: 1,
    canvasId: "canvas-1" as Id<"canvases">,
    type: "image",
    positionX: 10,
    positionY: 20,
    width: 280,
    height: 200,
    data: {},
    status: "idle",
    statusMessage: undefined,
    retryCount: 0,
    parentId: undefined,
    zIndex: 5,
    ...overrides,
  } as Doc<"nodes">;
}

function edgeDoc(overrides: Partial<Doc<"edges">>): Doc<"edges"> {
  return {
    _id: "edge-1" as Id<"edges">,
    _creationTime: 1,
    canvasId: "canvas-1" as Id<"canvases">,
    sourceNodeId: "source-1" as Id<"nodes">,
    targetNodeId: "target-1" as Id<"nodes">,
    sourceHandle: undefined,
    targetHandle: "null",
    ...overrides,
  } as Doc<"edges">;
}

function rfNode(id: string): RFNode {
  return { id, position: { x: 0, y: 0 }, data: {} };
}

describe("split canvas utility modules", () => {
  it("isolates React Flow adapters while preserving the canvas-utils facade", () => {
    const node = nodeDoc({ data: { storageId: "storage-1", label: "Source" } });
    const previousDataByNodeId = new Map<string, Record<string, unknown>>();

    expect(convexNodeToRF(node)).toEqual(facade.convexNodeToRF(node));
    expect(convexEdgeToRF(edgeDoc({ sourceHandle: "prompt-out" }))).toEqual(
      facade.convexEdgeToRF(edgeDoc({ sourceHandle: "prompt-out" })),
    );
    expect(convexEdgeToRFWithSourceGlow(edgeDoc({}), "prompt", "light")).toEqual(
      facade.convexEdgeToRFWithSourceGlow(edgeDoc({}), "prompt", "light"),
    );
    expect(
      convexNodeDocWithMergedStorageUrl(
        node,
        { "storage-1": "https://cdn.example.com/source.png" },
        previousDataByNodeId,
      ),
    ).toEqual(
      facade.convexNodeDocWithMergedStorageUrl(
        node,
        { "storage-1": "https://cdn.example.com/source.png" },
        previousDataByNodeId,
      ),
    );
  });

  it("uses the node document canvasId as canonical React Flow node data", () => {
    const node = nodeDoc({
      canvasId: "canvas-real" as Id<"canvases">,
      data: {
        canvasId: "node-stale" as Id<"nodes">,
        templateId: "instagram-post-agent",
      },
    });

    expect(convexNodeToRF(node).data).toMatchObject({
      canvasId: "canvas-real",
      templateId: "instagram-post-agent",
    });
  });

  it("merges render last upload URLs from batched storage resolution", () => {
    const renderNode = nodeDoc({
      type: "render",
      data: { lastUploadStorageId: "storage-render-1" },
    });

    expect(
      convexNodeDocWithMergedStorageUrl(
        renderNode,
        { "storage-render-1": "https://cdn.example.com/render.png" },
        new Map(),
      ).data,
    ).toMatchObject({
      lastUploadStorageId: "storage-render-1",
      lastUploadUrl: "https://cdn.example.com/render.png",
    });
  });

  it("keeps the previous render last upload URL while batch resolution is pending", () => {
    const renderNode = nodeDoc({
      type: "render",
      data: { lastUploadStorageId: "storage-render-1" },
    });

    expect(
      convexNodeDocWithMergedStorageUrl(
        renderNode,
        undefined,
        new Map([
          [
            renderNode._id,
            {
              lastUploadStorageId: "storage-render-1",
              lastUploadUrl: "https://cdn.example.com/previous-render.png",
            },
          ],
        ]),
      ).data,
    ).toMatchObject({
      lastUploadUrl: "https://cdn.example.com/previous-render.png",
    });
  });

  it("isolates handle style and glow helpers while preserving legacy exports", () => {
    const args = { nodeType: "compare", handleId: "left", handleType: "target" as const };

    expect(SOURCE_NODE_GLOW_RGB["video-prompt"]).toEqual([124, 58, 237]);
    expect(facade.SOURCE_NODE_GLOW_RGB["video-prompt"]).toEqual(SOURCE_NODE_GLOW_RGB["video-prompt"]);
    expect(NODE_HANDLE_MAP.agent).toEqual({ target: "agent-in" });
    expect(facade.NODE_HANDLE_MAP.agent).toEqual(NODE_HANDLE_MAP.agent);
    expect(canvasHandleAccentRgb(args)).toEqual(facade.canvasHandleAccentRgb(args));
    expect(canvasHandleAccentColor(args)).toBe(facade.canvasHandleAccentColor(args));
    expect(canvasHandleAccentColorWithAlpha(args, 0.25)).toBe(
      facade.canvasHandleAccentColorWithAlpha(args, 0.25),
    );
    expect(canvasHandleGlowShadow({ ...args, strength: 1, colorMode: "dark" })).toBe(
      facade.canvasHandleGlowShadow({ ...args, strength: 1, colorMode: "dark" }),
    );
    expect(connectionLineAccentRgb("mixer", "overlay")).toEqual(
      facade.connectionLineAccentRgb("mixer", "overlay"),
    );
    expect(connectionLineGlowFilter({ nodeType: "mixer", handleId: "overlay", strength: 1, colorMode: "light" })).toBe(
      facade.connectionLineGlowFilter({ nodeType: "mixer", handleId: "overlay", strength: 1, colorMode: "light" }),
    );
  });

  it("uses role-specific colors for ai-text instruction and draft input handles", () => {
    const instruction = canvasHandleAccentRgb({
      nodeType: "ai-text",
      handleId: "ai-text-instruction-in-2",
      handleType: "target",
    });
    const draft = canvasHandleAccentRgb({
      nodeType: "ai-text",
      handleId: "ai-text-in-2",
      handleType: "target",
    });
    const output = canvasHandleAccentRgb({
      nodeType: "ai-text",
      handleId: "ai-text-out",
      handleType: "source",
    });

    expect(instruction).toEqual([245, 158, 11]);
    expect(draft).toEqual([20, 184, 166]);
    expect(instruction).not.toEqual(draft);
    expect(output).toEqual(SOURCE_NODE_GLOW_RGB["ai-text"]);
  });

  it("isolates node defaults and media sizing helpers while preserving legacy exports", () => {
    expect(NODE_DEFAULTS["video-prompt"]).toMatchObject({
      width: 288,
      height: 260,
      data: { modelId: "wan-2-2-720p", durationSeconds: 5 },
    });
    expect(NODE_DEFAULTS.prompt.height).toBe(260);
    expect(getCanvasNodeStaticMinimumSize("prompt").minHeight).toBe(260);
    expect(getCanvasNodeStaticMinimumSize("video-prompt").minHeight).toBe(260);
    expect(facade.NODE_DEFAULTS["video-prompt"]).toEqual(NODE_DEFAULTS["video-prompt"]);
    expect(resolveMediaAspectRatio(1920, 1080)).toBe(facade.resolveMediaAspectRatio(1920, 1080));
    expect(computeMediaNodeSize("image", { intrinsicWidth: 1600, intrinsicHeight: 900 })).toEqual(
      facade.computeMediaNodeSize("image", { intrinsicWidth: 1600, intrinsicHeight: 900 }),
    );
  });

  it("isolates bridge-edge creation while preserving legacy exports", () => {
    const source = rfNode("source-1");
    const deleted = rfNode("deleted-1");
    const target = rfNode("target-1");
    const edges: RFEdge[] = [
      { id: "edge-in", source: source.id, target: deleted.id, sourceHandle: "image-out" },
      { id: "edge-out", source: deleted.id, target: target.id, targetHandle: "image-in" },
    ];

    expect(computeBridgeCreatesForDeletedNodes([deleted], [source, deleted, target], edges)).toEqual([
      {
        sourceNodeId: "source-1",
        targetNodeId: "target-1",
        sourceHandle: "image-out",
        targetHandle: "image-in",
      },
    ]);
    expect(computeBridgeCreatesForDeletedNodes([deleted], [source, deleted, target], edges)).toEqual(
      facade.computeBridgeCreatesForDeletedNodes([deleted], [source, deleted, target], edges),
    );
  });
});
