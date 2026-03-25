"use client";

import type { ReactNode } from "react";

interface BaseNodeWrapperProps {
  selected?: boolean;
  status?: string;
  statusMessage?: string;
  children: ReactNode;
  className?: string;
}

export default function BaseNodeWrapper({
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
      {children}
      {status === "error" && statusMessage && (
        <div className="px-3 pb-2 text-xs text-red-500 truncate">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
