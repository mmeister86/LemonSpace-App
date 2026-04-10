export type AgentClarificationQuestion = {
  id: string;
  prompt: string;
  required: boolean;
};

export type AgentClarificationAnswerMap = Partial<Record<string, string>>;

export type AgentOutputDraft = {
  title?: string;
  channel?: string;
  outputType?: string;
  body?: string;
};

export type AgentExecutionStep = {
  id: string;
  title: string;
  channel: string;
  outputType: string;
};

export type AgentExecutionPlan = {
  summary: string;
  steps: AgentExecutionStep[];
};

export type AgentBriefConstraints = {
  briefing: string;
  audience: string;
  tone: string;
  targetChannels: string[];
  hardConstraints: string[];
};

export type AgentLocale = "de" | "en";

export type AgentAnalyzeResult = {
  clarificationQuestions: AgentClarificationQuestion[];
  executionPlan: AgentExecutionPlan | null;
  outputDrafts: AgentOutputDraft[];
};

const SAFE_FALLBACK_TITLE = "Untitled";
const SAFE_FALLBACK_CHANNEL = "general";
const SAFE_FALLBACK_OUTPUT_TYPE = "text";

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStepId(value: unknown): string {
  return trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/\s+/g, "-");
}

function normalizeStringArray(raw: unknown, options?: { lowerCase?: boolean }): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    const trimmed = trimString(item);
    if (trimmed === "") {
      continue;
    }

    const value = options?.lowerCase ? trimmed.toLowerCase() : trimmed;
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function normalizeAgentBriefConstraints(raw: unknown): AgentBriefConstraints {
  const rawRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  return {
    briefing: trimString(rawRecord?.briefing),
    audience: trimString(rawRecord?.audience),
    tone: trimString(rawRecord?.tone),
    targetChannels: normalizeStringArray(rawRecord?.targetChannels, { lowerCase: true }),
    hardConstraints: normalizeStringArray(rawRecord?.hardConstraints),
  };
}

export function normalizeAgentLocale(raw: unknown): AgentLocale {
  if (raw === "de" || raw === "en") {
    return raw;
  }
  return "de";
}

export type PreflightClarificationInput = {
  briefConstraints: AgentBriefConstraints | unknown;
  incomingContextCount: number;
};

const BRIEFING_REQUIRED_QUESTION: AgentClarificationQuestion = {
  id: "briefing",
  prompt: "What should the agent produce? Provide the brief in one or two sentences.",
  required: true,
};

const TARGET_CHANNELS_REQUIRED_QUESTION: AgentClarificationQuestion = {
  id: "target-channels",
  prompt: "Which channels should this run target? List at least one channel.",
  required: true,
};

const INCOMING_CONTEXT_REQUIRED_QUESTION: AgentClarificationQuestion = {
  id: "incoming-context",
  prompt: "No context was provided. What source context should the agent use?",
  required: true,
};

export function buildPreflightClarificationQuestions(
  input: PreflightClarificationInput,
): AgentClarificationQuestion[] {
  const normalizedBriefConstraints = normalizeAgentBriefConstraints(input.briefConstraints);
  const incomingContextCount = Number.isFinite(input.incomingContextCount)
    ? Math.max(0, Math.trunc(input.incomingContextCount))
    : 0;

  const questions: AgentClarificationQuestion[] = [];

  if (normalizedBriefConstraints.briefing === "") {
    questions.push(BRIEFING_REQUIRED_QUESTION);
  }

  if (normalizedBriefConstraints.targetChannels.length === 0) {
    questions.push(TARGET_CHANNELS_REQUIRED_QUESTION);
  }

  if (incomingContextCount === 0) {
    questions.push(INCOMING_CONTEXT_REQUIRED_QUESTION);
  }

  return questions;
}

export function normalizeAgentExecutionPlan(raw: unknown): AgentExecutionPlan {
  const rawRecord =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const rawSteps = Array.isArray(rawRecord?.steps) ? rawRecord.steps : [];
  const seenStepIds = new Set<string>();
  const steps: AgentExecutionStep[] = [];

  for (let index = 0; index < rawSteps.length; index += 1) {
    const item = rawSteps[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const fallbackId = `step-${index + 1}`;
    const normalizedCandidateId = normalizeStepId(itemRecord.id) || fallbackId;
    let stepId = normalizedCandidateId;
    let suffix = 2;
    while (seenStepIds.has(stepId)) {
      stepId = `${normalizedCandidateId}-${suffix}`;
      suffix += 1;
    }
    seenStepIds.add(stepId);

    steps.push({
      id: stepId,
      title: trimString(itemRecord.title) || SAFE_FALLBACK_TITLE,
      channel: trimString(itemRecord.channel) || SAFE_FALLBACK_CHANNEL,
      outputType: trimString(itemRecord.outputType) || SAFE_FALLBACK_OUTPUT_TYPE,
    });
  }

  return {
    summary: trimString(rawRecord?.summary),
    steps,
  };
}

export function areClarificationAnswersComplete(
  questions: AgentClarificationQuestion[],
  answers: AgentClarificationAnswerMap,
): boolean {
  for (const question of questions) {
    if (!question.required) {
      continue;
    }

    if (trimString(answers[question.id]) === "") {
      return false;
    }
  }

  return true;
}

export function normalizeAgentOutputDraft(
  draft: AgentOutputDraft,
): AgentOutputDraft & {
  title: string;
  channel: string;
  outputType: string;
  body: string;
} {
  const title = trimString(draft.title) || SAFE_FALLBACK_TITLE;
  const channel = trimString(draft.channel) || SAFE_FALLBACK_CHANNEL;
  const outputType = trimString(draft.outputType) || SAFE_FALLBACK_OUTPUT_TYPE;

  return {
    ...draft,
    title,
    channel,
    outputType,
    body: trimString(draft.body),
  };
}
