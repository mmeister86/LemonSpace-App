import { describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";
import type { Dispatch, SetStateAction } from "react";

import {
  buildConnectionDropMenuNodeAction,
  settleConnectionDropMenuNodeAction,
} from "@/components/canvas/canvas-connection-drop-menu-actions";
import {
  CANVAS_NODE_TEMPLATES,
  type CanvasNodeTemplate,
} from "@/lib/canvas-node-templates";

function getMixerTemplate(): Extract<CanvasNodeTemplate, { type: "mixer" }> {
  const template = CANVAS_NODE_TEMPLATES.find(
    (candidate): candidate is Extract<CanvasNodeTemplate, { type: "mixer" }> =>
      candidate.type === "mixer",
  );
  if (!template) {
    throw new Error("Mixer template missing");
  }
  return template;
}

function getCommentTemplate(): Extract<CanvasNodeTemplate, { type: "comment" }> {
  const template = CANVAS_NODE_TEMPLATES.find(
    (candidate): candidate is Extract<CanvasNodeTemplate, { type: "comment" }> =>
      candidate.type === "comment",
  );
  if (!template) {
    throw new Error("Comment template missing");
  }
  return template;
}

describe("connection drop-menu node actions", () => {
  it("builds a source-to-new-node action with defaults, template data, and validation", () => {
    const fromNode: RFNode = {
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
      data: {},
    };
    const template = getMixerTemplate();

    const action = buildConnectionDropMenuNodeAction({
      canvasId: "canvas-1" as never,
      ctx: {
        screenX: 10,
        screenY: 20,
        flowX: 300,
        flowY: 140,
        fromNodeId: "node-source" as never,
        fromHandleId: undefined,
        fromHandleType: "source",
      },
      fromNode,
      template,
      edges: [],
      clientRequestId: "request-1",
    });

    expect(action).toEqual(
      expect.objectContaining({
        direction: "from-source",
        clientRequestId: "request-1",
        mutationArgs: expect.objectContaining({
          canvasId: "canvas-1",
          type: "mixer",
          positionX: 300,
          positionY: 140,
          sourceNodeId: "node-source",
          targetHandle: "base",
          data: expect.objectContaining({ canvasId: "canvas-1", opacity: 100 }),
        }),
      }),
    );
  });

  it("returns a validation error instead of mutation args for invalid menu-created edges", () => {
    const action = buildConnectionDropMenuNodeAction({
      canvasId: "canvas-1" as never,
      ctx: {
        screenX: 10,
        screenY: 20,
        flowX: 300,
        flowY: 140,
        fromNodeId: "node-video" as never,
        fromHandleId: undefined,
        fromHandleType: "source",
      },
      fromNode: {
        id: "node-video",
        type: "video",
        position: { x: 0, y: 0 },
        data: {},
      } as RFNode,
      template: getMixerTemplate(),
      edges: [] as RFEdge[],
      clientRequestId: "request-1",
    });

    expect(action).toEqual({ validationError: "mixer-source-invalid" });
  });

  it("rejects non-connectable comment nodes from connection-created placement", () => {
    const action = buildConnectionDropMenuNodeAction({
      canvasId: "canvas-1" as never,
      ctx: {
        screenX: 10,
        screenY: 20,
        flowX: 300,
        flowY: 140,
        fromNodeId: "node-image" as never,
        fromHandleId: undefined,
        fromHandleType: "source",
      },
      fromNode: {
        id: "node-image",
        type: "image",
        position: { x: 0, y: 0 },
        data: {},
      } as RFNode,
      template: getCommentTemplate(),
      edges: [] as RFEdge[],
      clientRequestId: "request-1",
    });

    expect(action).toEqual({ validationError: "incomplete" });
  });

  it("settles non-optimistic created node ids and skips optimistic ids", async () => {
    const resolvedRealIds = new Map<string, string>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const setEdgeSyncNonce: Dispatch<SetStateAction<number>> = vi.fn();

    await settleConnectionDropMenuNodeAction({
      realId: "node-real" as never,
      clientRequestId: "request-1",
      resolvedRealIdByClientRequest: resolvedRealIds as never,
      syncPendingMoveForClientRequest,
      setEdgeSyncNonce,
    });

    await settleConnectionDropMenuNodeAction({
      realId: "optimistic_request-2" as never,
      clientRequestId: "request-2",
      resolvedRealIdByClientRequest: resolvedRealIds as never,
      syncPendingMoveForClientRequest,
      setEdgeSyncNonce,
    });

    expect(resolvedRealIds.get("request-1")).toBe("node-real");
    expect(resolvedRealIds.has("request-2")).toBe(false);
    expect(syncPendingMoveForClientRequest).toHaveBeenCalledTimes(1);
    expect(setEdgeSyncNonce).toHaveBeenCalledTimes(1);
  });
});
