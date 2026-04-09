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
