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

type UseCanvasDeleteHandlersParams = {
  t: ToastTranslations;
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
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
};

export function useCanvasDeleteHandlers({
  t,
  canvasId,
  nodes,
  edges,
  nodesRef,
  edgesRef,
  deletingNodeIds,
  setAssetBrowserTargetNodeId,
  runBatchRemoveNodesMutation,
  runCreateEdgeMutation,
  runRemoveEdgeMutation,
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
        return {
          nodes: allowed,
          edges: getConnectedEdges(allowed, matchingEdges),
        };
      }

      return true;
    },
    [t],
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
      const connectedDeletedEdges = getConnectedEdges(deletedNodes, liveEdges);
      const remainingNodes = liveNodes.filter(
        (node) => !removedTargetSet.has(node.id),
      );
      let remainingEdges = liveEdges.filter(
        (edge) => !connectedDeletedEdges.includes(edge) && edge.className !== "temp",
      );

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
          if (remainingEdges.some((edge) => edgeKey(edge) === bridgeKey)) {
            console.info("[Canvas] skipped duplicate bridge edge after delete", {
              canvasId,
              deletedNodeIds: idsToDelete,
              bridgeCreate,
            });
            continue;
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
            continue;
          }

          try {
            console.info("[Canvas] creating bridge edge after delete", {
              canvasId,
              deletedNodeIds: idsToDelete,
              bridgeCreate,
            });

            await runCreateEdgeMutation({
              canvasId,
              sourceNodeId: bridgeCreate.sourceNodeId,
              targetNodeId: bridgeCreate.targetNodeId,
              sourceHandle: bridgeCreate.sourceHandle,
              targetHandle: bridgeCreate.targetHandle,
            });
            remainingEdges = [
              ...remainingEdges,
              {
                id: `bridge-${bridgeCreate.sourceNodeId}-${bridgeCreate.targetNodeId}-${remainingEdges.length}`,
                source: bridgeCreate.sourceNodeId,
                target: bridgeCreate.targetNodeId,
                sourceHandle: bridgeCreate.sourceHandle,
                targetHandle: bridgeCreate.targetHandle,
              },
            ];
          } catch (error: unknown) {
            console.error("[Canvas] bridge edge create failed", {
              canvasId,
              deletedNodeIds: idsToDelete,
              bridgeCreate,
              error,
            });
            throw error;
          }
        }
      })()
        .then(() => {
          // Erfolg bedeutet hier nur: Mutation/Queue wurde angenommen.
          // Den Delete-Lock erst lösen, wenn Convex-Snapshot die Node wirklich nicht mehr enthält.
        })
        .catch((error: unknown) => {
          console.error("[Canvas] batch remove failed", error);
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
      edges,
      edgesRef,
      nodes,
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
