"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  buildGraphSnapshot,
  type CanvasGraphEdgeLike,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";

type CanvasGraphContextValue = CanvasGraphSnapshot;

const CanvasGraphContext = createContext<CanvasGraphContextValue | null>(null);

export function CanvasGraphProvider({
  nodes,
  edges,
  children,
}: {
  nodes: readonly CanvasGraphNodeLike[];
  edges: readonly CanvasGraphEdgeLike[];
  children: ReactNode;
}) {
  const value = useMemo(() => buildGraphSnapshot(nodes, edges), [edges, nodes]);

  return <CanvasGraphContext.Provider value={value}>{children}</CanvasGraphContext.Provider>;
}

export function useCanvasGraph(): CanvasGraphContextValue {
  const context = useContext(CanvasGraphContext);
  if (!context) {
    throw new Error("useCanvasGraph must be used within CanvasGraphProvider");
  }

  return context;
}
