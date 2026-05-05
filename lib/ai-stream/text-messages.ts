export type AiStreamMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function trimOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildAiTextStreamMessages(args: {
  instruction?: string;
  inputText?: string;
}): AiStreamMessage[] {
  const instruction = trimOptionalText(args.instruction);
  const inputText = trimOptionalText(args.inputText);
  const hasSourceMaterial = Boolean(inputText);
  const requestedTask = instruction
    ? instruction
    : hasSourceMaterial
      ? "Improve the text for clarity, structure, flow, and correctness while preserving the intended meaning."
      : "Create a fresh text from the available context.";

  return [
    {
      role: "system",
      content: [
        "You are the LemonSpace AI text node.",
        "Write only the final text content.",
        "Do not add explanations, headings, bullet-point rationales, or markdown code fences unless the user explicitly asks for them.",
        "Keep the dominant language of the provided context and instructions.",
        hasSourceMaterial
          ? "If source material is provided, transform or improve it according to the instruction."
          : "If no source material is provided, create a new text from the instruction.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task:\n${requestedTask}`,
        inputText
          ? `Text or draft:\n${inputText}`
          : "No source material was provided. Generate the requested text from scratch.",
      ].join("\n\n"),
    },
  ];
}
