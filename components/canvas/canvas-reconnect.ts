import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { reconnectEdge, type Connection, type Edge as RFEdge } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";

import { isOptimisticEdgeId } from "./canvas-helpers";

type UseCanvasReconnectHandlersParams = {
  edgeReconnectSuccessful: MutableRefObject<boolean>;
  isReconnectDragActiveRef: MutableRefObject<boolean>;
  setEdges: Dispatch<SetStateAction<RFEdge[]>>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
};

export function useCanvasReconnectHandlers({
  edgeReconnectSuccessful,
  isReconnectDragActiveRef,
  setEdges,
  runRemoveEdgeMutation,
}: UseCanvasReconnectHandlersParams): {
  onReconnectStart: () => void;
  onReconnect: (oldEdge: RFEdge, newConnection: Connection) => void;
  onReconnectEnd: (_: MouseEvent | TouchEvent, edge: RFEdge) => void;
} {
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
    isReconnectDragActiveRef.current = true;
  }, [edgeReconnectSuccessful, isReconnectDragActiveRef]);

  const onReconnect = useCallback(
    (oldEdge: RFEdge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
    },
    [edgeReconnectSuccessful, setEdges],
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: RFEdge) => {
      try {
        if (!edgeReconnectSuccessful.current) {
          setEdges((currentEdges) =>
            currentEdges.filter((candidate) => candidate.id !== edge.id),
          );
          if (edge.className === "temp") {
            edgeReconnectSuccessful.current = true;
            return;
          }

          if (isOptimisticEdgeId(edge.id)) {
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
        edgeReconnectSuccessful.current = true;
      } finally {
        isReconnectDragActiveRef.current = false;
      }
    },
    [edgeReconnectSuccessful, isReconnectDragActiveRef, runRemoveEdgeMutation, setEdges],
  );

  return { onReconnectStart, onReconnect, onReconnectEnd };
}
