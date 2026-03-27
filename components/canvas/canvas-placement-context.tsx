"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { ReactMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useReactFlow, useStore, type Edge as RFEdge } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

type CreateNodeMutation = ReactMutation<
  FunctionReference<
    "mutation",
    "public",
    {
      canvasId: Id<"canvases">;
      type: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      data: unknown;
      parentId?: Id<"nodes">;
      zIndex?: number;
    },
    Id<"nodes">
  >
>;

type CreateNodeWithEdgeSplitMutation = ReactMutation<
  FunctionReference<
    "mutation",
    "public",
    {
      canvasId: Id<"canvases">;
      type: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      data: unknown;
      parentId?: Id<"nodes">;
      zIndex?: number;
      splitEdgeId: Id<"edges">;
      newNodeTargetHandle?: string;
      newNodeSourceHandle?: string;
      splitSourceHandle?: string;
      splitTargetHandle?: string;
    },
    Id<"nodes">
  >
>;

type FlowPoint = { x: number; y: number };

type CreateNodeWithIntersectionInput = {
  type: string;
  position: FlowPoint;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
  clientPosition?: FlowPoint;
  zIndex?: number;
};

type CanvasPlacementContextValue = {
  createNodeWithIntersection: (
    input: CreateNodeWithIntersectionInput,
  ) => Promise<Id<"nodes">>;
};

const CanvasPlacementContext = createContext<CanvasPlacementContextValue | null>(
  null,
);

function getEdgeIdFromInteractionElement(element: Element): string | null {
  const edgeContainer = element.closest(".react-flow__edge");
  if (!edgeContainer) return null;

  const dataId = edgeContainer.getAttribute("data-id");
  if (dataId) return dataId;

  const domId = edgeContainer.getAttribute("id");
  if (domId?.startsWith("reactflow__edge-")) {
    return domId.slice("reactflow__edge-".length);
  }

  return null;
}

function getIntersectedPersistedEdge(
  point: FlowPoint,
  edges: RFEdge[],
): RFEdge | undefined {
  const elements = document.elementsFromPoint(point.x, point.y);
  const interactionElement = elements.find(
    (element) => element.classList.contains("react-flow__edge-interaction"),
  );

  if (!interactionElement) {
    return undefined;
  }

  const edgeId = getEdgeIdFromInteractionElement(interactionElement);
  if (!edgeId) return undefined;

  const edge = edges.find((candidate) => candidate.id === edgeId);
  if (!edge || edge.className === "temp") return undefined;

  return edge;
}

function hasHandleKey(
  handles: { source?: string; target?: string } | undefined,
  key: "source" | "target",
): boolean {
  if (!handles) return false;
  return Object.prototype.hasOwnProperty.call(handles, key);
}

function normalizeHandle(handle: string | null | undefined): string | undefined {
  return handle ?? undefined;
}

interface CanvasPlacementProviderProps {
  canvasId: Id<"canvases">;
  createNode: CreateNodeMutation;
  createNodeWithEdgeSplit: CreateNodeWithEdgeSplitMutation;
  children: ReactNode;
}

export function CanvasPlacementProvider({
  canvasId,
  createNode,
  createNodeWithEdgeSplit,
  children,
}: CanvasPlacementProviderProps) {
  const { flowToScreenPosition } = useReactFlow();
  const edges = useStore((store) => store.edges);

  const createNodeWithIntersection = useCallback(
    async ({
      type,
      position,
      width,
      height,
      data,
      clientPosition,
      zIndex,
    }: CreateNodeWithIntersectionInput) => {
      const defaults = NODE_DEFAULTS[type] ?? {
        width: 200,
        height: 100,
        data: {},
      };

      const effectiveWidth = width ?? defaults.width;
      const effectiveHeight = height ?? defaults.height;
      const centerClientPosition = flowToScreenPosition({
        x: position.x + effectiveWidth / 2,
        y: position.y + effectiveHeight / 2,
      });

      const hitEdgeFromClientPosition = clientPosition
        ? getIntersectedPersistedEdge(clientPosition, edges)
        : undefined;
      const hitEdge =
        hitEdgeFromClientPosition ??
        getIntersectedPersistedEdge(centerClientPosition, edges);

      const nodePayload = {
        canvasId,
        type,
        positionX: position.x,
        positionY: position.y,
        width: effectiveWidth,
        height: effectiveHeight,
        data: {
          ...defaults.data,
          ...(data ?? {}),
          canvasId,
        },
        ...(zIndex !== undefined ? { zIndex } : {}),
      };

      if (!hitEdge) {
        return await createNode(nodePayload);
      }

      const handles = NODE_HANDLE_MAP[type];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        return await createNode(nodePayload);
      }

      try {
        return await createNodeWithEdgeSplit({
          ...nodePayload,
          splitEdgeId: hitEdge.id as Id<"edges">,
          newNodeTargetHandle: normalizeHandle(handles.target),
          newNodeSourceHandle: normalizeHandle(handles.source),
          splitSourceHandle: normalizeHandle(hitEdge.sourceHandle),
          splitTargetHandle: normalizeHandle(hitEdge.targetHandle),
        });
      } catch (error) {
        console.error("[Canvas placement] edge split failed", {
          edgeId: hitEdge.id,
          type,
          error: String(error),
        });
        throw error;
      }
    },
    [canvasId, createNode, createNodeWithEdgeSplit, edges, flowToScreenPosition],
  );

  const value = useMemo(
    () => ({ createNodeWithIntersection }),
    [createNodeWithIntersection],
  );

  return (
    <CanvasPlacementContext.Provider value={value}>
      {children}
    </CanvasPlacementContext.Provider>
  );
}

export function useCanvasPlacement() {
  const context = useContext(CanvasPlacementContext);
  if (!context) {
    throw new Error("useCanvasPlacement must be used within CanvasPlacementProvider");
  }
  return context;
}
