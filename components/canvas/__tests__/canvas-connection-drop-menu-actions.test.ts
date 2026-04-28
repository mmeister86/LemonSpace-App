import { describe, expect, it, vi } from "vitest";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import {
  buildConnectionDropMenuNodeAction,
  settleConnectionDropMenuNodeAction,
} from "@/components/canvas/canvas-connection-drop-menu-actions";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";

describe("connection drop-menu node actions", () => {
  it("builds a source-to-new-node action with defaults, template data, and validation", () => {
    const fromNode: RFNode = {
      id: "node-source",
      type: "image",
      position: { x: 0, y: 0 },
      data: {},
    };
    const template = {
      type: "mixer",
      label: "Mixer",
      defaultData: { opacity: 50 },
    } as CanvasNodeTemplate;

    const action = buildConnectionDropMenuNodeAction({
      canvasId: "canvas-1" as never,
      ctx: {
        screenX: 10,
        screenY: 20,
        flowX: 300,
        flowY: 140,
        fromNodeId: "node-source" as never,
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
          data: expect.objectContaining({ canvasId: "canvas-1", opacity: 50 }),
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
        fromHandleType: "source",
      },
      fromNode: {
        id: "node-video",
        type: "video",
        position: { x: 0, y: 0 },
        data: {},
      } as RFNode,
      template: { type: "mixer", label: "Mixer" } as CanvasNodeTemplate,
      edges: [] as RFEdge[],
      clientRequestId: "request-1",
    });

    expect(action).toEqual({ validationError: "mixer-source-invalid" });
  });

  it("settles non-optimistic created node ids and skips optimistic ids", async () => {
    const resolvedRealIds = new Map<string, string>();
    const syncPendingMoveForClientRequest = vi.fn(async () => undefined);
    const setEdgeSyncNonce = vi.fn<(updater: (n: number) => number) => void>();

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
