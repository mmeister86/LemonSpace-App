import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  getConnectedEdges,
  type Edge as RFEdge,
  type Node as RFNode,
  type OnBeforeDelete,
} from "@xyflow/react";
import { useTranslations } from "next-intl";

import type { Id } from "@/convex/_generated/dataModel";
import { computeBridgeCreatesForDeletedNodes } from "@/lib/canvas-utils";
import { toast } from "@/lib/toast";
import { type CanvasNodeDeleteBlockReason } from "@/lib/toast";

import { getNodeDeleteBlockReason } from "./canvas-helpers";
import { validateCanvasConnection } from "./canvas-connection-validation";

type ToastTranslations = ReturnType<typeof useTranslations<'toasts'>>;

const BRIDGE_CREATE_MAX_ATTEMPTS = 4;
const BRIDGE_CREATE_INITIAL_BACKOFF_MS = 40;

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRetryableBridgeCreateError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("not authenticated")
  ) {
    return false;
  }

  if (
    message.includes("limit") ||
    message.includes("duplicate") ||
    message.includes("already exists") ||
    message.includes("conflict") ||
    message.includes("concurrent") ||
    message.includes("tempor") ||
    message.includes("timeout") ||
    message.includes("try again") ||
    message.includes("retry") ||
    message.includes("stale")
  ) {
    return true;
  }

  return true;
}

type UseCanvasDeleteHandlersParams = {
  t: ToastTranslations;
  canvasId: Id<"canvases">;
  nodesRef: MutableRefObject<RFNode[]>;
  edgesRef: MutableRefObject<RFEdge[]>;
  deletingNodeIds: MutableRefObject<Set<string>>;
  setAssetBrowserTargetNodeId: Dispatch<SetStateAction<string | null>>;
  runBatchRemoveNodesMutation: (args: { nodeIds: Id<"nodes">[] }) => Promise<unknown>;
  runCreateEdgeMutation: (args: {
    canvasId: Id<"canvases">;
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
  }) => Promise<unknown>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
  onHistoryCapture?: () => void;
};

