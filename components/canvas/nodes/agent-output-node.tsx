"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

type AgentOutputNodeData = {
  isSkeleton?: boolean;
  stepId?: string;
  stepIndex?: number;
  stepTotal?: number;
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
  const isSkeleton = nodeData.isSkeleton === true;
  const hasStepCounter =
    typeof nodeData.stepIndex === "number" &&
    Number.isFinite(nodeData.stepIndex) &&
    typeof nodeData.stepTotal === "number" &&
    Number.isFinite(nodeData.stepTotal) &&
    nodeData.stepTotal > 0;
  const safeStepIndex =
    typeof nodeData.stepIndex === "number" && Number.isFinite(nodeData.stepIndex)
      ? Math.max(0, Math.floor(nodeData.stepIndex))
      : 0;
  const safeStepTotal =
    typeof nodeData.stepTotal === "number" && Number.isFinite(nodeData.stepTotal)
      ? Math.max(1, Math.floor(nodeData.stepTotal))
      : 1;
  const stepCounter = hasStepCounter
    ? `${safeStepIndex + 1}/${safeStepTotal}`
    : null;
  const resolvedTitle = nodeData.title ?? (isSkeleton ? "Planned output" : "Agent output");

  return (
    <BaseNodeWrapper
      nodeType="agent-output"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className={`min-w-[300px] border-amber-500/30 ${isSkeleton ? "opacity-80" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="agent-output-in"
        className="!h-3 !w-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex h-full flex-col gap-3 p-3">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-foreground" title={resolvedTitle}>
              {resolvedTitle}
            </p>
            {isSkeleton ? (
              <span className="shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                Skeleton
              </span>
            ) : null}
          </div>
          {isSkeleton ? (
            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
              Planned output{stepCounter ? ` - ${stepCounter}` : ""}
              {nodeData.stepId ? ` - ${nodeData.stepId}` : ""}
            </p>
          ) : null}
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
          {isSkeleton ? (
            <div
              data-testid="agent-output-skeleton-body"
              className="animate-pulse rounded-md border border-dashed border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-amber-500/10 p-3"
            >
              <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">Planned content</p>
            </div>
          ) : (
            <p className="line-clamp-6 whitespace-pre-wrap text-xs text-foreground/90">
              {nodeData.body ?? ""}
            </p>
          )}
        </section>
      </div>
    </BaseNodeWrapper>
  );
}
