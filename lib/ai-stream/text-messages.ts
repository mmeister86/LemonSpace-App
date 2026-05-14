import type { ModelMessage } from "ai";

import type { AiImageReferenceSourceType } from "@/lib/ai-image-references";

export type AiStreamMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiTextVisualMode = "context" | "describe";

export type AiTextVisualReference = {
  sourceNodeId: string;
  sourceType: AiImageReferenceSourceType;
  label: string;
  imageUrl: string;
};

export function trimOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildAiTextStreamMessages(args: {
  instruction?: string;
  inputText?: string;
  visualMode?: AiTextVisualMode;
  visualReferences?: AiTextVisualReference[];
}): ModelMessage[] {
  const instruction = trimOptionalText(args.instruction);
  const inputText = trimOptionalText(args.inputText);
  const visualMode = args.visualMode ?? "context";
  const visualReferences = (args.visualReferences ?? []).filter((reference) =>
    reference.imageUrl.trim().length > 0,
  );
  const hasSourceMaterial = Boolean(inputText);
  const hasVisualMaterial = visualReferences.length > 0;
  const requestedTask = instruction
    ? instruction
    : visualMode === "describe" && hasVisualMaterial
      ? "Describe the attached image material clearly and usefully in text."
      : hasSourceMaterial
      ? "Improve the text for clarity, structure, flow, and correctness while preserving the intended meaning."
      : "Create a fresh text from the available context.";
  const visualPreamble =
    visualMode === "describe"
      ? [
          "Describe the attached image material in text.",
          "Focus on visible subject matter, composition, mood, text visible in the image, and details useful for downstream writing.",
        ].join("\n")
      : [
          "Use the attached images as visual context.",
          "Do not describe the images exhaustively unless the task asks for that.",
        ].join("\n");
  const textContent = [
    `Task:\n${requestedTask}`,
    inputText
      ? `Text or draft:\n${inputText}`
      : hasVisualMaterial
        ? "No text draft was provided. Use the visual material and instructions."
        : "No source material was provided. Generate the requested text from scratch.",
    hasVisualMaterial
      ? [
          visualPreamble,
          ...visualReferences.map(
            (reference, index) =>
              `${reference.label.trim() || `Bild ${index + 1}`}: connected ${reference.sourceType} source.`,
          ),
        ].join("\n")
      : "",
  ].filter(Boolean).join("\n\n");

  return [
    {
      role: "system",
      content: [
        "You are the LemonSpace AI text node.",
        "Write only the final text content.",
        "Do not add explanations, headings, bullet-point rationales, or markdown code fences unless the user explicitly asks for them.",
        "Keep the dominant language of the provided context and instructions.",
        hasVisualMaterial && visualMode === "describe"
          ? "If image material is provided for description, translate the visible content into useful text according to the instruction."
          : hasSourceMaterial || hasVisualMaterial
          ? "If source material is provided, transform or improve it according to the instruction."
          : "If no source material is provided, create a new text from the instruction.",
      ].join("\n"),
    },
    {
      role: "user",
      content: hasVisualMaterial
        ? [
            {
              type: "text",
              text: textContent,
            },
            ...visualReferences.map((reference) => ({
              type: "file" as const,
              mediaType: "image",
              data: reference.imageUrl.trim(),
            })),
          ]
        : textContent,
    },
  ];
}
