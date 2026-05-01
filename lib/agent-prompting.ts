/**
 * Onboarding note:
 * Pure prompt construction for analyze/execute agent phases. It consumes compiled prompt segments rather than raw Markdown.
 */

import type { AgentDefinition } from "@/lib/agent-definitions";
import type {
  AgentBriefConstraints,
  AgentClarificationAnswerMap,
  AgentExecutionPlan,
  AgentLocale,
} from "@/lib/agent-run-contract";
import {
  AGENT_DOC_SEGMENTS,
  type AgentDocPromptSegments,
} from "@/lib/generated/agent-doc-segments";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PromptContextNode = {
  nodeId: string;
  type: string;
  status?: string;
  data?: unknown;
};

const PROMPT_SEGMENT_ORDER = ["role", "style-rules", "decision-framework", "channel-notes"] as const;

const PROMPT_DATA_WHITELIST: Record<string, readonly string[]> = {
  image: ["url", "mimeType", "width", "height", "prompt"],
  asset: ["url", "mimeType", "width", "height", "title"],
  video: ["url", "durationSeconds", "width", "height"],
  "asset-video": ["mp4Url", "thumbnailUrl", "duration", "width", "height"],
  text: ["content"],
  "ai-text-output": ["instruction", "inputText", "outputText", "modelId", "creditCost"],
  note: ["content", "color"],
  frame: ["label", "exportWidth", "exportHeight", "backgroundColor"],
  compare: ["leftNodeId", "rightNodeId", "sliderPosition"],
  render: ["url", "format", "width", "height"],
  "ai-image": ["prompt", "model", "modelTier", "creditCost"],
  "ai-video": ["prompt", "model", "modelLabel", "durationSeconds", "creditCost"],
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatScalarValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().replace(/\s+/g, " ").slice(0, 220);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function formatJsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function resolvePromptSegments(
  definition: AgentDefinition,
  provided?: AgentDocPromptSegments,
): AgentDocPromptSegments {
  if (provided) {
    return provided;
  }

  const generated = AGENT_DOC_SEGMENTS[definition.id];
  if (generated) {
    return generated;
  }

  return {
    role: "",
    "style-rules": "",
    "decision-framework": "",
    "channel-notes": "",
  };
}

function extractWhitelistedFields(nodeType: string, data: unknown): Array<{ key: string; value: string }> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }

  const record = data as Record<string, unknown>;
  const keys = PROMPT_DATA_WHITELIST[nodeType] ?? [];
  const fields: Array<{ key: string; value: string }> = [];

  for (const key of keys) {
    const value = formatScalarValue(record[key]);
    if (!value) {
      continue;
    }
    fields.push({ key, value });
  }

  return fields;
}

function formatPromptSegments(segments: AgentDocPromptSegments): string {
  return PROMPT_SEGMENT_ORDER.map((key) => `${key}:\n${segments[key]}`).join("\n\n");
}

function getOutputLanguageInstruction(locale: AgentLocale): string {
  if (locale === "de") {
    return "Write all generated fields in German (de-DE), including step titles, channel labels, output types, clarification prompts, and body content.";
  }

  return "Write all generated fields in English (en-US), including step titles, channel labels, output types, clarification prompts, and body content.";
}

function formatBlueprintHints(definition: AgentDefinition): string {
  return definition.defaultOutputBlueprints
    .map((blueprint, index) => {
      const requiredSections = blueprint.requiredSections.join(", ") || "none";
      const requiredMetadataKeys = blueprint.requiredMetadataKeys.join(", ") || "none";
      const qualityChecks = blueprint.qualityChecks.join(", ") || "none";
      return [
        `${index + 1}. artifactType=${blueprint.artifactType}`,
        `requiredSections=${requiredSections}`,
        `requiredMetadataKeys=${requiredMetadataKeys}`,
        `qualityChecks=${qualityChecks}`,
      ].join("; ");
    })
    .join("\n");
}

export function summarizeIncomingContext(nodes: PromptContextNode[]): string {
  if (nodes.length === 0) {
    return "No incoming nodes connected to this agent.";
  }

  const sorted = [...nodes].sort((left, right) => {
    if (left.nodeId !== right.nodeId) {
      return left.nodeId.localeCompare(right.nodeId);
    }
    return left.type.localeCompare(right.type);
  });

  const lines: string[] = [`Incoming context nodes: ${sorted.length}`];

  for (let index = 0; index < sorted.length; index += 1) {
    const node = sorted[index];
    const status = trimText(node.status) || "unknown";
    lines.push(`${index + 1}. nodeId=${node.nodeId}, type=${node.type}, status=${status}`);

    const fields = extractWhitelistedFields(node.type, node.data);
    if (fields.length === 0) {
      lines.push("   data: (no whitelisted fields)");
      continue;
    }

    for (const field of fields) {
      lines.push(`   - ${field.key}: ${field.value}`);
    }
  }

  return lines.join("\n");
}

