import type { Dispatch, SetStateAction } from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import type { CanvasNodeType } from "@/lib/canvas-node-types";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import type { ConnectionDropMenuState } from "./canvas-connection-drop-menu";
import { validateCanvasConnectionByType } from "./canvas-connection-validation";
import { isOptimisticNodeId } from "./canvas-helpers";

type BaseCreateNodeWithEdgeArgs = {
  canvasId: Id<"canvases">;
  type: CanvasNodeType;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  data: Record<string, unknown>;
  clientRequestId: string;
  parentId?: Id<"nodes">;
  zIndex?: number;
  sourceHandle?: string;
  targetHandle?: string;
};

export type ConnectionDropMenuNodeAction =
  | {
      direction: "from-source";
      clientRequestId: string;
      mutationArgs: BaseCreateNodeWithEdgeArgs & { sourceNodeId: string };
    }
  | {
      direction: "to-target";
      clientRequestId: string;
      mutationArgs: BaseCreateNodeWithEdgeArgs & { targetNodeId: string };
    };

export function buildConnectionDropMenuNodeAction(args: {
  canvasId: Id<"canvases">;
  ctx: ConnectionDropMenuState;
  fromNode: RFNode;
  template: CanvasNodeTemplate;
  edges: RFEdge[];
  clientRequestId: string;
}): ConnectionDropMenuNodeAction | { validationError: CanvasConnectionValidationReason } {
  const defaults = NODE_DEFAULTS[args.template.type] ?? {
    width: 200,
    height: 100,
    data: {},
  };
  const handles = NODE_HANDLE_MAP[args.template.type];
  const width = args.template.width ?? defaults.width;
  const height = args.template.height ?? defaults.height;
  const data = {
    ...defaults.data,
    ...(args.template.defaultData as Record<string, unknown>),
    canvasId: args.canvasId,
  };

  const base = {
    canvasId: args.canvasId,
    type: args.template.type,
    positionX: args.ctx.flowX,
    positionY: args.ctx.flowY,
    width,
    height,
    data,
    clientRequestId: args.clientRequestId,
  };

  if (args.ctx.fromHandleType === "source") {
    const validationError = validateCanvasConnectionByType({
      sourceType: args.fromNode.type ?? "",
      targetType: args.template.type,
      targetNodeId: `__pending_${args.template.type}_${Date.now()}`,
      targetHandle: handles?.target,
      edges: args.edges,
    });
    if (validationError) return { validationError };

    return {
      direction: "from-source",
      clientRequestId: args.clientRequestId,
      mutationArgs: {
        ...base,
        sourceNodeId: args.ctx.fromNodeId,
        sourceHandle: args.ctx.fromHandleId,
        targetHandle: handles?.target ?? undefined,
      },
    };
  }

  const validationError = validateCanvasConnectionByType({
    sourceType: args.template.type,
    targetType: args.fromNode.type ?? "",
    targetNodeId: args.fromNode.id,
    targetHandle: args.ctx.fromHandleId,
    edges: args.edges,
  });
  if (validationError) return { validationError };

  return {
    direction: "to-target",
    clientRequestId: args.clientRequestId,
    mutationArgs: {
      ...base,
      targetNodeId: args.ctx.fromNodeId,
      sourceHandle: handles?.source ?? undefined,
      targetHandle: args.ctx.fromHandleId,
    },
  };
}

export async function settleConnectionDropMenuNodeAction(args: {
  realId: Id<"nodes"> | string;
  clientRequestId: string;
  resolvedRealIdByClientRequest: Map<string, Id<"nodes">>;
  syncPendingMoveForClientRequest: (
    clientRequestId: string,
    realId?: Id<"nodes">,
  ) => Promise<unknown>;
  setEdgeSyncNonce: Dispatch<SetStateAction<number>>;
}): Promise<void> {
  if (isOptimisticNodeId(args.realId as string)) {
    return;
  }

  const settledRealId = args.realId as Id<"nodes">;
  args.resolvedRealIdByClientRequest.set(args.clientRequestId, settledRealId);
  await args.syncPendingMoveForClientRequest(args.clientRequestId, settledRealId);
  args.setEdgeSyncNonce((n) => n + 1);
}
