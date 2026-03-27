"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { useReactFlow, useStore, type Edge as RFEdge } from "@xyflow/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";

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
  children: ReactNode;
}

export function CanvasPlacementProvider({
  canvasId,
  children,
}: CanvasPlacementProviderProps) {
  const { flowToScreenPosition } = useReactFlow();
  const edges = useStore((store) => store.edges);
  const createNode = useMutation(api.nodes.create);
  const createEdge = useMutation(api.edges.create);
  const removeEdge = useMutation(api.edges.remove);

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

      const nodeId = await createNode({
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
      });

      if (!hitEdge) {
        return nodeId;
      }

      const handles = NODE_HANDLE_MAP[type];
      if (!hasHandleKey(handles, "source") || !hasHandleKey(handles, "target")) {
        return nodeId;
      }

      try {
        await createEdge({
          canvasId,
          sourceNodeId: hitEdge.source as Id<"nodes">,
          targetNodeId: nodeId,
          sourceHandle: normalizeHandle(hitEdge.sourceHandle),
          targetHandle: normalizeHandle(handles.target),
        });

        await createEdge({
          canvasId,
          sourceNodeId: nodeId,
          targetNodeId: hitEdge.target as Id<"nodes">,
          sourceHandle: normalizeHandle(handles.source),
          targetHandle: normalizeHandle(hitEdge.targetHandle),
        });

        await removeEdge({ edgeId: hitEdge.id as Id<"edges"> });
      } catch (error) {
        console.error("[Canvas placement] edge split failed", {
          edgeId: hitEdge.id,
          nodeId,
          type,
          error: String(error),
        });
      }

      return nodeId;
    },
    [canvasId, createEdge, createNode, edges, flowToScreenPosition, removeEdge],
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
