"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NodeToolbar,
  Position,
  useOnSelectionChange,
  useReactFlow,
  type Node as RFNode,
} from "@xyflow/react";
import { FolderMinus, FolderPlus } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import { isOptimisticNodeId, isEditableKeyboardTarget } from "./canvas-helpers";
import {
  computeGroupFrameForNodes,
  getDirectUngroupChildPositions,
  getSelectedRootNodes,
} from "./canvas-grouping-helpers";

export type CreateGroupFromSelectionMutation = (args: {
  canvasId: Id<"canvases">;
  nodeIds: Id<"nodes">[];
  group: {
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    label?: string;
    zIndex?: number;
    clientRequestId?: string;
  };
  childPositions: Array<{
    nodeId: Id<"nodes">;
    positionX: number;
    positionY: number;
  }>;
}) => Promise<Id<"nodes">>;

export type UngroupNodesMutation = (args: {
  groupNodeIds: Id<"nodes">[];
  childPositions: Array<{
    nodeId: Id<"nodes">;
    parentId?: Id<"nodes">;
    positionX: number;
    positionY: number;
  }>;
}) => Promise<unknown>;

type CanvasSelectionToolbarProps = {
  canvasId: Id<"canvases">;
  disabled: boolean;
  isSyncOnline: boolean;
  createGroupFromSelection: CreateGroupFromSelectionMutation;
  ungroupNodes: UngroupNodesMutation;
  notifyOfflineUnsupported: (label: string) => void;
};

function computeGroupZIndex(nodes: RFNode[]): number | undefined {
  const selectedZIndexes = nodes
    .map((node) => node.zIndex)
    .filter((zIndex): zIndex is number => typeof zIndex === "number");
  if (selectedZIndexes.length === 0) return undefined;
  return Math.min(...selectedZIndexes) - 1;
}

