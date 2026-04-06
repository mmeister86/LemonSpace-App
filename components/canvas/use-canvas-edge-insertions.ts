import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge as RFEdge, Node as RFNode } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasConnectionValidationReason } from "@/lib/canvas-connection-policy";
import {
  CANVAS_NODE_TEMPLATES,
  type CanvasNodeTemplate,
} from "@/lib/canvas-node-templates";
import type { CanvasNodeType } from "@/lib/canvas-node-types";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

import {
  computeEdgeInsertReflowPlan,
  computeEdgeInsertLayout,
  hasHandleKey,
  isOptimisticEdgeId,
  normalizeHandle,
  rfEdgeConnectionSignature,
} from "./canvas-helpers";
import { validateCanvasEdgeSplit } from "./canvas-connection-validation";

export type EdgeInsertMenuState = {
  edgeId: string;
  screenX: number;
  screenY: number;
};

const EDGE_INSERT_GAP_PX = 10;
const DEFAULT_REFLOW_SETTLE_MS = 997;

function waitForReflowSettle(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
  applyLocalNodeMoves?: (
    moves: {
      nodeId: Id<"nodes">;
      positionX: number;
      positionY: number;
    }[],
  ) => void;
  showConnectionRejectedToast: (reason: CanvasConnectionValidationReason) => void;
  onReflowStateChange?: (isReflowing: boolean) => void;
  reflowSettleMs?: number;
};

export function useCanvasEdgeInsertions({
  canvasId,
  nodes,
  edges,
  runCreateNodeWithEdgeSplitOnlineOnly,
  runBatchMoveNodesMutation,
  applyLocalNodeMoves,
  showConnectionRejectedToast,
  onReflowStateChange,
  reflowSettleMs = DEFAULT_REFLOW_SETTLE_MS,
}: UseCanvasEdgeInsertionsArgs) {
  const [edgeInsertMenu, setEdgeInsertMenu] = useState<EdgeInsertMenuState | null>(null);
  const edgeInsertMenuRef = useRef<EdgeInsertMenuState | null>(null);

  const policyEdges = edges.filter(
    (edge) => edge.className !== "temp" && !isOptimisticEdgeId(edge.id),
  );

  useEffect(() => {
    edgeInsertMenuRef.current = edgeInsertMenu;
  }, [edgeInsertMenu]);

  const closeEdgeInsertMenu = useCallback(() => {
    setEdgeInsertMenu(null);
  }, []);

  const openEdgeInsertMenu = useCallback(
    ({ edgeId, screenX, screenY }: EdgeInsertMenuState) => {
      const clickedEdge = edges.find(
        (candidate) => candidate.id === edgeId && candidate.className !== "temp",
      );
      if (!clickedEdge) {
        return;
      }

      let resolvedEdgeId: string | null = null;
      if (!isOptimisticEdgeId(edgeId)) {
        const persisted = policyEdges.find((candidate) => candidate.id === edgeId);
        resolvedEdgeId = persisted?.id ?? null;
      } else {
        const signature = rfEdgeConnectionSignature(clickedEdge);
        const persistedTwin = policyEdges.find(
          (candidate) => rfEdgeConnectionSignature(candidate) === signature,
        );
        resolvedEdgeId = persistedTwin?.id ?? null;
      }

      if (!resolvedEdgeId) {
        return;
      }

      setEdgeInsertMenu({ edgeId: resolvedEdgeId, screenX, screenY });
    },
    [edges, policyEdges],
  );

  const edgeInsertTemplates = (() => {
    if (!edgeInsertMenu) {
      return [] as CanvasNodeTemplate[];
    }

    const splitEdge = policyEdges.find((edge) => edge.id === edgeInsertMenu.edgeId);
    if (!splitEdge) {
      return [] as CanvasNodeTemplate[];
    }

    return CANVAS_NODE_TEMPLATES.filter((template) => {
      const handles = NODE_HANDLE_MAP[template.type];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        return false;
      }

      const middleNode: RFNode = {
        id: "__pending_edge_insert__",
        type: template.type,
        position: { x: 0, y: 0 },
        data: {},
      };

      const splitValidationError = validateCanvasEdgeSplit({
        nodes,
        edges: policyEdges,
        splitEdge,
        middleNode,
      });

      return splitValidationError === null;
    });
  })();

  const handleEdgeInsertPick = useCallback(
    async (template: CanvasNodeTemplate) => {
      const menu = edgeInsertMenuRef.current;
      if (!menu) {
        return;
      }

      const splitEdge = policyEdges.find((edge) => edge.id === menu.edgeId);
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
        edges: policyEdges,
        splitEdge,
        middleNode,
      });

      if (splitValidationError) {
        showConnectionRejectedToast(splitValidationError);
        return;
      }

      const reflowPlan = computeEdgeInsertReflowPlan({
        nodes,
        edges: policyEdges,
        splitEdge,
        sourceNode,
        targetNode,
        newNodeWidth: width,
        newNodeHeight: height,
        gapPx: EDGE_INSERT_GAP_PX,
      });

      const reflowMoves = reflowPlan.moves.map((move) => ({
        nodeId: move.nodeId as Id<"nodes">,
        positionX: move.positionX,
        positionY: move.positionY,
      }));

      if (reflowMoves.length > 0) {
        onReflowStateChange?.(true);
        try {
          applyLocalNodeMoves?.(reflowMoves);
          await runBatchMoveNodesMutation({
            moves: reflowMoves,
          });

          if (reflowSettleMs > 0) {
            await waitForReflowSettle(reflowSettleMs);
          }
        } finally {
          onReflowStateChange?.(false);
        }
      }

      const sourceAfterMove = reflowPlan.sourcePosition
        ? { ...sourceNode, position: reflowPlan.sourcePosition }
        : sourceNode;
      const targetAfterMove = reflowPlan.targetPosition
        ? { ...targetNode, position: reflowPlan.targetPosition }
        : targetNode;

      const layout = computeEdgeInsertLayout({
        sourceNode: sourceAfterMove,
        targetNode: targetAfterMove,
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

      closeEdgeInsertMenu();
    },
    [
      canvasId,
      closeEdgeInsertMenu,
      nodes,
      policyEdges,
      runBatchMoveNodesMutation,
      applyLocalNodeMoves,
      runCreateNodeWithEdgeSplitOnlineOnly,
      showConnectionRejectedToast,
      onReflowStateChange,
      reflowSettleMs,
    ],
  );

  return {
    edgeInsertMenu,
    edgeInsertTemplates,
    openEdgeInsertMenu,
    closeEdgeInsertMenu,
    handleEdgeInsertPick,
  };
}