export function useCanvasDeleteHandlers({
  t,
  canvasId,
  nodesRef,
  edgesRef,
  deletingNodeIds,
  setAssetBrowserTargetNodeId,
  runBatchRemoveNodesMutation,
  runCreateEdgeMutation,
  runRemoveEdgeMutation,
  onHistoryCapture,
}: UseCanvasDeleteHandlersParams): {
  onBeforeDelete: OnBeforeDelete<RFNode, RFEdge>;
  onNodesDelete: (deletedNodes: RFNode[]) => void;
  onEdgesDelete: (deletedEdges: RFEdge[]) => void;
} {
  const edgeKey = useCallback(
    (edge: Pick<RFEdge, "source" | "target" | "sourceHandle" | "targetHandle">) =>
      `${edge.source}\0${edge.target}\0${edge.sourceHandle ?? ""}\0${edge.targetHandle ?? ""}`,
    [],
  );

  const onBeforeDelete = useCallback(
    async ({
      nodes: matchingNodes,
      edges: matchingEdges,
    }: {
      nodes: RFNode[];
      edges: RFEdge[];
    }) => {
      if (matchingNodes.length === 0) {
        if (matchingEdges.some((edge) => edge.className !== "temp")) {
          onHistoryCapture?.();
        }
        return true;
      }

      const allowed: RFNode[] = [];
      const blocked: RFNode[] = [];
      const blockedReasons = new Set<CanvasNodeDeleteBlockReason>();
      for (const node of matchingNodes) {
        const reason = getNodeDeleteBlockReason(node);
        if (reason !== null) {
          blocked.push(node);
          blockedReasons.add(reason);
        } else {
          allowed.push(node);
        }
      }

      if (allowed.length === 0) {
        const title = t('canvas.nodeDeleteBlockedTitle');
        const desc = t('canvas.nodeDeleteBlockedDesc');
        toast.warning(title, desc);
        return false;
      }

      if (blocked.length > 0) {
        const title = t('canvas.nodeDeleteBlockedPartialTitle');
        const whyDesc = t('canvas.nodeDeleteBlockedDesc');
        const suffix =
          blocked.length === 1
            ? t('canvas.nodeDeleteBlockedPartialSuffixOne')
            : t('canvas.nodeDeleteBlockedPartialSuffixOther', { count: blocked.length });
        const desc = `${whyDesc} ${suffix}`;
        toast.warning(title, desc);
        onHistoryCapture?.();
        return {
          nodes: allowed,
          edges: getConnectedEdges(allowed, matchingEdges),
        };
      }

      onHistoryCapture?.();
      return true;
    },
    [onHistoryCapture, t],
  );

  const onNodesDelete = useCallback(
    (deletedNodes: RFNode[]) => {
      const count = deletedNodes.length;
      if (count === 0) return;

      const idsToDelete = deletedNodes.map((node) => node.id);
      for (const id of idsToDelete) {
        deletingNodeIds.current.add(id);
      }

      const removedTargetSet = new Set(idsToDelete);
      setAssetBrowserTargetNodeId((current) =>
        current !== null && removedTargetSet.has(current) ? null : current,
      );

      const liveNodes = nodesRef.current;
      const liveEdges = edgesRef.current;

      const bridgeCreates = computeBridgeCreatesForDeletedNodes(
        deletedNodes,
        liveNodes,
        liveEdges,
      );
      const bridgeEdgesCreatedInThisRun: RFEdge[] = [];

      const getRemainingNodes = () =>
        nodesRef.current.filter((node) => !removedTargetSet.has(node.id));

      const getRemainingEdges = () => {
        const fromRefs = edgesRef.current.filter((edge) => {
          if (edge.className === "temp") {
            return false;
          }

          if (removedTargetSet.has(edge.source) || removedTargetSet.has(edge.target)) {
            return false;
          }

          return true;
        });

        const deduped = [...fromRefs];
        const dedupedKeys = new Set(fromRefs.map((edge) => edgeKey(edge)));
        for (const createdEdge of bridgeEdgesCreatedInThisRun) {
          const key = edgeKey(createdEdge);
          if (dedupedKeys.has(key)) {
            continue;
          }
          deduped.push(createdEdge);
          dedupedKeys.add(key);
        }

        return deduped;
      };

      if (bridgeCreates.length > 0) {
        console.info("[Canvas] computed bridge edges for delete", {
          canvasId,
          deletedNodeIds: idsToDelete,
          deletedNodes: deletedNodes.map((node) => ({
            id: node.id,
            type: node.type ?? null,
          })),
          bridgeCreates,
        });
      }

      void (async () => {
        await runBatchRemoveNodesMutation({
          nodeIds: idsToDelete as Id<"nodes">[],
        });

        for (const bridgeCreate of bridgeCreates) {
          const bridgeKey = edgeKey({
            source: bridgeCreate.sourceNodeId,
            target: bridgeCreate.targetNodeId,
            sourceHandle: bridgeCreate.sourceHandle,
            targetHandle: bridgeCreate.targetHandle,
          });

          let created = false;

          for (
            let attempt = 1;
            attempt <= BRIDGE_CREATE_MAX_ATTEMPTS;
            attempt += 1
          ) {
            const remainingNodes = getRemainingNodes();
            const remainingEdges = getRemainingEdges();

            if (remainingEdges.some((edge) => edgeKey(edge) === bridgeKey)) {
              console.info("[Canvas] skipped duplicate bridge edge after delete", {
                canvasId,
                deletedNodeIds: idsToDelete,
                bridgeCreate,
              });
              break;
            }

            const validationError = validateCanvasConnection(
              {
                source: bridgeCreate.sourceNodeId,
                target: bridgeCreate.targetNodeId,
                sourceHandle: bridgeCreate.sourceHandle ?? null,
                targetHandle: bridgeCreate.targetHandle ?? null,
              },
              remainingNodes,
              remainingEdges,
              undefined,
              { includeOptimisticEdges: true },
            );

            if (validationError) {
              console.info("[Canvas] skipped invalid bridge edge after delete", {
                canvasId,
                deletedNodeIds: idsToDelete,
                bridgeCreate,
                validationError,
              });
              break;
            }

            try {
              console.info("[Canvas] creating bridge edge after delete", {
                canvasId,
                deletedNodeIds: idsToDelete,
                bridgeCreate,
                attempt,
              });

              await runCreateEdgeMutation({
                canvasId,
                sourceNodeId: bridgeCreate.sourceNodeId,
                targetNodeId: bridgeCreate.targetNodeId,
                sourceHandle: bridgeCreate.sourceHandle,
                targetHandle: bridgeCreate.targetHandle,
              });

              bridgeEdgesCreatedInThisRun.push({
                id: `bridge-${bridgeCreate.sourceNodeId}-${bridgeCreate.targetNodeId}-${bridgeEdgesCreatedInThisRun.length}`,
                source: bridgeCreate.sourceNodeId,
                target: bridgeCreate.targetNodeId,
                sourceHandle: bridgeCreate.sourceHandle,
                targetHandle: bridgeCreate.targetHandle,
              });
              created = true;
              break;
            } catch (error: unknown) {
              const errorMessage = getErrorMessage(error);
              const retryable = isRetryableBridgeCreateError(error);
              const isLastAttempt = attempt >= BRIDGE_CREATE_MAX_ATTEMPTS;

              if (!retryable || isLastAttempt) {
                console.error("[Canvas] bridge edge create failed", {
                  canvasId,
                  deletedNodeIds: idsToDelete,
                  bridgeCreate,
                  attempt,
                  maxAttempts: BRIDGE_CREATE_MAX_ATTEMPTS,
                  retryable,
                  error: errorMessage,
                });
                break;
              }

              const backoffMs =
                BRIDGE_CREATE_INITIAL_BACKOFF_MS * 2 ** (attempt - 1);

              console.warn("[Canvas] bridge edge create retry scheduled", {
                canvasId,
                deletedNodeIds: idsToDelete,
                bridgeCreate,
                attempt,
                nextAttempt: attempt + 1,
                backoffMs,
                error: errorMessage,
              });

              await waitFor(backoffMs);
            }
          }

          if (!created) {
            continue;
          }
        }
      })()
        .then(() => {
          // Erfolg bedeutet hier nur: Mutation/Queue wurde angenommen.
          // Den Delete-Lock erst lösen, wenn Convex-Snapshot die Node wirklich nicht mehr enthält.
        })
        .catch((error: unknown) => {
          console.error("[Canvas] batch remove failed", {
            canvasId,
            deletedNodeIds: idsToDelete,
            error: getErrorMessage(error),
          });
          for (const id of idsToDelete) {
            deletingNodeIds.current.delete(id);
          }
        });

      const title = t('canvas.nodesRemoved', { count });
      toast.info(title);
    },
    [
      t,
      canvasId,
      deletingNodeIds,
      edgeKey,
      edgesRef,
      nodesRef,
      runBatchRemoveNodesMutation,
      runCreateEdgeMutation,
      setAssetBrowserTargetNodeId,
    ],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: RFEdge[]) => {
      for (const edge of deletedEdges) {
        if (edge.className === "temp") {
          continue;
        }

        void runRemoveEdgeMutation({ edgeId: edge.id as Id<"edges"> }).catch(
          (error) => {
            console.error("[Canvas edge remove failed] edge delete", {
              edgeId: edge.id,
              edgeClassName: edge.className ?? null,
              source: edge.source,
              target: edge.target,
              error: String(error),
            });
          },
        );
      }
    },
    [runRemoveEdgeMutation],
  );

  return { onBeforeDelete, onNodesDelete, onEdgesDelete };
}
