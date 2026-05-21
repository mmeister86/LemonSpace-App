"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CollapsedNodeDrawerToolbarContextValue = {
  activeToolbarNodeId: string | null;
  setActiveToolbarNodeId: (nodeId: string | null) => void;
};

const CollapsedNodeDrawerToolbarContext =
  createContext<CollapsedNodeDrawerToolbarContextValue | null>(null);

export function CollapsedNodeDrawerToolbarProvider({
  children,
  initialActiveToolbarNodeId = null,
}: {
  children: ReactNode;
  initialActiveToolbarNodeId?: string | null;
}) {
  const [activeToolbarNodeId, setActiveToolbarNodeId] = useState<string | null>(
    initialActiveToolbarNodeId,
  );
  const value = useMemo(
    () => ({ activeToolbarNodeId, setActiveToolbarNodeId }),
    [activeToolbarNodeId],
  );

  return (
    <CollapsedNodeDrawerToolbarContext.Provider value={value}>
      {children}
    </CollapsedNodeDrawerToolbarContext.Provider>
  );
}

export function useCollapsedNodeDrawerToolbar() {
  return (
    useContext(CollapsedNodeDrawerToolbarContext) ?? {
      activeToolbarNodeId: null,
      setActiveToolbarNodeId: () => undefined,
    }
  );
}
