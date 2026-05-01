/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas scissors. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

import { useCallback, useEffect } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { Edge as RFEdge } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import type { CanvasNavTool } from "@/components/canvas/canvas-toolbar";
import {
  collectCuttableEdgesAlongScreenSegment,
  getSingleCharacterHotkey,
  getIntersectedEdgeId,
  isEdgeCuttable,
  isEditableKeyboardTarget,
} from "./canvas-helpers";

type Point = { x: number; y: number };

type UseCanvasScissorsParams = {
  scissorsMode: boolean;
  scissorsModeRef: MutableRefObject<boolean>;
  edgesRef: MutableRefObject<RFEdge[]>;
  setScissorsMode: Dispatch<SetStateAction<boolean>>;
  setNavTool: Dispatch<SetStateAction<CanvasNavTool>>;
  setScissorStrokePreview: Dispatch<SetStateAction<Point[] | null>>;
  runRemoveEdgeMutation: (args: { edgeId: Id<"edges"> }) => Promise<unknown>;
};

export function useCanvasScissors({
  scissorsMode,
  scissorsModeRef,
  edgesRef,
  setScissorsMode,
  setNavTool,
  setScissorStrokePreview,
  runRemoveEdgeMutation,
}: UseCanvasScissorsParams): {
  onEdgeClickScissors: (_event: ReactMouseEvent, edge: RFEdge) => void;
  onScissorsFlowPointerDownCapture: (event: ReactPointerEvent) => void;
} {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && scissorsModeRef.current) {
        setScissorsMode(false);
        setNavTool("select");
        setScissorStrokePreview(null);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const isScissorHotkey = getSingleCharacterHotkey(event) === "k";
      if (!isScissorHotkey) return;
      if (isEditableKeyboardTarget(event.target)) return;

      event.preventDefault();
      if (scissorsModeRef.current) {
        setScissorsMode(false);
        setNavTool("select");
      } else {
        setScissorsMode(true);
        setNavTool("scissor");
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scissorsModeRef, setNavTool, setScissorStrokePreview, setScissorsMode]);

  useEffect(() => {
    if (!scissorsMode) {
      setScissorStrokePreview(null);
    }
  }, [scissorsMode, setScissorStrokePreview]);

  const onEdgeClickScissors = useCallback(
    (_event: ReactMouseEvent, edge: RFEdge) => {
      if (!scissorsModeRef.current) return;
      if (!isEdgeCuttable(edge)) return;

      void runRemoveEdgeMutation({ edgeId: edge.id as Id<"edges"> }).catch(
        (error) => {
          console.error("[Canvas] scissors edge click remove failed", {
            edgeId: edge.id,
            error: String(error),
          });
        },
      );
    },
    [runRemoveEdgeMutation, scissorsModeRef],
  );

  const onScissorsFlowPointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (!scissorsModeRef.current) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const targetElement = event.target as HTMLElement;
      if (targetElement.closest(".react-flow__node")) return;
      if (targetElement.closest(".react-flow__controls")) return;
      if (targetElement.closest(".react-flow__minimap")) return;
      if (!targetElement.closest(".react-flow__pane")) return;
      if (getIntersectedEdgeId({ x: event.clientX, y: event.clientY })) {
        return;
      }

      const strokeIds = new Set<string>();
      const points: Point[] = [{ x: event.clientX, y: event.clientY }];
      setScissorStrokePreview(points);

      const handleMove = (pointerEvent: PointerEvent) => {
        const previous = points[points.length - 1]!;
        const nextX = pointerEvent.clientX;
        const nextY = pointerEvent.clientY;

        collectCuttableEdgesAlongScreenSegment(
          previous.x,
          previous.y,
          nextX,
          nextY,
          edgesRef.current,
          strokeIds,
        );

        points.push({ x: nextX, y: nextY });
        setScissorStrokePreview([...points]);
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        setScissorStrokePreview(null);
        if (!scissorsModeRef.current) return;

        for (const id of strokeIds) {
          void runRemoveEdgeMutation({ edgeId: id as Id<"edges"> }).catch(
            (error) => {
              console.error("[Canvas] scissors stroke remove failed", {
                edgeId: id,
                error: String(error),
              });
            },
          );
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
      event.preventDefault();
    },
    [edgesRef, runRemoveEdgeMutation, scissorsModeRef, setScissorStrokePreview],
  );

  return { onEdgeClickScissors, onScissorsFlowPointerDownCapture };
}
