"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  buildGraphSnapshot,
  type CanvasGraphEdgeLike,
  type CanvasGraphNodeDataOverrides,
  type CanvasGraphNodeLike,
  type CanvasGraphSnapshot,
  pruneCanvasGraphNodeDataOverrides,
} from "@/lib/canvas-render-preview";

type CanvasGraphContextValue = CanvasGraphSnapshot & {
  previewNodeDataOverrides: CanvasGraphNodeDataOverrides;
};

type CanvasGraphPreviewOverridesContextValue = {
  setPreviewNodeDataOverride: (nodeId: string, data: unknown) => void;
  clearPreviewNodeDataOverride: (nodeId: string) => void;
  clearPreviewNodeDataOverrides: () => void;
};

const CanvasGraphContext = createContext<CanvasGraphContextValue | null>(null);
const CanvasGraphPreviewOverridesContext =
  createContext<CanvasGraphPreviewOverridesContextValue | null>(null);

export function CanvasGraphProvider({
  nodes,
  edges,
  children,
}: {
  nodes: readonly CanvasGraphNodeLike[];
  edges: readonly CanvasGraphEdgeLike[];
  children: ReactNode;
}) {
  const [previewNodeDataOverrides, setPreviewNodeDataOverrides] =
    useState<CanvasGraphNodeDataOverrides>(() => new Map());

  const setPreviewNodeDataOverride = useCallback((nodeId: string, data: unknown) => {
    setPreviewNodeDataOverrides((previous) => {
      if (previous.has(nodeId) && Object.is(previous.get(nodeId), data)) {
        return previous;
      }

      const next = new Map(previous);
      next.set(nodeId, data);
      return next;
    });
  }, []);

  const clearPreviewNodeDataOverride = useCallback((nodeId: string) => {
    setPreviewNodeDataOverrides((previous) => {
      if (!previous.has(nodeId)) {
        return previous;
      }

      const next = new Map(previous);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const clearPreviewNodeDataOverrides = useCallback(() => {
    setPreviewNodeDataOverrides((previous) => {
      if (previous.size === 0) {
        return previous;
      }

      return new Map();
    });
  }, []);

  const prunedPreviewNodeDataOverrides = useMemo(
    () => pruneCanvasGraphNodeDataOverrides(nodes, previewNodeDataOverrides),
    [nodes, previewNodeDataOverrides],
  );

  const graph = useMemo(
    () =>
      buildGraphSnapshot(nodes, edges, {
        nodeDataOverrides: prunedPreviewNodeDataOverrides,
      }),
    [edges, nodes, prunedPreviewNodeDataOverrides],
  );

  const value = useMemo(
    () => ({
      ...graph,
      previewNodeDataOverrides: prunedPreviewNodeDataOverrides,
    }),
    [graph, prunedPreviewNodeDataOverrides],
  );

  const previewOverridesValue = useMemo(
    () => ({
      setPreviewNodeDataOverride,
      clearPreviewNodeDataOverride,
      clearPreviewNodeDataOverrides,
    }),
    [
      clearPreviewNodeDataOverride,
      clearPreviewNodeDataOverrides,
      setPreviewNodeDataOverride,
    ],
  );

  return (
    <CanvasGraphPreviewOverridesContext.Provider value={previewOverridesValue}>
      <CanvasGraphContext.Provider value={value}>{children}</CanvasGraphContext.Provider>
    </CanvasGraphPreviewOverridesContext.Provider>
  );
}

export function useCanvasGraph(): CanvasGraphContextValue {
  const context = useContext(CanvasGraphContext);
  if (!context) {
    throw new Error("useCanvasGraph must be used within CanvasGraphProvider");
  }

  return context;
}

export function useCanvasGraphPreviewOverrides(): CanvasGraphPreviewOverridesContextValue {
  const context = useContext(CanvasGraphPreviewOverridesContext);
  if (!context) {
    throw new Error("useCanvasGraphPreviewOverrides must be used within CanvasGraphProvider");
  }

  return context;
}
