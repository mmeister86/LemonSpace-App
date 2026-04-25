"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";

type CanvasSyncStatus = {
  pendingCount: number;
  isSyncing: boolean;
  isOffline: boolean;
};

type CanvasSyncContextValue = {
  queueNodeDataUpdate: (args: { nodeId: Id<"nodes">; data: unknown }) => Promise<void>;
  queueNodeResize: (args: {
    nodeId: Id<"nodes">;
    width: number;
    height: number;
  }) => Promise<void>;
  ungroupNodes?: (args: {
    groupNodeIds: Id<"nodes">[];
    childPositions: Array<{
      nodeId: Id<"nodes">;
      parentId?: Id<"nodes">;
      positionX: number;
      positionY: number;
    }>;
  }) => Promise<unknown>;
  notifyOfflineUnsupported?: (label: string) => void;
  status: CanvasSyncStatus;
};

const CanvasSyncContext = createContext<CanvasSyncContextValue | null>(null);

export function CanvasSyncProvider({
  value,
  children,
}: {
  value: CanvasSyncContextValue;
  children: ReactNode;
}) {
  return (
    <CanvasSyncContext.Provider value={value}>{children}</CanvasSyncContext.Provider>
  );
}

export function useCanvasSync(): CanvasSyncContextValue {
  const context = useContext(CanvasSyncContext);
  if (!context) {
    throw new Error("useCanvasSync must be used within CanvasSyncProvider");
  }
  return context;
}
