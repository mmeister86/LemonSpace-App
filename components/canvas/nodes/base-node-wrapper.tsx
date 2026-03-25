"use client";

import type { ReactNode } from "react";

interface BaseNodeWrapperProps {
  selected?: boolean;
  status?: "idle" | "executing" | "done" | "error";
  children: ReactNode;
  className?: string;
}

const statusClassMap: Record<NonNullable<BaseNodeWrapperProps["status"]>, string> = {
  idle: "",
  executing: "animate-pulse border-yellow-400",
  done: "border-green-500",
  error: "border-red-500",
};

export default function BaseNodeWrapper({
  selected,
  status = "idle",
  children,
  className = "",
}: BaseNodeWrapperProps) {
  return (
    <div
      className={[
        "rounded-xl border bg-card shadow-sm transition-shadow",
        selected ? "ring-2 ring-primary shadow-md" : "",
        statusClassMap[status],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
