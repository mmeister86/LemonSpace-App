/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas sync node create actions. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

export function ensureCanvasSyncClientRequestId<TArgs extends { clientRequestId?: string }>(
  args: TArgs,
): TArgs & { clientRequestId: string } {
  return {
    ...args,
    clientRequestId: args.clientRequestId ?? crypto.randomUUID(),
  };
}

export function shouldRunCreateWithPersistedEndpoint(
  isSyncOnline: boolean,
  connectedNodeId: string,
  isOptimisticNodeId: (nodeId: string) => boolean,
): boolean {
  return isSyncOnline && !isOptimisticNodeId(connectedNodeId);
}
