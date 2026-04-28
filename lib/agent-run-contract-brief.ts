import { normalizeStringArray, trimString } from "@/lib/agent-run-contract-shared";

export type AgentClarificationQuestion = {
  id: string;
  prompt: string;
  required: boolean;
};

export type AgentClarificationAnswerMap = Partial<Record<string, string>>;

export type AgentBriefConstraints = {
  briefing: string;
  audience: string;
  tone: string;
  targetChannels: string[];
  hardConstraints: string[];
};

export type AgentLocale = "de" | "en";

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
