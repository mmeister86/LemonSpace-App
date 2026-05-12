"use client";

import { CheckCircle2, ChevronRight, CircleDashed, Clock3, Wrench, XCircle } from "lucide-react";

import {
  normalizeAiRunEvents,
  normalizeToolCallTraces,
  type AiRunEvent,
  type AiRunPhase,
  type ToolCallTrace,
} from "@/lib/ai-run-history";
import { cn } from "@/lib/utils";

type AiRunLabels = {
  phase: Record<AiRunPhase, string>;
  progressTitle: string;
  eventsTitle: string;
  toolCallsTitle: string;
  noEvents: string;
  running: string;
  success: string;
  error: string;
  details: string;
  input: string;
  output: string;
  elapsed: string;
};

function formatElapsed(startedAt: number | undefined, now = Date.now()): string | null {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusIcon(status: string | undefined) {
  if (status === "success") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />;
  }
  if (status === "error") {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
  return <CircleDashed className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
}

function effectiveEventStatus(
  status: string | undefined,
  currentPhase: AiRunPhase,
): string | undefined {
  if (status === "running" && currentPhase === "done") {
    return "success";
  }
  if (status === "running" && currentPhase === "error") {
    return "error";
  }
  return status;
}

function stringifyDetail(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AiRunStatusPanel({
  phase,
  startedAt,
  events,
  toolCalls,
  labels,
  accent = "violet",
  className,
}: {
  phase?: AiRunPhase;
  startedAt?: number;
  events?: readonly AiRunEvent[];
  toolCalls?: readonly ToolCallTrace[];
  labels: AiRunLabels;
  accent?: "violet" | "amber";
  className?: string;
}) {
  const normalizedEvents = normalizeAiRunEvents(events);
  const normalizedToolCalls = normalizeToolCallTraces(toolCalls);
  const currentPhase = phase ?? normalizedEvents.at(-1)?.phase ?? "preparing";
  const elapsed = formatElapsed(startedAt);
  const accentClass =
    accent === "amber"
      ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200"
      : "border-violet-500/30 bg-violet-500/5 text-violet-800 dark:text-violet-200";

  if (normalizedEvents.length === 0 && normalizedToolCalls.length === 0 && !phase) {
    return null;
  }

  return (
    <section
      data-testid="ai-run-status-panel"
      className={cn("rounded-md border px-2.5 py-2 text-xs", accentClass, className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{labels.phase[currentPhase]}</span>
        </div>
        {elapsed ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {labels.elapsed.replace("{time}", elapsed)}
          </span>
        ) : null}
      </div>

      {normalizedEvents.length > 0 ? (
        <div className="mt-2 space-y-1">
          {normalizedEvents.slice(-3).map((event) => (
            <div key={event.id} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
              {statusIcon(effectiveEventStatus(event.status, currentPhase))}
              <span className="min-w-0 flex-1 break-words">{event.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">{labels.noEvents}</p>
      )}

      {normalizedToolCalls.length > 0 ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          <span>{labels.toolCallsTitle}: {normalizedToolCalls.length}</span>
        </div>
      ) : null}
    </section>
  );
}

export function AiStreamingResponse({
  text,
  empty,
  className,
}: {
  text: string;
  empty: string;
  className?: string;
}) {
  return (
    <div
      data-testid="ai-streaming-response"
      className={cn("h-full overflow-auto p-3 text-sm leading-relaxed", className)}
    >
      {text ? (
        <div className="whitespace-pre-wrap break-words">
          {text}
          <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-current opacity-50" />
        </div>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function AiToolCallsSection({
  toolCalls,
  labels,
  className,
}: {
  toolCalls?: readonly ToolCallTrace[];
  labels: AiRunLabels;
  className?: string;
}) {
  const normalizedToolCalls = normalizeToolCallTraces(toolCalls);
  if (normalizedToolCalls.length === 0) {
    return null;
  }

  return (
    <section data-testid="ai-tool-calls-section" className={cn("space-y-1.5", className)}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Wrench className="h-3 w-3" />
        {labels.toolCallsTitle}
      </p>
      <div className="space-y-1.5">
        {normalizedToolCalls.map((toolCall) => {
          const input = stringifyDetail(toolCall.input);
          const output = stringifyDetail(toolCall.output);
          const hasDetails = input || output || toolCall.error;
          return (
            <details
              key={toolCall.id}
              className="rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-[11px]"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 text-foreground/90">
                <ChevronRight className="h-3 w-3 shrink-0 transition-transform details-open:rotate-90" />
                {statusIcon(toolCall.status)}
                <span className="min-w-0 flex-1 truncate font-medium">{toolCall.message}</span>
                <span className="shrink-0 text-muted-foreground">
                  {toolCall.status === "success"
                    ? labels.success
                    : toolCall.status === "error"
                      ? labels.error
                      : labels.running}
                </span>
              </summary>
              {hasDetails ? (
                <div className="mt-2 space-y-2">
                  {input ? (
                    <div>
                      <p className="mb-1 font-medium text-muted-foreground">{labels.input}</p>
                      <pre className="max-h-32 overflow-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-relaxed">
                        {input}
                      </pre>
                    </div>
                  ) : null}
                  {output ? (
                    <div>
                      <p className="mb-1 font-medium text-muted-foreground">{labels.output}</p>
                      <pre className="max-h-32 overflow-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-relaxed">
                        {output}
                      </pre>
                    </div>
                  ) : null}
                  {toolCall.error ? (
                    <p className="break-words text-destructive">{toolCall.error}</p>
                  ) : null}
                </div>
              ) : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}
