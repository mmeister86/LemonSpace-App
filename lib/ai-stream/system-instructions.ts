/**
 * Onboarding note:
 * AI SDK v7 expects trusted server system prompts in the top-level instructions option, not inside messages.
 */

import type { ModelMessage } from "ai";

export type AiSdkPromptParts = {
  instructions?: string;
  messages: ModelMessage[];
};

function systemContentToText(content: ModelMessage["content"]): string {
  return typeof content === "string" ? content.trim() : "";
}

export function splitSystemInstructionsFromMessages(
  messages: ModelMessage[],
): AiSdkPromptParts {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => systemContentToText(message.content))
    .filter(Boolean)
    .join("\n\n");

  return {
    ...(instructions ? { instructions } : {}),
    messages: messages.filter((message) => message.role !== "system"),
  };
}
