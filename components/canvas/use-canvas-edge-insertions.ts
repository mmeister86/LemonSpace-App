import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import type { CanvasNodeType } from "@/lib/canvas-node-types";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import {
  computeEdgeInsertLayout,
  hasHandleKey,
  isOptimisticEdgeId,
  normalizeHandle,
} from "./canvas-helpers";
import { validateCanvasEdgeSplit } from "./canvas-connection-validation";

export type EdgeInsertMenuState = {
  edgeId: string;
  screenX: number;
  screenY: number;
};

const EDGE_INSERT_GAP_PX = 10;

type UseCanvasEdgeInsertionsArgs = {
  canvasId: Id<"canvases">;
  nodes: RFNode[];
  edges: RFEdge[];
  runCreateNodeWithEdgeSplitOnlineOnly: (args: {
    canvasId: Id<"canvases">;
    type: CanvasNodeType;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: Record<string, unknown>;
    splitEdgeId: Id<"edges">;
    newNodeTargetHandle?: string;
    newNodeSourceHandle?: string;
    splitSourceHandle?: string;
    splitTargetHandle?: string;
    clientRequestId?: string;
  }) => Promise<Id<"nodes"> | string>;
  runBatchMoveNodesMutation: (args: {
    moves: {
      nodeId: Id<"nodes">;
      positionX: number;
      positionY: number;
    }[];
  }) => Promise<void>;
  showConnectionRejectedToast: (reason: CanvasConnectionValidationReason) => void;
};

export function useCanvasEdgeInsertions({
  canvasId,
  nodes,
  edges,
  runCreateNodeWithEdgeSplitOnlineOnly,
  runBatchMoveNodesMutation,
  showConnectionRejectedToast,
}: UseCanvasEdgeInsertionsArgs) {
  const [edgeInsertMenu, setEdgeInsertMenu] = useState<EdgeInsertMenuState | null>(null);
  const edgeInsertMenuRef = useRef<EdgeInsertMenuState | null>(null);

  useEffect(() => {
    edgeInsertMenuRef.current = edgeInsertMenu;
  }, [edgeInsertMenu]);

  const closeEdgeInsertMenu = useCallback(() => {
    setEdgeInsertMenu(null);
  }, []);

  const openEdgeInsertMenu = useCallback(
    ({ edgeId, screenX, screenY }: EdgeInsertMenuState) => {
      const edge = edges.find(
        (candidate) =>
          candidate.id === edgeId &&
          candidate.className !== "temp" &&
          !isOptimisticEdgeId(candidate.id),
      );
      if (!edge) {
        return;
      }

      setEdgeInsertMenu({ edgeId, screenX, screenY });
    },
    [edges],
  );

  const handleEdgeInsertPick = useCallback(
    async (template: CanvasNodeTemplate) => {
      const menu = edgeInsertMenuRef.current;
      if (!menu) {
        return;
      }

      const splitEdge = edges.find(
        (edge) =>
          edge.id === menu.edgeId && edge.className !== "temp" && !isOptimisticEdgeId(edge.id),
      );
      if (!splitEdge) {
        showConnectionRejectedToast("unknown-node");
        return;
      }

      const sourceNode = nodes.find((node) => node.id === splitEdge.source);
      const targetNode = nodes.find((node) => node.id === splitEdge.target);
      if (!sourceNode || !targetNode) {
        showConnectionRejectedToast("unknown-node");
        return;
      }

      const defaults = NODE_DEFAULTS[template.type] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const width = template.width ?? defaults.width;
      const height = template.height ?? defaults.height;
      const handles = NODE_HANDLE_MAP[template.type];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        showConnectionRejectedToast("unknown-node");
        return;
      }

      const middleNode: RFNode = {
        id: "__pending_edge_insert__",
        type: template.type,
        position: { x: 0, y: 0 },
        data: {},
      };

      const splitValidationError = validateCanvasEdgeSplit({
        nodes,
        edges,
        splitEdge,
        middleNode,
      });

      if (splitValidationError) {
        showConnectionRejectedToast(splitValidationError);
        return;
      }

      const layout = computeEdgeInsertLayout({
        sourceNode,
        targetNode,
        newNodeWidth: width,
        newNodeHeight: height,
        gapPx: EDGE_INSERT_GAP_PX,
      });

      await runCreateNodeWithEdgeSplitOnlineOnly({
        canvasId,
        type: template.type,
        positionX: layout.insertPosition.x,
        positionY: layout.insertPosition.y,
        width,
        height,
        data: {
          ...defaults.data,
          ...(template.defaultData as Record<string, unknown>),
          canvasId,
        },
        splitEdgeId: splitEdge.id as Id<"edges">,
        newNodeTargetHandle: normalizeHandle(handles.target),
        newNodeSourceHandle: normalizeHandle(handles.source),
        splitSourceHandle: normalizeHandle(splitEdge.sourceHandle),
        splitTargetHandle: normalizeHandle(splitEdge.targetHandle),
      });

      const moves: {
        nodeId: Id<"nodes">;
        positionX: number;
        positionY: number;
      }[] = [];

      if (layout.sourcePosition) {
        moves.push({
          nodeId: sourceNode.id as Id<"nodes">,
          positionX: layout.sourcePosition.x,
          positionY: layout.sourcePosition.y,
        });
      }

      if (layout.targetPosition) {
        moves.push({
          nodeId: targetNode.id as Id<"nodes">,
          positionX: layout.targetPosition.x,
          positionY: layout.targetPosition.y,
        });
      }

      if (moves.length > 0) {
        await runBatchMoveNodesMutation({ moves });
      }

      closeEdgeInsertMenu();
    },
    [
      canvasId,
      closeEdgeInsertMenu,
      edges,
      nodes,
      runBatchMoveNodesMutation,
      runCreateNodeWithEdgeSplitOnlineOnly,
      showConnectionRejectedToast,
    ],
  );

  return {
    edgeInsertMenu,
    openEdgeInsertMenu,
    closeEdgeInsertMenu,
    handleEdgeInsertPick,
  };
}
