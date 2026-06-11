/**
 * Onboarding note:
 * Backend helper for Canvas node validation. Keep ownership checks, idempotency, and graph cleanup rules aligned with public node mutations.
 */

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { validateBatchNodesForUserOrThrow } from "../batch_validation_utils";
import {
  getCanvasConnectionValidationMessage,
  validateCanvasConnectionPolicy,
} from "../../lib/canvas-connection-policy";

const PERFORMANCE_LOG_THRESHOLD_MS = 250;
const INCOMING_EDGE_POLICY_INSPECTION_LIMIT = 8;

export async function getValidatedBatchNodesOrThrow(
  ctx: MutationCtx,
  userId: string,
  nodeIds: Id<"nodes">[],
): Promise<{ canvasId: Id<"canvases">; nodes: Doc<"nodes">[] }> {
  return await validateBatchNodesForUserOrThrow({
    userId,
    nodeIds,
    getNodeById: (nodeId) => ctx.db.get(nodeId),
    getCanvasById: (canvasId) => ctx.db.get(canvasId),
  });
}

async function getIncomingEdgePolicyContext(
  ctx: MutationCtx,
  args: {
    targetNodeId: Id<"nodes">;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<{
  count: number;
  targetHandles: Array<string | undefined>;
  sourceTypes: string[];
  edgeKinds: Array<string | undefined>;
}> {
  const incomingEdgesQuery = ctx.db
    .query("edges")
    .withIndex("by_target", (q) => q.eq("targetNodeId", args.targetNodeId));

  const checkStartedAt = Date.now();
  const incomingEdges = await incomingEdgesQuery.take(
    INCOMING_EDGE_POLICY_INSPECTION_LIMIT,
  );
  const checkDurationMs = Date.now() - checkStartedAt;

  const filteredIncomingEdges = incomingEdges.filter(
    (edge) => edge._id !== args.edgeIdToIgnore,
  );
  const incomingCount = filteredIncomingEdges.length;
  if (checkDurationMs >= PERFORMANCE_LOG_THRESHOLD_MS) {
    const inspected = incomingEdges.length;

    console.warn("[nodes.countIncomingEdges] slow incoming edge check", {
      targetNodeId: args.targetNodeId,
      edgeIdToIgnore: args.edgeIdToIgnore,
      inspected,
      checkDurationMs,
    });
  }

  const sourceNodes = await Promise.all(
    filteredIncomingEdges.map((edge) => ctx.db.get(edge.sourceNodeId)),
  );

  return {
    count: incomingCount,
    targetHandles: filteredIncomingEdges.map((edge) => edge.targetHandle),
    sourceTypes: sourceNodes.map((node) => node?.type ?? ""),
    edgeKinds: filteredIncomingEdges.map((edge) => edge.kind),
  };
}

export async function assertConnectionPolicyForTypes(
  ctx: MutationCtx,
  args: {
    sourceType: Doc<"nodes">["type"];
    targetType: Doc<"nodes">["type"];
    targetNodeId: Id<"nodes">;
    targetHandle?: string;
    edgeIdToIgnore?: Id<"edges">;
  },
): Promise<void> {
  const targetIncoming = await getIncomingEdgePolicyContext(ctx, {
    targetNodeId: args.targetNodeId,
    edgeIdToIgnore: args.edgeIdToIgnore,
  });

  const reason = validateCanvasConnectionPolicy({
    sourceType: args.sourceType,
    targetType: args.targetType,
    targetIncomingCount: targetIncoming.count,
    targetHandle: args.targetHandle,
    targetIncomingHandles: targetIncoming.targetHandles,
    targetIncomingSourceTypes: targetIncoming.sourceTypes,
    targetIncomingEdgeKinds: targetIncoming.edgeKinds,
  });

  if (reason) {
    throw new Error(getCanvasConnectionValidationMessage(reason));
  }
}
