"use client";

/**
 * Onboarding note:
 * Supports the Canvas editor workflow for use canvas grouping mutations. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

import { OPTIMISTIC_NODE_PREFIX } from "./canvas-helpers";
import {
  getCanvasGraphEdgesFromQuery,
  getCanvasGraphNodesFromQuery,
  setCanvasGraphEdgesInQuery,
  setCanvasGraphNodesInQuery,
} from "./canvas-graph-query-cache";
import type {
  CreateGroupFromSelectionMutation,
  UngroupNodesMutation,
} from "./canvas-selection-toolbar";

type UseCanvasGroupingMutationsArgs = {
  canvasId: Id<"canvases">;
};

export function useCanvasGroupingMutations({
  canvasId,
}: UseCanvasGroupingMutationsArgs): {
  createGroupFromSelection: CreateGroupFromSelectionMutation;
  ungroupNodes: UngroupNodesMutation;
} {
  const createGroupFromSelection = useMutation(
    api.nodes.createGroupFromSelection,
  ).withOptimisticUpdate((localStore, args) => {
    const nodeList = getCanvasGraphNodesFromQuery(localStore, {
      canvasId: args.canvasId,
    });
    if (nodeList === undefined) return;

    const clientRequestId = args.group.clientRequestId;
    if (!clientRequestId) return;

    const optimisticGroupId =
      `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}` as Id<"nodes">;
    if (nodeList.some((node) => node._id === optimisticGroupId)) return;

    const childPositionByNodeId = new Map(
      args.childPositions.map((position) => [position.nodeId, position]),
    );
    const syntheticGroup: Doc<"nodes"> = {
      _id: optimisticGroupId,
      _creationTime: 0,
      canvasId: args.canvasId,
      type: "group",
      positionX: args.group.positionX,
      positionY: args.group.positionY,
      width: args.group.width,
      height: args.group.height,
      status: "idle",
      retryCount: 0,
      data: {
        label: args.group.label ?? "Gruppe",
      } as Doc<"nodes">["data"],
      zIndex: args.group.zIndex,
    };

    const patchedNodes = nodeList.map((node) => {
      const childPosition = childPositionByNodeId.get(node._id);
      if (!childPosition) return node;

      return {
        ...node,
        parentId: optimisticGroupId,
        positionX: childPosition.positionX,
        positionY: childPosition.positionY,
      };
    });

    setCanvasGraphNodesInQuery(localStore, {
      canvasId: args.canvasId,
      nodes: [syntheticGroup, ...patchedNodes],
    });
  });

  const ungroupNodes = useMutation(api.nodes.ungroupNodes).withOptimisticUpdate(
    (localStore, args) => {
      const nodeList = getCanvasGraphNodesFromQuery(localStore, { canvasId });
      if (nodeList === undefined) return;

      const groupNodeIds = new Set(args.groupNodeIds);
      const childPositionByNodeId = new Map(
        args.childPositions.map((position) => [position.nodeId, position]),
      );
      const nextNodes = nodeList
        .filter((node) => !groupNodeIds.has(node._id))
        .map((node) => {
          const childPosition = childPositionByNodeId.get(node._id);
          if (!childPosition) return node;

          return {
            ...node,
            parentId: childPosition.parentId,
            positionX: childPosition.positionX,
            positionY: childPosition.positionY,
          };
        });

      setCanvasGraphNodesInQuery(localStore, {
        canvasId,
        nodes: nextNodes,
      });

      const edgeList = getCanvasGraphEdgesFromQuery(localStore, { canvasId });
      if (edgeList === undefined) return;

      setCanvasGraphEdgesInQuery(localStore, {
        canvasId,
        edges: edgeList.filter(
          (edge) =>
            !groupNodeIds.has(edge.sourceNodeId) &&
            !groupNodeIds.has(edge.targetNodeId),
        ),
      });
    },
  );

  return {
    createGroupFromSelection,
    ungroupNodes,
  };
}
