"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";

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

function tryFormatJsonBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  const looksLikeJsonObject = trimmed.startsWith("{") && trimmed.endsWith("}");
  const looksLikeJsonArray = trimmed.startsWith("[") && trimmed.endsWith("]");
  if (!looksLikeJsonObject && !looksLikeJsonArray) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export default function AgentOutputNode({ data, selected }: NodeProps<AgentOutputNodeType>) {
  const t = useTranslations("agentOutputNode");
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
  const resolvedTitle =
    nodeData.title ??
    (isSkeleton ? t("plannedOutputDefaultTitle") : t("defaultTitle"));
  const body = nodeData.body ?? "";
  const formattedJsonBody = isSkeleton ? null : tryFormatJsonBody(body);

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
                  {t("skeletonBadge")}
                </span>
              ) : null}
            </div>
            {isSkeleton ? (
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                {t("plannedOutputLabel")}
                {stepCounter ? ` - ${stepCounter}` : ""}
                {nodeData.stepId ? ` - ${nodeData.stepId}` : ""}
              </p>
            ) : null}
        </header>

        <section
          data-testid="agent-output-meta-strip"
          className="grid grid-cols-2 gap-2 rounded-md border border-border/70 bg-muted/30 px-2 py-1.5"
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("channelLabel")}</p>
            <p className="truncate text-xs font-medium text-foreground/90" title={nodeData.channel}>
              {nodeData.channel ?? "-"}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("typeLabel")}</p>
            <p className="truncate text-xs font-medium text-foreground/90" title={nodeData.outputType}>
              {nodeData.outputType ?? "-"}
            </p>
          </div>
        </section>

        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("bodyLabel")}
          </p>
          {isSkeleton ? (
            <div
              data-testid="agent-output-skeleton-body"
              className="animate-pulse rounded-md border border-dashed border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-amber-500/10 p-3"
            >
              <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{t("plannedContent")}</p>
            </div>
          ) : formattedJsonBody ? (
            <pre
              data-testid="agent-output-json-body"
              className="max-h-48 overflow-auto rounded-md border border-border/80 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/95"
            >
              <code>{formattedJsonBody}</code>
            </pre>
          ) : (
            <div
              data-testid="agent-output-text-body"
              className="max-h-48 overflow-auto rounded-md border border-border/70 bg-background/70 p-3 text-[13px] leading-relaxed text-foreground/90"
            >
              <p className="whitespace-pre-wrap break-words">{body}</p>
            </div>
          )}
        </section>
      </div>
    </BaseNodeWrapper>
  );
}
