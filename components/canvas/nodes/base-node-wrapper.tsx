"use client";

import type { ReactNode } from "react";
import { NodeErrorBoundary } from "./node-error-boundary";

interface BaseNodeWrapperProps {
  nodeType: string;
  selected?: boolean;
  status?: string;
  statusMessage?: string;
  children: ReactNode;
  className?: string;
}

export default function BaseNodeWrapper({
  nodeType,
  selected,
  status = "idle",
  statusMessage,
  children,
  className = "",
}: BaseNodeWrapperProps) {
  const statusStyles: Record<string, string> = {
    idle: "",
    analyzing: "border-yellow-400 animate-pulse",
    clarifying: "border-amber-400",
    executing: "border-yellow-400 animate-pulse",
    done: "border-green-500",
    error: "border-red-500",
  };

  return (
    <div
      className={`
        rounded-xl border bg-card shadow-sm transition-shadow
        ${selected ? "ring-2 ring-primary shadow-md" : ""}
        ${statusStyles[status] ?? ""}
        ${className}
      `}
    >
      <NodeErrorBoundary nodeType={nodeType}>{children}</NodeErrorBoundary>
      {status === "error" && statusMessage && (
        <div className="px-3 pb-2 text-xs text-red-500 truncate">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
