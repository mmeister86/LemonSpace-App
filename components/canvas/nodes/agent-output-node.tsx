"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

type AgentOutputNodeData = {
  title?: string;
  channel?: string;
  outputType?: string;
  body?: string;
  _status?: string;
  _statusMessage?: string;
};

type AgentOutputNodeType = Node<AgentOutputNodeData, "agent-output">;

export default function AgentOutputNode({ data, selected }: NodeProps<AgentOutputNodeType>) {
  const nodeData = data as AgentOutputNodeData;

  return (
    <BaseNodeWrapper
      nodeType="agent-output"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[300px] border-amber-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="agent-output-in"
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-3 p-3">
        <header className="space-y-1">
          <p className="truncate text-xs font-semibold text-foreground" title={nodeData.title}>
            {nodeData.title ?? "Agent output"}
          </p>
        </header>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Channel
          </p>
          <p className="truncate text-xs text-foreground/90" title={nodeData.channel}>
            {nodeData.channel ?? "-"}
          </p>
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Output Type
          </p>
          <p className="truncate text-xs text-foreground/90" title={nodeData.outputType}>
            {nodeData.outputType ?? "-"}
          </p>
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Body
          </p>
          <p className="line-clamp-6 whitespace-pre-wrap text-xs text-foreground/90">
            {nodeData.body ?? ""}
          </p>
        </section>
      </div>
    </BaseNodeWrapper>
  );
}