export function CanvasSelectionToolbar({
  canvasId,
  disabled,
  isSyncOnline,
  createGroupFromSelection,
  ungroupNodes,
  notifyOfflineUnsupported,
}: CanvasSelectionToolbarProps) {
  const { getNodes, setNodes } = useReactFlow();
  const [selectedNodes, setSelectedNodes] = useState<RFNode[]>([]);
  const [isMutating, setIsMutating] = useState(false);

  useOnSelectionChange({
    onChange: ({ nodes }) => {
      setSelectedNodes(nodes);
    },
  });

  const effectiveSelectedRoots = useMemo(() => {
    const selectedIds = new Set(selectedNodes.map((node) => node.id));
    return getSelectedRootNodes(
      getNodes().map((node) => ({
        ...node,
        selected: selectedIds.has(node.id),
      })),
    );
  }, [getNodes, selectedNodes]);

  const selectedGroups = useMemo(
    () => selectedNodes.filter((node) => node.type === "group"),
    [selectedNodes],
  );

  const hasOptimisticSelection = useMemo(
    () => effectiveSelectedRoots.some((node) => isOptimisticNodeId(node.id)),
    [effectiveSelectedRoots],
  );

  const canGroup =
    !disabled &&
    isSyncOnline &&
    effectiveSelectedRoots.length >= 2 &&
    !hasOptimisticSelection &&
    !isMutating;
  const canUngroup =
    !disabled &&
    isSyncOnline &&
    selectedGroups.length > 0 &&
    !selectedGroups.some((node) => isOptimisticNodeId(node.id)) &&
    !isMutating;

  const groupSelection = useCallback(async () => {
    if (!isSyncOnline) {
      notifyOfflineUnsupported("Gruppieren");
      return;
    }
    if (!canGroup) return;

    const allNodes = getNodes();
    const selectedIds = new Set(effectiveSelectedRoots.map((node) => node.id));
    const selectedRootNodes = allNodes.filter((node) => selectedIds.has(node.id));
    const frame = computeGroupFrameForNodes(selectedRootNodes, allNodes);
    if (!frame) return;

    const clientRequestId = crypto.randomUUID();
    setIsMutating(true);
    try {
      const groupId = await createGroupFromSelection({
        canvasId,
        nodeIds: selectedRootNodes.map((node) => node.id as Id<"nodes">),
        group: {
          positionX: frame.positionX,
          positionY: frame.positionY,
          width: frame.width,
          height: frame.height,
          label: "Gruppe",
          zIndex: computeGroupZIndex(selectedRootNodes),
          clientRequestId,
        },
        childPositions: frame.childPositions.map((position) => ({
          nodeId: position.nodeId as Id<"nodes">,
          positionX: position.positionX,
          positionY: position.positionY,
        })),
      });

      const childPositionByNodeId = new Map(
        frame.childPositions.map((position) => [position.nodeId, position]),
      );
      setNodes((currentNodes) => {
        let existingGroupNode: RFNode | undefined;
        const seenNodeIds = new Set<string>();
        const nextNodes: RFNode[] = [];

        for (const node of currentNodes) {
          const childPosition = childPositionByNodeId.get(node.id);
          const nextNode = childPosition
            ? {
                ...node,
                parentId: groupId,
                position: {
                  x: childPosition.positionX,
                  y: childPosition.positionY,
                },
                selected: false,
              }
            : { ...node, selected: node.id === groupId };

          if (nextNode.id === groupId) {
            existingGroupNode ??= nextNode;
            continue;
          }

          if (seenNodeIds.has(nextNode.id)) continue;
          seenNodeIds.add(nextNode.id);
          nextNodes.push(nextNode);
        }

        const groupNode: RFNode = {
          id: groupId,
          type: "group",
          position: { x: frame.positionX, y: frame.positionY },
          style: { width: frame.width, height: frame.height },
          data: { label: "Gruppe" },
          zIndex: computeGroupZIndex(selectedRootNodes),
          selected: true,
        };

        const resolvedGroupNode = existingGroupNode
          ? {
              ...existingGroupNode,
              ...groupNode,
              data: {
                ...((existingGroupNode.data as Record<string, unknown>) ?? {}),
                ...((groupNode.data as Record<string, unknown>) ?? {}),
              },
              selected: true,
            }
          : groupNode;

        return [resolvedGroupNode, ...nextNodes];
      });
    } finally {
      setIsMutating(false);
    }
  }, [
    canvasId,
    canGroup,
    createGroupFromSelection,
    effectiveSelectedRoots,
    getNodes,
    isSyncOnline,
    notifyOfflineUnsupported,
    setNodes,
  ]);

  const ungroupSelection = useCallback(async () => {
    if (!isSyncOnline) {
      notifyOfflineUnsupported("Entgruppieren");
      return;
    }
    if (!canUngroup) return;

    const allNodes = getNodes();
    const selectedGroupIds = new Set(selectedGroups.map((node) => node.id));
    const groupNodes = allNodes.filter((node) => selectedGroupIds.has(node.id));
    const childPositions = getDirectUngroupChildPositions(groupNodes, allNodes).map(
      (position) => ({
        nodeId: position.nodeId as Id<"nodes">,
        parentId: position.parentId as Id<"nodes"> | undefined,
        positionX: position.positionX,
        positionY: position.positionY,
      }),
    );
    if (childPositions.length === 0) return;

    setIsMutating(true);
    try {
      await ungroupNodes({
        groupNodeIds: groupNodes.map((node) => node.id as Id<"nodes">),
        childPositions,
      });
      const childPositionByNodeId = new Map(
        childPositions.map((position) => [position.nodeId as string, position]),
      );
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const childPosition = childPositionByNodeId.get(node.id);
          if (!childPosition) return node;
          return {
            ...node,
            parentId: childPosition.parentId as string | undefined,
            position: {
              x: childPosition.positionX,
              y: childPosition.positionY,
            },
          };
        }),
      );
    } finally {
      setIsMutating(false);
    }
  }, [canUngroup, getNodes, isSyncOnline, notifyOfflineUnsupported, selectedGroups, setNodes, ungroupNodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.altKey) return;
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key.toLowerCase() !== "g") return;

      if (event.shiftKey) {
        if (!canUngroup && isSyncOnline) return;
        event.preventDefault();
        void ungroupSelection();
        return;
      }

      if (!canGroup && isSyncOnline) return;
      event.preventDefault();
      void groupSelection();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canGroup, canUngroup, groupSelection, isSyncOnline, ungroupSelection]);

  const stopPropagation = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
  };

  const isVisible = !disabled && effectiveSelectedRoots.length >= 2;

  return (
    <NodeToolbar
      nodeId={effectiveSelectedRoots.map((node) => node.id)}
      isVisible={isVisible}
      position={Position.Top}
      offset={8}
    >
      <div className="nodrag nopan flex items-center gap-1 rounded-lg border bg-card p-1 shadow-md">
        <button
          type="button"
          title="Group"
          disabled={!canGroup}
          onClick={(event) => {
            stopPropagation(event);
            void groupSelection();
          }}
          onPointerDown={stopPropagation}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FolderPlus size={14} />
        </button>
        {selectedGroups.length > 0 ? (
          <button
            type="button"
            title="Ungroup"
            disabled={!canUngroup}
            onClick={(event) => {
              stopPropagation(event);
              void ungroupSelection();
            }}
            onPointerDown={stopPropagation}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FolderMinus size={14} />
          </button>
        ) : null}
      </div>
    </NodeToolbar>
  );
}
