"use client";

import { Bot } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { getAgentTemplate } from "@/lib/agent-templates";
import BaseNodeWrapper from "./base-node-wrapper";

type AgentNodeData = {
  templateId?: string;
  canvasId?: string;
  _status?: string;
  _statusMessage?: string;
};

type AgentNodeType = Node<AgentNodeData, "agent">;

const DEFAULT_AGENT_TEMPLATE_ID = "campaign-distributor";

function CompactList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-1">
      {items.slice(0, 4).map((item) => (
        <li key={item} className="truncate text-[11px] text-foreground/90" title={item}>
          - {item}
        </li>
      ))}
    </ul>
  );
}

export default function AgentNode({ data, selected }: NodeProps<AgentNodeType>) {
  const nodeData = data as AgentNodeData;
  const template =
    getAgentTemplate(nodeData.templateId ?? DEFAULT_AGENT_TEMPLATE_ID) ??
    getAgentTemplate(DEFAULT_AGENT_TEMPLATE_ID);

  if (!template) {
    return null;
  }

  return (
    <BaseNodeWrapper
      nodeType="agent"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[300px] border-amber-500/30"
    >
      <Handle
        type="target"
        position={Position.Left}
        id="agent-in"
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-3 p-3">
        <header className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Bot className="h-3.5 w-3.5" />
            <span>{template.emoji}</span>
            <span>{template.name}</span>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        </header>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Channels
          </p>
          <CompactList items={template.channels} />
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected Inputs
          </p>
          <CompactList items={template.expectedInputs} />
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Expected Outputs
          </p>
          <CompactList items={template.expectedOutputs} />
        </section>
      </div>
    </BaseNodeWrapper>
  );
}
