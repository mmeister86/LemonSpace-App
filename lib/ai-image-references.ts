/**
 * Shared image-reference contract for KI-Bild generation.
 */

export const MAX_AI_IMAGE_REFERENCES = 6;

export const AI_IMAGE_REFERENCE_SOURCE_TYPES = [
  "image",
  "asset",
  "ai-image",
  "render",
] as const;

export type AiImageReferenceSourceType =
  (typeof AI_IMAGE_REFERENCE_SOURCE_TYPES)[number];

export type AiImageReferenceInput = {
  sourceNodeId: string;
  sourceType: AiImageReferenceSourceType;
  label: string;
  storageId?: string;
  imageUrl?: string;
  renderPipelineHash?: string;
};

const AI_IMAGE_REFERENCE_SOURCE_TYPE_SET = new Set<string>(
  AI_IMAGE_REFERENCE_SOURCE_TYPES,
);

export function isAiImageReferenceSourceType(
  value: string,
): value is AiImageReferenceSourceType {
  return AI_IMAGE_REFERENCE_SOURCE_TYPE_SET.has(value);
}

export function buildReferencePromptPreamble(
  references: readonly Pick<AiImageReferenceInput, "label" | "sourceType">[],
): string {
  if (references.length === 0) {
    return "";
  }

  const lines = references.map((reference, index) => {
    const label = reference.label.trim() || `Ref ${index + 1}`;
    return `${label}: connected ${reference.sourceType} reference.`;
  });

  return [
    "Use the attached images as numbered visual references.",
    "The user may refer to them by Ref number.",
    ...lines,
  ].join("\n");
}
