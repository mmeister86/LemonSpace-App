import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  getConnectedEdges,
  type Edge as RFEdge,
  type Node as RFNode,
  type OnBeforeDelete,
} from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import { computeBridgeCreatesForDeletedNodes } from "@/lib/canvas-utils";
import { toast } from "@/lib/toast";
import { msg, type CanvasNodeDeleteBlockReason } from "@/lib/toast-messages";

import { getNodeDeleteBlockReason, isOptimisticEdgeId } from "./canvas-helpers";

type UseCanvasDeleteHandlersParams = {
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
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
  canvasId,
  nodes,
  edges,
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
        const { title, desc } = msg.canvas.nodeDeleteBlockedExplain(blockedReasons);
        toast.warning(title, desc);
        return false;
      }

      if (blocked.length > 0) {
        const { title, desc } = msg.canvas.nodeDeleteBlockedPartial(
          blocked.length,
          blockedReasons,
        );
        toast.warning(title, desc);
        return {
          nodes: allowed,
          edges: getConnectedEdges(allowed, matchingEdges),
        };
      }

      return true;
    },
    [],
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

      const bridgeCreates = computeBridgeCreatesForDeletedNodes(
        deletedNodes,
        nodes,
        edges,
      );
      const edgePromises = bridgeCreates.map((bridgeCreate) =>
        runCreateEdgeMutation({
          canvasId,
          sourceNodeId: bridgeCreate.sourceNodeId,
          targetNodeId: bridgeCreate.targetNodeId,
          sourceHandle: bridgeCreate.sourceHandle,
          targetHandle: bridgeCreate.targetHandle,
        }),
      );

      void Promise.all([
        runBatchRemoveNodesMutation({
          nodeIds: idsToDelete as Id<"nodes">[],
        }),
        ...edgePromises,
      ])
        .then(() => {
          for (const id of idsToDelete) {
            deletingNodeIds.current.delete(id);
          }
        })
        .catch((error: unknown) => {
          console.error("[Canvas] batch remove failed", error);
          for (const id of idsToDelete) {
            deletingNodeIds.current.delete(id);
          }
        });

      const { title } = msg.canvas.nodesRemoved(count);
      toast.info(title);
    },
    [
      canvasId,
      deletingNodeIds,
      edges,
      nodes,
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
        if (isOptimisticEdgeId(edge.id)) {
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
