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
