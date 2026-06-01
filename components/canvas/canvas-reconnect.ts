/**
 * Onboarding note:
 * Tracks React Flow reconnect gestures so failed reconnects do not accidentally remove the original edge.
 */

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
    edgeIdToIgnore?: Id<"edges">;
  }) => Promise<unknown>;
  runSwapMixerInputsMutation?: (args: {
    canvasId: Id<"canvases">;
    edgeId: Id<"edges">;
    otherEdgeId: Id<"edges">;
  }) => Promise<unknown>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
  validateConnection?: (
    oldEdge: RFEdge,
    newConnection: Connection,
  ) => string | null;
  resolveMixerSwapReconnect?: (
    oldEdge: RFEdge,
    newConnection: Connection,
    validationError: string,
  ) => {
    edgeId: Id<"edges">;
    otherEdgeId: Id<"edges">;
    nextEdgeHandle: string;
    nextOtherEdgeHandle: string;
  } | null;
  onInvalidConnection?: (message: string) => void;
  clearActiveMagnetTarget?: () => void;
};

export function useCanvasReconnectHandlers({
  canvasId,
  edgeReconnectSuccessful,
  isReconnectDragActiveRef,
  setEdges,
  runCreateEdgeMutation,
  runSwapMixerInputsMutation,
  runRemoveEdgeMutation,
  validateConnection,
  resolveMixerSwapReconnect,
  onInvalidConnection,
  clearActiveMagnetTarget,
}: UseCanvasReconnectHandlersParams): {
  onReconnectStart: () => void;
  onReconnect: (oldEdge: RFEdge, newConnection: Connection) => void;
  onReconnectEnd: (_: MouseEvent | TouchEvent, edge: RFEdge) => void;
} {
  const pendingReconnectRef = useRef<
    | {
        kind: "replace";
        oldEdge: RFEdge;
        newConnection: Connection;
      }
    | {
        kind: "swap";
        edgeId: Id<"edges">;
        otherEdgeId: Id<"edges">;
      }
    | null
  >(null);

  const onReconnectStart = useCallback(() => {
    clearActiveMagnetTarget?.();
    edgeReconnectSuccessful.current = false;
    isReconnectDragActiveRef.current = true;
    pendingReconnectRef.current = null;
  }, [clearActiveMagnetTarget, edgeReconnectSuccessful, isReconnectDragActiveRef]);

  const onReconnect = useCallback(
    (oldEdge: RFEdge, newConnection: Connection) => {
      const validationError = validateConnection?.(oldEdge, newConnection) ?? null;
      if (validationError) {
        const swapReconnect = resolveMixerSwapReconnect?.(
          oldEdge,
          newConnection,
          validationError,
        );
        if (swapReconnect) {
          edgeReconnectSuccessful.current = true;
          pendingReconnectRef.current = {
            kind: "swap",
            edgeId: swapReconnect.edgeId,
            otherEdgeId: swapReconnect.otherEdgeId,
          };
          setEdges((currentEdges) =>
            currentEdges.map((candidate) => {
              if (candidate.id === swapReconnect.edgeId) {
                return {
                  ...candidate,
                  targetHandle: swapReconnect.nextEdgeHandle,
                };
              }
              if (candidate.id === swapReconnect.otherEdgeId) {
                return {
                  ...candidate,
                  targetHandle: swapReconnect.nextOtherEdgeHandle,
                };
              }
              return candidate;
            }),
          );
          return;
        }

        edgeReconnectSuccessful.current = true;
        pendingReconnectRef.current = null;
        onInvalidConnection?.(validationError);
        return;
      }

      edgeReconnectSuccessful.current = true;
      pendingReconnectRef.current = {
        kind: "replace",
        oldEdge,
        newConnection,
      };
      setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges));
    },
    [
      edgeReconnectSuccessful,
      onInvalidConnection,
      resolveMixerSwapReconnect,
      setEdges,
      validateConnection,
    ],
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
        if (pendingReconnect?.kind === "replace" && pendingReconnect.newConnection.source && pendingReconnect.newConnection.target) {
          void runCreateEdgeMutation({
            canvasId,
            sourceNodeId: pendingReconnect.newConnection.source as Id<"nodes">,
            targetNodeId: pendingReconnect.newConnection.target as Id<"nodes">,
            sourceHandle: pendingReconnect.newConnection.sourceHandle ?? undefined,
            targetHandle: pendingReconnect.newConnection.targetHandle ?? undefined,
            edgeIdToIgnore: pendingReconnect.oldEdge.id as Id<"edges">,
          })
            .catch((error) => {
              console.error("[Canvas edge reconnect failed] create edge", {
                oldEdgeId: pendingReconnect.oldEdge.id,
                source: pendingReconnect.newConnection.source,
                target: pendingReconnect.newConnection.target,
                error: String(error),
              });
            });
        }

        if (pendingReconnect?.kind === "swap") {
          if (runSwapMixerInputsMutation) {
            void runSwapMixerInputsMutation({
              canvasId,
              edgeId: pendingReconnect.edgeId,
              otherEdgeId: pendingReconnect.otherEdgeId,
            }).catch((error) => {
              console.error("[Canvas edge reconnect failed] swap mixer inputs", {
                edgeId: pendingReconnect.edgeId,
                otherEdgeId: pendingReconnect.otherEdgeId,
                error: String(error),
              });
            });
          }
        }

        edgeReconnectSuccessful.current = true;
      } finally {
        clearActiveMagnetTarget?.();
        isReconnectDragActiveRef.current = false;
      }
    },
    [
      canvasId,
      clearActiveMagnetTarget,
      edgeReconnectSuccessful,
      isReconnectDragActiveRef,
      runCreateEdgeMutation,
      runRemoveEdgeMutation,
      runSwapMixerInputsMutation,
      setEdges,
    ],
  );

  return { onReconnectStart, onReconnect, onReconnectEnd };
}
