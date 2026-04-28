import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type NodeCreateMutationName =
  | "nodes.create"
  | "nodes.createWithEdgeSplit"
  | "nodes.createWithEdgeFromSource"
  | "nodes.createWithEdgeToTarget"
  | "nodes.createGroupFromSelection";

const OPTIMISTIC_NODE_PREFIX = "optimistic_";
const NODE_CREATE_MUTATIONS: NodeCreateMutationName[] = [
  "nodes.create",
  "nodes.createWithEdgeSplit",
  "nodes.createWithEdgeFromSource",
  "nodes.createWithEdgeToTarget",
  "nodes.createGroupFromSelection",
];

export async function getIdempotentNodeCreateResult(
  ctx: MutationCtx,
  args: {
    userId: string;
    mutation: NodeCreateMutationName;
    clientRequestId?: string;
    canvasId: Id<"canvases">;
  },
): Promise<Id<"nodes"> | null> {
  const clientRequestId = args.clientRequestId;
  if (!clientRequestId) return null;

  const existing = await ctx.db
    .query("mutationRequests")
    .withIndex("by_user_mutation_request", (q) =>
      q
        .eq("userId", args.userId)
        .eq("mutation", args.mutation)
        .eq("clientRequestId", clientRequestId),
    )
    .first();

  if (!existing) return null;
  if (existing.canvasId && existing.canvasId !== args.canvasId) {
    throw new Error("Client request conflict");
  }
  if (!existing.nodeId) return null;
  return existing.nodeId;
}

export async function rememberIdempotentNodeCreateResult(
  ctx: MutationCtx,
  args: {
    userId: string;
    mutation: NodeCreateMutationName;
    clientRequestId?: string;
    canvasId: Id<"canvases">;
    nodeId: Id<"nodes">;
  },
): Promise<void> {
  if (!args.clientRequestId) return;
  await ctx.db.insert("mutationRequests", {
    userId: args.userId,
    mutation: args.mutation,
    clientRequestId: args.clientRequestId,
    canvasId: args.canvasId,
    nodeId: args.nodeId,
    createdAt: Date.now(),
  });
}

function getClientRequestIdFromOptimisticNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(OPTIMISTIC_NODE_PREFIX)) {
    return null;
  }
  const clientRequestId = nodeId.slice(OPTIMISTIC_NODE_PREFIX.length);
  return clientRequestId.length > 0 ? clientRequestId : null;
}

export async function resolveNodeReferenceForWrite(
  ctx: MutationCtx,
  args: {
    userId: string;
    canvasId: Id<"canvases">;
    nodeId: string;
  },
): Promise<Id<"nodes">> {
  const clientRequestId = getClientRequestIdFromOptimisticNodeId(args.nodeId);
  if (!clientRequestId) {
    return args.nodeId as Id<"nodes">;
  }

  for (const mutation of NODE_CREATE_MUTATIONS) {
    const resolvedNodeId = await getIdempotentNodeCreateResult(ctx, {
      userId: args.userId,
      mutation,
      clientRequestId,
      canvasId: args.canvasId,
    });
    if (resolvedNodeId) {
      return resolvedNodeId;
    }
  }

  throw new Error(`Referenced node not found for optimistic id ${args.nodeId}`);
}
