"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { CanvasMagnetTarget } from "@/components/canvas/canvas-connection-magnetism";

type CanvasConnectionMagnetismState = {
  activeTarget: CanvasMagnetTarget | null;
  setActiveTarget: (target: CanvasMagnetTarget | null) => void;
};

const CanvasConnectionMagnetismContext =
  createContext<CanvasConnectionMagnetismState | null>(null);

export function CanvasConnectionMagnetismProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeTarget, setActiveTarget] = useState<CanvasMagnetTarget | null>(null);

  const value = useMemo(
    () => ({
      activeTarget,
      setActiveTarget,
    }),
    [activeTarget],
  );

  return (
    <CanvasConnectionMagnetismContext.Provider value={value}>
      {children}
    </CanvasConnectionMagnetismContext.Provider>
  );
}

export function useCanvasConnectionMagnetism(): CanvasConnectionMagnetismState {
  const context = useContext(CanvasConnectionMagnetismContext);
  if (!context) {
    throw new Error(
      "useCanvasConnectionMagnetism must be used within CanvasConnectionMagnetismProvider",
    );
  }
  return context;
}
