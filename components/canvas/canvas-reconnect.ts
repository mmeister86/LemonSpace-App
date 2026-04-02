import { useCallback } from "react";
import { useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { reconnectEdge, type Connection, type Edge as RFEdge } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";

type UseCanvasReconnectHandlersParams = {
  canvasId: Id<"canvases">;
  edgeReconnectSuccessful: MutableRefObject<boolean>;
  isReconnectDragActiveRef: MutableRefObject<boolean>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  runCreateEdgeMutation: (args: {
    canvasId: Id<"canvases">;
    sourceNodeId: Id<"nodes">;
    targetNodeId: Id<"nodes">;
    sourceHandle?: string;
    targetHandle?: string;
  }) => Promise<unknown>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
  validateConnection?: (
    oldEdge: RFEdge,
    newConnection: Connection,
  ) => string | null;
  onInvalidConnection?: (message: string) => void;
};

export function useCanvasReconnectHandlers({
  canvasId,
  edgeReconnectSuccessful,
  isReconnectDragActiveRef,
  setEdges,
  runCreateEdgeMutation,
  runRemoveEdgeMutation,
  validateConnection,
  onInvalidConnection,
}: UseCanvasReconnectHandlersParams): {
  onReconnectStart: () => void;
  onReconnect: (oldEdge: RFEdge, newConnection: Connection) => void;
  onReconnectEnd: (_: MouseEvent | TouchEvent, edge: RFEdge) => void;
} {
  const pendingReconnectRef = useRef<{
    oldEdge: RFEdge;
    newConnection: Connection;
  } | null>(null);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    isReconnectDragActiveRef.current = true;
    pendingReconnectRef.current = null;
  }, [edgeReconnectSuccessful, isReconnectDragActiveRef]);

  const onReconnect = useCallback(
    (oldEdge: RFEdge, newConnection: Connection) => {
      const validationError = validateConnection?.(oldEdge, newConnection) ?? null;
      if (validationError) {
        edgeReconnectSuccessful.current = true;
        pendingReconnectRef.current = null;
        onInvalidConnection?.(validationError);
        return;
      }

      edgeReconnectSuccessful.current = true;
      pendingReconnectRef.current = { oldEdge, newConnection };
      setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
    },
    [edgeReconnectSuccessful, onInvalidConnection, setEdges, validateConnection],
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: RFEdge) => {
      try {
        if (!edgeReconnectSuccessful.current) {
          pendingReconnectRef.current = null;
          setEdges((currentEdges) =>
            currentEdges.filter((candidate) => candidate.id !== edge.id),
          );
          if (edge.className === "temp") {
            edgeReconnectSuccessful.current = true;
            return;
          }

          void runRemoveEdgeMutation({ edgeId: edge.id as Id<"edges"> }).catch(
            (error) => {
              console.error("[Canvas edge remove failed] reconnect end", {
                edgeId: edge.id,
                edgeClassName: edge.className ?? null,
                source: edge.source,
                target: edge.target,
                error: String(error),
              });
            },
          );
        }

        const pendingReconnect = pendingReconnectRef.current;
        pendingReconnectRef.current = null;
        if (
          pendingReconnect &&
          pendingReconnect.newConnection.source &&
          pendingReconnect.newConnection.target
        ) {
          void runCreateEdgeMutation({
            canvasId,
            sourceNodeId: pendingReconnect.newConnection.source as Id<"nodes">,
            targetNodeId: pendingReconnect.newConnection.target as Id<"nodes">,
            sourceHandle: pendingReconnect.newConnection.sourceHandle ?? undefined,
            targetHandle: pendingReconnect.newConnection.targetHandle ?? undefined,
          }).catch((error) => {
            console.error("[Canvas edge reconnect failed] create edge", {
              oldEdgeId: pendingReconnect.oldEdge.id,
              source: pendingReconnect.newConnection.source,
              target: pendingReconnect.newConnection.target,
              error: String(error),
            });
          });

          if (pendingReconnect.oldEdge.className !== "temp") {
            void runRemoveEdgeMutation({
              edgeId: pendingReconnect.oldEdge.id as Id<"edges">,
            }).catch((error) => {
              console.error("[Canvas edge reconnect failed] remove old edge", {
                oldEdgeId: pendingReconnect.oldEdge.id,
                error: String(error),
              });
            });
          }
        }

        edgeReconnectSuccessful.current = true;
      } finally {
        isReconnectDragActiveRef.current = false;
      }
    },
    [
      canvasId,
      edgeReconnectSuccessful,
      isReconnectDragActiveRef,
      runCreateEdgeMutation,
      runRemoveEdgeMutation,
      setEdges,
    ],
  );

  return { onReconnectStart, onReconnect, onReconnectEnd };
}
