import { useEffect, useMemo, useRef } from "react";
import type { EdgeTypes } from "@xyflow/react";

import { isOptimisticEdgeId } from "@/components/canvas/canvas-helpers";
import type { DefaultEdgeInsertAnchor } from "@/components/canvas/edges/default-edge";
import DefaultEdge from "@/components/canvas/edges/default-edge";

type UseCanvasEdgeTypesArgs = {
  edgeInsertMenuEdgeId: string | null;
  scissorsMode: boolean;
  onInsertClick: (anchor: DefaultEdgeInsertAnchor) => void;
};

export function useCanvasEdgeTypes({
  edgeInsertMenuEdgeId,
  scissorsMode,
  onInsertClick,
}: UseCanvasEdgeTypesArgs): EdgeTypes {
  const edgeInsertMenuEdgeIdRef = useRef<string | null>(edgeInsertMenuEdgeId);
  const scissorsModeRef = useRef(scissorsMode);
  const onInsertClickRef = useRef(onInsertClick);

  useEffect(() => {
    edgeInsertMenuEdgeIdRef.current = edgeInsertMenuEdgeId;
    scissorsModeRef.current = scissorsMode;
    onInsertClickRef.current = onInsertClick;
  }, [edgeInsertMenuEdgeId, onInsertClick, scissorsMode]);

  return useMemo(
    () => ({
      "canvas-default": (edgeProps: Parameters<typeof DefaultEdge>[0]) => {
        const edgeClassName = (edgeProps as { className?: string }).className;
        const isInsertableEdge =
          edgeClassName !== "temp" && !isOptimisticEdgeId(edgeProps.id);

        return (
          <DefaultEdge
            {...edgeProps}
            edgeId={edgeProps.id}
            isMenuOpen={edgeInsertMenuEdgeIdRef.current === edgeProps.id}
            disabled={scissorsModeRef.current || !isInsertableEdge}
            onInsertClick={
              isInsertableEdge ? onInsertClickRef.current : undefined
            }
          />
        );
      },
    }),
    [],
  );
}
