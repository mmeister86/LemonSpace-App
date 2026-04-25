import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import type { EdgeTypes } from "@xyflow/react";

import { isOptimisticEdgeId } from "@/components/canvas/canvas-helpers";
import type { DefaultEdgeInsertAnchor } from "@/components/canvas/edges/default-edge";
import DefaultEdge from "@/components/canvas/edges/default-edge";

type CanvasEdgeTypesContextValue = {
  edgeInsertMenuEdgeId: string | null;
  scissorsMode: boolean;
  onInsertClick: (anchor: DefaultEdgeInsertAnchor) => void;
};

const CanvasEdgeTypesContext = createContext<CanvasEdgeTypesContextValue>({
  edgeInsertMenuEdgeId: null,
  scissorsMode: false,
  onInsertClick: () => {},
});

type CanvasEdgeTypesProviderProps = PropsWithChildren<CanvasEdgeTypesContextValue>;

export function CanvasEdgeTypesProvider({
  children,
  edgeInsertMenuEdgeId,
  scissorsMode,
  onInsertClick,
}: CanvasEdgeTypesProviderProps) {
  const value = useMemo(
    () => ({
      edgeInsertMenuEdgeId,
      scissorsMode,
      onInsertClick,
    }),
    [edgeInsertMenuEdgeId, onInsertClick, scissorsMode],
  );

  return (
    <CanvasEdgeTypesContext.Provider value={value}>
      {children}
    </CanvasEdgeTypesContext.Provider>
  );
}

function CanvasDefaultEdge(edgeProps: Parameters<typeof DefaultEdge>[0]) {
  const { edgeInsertMenuEdgeId, scissorsMode, onInsertClick } = useContext(
    CanvasEdgeTypesContext,
  );
  const edgeClassName = (edgeProps as { className?: string }).className;
  const isInsertableEdge =
    edgeClassName !== "temp" && !isOptimisticEdgeId(edgeProps.id);

  return (
    <DefaultEdge
      {...edgeProps}
      edgeId={edgeProps.id}
      isMenuOpen={edgeInsertMenuEdgeId === edgeProps.id}
      disabled={scissorsMode || !isInsertableEdge}
      onInsertClick={isInsertableEdge ? onInsertClick : undefined}
    />
  );
}

export const canvasEdgeTypes: EdgeTypes = {
  "canvas-default": CanvasDefaultEdge,
};
