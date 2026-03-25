"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import BaseNodeWrapper from "./base-node-wrapper";

type AiImageNodeData = {
  url?: string;
  prompt?: string;
  model?: string;
  _status?: string;
  _statusMessage?: string;
};

export type AiImageNode = Node<AiImageNodeData, "ai-image">;

export default function AiImageNode({
  data,
  selected,
}: NodeProps<AiImageNode>) {
  const status = data._status ?? "idle";

  return (
    <BaseNodeWrapper
      selected={selected}
      status={status}
      statusMessage={data._statusMessage}
    >
      <div className="p-2">
        <div className="text-xs font-medium text-emerald-500 mb-1">
          🤖 KI-Bild
        </div>

        {status === "executing" && (
          <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {status === "done" && data.url && (
          <img
            src={data.url}
            alt={data.prompt ?? "KI-generiertes Bild"}
            className="rounded-lg object-cover max-w-[260px]"
            draggable={false}
          />
        )}

        {status === "error" && (
          <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/20 text-sm text-red-600">
            {data._statusMessage ?? "Fehler bei der Generierung"}
          </div>
        )}

        {status === "idle" && (
          <div className="flex h-36 w-56 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            Prompt verbinden
          </div>
        )}

        {data.prompt && status === "done" && (
          <p className="mt-1 text-xs text-muted-foreground truncate max-w-[260px]">
            {data.prompt}
          </p>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-emerald-500 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />
    </BaseNodeWrapper>
  );
}