export function buildAnalyzeMessages(input: {
  definition: AgentDefinition;
  locale: AgentLocale;
  briefConstraints: AgentBriefConstraints;
  clarificationAnswers: AgentClarificationAnswerMap;
  incomingContextSummary: string;
  incomingContextCount: number;
  promptSegments?: AgentDocPromptSegments;
}): OpenRouterMessage[] {
  const segments = resolvePromptSegments(input.definition, input.promptSegments);

  return [
    {
      role: "system",
      content: [
        `You are the LemonSpace Agent Analyzer for ${input.definition.metadata.name}.`,
        input.definition.metadata.description,
        getOutputLanguageInstruction(input.locale),
        "Use the following compiled prompt segments:",
        formatPromptSegments(segments),
        `analysis rules:\n- ${input.definition.analysisRules.join("\n- ")}`,
        `brief field order: ${input.definition.briefFieldOrder.join(", ")}`,
        `default output blueprints:\n${formatBlueprintHints(input.definition)}`,
        "Return structured JSON matching the schema.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Brief + constraints:\n${formatJsonBlock(input.briefConstraints)}`,
        `Current clarification answers:\n${formatJsonBlock(input.clarificationAnswers)}`,
        `Incoming context node count: ${input.incomingContextCount}`,
        "Incoming node context summary:",
        input.incomingContextSummary,
      ].join("\n\n"),
    },
  ];
}

function formatExecutionRequirements(plan: AgentExecutionPlan): string {
  return plan.steps
    .map((step, index) => {
      const sections = step.requiredSections.join(", ") || "none";
      const checks = step.qualityChecks.join(", ") || "none";
      return [
        `${index + 1}. id=${step.id}`,
        `title: ${step.title}`,
        `channel: ${step.channel}`,
        `outputType: ${step.outputType}`,
        `artifactType: ${step.artifactType}`,
        `goal: ${step.goal}`,
        `requiredSections: ${sections}`,
        `qualityChecks: ${checks}`,
      ].join("; ");
    })
    .join("\n");
}

function formatDeliverableFirstInstructions(): string {
  const rules = [
    "Prioritize publishable, user-facing deliverables for every execution step.",
    "Lead with final copy/content that can be shipped immediately.",
    "Keep assumptions, rationale, and risk notes secondary and concise.",
    "Do not produce reasoning-dominant output or long meta commentary.",
    "When context is partial, deliver the best safe draft first and clearly note assumptions in brief form.",
  ];

  return `deliverable-first rules:\n- ${rules.join("\n- ")}`;
}

export function buildExecuteMessages(input: {
  definition: AgentDefinition;
  locale: AgentLocale;
  briefConstraints: AgentBriefConstraints;
  clarificationAnswers: AgentClarificationAnswerMap;
  incomingContextSummary: string;
  executionPlan: AgentExecutionPlan;
  promptSegments?: AgentDocPromptSegments;
}): OpenRouterMessage[] {
  const segments = resolvePromptSegments(input.definition, input.promptSegments);

  return [
    {
      role: "system",
      content: [
        `You are the LemonSpace Agent Executor for ${input.definition.metadata.name}.`,
        getOutputLanguageInstruction(input.locale),
        "Use the following compiled prompt segments:",
        formatPromptSegments(segments),
        `execution rules:\n- ${input.definition.executionRules.join("\n- ")}`,
        formatDeliverableFirstInstructions(),
        "Return one output payload per execution step keyed by step id.",
      ].join("\n\n"),
    },
    {
      role: "user",
      content: [
        `Brief + constraints:\n${formatJsonBlock(input.briefConstraints)}`,
        `Clarification answers:\n${formatJsonBlock(input.clarificationAnswers)}`,
        `Execution plan summary: ${input.executionPlan.summary}`,
        `Per-step requirements:\n${formatExecutionRequirements(input.executionPlan)}`,
        "Incoming node context summary:",
        input.incomingContextSummary,
      ].join("\n\n"),
    },
  ];
}
