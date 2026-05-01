/**
 * Onboarding note:
 * Convex backend module for node status helpers. Keep auth checks, ownership validation, and idempotency close to the mutation/query that touches user data.
 */

import type { Doc } from "./_generated/dataModel";

export type NodeStatus = Doc<"nodes">["status"];

export type NodeStatusPatch = {
  status: NodeStatus;
  statusMessage?: string;
  retryCount?: number;
};

export function mergeNodeData(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...previous,
    ...next,
  };
}

export function buildNodeExecutingPatch(options?: {
  statusMessage?: string;
  retryCount?: number;
}): NodeStatusPatch {
  return {
    status: "executing",
    retryCount: options?.retryCount ?? 0,
    statusMessage: options?.statusMessage,
  };
}

export function buildNodeRetryPatch(options: {
  retryCount: number;
  statusMessage: string;
}): NodeStatusPatch {
  return buildNodeExecutingPatch(options);
}

export function buildNodeDonePatch(options?: {
  retryCount?: number;
}): NodeStatusPatch {
  return {
    status: "done",
    retryCount: options?.retryCount ?? 0,
    statusMessage: undefined,
  };
}

export function buildNodeErrorPatch(options: {
  retryCount?: number;
  statusMessage: string;
}): NodeStatusPatch {
  return {
    status: "error",
    retryCount: options.retryCount,
    statusMessage: options.statusMessage,
  };
}

export function buildNodeStatusUpdatePatch(options: {
  status: NodeStatus;
  statusMessage?: string;
  retryCount?: number;
}): NodeStatusPatch {
  const patch: NodeStatusPatch = {
    status: options.status,
  };
  if (options.statusMessage !== undefined) {
    patch.statusMessage = options.statusMessage;
  } else if (
    options.status === "done" ||
    options.status === "executing" ||
    options.status === "idle"
  ) {
    patch.statusMessage = undefined;
  }
  if (options.retryCount !== undefined) {
    patch.retryCount = options.retryCount;
  }
  return patch;
}
