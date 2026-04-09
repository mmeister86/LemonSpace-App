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

export type AgentExecutionPlan = {
  steps: string[];
  outputs: AgentOutputDraft[];
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
