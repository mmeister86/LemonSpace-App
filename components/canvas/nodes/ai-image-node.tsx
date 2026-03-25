"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type AiImageNodeData = {
  url?: string;
  prompt?: string;
  model?: string;
  status?: "idle" | "executing" | "done" | "error";
  errorMessage?: string;
};

export type AiImageNode = Node<AiImageNodeData, "ai-image">;

export default function AiImageNode({ data, selected }: NodeProps<AiImageNode>) {
  const status = data.status ?? "idle";

  return (
    <BaseNodeWrapper selected={selected} status={status} className="p-2">
      <div className="mb-1 text-xs font-medium text-emerald-500">KI-Bild</div>

      {status === "executing" ? (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : null}

      {status === "done" && data.url ? (
        <img
          src={data.url}
          alt={data.prompt ?? "KI-generiertes Bild"}
          className="max-w-[280px] rounded-lg object-cover"
          draggable={false}
        />
      ) : null}

      {status === "error" ? (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-red-50 text-sm text-red-600 dark:bg-red-950/20">
          {data.errorMessage ?? "Fehler bei der Generierung"}
        </div>
      ) : null}

      {status === "idle" ? (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          Prompt verbinden
        </div>
      ) : null}

      {data.prompt && status === "done" ? (
        <p className="mt-1 max-w-[280px] truncate text-xs text-muted-foreground">{data.prompt}</p>
      ) : null}

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-emerald-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary"
      />
    </BaseNodeWrapper>
  );
}
