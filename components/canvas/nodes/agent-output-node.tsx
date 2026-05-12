"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas agent output node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useSyncExternalStore } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";

import { InstagramPost } from "@/components/agents/instagram/ui/instagram-post";
import {
  getLocalNodeStreamSnapshot,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";
import {
  AiRunStatusPanel,
  AiStreamingResponse,
  AiToolCallsSection,
} from "@/components/ui/ai-run-status";
import BaseNodeWrapper from "./base-node-wrapper";
import CanvasHandle from "@/components/canvas/canvas-handle";
import type { AiRunEvent, AiRunPhase, ToolCallTrace } from "@/lib/ai-run-history";

type AgentOutputNodeData = {
  isSkeleton?: boolean;
  stepId?: string;
  stepIndex?: number;
  stepTotal?: number;
  title?: string;
  channel?: string;
  artifactType?: string;
  previewText?: string;
  sections?: Array<{
    id?: string;
    label?: string;
    content?: string;
  }>;
  metadata?: Record<string, string | string[] | unknown>;
  metadataLabels?: Record<string, string | unknown>;
  qualityChecks?: string[];
  outputType?: string;
  body?: string;
  instagramPost?: {
    username?: string;
    location?: string;
    profileImageUrl?: string;
    imageUrl?: string;
    isLiked?: boolean;
    likesCount?: number;
    caption?: string;
    hashtags?: string[];
  };
  runStartedAt?: number;
  runFinishedAt?: number;
  runEvents?: AiRunEvent[];
  toolCalls?: ToolCallTrace[];
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

function normalizeSections(raw: AgentOutputNodeData["sections"]) {
  if (!Array.isArray(raw)) {
    return [] as Array<{ id: string; label: string; content: string }>;
  }

  const sections: Array<{ id: string; label: string; content: string }> = [];
  for (const item of raw) {
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    const content = typeof item?.content === "string" ? item.content.trim() : "";
    if (label === "" || content === "") {
      continue;
    }
    const id = typeof item.id === "string" && item.id.trim() !== "" ? item.id.trim() : label;
    sections.push({ id, label, content });
  }

  return sections;
}

function normalizeMetadata(raw: AgentOutputNodeData["metadata"]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [] as Array<[string, string]>;
  }

  const entries: Array<[string, string]> = [];
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = rawKey.trim();
    if (key === "") {
      continue;
    }

    if (typeof rawValue === "string") {
      const value = rawValue.trim();
      if (value !== "") {
        entries.push([key, value]);
      }
      continue;
    }

    if (Array.isArray(rawValue)) {
      const values = rawValue
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value !== "");
      if (values.length > 0) {
        entries.push([key, values.join(", ")]);
      }
    }
  }

  return entries;
}

function resolveMetadataLabel(
  key: string,
  rawLabels: AgentOutputNodeData["metadataLabels"],
): string {
  if (!rawLabels || typeof rawLabels !== "object" || Array.isArray(rawLabels)) {
    return key;
  }

  const candidate = rawLabels[key];
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate.trim() : key;
}

function normalizeQualityChecks(raw: AgentOutputNodeData["qualityChecks"]): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

function normalizeSectionToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function partitionSections(
  sections: Array<{ id: string; label: string; content: string }>,
  artifactType: string,
) {
  const artifactToken = normalizeSectionToken(artifactType);
  const priorityTokens = artifactToken === "socialcaptionpack" ? ["caption", "hashtags", "cta"] : [];
  const isSecondaryNote = (label: string) => {
    const token = normalizeSectionToken(label);
    return token.includes("formatnote") || token.includes("assumption");
  };

  const primaryWithIndex: Array<{ section: (typeof sections)[number]; index: number }> = [];
  const secondary: Array<{ id: string; label: string; content: string }> = [];

  sections.forEach((section, index) => {
    if (isSecondaryNote(section.label)) {
      secondary.push(section);
      return;
    }
    primaryWithIndex.push({ section, index });
  });

  if (priorityTokens.length === 0) {
    return {
      primary: primaryWithIndex.map((entry) => entry.section),
      secondary,
    };
  }

  const priorityIndexByToken = new Map(priorityTokens.map((token, index) => [token, index]));
  const primary = [...primaryWithIndex]
    .sort((left, right) => {
      const leftToken = normalizeSectionToken(left.section.label);
      const rightToken = normalizeSectionToken(right.section.label);
      const leftPriority = priorityIndexByToken.get(leftToken);
      const rightPriority = priorityIndexByToken.get(rightToken);

      if (leftPriority !== undefined && rightPriority !== undefined) {
        return leftPriority - rightPriority;
      }
      if (leftPriority !== undefined) {
        return -1;
      }
      if (rightPriority !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.section);

  return {
    primary,
    secondary,
  };
}

export default function AgentOutputNode({ id, data, selected }: NodeProps<AgentOutputNodeType>) {
  const t = useTranslations("agentOutputNode");
  const nodeData = data as AgentOutputNodeData;
  const localStream = useSyncExternalStore(
    (listener) => subscribeToLocalNodeStream(id, listener),
    () => getLocalNodeStreamSnapshot(id),
    () => undefined,
  );
  const isSkeleton = nodeData.isSkeleton === true;
  const terminalPhase =
    nodeData._status === "done" ? "done" : nodeData._status === "error" ? "error" : undefined;
  const activeLocalStream = terminalPhase ? undefined : localStream;
  const runLabels = {
    phase: {
      preparing: t("run.phase.preparing"),
      "reading-context": t("run.phase.readingContext"),
      streaming: t("run.phase.streaming"),
      "calling-tools": t("run.phase.callingTools"),
      finalizing: t("run.phase.finalizing"),
      done: t("run.phase.done"),
      error: t("run.phase.error"),
    } satisfies Record<AiRunPhase, string>,
    progressTitle: t("run.progressTitle"),
    eventsTitle: t("run.eventsTitle"),
    toolCallsTitle: t("run.toolCallsTitle"),
    noEvents: t("run.noEvents"),
    running: t("run.running"),
    success: t("run.success"),
    error: t("run.error"),
    details: t("run.details"),
    input: t("run.input"),
    output: t("run.output"),
    elapsed: t("run.elapsed", { time: "{time}" }),
  };
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
  const artifactType = nodeData.artifactType ?? nodeData.outputType ?? "";
  const sections = normalizeSections(nodeData.sections);
  const { primary: primarySections, secondary: secondarySections } = partitionSections(
    sections,
    artifactType,
  );
  const metadataEntries = normalizeMetadata(nodeData.metadata);
  const metadataLabels = nodeData.metadataLabels;
  const qualityChecks = normalizeQualityChecks(nodeData.qualityChecks);
  const isInstagramPost = artifactType === "instagram-post" && nodeData.instagramPost;
  const previewText =
    typeof nodeData.previewText === "string" && nodeData.previewText.trim() !== ""
      ? nodeData.previewText.trim()
      : primarySections[0]?.content ?? sections[0]?.content ?? "";
  const hasStructuredOutput =
    sections.length > 0 || metadataEntries.length > 0 || qualityChecks.length > 0 || previewText !== "";
  const hasMetaValues =
    (typeof nodeData.channel === "string" && nodeData.channel.trim() !== "") || artifactType.trim() !== "";
  const hasDetailsContent =
    secondarySections.length > 0 || metadataEntries.length > 0 || qualityChecks.length > 0 || hasMetaValues;
  const formattedJsonBody = isSkeleton ? null : tryFormatJsonBody(body);

  return (
    <BaseNodeWrapper
      nodeType="agent-output"
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className={`min-w-[300px] border-amber-500/30 ${isSkeleton ? "opacity-80" : ""}`}
    >
      <CanvasHandle
        nodeId={id}
        nodeType="agent-output"
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

        <AiRunStatusPanel
          phase={terminalPhase ?? activeLocalStream?.phase}
          startedAt={activeLocalStream?.startedAt ?? nodeData.runStartedAt}
          events={activeLocalStream?.events ?? nodeData.runEvents}
          toolCalls={activeLocalStream?.toolCalls ?? nodeData.toolCalls}
          labels={runLabels}
          accent="amber"
        />

        {activeLocalStream?.text ? (
          <section data-testid="agent-output-stream-draft" className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bodyLabel")}
            </p>
            <AiStreamingResponse
              text={activeLocalStream.text}
              empty={t("plannedContent")}
              className="max-h-48 rounded-md border border-border/70 bg-background/70 text-[13px] text-foreground/90"
            />
          </section>
        ) : isSkeleton ? (
          <section className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bodyLabel")}
            </p>
            <div
              data-testid="agent-output-skeleton-body"
              className="animate-pulse rounded-md border border-dashed border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-amber-500/10 p-3"
            >
              <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{t("plannedContent")}</p>
            </div>
          </section>
        ) : isInstagramPost ? (
          <section data-testid="agent-output-instagram-preview" className="space-y-2">
            <InstagramPost {...nodeData.instagramPost} />
            {metadataEntries.length > 0 ? (
              <details data-testid="agent-output-details" className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5">
                <summary className="cursor-pointer text-[11px] font-semibold text-foreground/80">{t("detailsLabel")}</summary>
                <div className="mt-2 space-y-1 text-[12px] text-foreground/90">
                  {metadataEntries.map(([key, value]) => (
                    <p key={key} className="break-words">
                      <span className="font-semibold">{resolveMetadataLabel(key, metadataLabels)}</span>: {value}
                    </p>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        ) : hasStructuredOutput ? (
          <>
            {previewText !== "" ? (
              <section data-testid="agent-output-preview" className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("previewLabel")}</p>
                <div className="max-h-40 overflow-auto rounded-md border border-border/70 bg-background/70 p-3 text-[13px] leading-relaxed text-foreground/90">
                  <p className="whitespace-pre-wrap break-words">{previewText}</p>
                </div>
              </section>
            ) : null}

            {primarySections.length > 0 ? (
              <section data-testid="agent-output-sections" className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionsLabel")}</p>
                <div className="space-y-1.5">
                  {primarySections.map((section) => (
                    <div key={section.id} className="rounded-md border border-border/70 bg-background/70 p-2">
                      <p className="text-[11px] font-semibold text-foreground/90">{section.label}</p>
                      <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90">
                        {section.content}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {hasDetailsContent ? (
              <details data-testid="agent-output-details" className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5">
                <summary className="cursor-pointer text-[11px] font-semibold text-foreground/80">{t("detailsLabel")}</summary>
                <div className="mt-2 space-y-2">
                  {hasMetaValues ? (
                    <section
                      data-testid="agent-output-meta-strip"
                      className="grid grid-cols-2 gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("channelLabel")}</p>
                        <p className="truncate text-xs font-medium text-foreground/90" title={nodeData.channel}>
                          {nodeData.channel ?? t("emptyValue")}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("artifactTypeLabel")}</p>
                        <p className="truncate text-xs font-medium text-foreground/90" title={artifactType}>
                          {artifactType || t("emptyValue")}
                        </p>
                      </div>
                    </section>
                  ) : null}

                  {secondarySections.length > 0 ? (
                    <section data-testid="agent-output-secondary-sections" className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionsLabel")}</p>
                      <div className="space-y-1.5">
                        {secondarySections.map((section) => (
                          <div key={section.id} className="rounded-md border border-border/70 bg-background/70 p-2">
                            <p className="text-[11px] font-semibold text-foreground/90">{section.label}</p>
                            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-foreground/90">
                              {section.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {metadataEntries.length > 0 ? (
                    <section data-testid="agent-output-metadata" className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("metadataLabel")}</p>
                      <div className="space-y-1 text-[12px] text-foreground/90">
                        {metadataEntries.map(([key, value]) => (
                          <p key={key} className="break-words">
                            <span className="font-semibold">{resolveMetadataLabel(key, metadataLabels)}</span>: {value}
                          </p>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {qualityChecks.length > 0 ? (
                    <section data-testid="agent-output-quality-checks" className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("qualityChecksLabel")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {qualityChecks.map((qualityCheck) => (
                          <span
                            key={qualityCheck}
                            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200"
                          >
                            {qualityCheck}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </details>
            ) : null}
          </>
        ) : formattedJsonBody ? (
          <section className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bodyLabel")}
            </p>
            <pre
              data-testid="agent-output-json-body"
              className="max-h-48 overflow-auto rounded-md border border-border/80 bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/95"
            >
              <code>{formattedJsonBody}</code>
            </pre>
          </section>
        ) : (
          <section className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bodyLabel")}
            </p>
            <div
              data-testid="agent-output-text-body"
              className="max-h-48 overflow-auto rounded-md border border-border/70 bg-background/70 p-3 text-[13px] leading-relaxed text-foreground/90"
            >
              <p className="whitespace-pre-wrap break-words">{body}</p>
            </div>
          </section>
        )}

        <AiToolCallsSection
          toolCalls={activeLocalStream?.toolCalls ?? nodeData.toolCalls}
          labels={runLabels}
        />
      </div>
    </BaseNodeWrapper>
  );
}
