/**
 * Onboarding note:
 * Single policy source for valid Canvas connections. Server and client both depend on these rules for parity.
 */

import { isAdjustmentNodeType } from "@/lib/canvas-node-types";
import {
  isAiImageReferenceSourceType,
  MAX_AI_IMAGE_REFERENCES,
} from "@/lib/ai-image-references";
import {
  MAX_MIXER_LAYERS,
  normalizeMixerLayerHandle,
} from "@/lib/canvas-mixer-normalization";
import {
  INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
  INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
  INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
  INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
  INSTAGRAM_POST_MOCKUP_TARGET_HANDLES,
  INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
} from "@/lib/instagram-post-mockup";

export const CANVAS_NODE_DND_MIME = "application/lemonspace-node-type";

const ADJUSTMENT_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

const MASK_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "render",
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

const CROP_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "render",
  "video",
  "asset-video",
  "ai-video",
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

const RENDER_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "mixer",
  "crop",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "change-camera",
]);

const TRANSFORM_NODE_TYPES = new Set<string>([
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "change-camera",
]);

const TRANSFORM_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "bg-remove-output",
  "render",
  "crop",
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "change-camera",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
]);

const AGENT_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "video",
  "asset-video",
  "text",
  "ai-text-output",
  "note",
  "frame",
  "compare",
  "render",
  "ai-image",
  "ai-video",
]);

export const MAX_AGENT_CONTEXT_INPUTS = 8;
export const MAX_PROMPT_TEXT_INPUTS = 3;
export const MAX_AI_TEXT_INSTRUCTION_INPUTS = 3;
export const MAX_AI_TEXT_DRAFT_INPUTS = 3;

export function isAgentContextSourceType(sourceType: string): boolean {
  return AGENT_ALLOWED_SOURCE_TYPES.has(sourceType);
}

const AI_TEXT_TEXT_SOURCE_TYPES = new Set<string>(["text", "ai-text-output"]);
const AI_TEXT_VISUAL_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "render",
]);
const AI_TEXT_ALLOWED_SOURCE_TYPES = new Set<string>([
  ...AI_TEXT_TEXT_SOURCE_TYPES,
  ...AI_TEXT_VISUAL_SOURCE_TYPES,
]);

const INSTAGRAM_POST_MOCKUP_VISUAL_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "render",
  "ai-image",
  "crop",
]);
const INSTAGRAM_POST_MOCKUP_TEXT_SOURCE_TYPES = new Set<string>([
  "text",
  "ai-text-output",
]);
const INSTAGRAM_POST_MOCKUP_TARGET_HANDLE_SET = new Set<string>(
  INSTAGRAM_POST_MOCKUP_TARGET_HANDLES,
);

export function isAiTextInputSourceType(sourceType: string): boolean {
  return AI_TEXT_ALLOWED_SOURCE_TYPES.has(sourceType);
}

export function isAiTextInstructionSourceType(sourceType: string): boolean {
  return AI_TEXT_TEXT_SOURCE_TYPES.has(sourceType);
}

export function isAiTextDraftSourceType(sourceType: string): boolean {
  return AI_TEXT_ALLOWED_SOURCE_TYPES.has(sourceType);
}

const PROMPT_TEXT_SOURCE_TYPES = new Set<string>(["text", "ai-text-output"]);

const MIXER_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "render",
  "text",
]);

const STYLE_TRANSFER_TARGET_HANDLES = new Set<string>(["image", "reference"]);

function normalizeMixerHandle(handle: string | null | undefined): string {
  return normalizeMixerLayerHandle(handle) ?? "";
}

function isAiTextInstructionHandle(handle: string | null | undefined): boolean {
  return typeof handle === "string" && handle.startsWith("ai-text-instruction-in");
}

function isAiTextDraftHandle(handle: string | null | undefined): boolean {
  return (
    handle == null ||
    handle === "" ||
    handle === "null" ||
    (typeof handle === "string" &&
      handle.startsWith("ai-text-in") &&
      !isAiTextInstructionHandle(handle))
  );
}

function aiTextRoleForHandle(
  handle: string | null | undefined,
): "instruction" | "draft" | null {
  if (isAiTextInstructionHandle(handle)) {
    return "instruction";
  }
  if (isAiTextDraftHandle(handle)) {
    return "draft";
  }
  return null;
}

const ADJUSTMENT_DISALLOWED_TARGET_TYPES = new Set<string>(["prompt", "ai-image"]);

export type CanvasConnectionValidationReason =
  | "incomplete"
  | "self-loop"
  | "unknown-node"
  | "prompt-source-invalid"
  | "prompt-image-incoming-limit"
  | "prompt-visual-incoming-limit"
  | "prompt-text-incoming-limit"
  | "ai-video-source-invalid"
  | "video-prompt-target-invalid"
  | "adjustment-source-invalid"
  | "adjustment-incoming-limit"
  | "crop-source-invalid"
  | "crop-incoming-limit"
  | "compare-incoming-limit"
  | "adjustment-target-forbidden"
  | "render-source-invalid"
  | "transform-source-invalid"
  | "transform-incoming-limit"
  | "style-transfer-target-handle-invalid"
  | "style-transfer-handle-incoming-limit"
  | "style-transfer-incoming-limit"
  | "agent-source-invalid"
  | "agent-incoming-limit"
  | "ai-text-source-invalid"
  | "ai-text-incoming-limit"
  | "ai-text-draft-incoming-limit"
  | "ai-text-instruction-incoming-limit"
  | "ai-text-output-source-invalid"
  | "ai-text-output-incoming-limit"
  | "agent-output-source-invalid"
  | "instagram-post-mockup-source-invalid"
  | "instagram-post-mockup-target-handle-invalid"
  | "instagram-post-mockup-handle-incoming-limit"
  | "mask-source-invalid"
  | "mask-incoming-limit"
  | "mask-target-handle-required"
  | "mask-handle-incoming-limit"
  | "mixer-source-invalid"
  | "mixer-target-handle-invalid"
  | "mixer-handle-incoming-limit"
  | "mixer-incoming-limit";

export function validateCanvasConnectionPolicy(args: {
  sourceType: string;
  targetType: string;
  targetIncomingCount: number;
  targetHandle?: string | null;
  targetIncomingHandles?: Array<string | null | undefined>;
  targetIncomingSourceTypes?: string[];
}): CanvasConnectionValidationReason | null {
  const {
    sourceType,
    targetType,
    targetIncomingCount,
    targetHandle,
    targetIncomingHandles,
    targetIncomingSourceTypes,
  } = args;

  if (sourceType === "video-prompt" && targetType !== "ai-video") {
    return "video-prompt-target-invalid";
  }

  if (targetType === "prompt") {
    const isImageSource = isAiImageReferenceSourceType(sourceType);
    const isTextSource = PROMPT_TEXT_SOURCE_TYPES.has(sourceType);

    if (!isImageSource && !isTextSource) {
      return "prompt-source-invalid";
    }

    const incomingSourceTypes = targetIncomingSourceTypes ?? [];
    if (isImageSource) {
      const visualIncomingCount = incomingSourceTypes.filter((type) =>
        isAiImageReferenceSourceType(type),
      ).length;
      if (visualIncomingCount >= MAX_AI_IMAGE_REFERENCES) {
        return "prompt-visual-incoming-limit";
      }
    }

    if (isTextSource) {
      const textIncomingCount = incomingSourceTypes.filter((type) =>
        PROMPT_TEXT_SOURCE_TYPES.has(type),
      ).length;
      if (textIncomingCount >= MAX_PROMPT_TEXT_INPUTS) {
        return "prompt-text-incoming-limit";
      }
    }

    return null;
  }

  if (targetType === "mixer") {
    if (!MIXER_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "mixer-source-invalid";
    }

    if (targetIncomingCount >= MAX_MIXER_LAYERS) {
      return "mixer-incoming-limit";
    }

    const normalizedTargetHandle = normalizeMixerHandle(targetHandle);
    if (!normalizedTargetHandle) {
      return "mixer-target-handle-invalid";
    }

    const normalizedIncomingHandles = (targetIncomingHandles ?? []).map((handle) =>
      normalizeMixerHandle(handle),
    );
    const incomingOnHandle = normalizedIncomingHandles.filter(
      (handle) => handle === normalizedTargetHandle,
    ).length;

    if (incomingOnHandle >= 1) {
      return "mixer-handle-incoming-limit";
    }
  }

  if (targetType === "mask") {
    if (!MASK_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "mask-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "mask-incoming-limit";
    }
    return null;
  }

  if (targetType === "style-transfer") {
    if (!TRANSFORM_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "transform-source-invalid";
    }

    const normalizedTargetHandle =
      targetHandle == null || targetHandle === "" || targetHandle === "null"
        ? "image"
        : targetHandle;
    if (!STYLE_TRANSFER_TARGET_HANDLES.has(normalizedTargetHandle)) {
      return "style-transfer-target-handle-invalid";
    }

    if (targetIncomingCount >= 2) {
      return "style-transfer-incoming-limit";
    }

    const incomingOnHandle = (targetIncomingHandles ?? []).filter((handle) => {
      const normalized =
        handle == null || handle === "" || handle === "null" ? "image" : handle;
      return normalized === normalizedTargetHandle;
    }).length;

    if (incomingOnHandle >= 1) {
      return "style-transfer-handle-incoming-limit";
    }

    return null;
  }

  if (targetType === "instagram-post-mockup") {
    const normalizedTargetHandle =
      targetHandle == null || targetHandle === "" || targetHandle === "null"
        ? ""
        : targetHandle;

    if (!INSTAGRAM_POST_MOCKUP_TARGET_HANDLE_SET.has(normalizedTargetHandle)) {
      return "instagram-post-mockup-target-handle-invalid";
    }

    const acceptsSource =
      normalizedTargetHandle === INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE
        ? INSTAGRAM_POST_MOCKUP_VISUAL_SOURCE_TYPES.has(sourceType)
        : normalizedTargetHandle === INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE
          ? sourceType === "prompt"
          : [
              INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
              INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
              INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
              INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
            ].includes(normalizedTargetHandle)
            ? INSTAGRAM_POST_MOCKUP_TEXT_SOURCE_TYPES.has(sourceType)
            : false;

    if (!acceptsSource) {
      return "instagram-post-mockup-source-invalid";
    }

    const incomingOnHandle = (targetIncomingHandles ?? []).filter((handle) => {
      const normalized =
        handle == null || handle === "" || handle === "null" ? "" : handle;
      return normalized === normalizedTargetHandle;
    }).length;

    if (incomingOnHandle >= 1) {
      return "instagram-post-mockup-handle-incoming-limit";
    }

    return null;
  }

  if (targetType === "agent-output" && sourceType !== "agent") {
    return "agent-output-source-invalid";
  }

  if (targetType === "ai-video" && sourceType !== "video-prompt") {
    return "ai-video-source-invalid";
  }

  if (targetType === "render" && !RENDER_ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return "render-source-invalid";
  }

  if (TRANSFORM_NODE_TYPES.has(targetType)) {
    if (!TRANSFORM_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "transform-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "transform-incoming-limit";
    }
  }

  if (targetType === "crop") {
    if (!CROP_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "crop-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "crop-incoming-limit";
    }
  }

  if (targetType === "agent") {
    if (!isAgentContextSourceType(sourceType)) {
      return "agent-source-invalid";
    }

    if (targetIncomingCount >= MAX_AGENT_CONTEXT_INPUTS) {
      return "agent-incoming-limit";
    }
  }

  if (targetType === "ai-text") {
    const role = aiTextRoleForHandle(targetHandle);
    if (role === null) {
      return "ai-text-source-invalid";
    }

    if (role === "instruction" && !AI_TEXT_TEXT_SOURCE_TYPES.has(sourceType)) {
      return "ai-text-source-invalid";
    }

    if (role === "draft" && !AI_TEXT_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "ai-text-source-invalid";
    }

    const incomingOnRole = (targetIncomingHandles ?? []).filter(
      (handle) => aiTextRoleForHandle(handle) === role,
    ).length;

    if (role === "instruction" && incomingOnRole >= MAX_AI_TEXT_INSTRUCTION_INPUTS) {
      return "ai-text-instruction-incoming-limit";
    }

    if (role === "draft" && incomingOnRole >= MAX_AI_TEXT_DRAFT_INPUTS) {
      return "ai-text-draft-incoming-limit";
    }
  }

  if (targetType === "ai-text-output") {
    if (sourceType !== "ai-text") {
      return "ai-text-output-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "ai-text-output-incoming-limit";
    }
  }

  if (isAdjustmentNodeType(targetType) && targetType !== "render") {
    if (targetHandle === "mask") {
      if (sourceType !== "mask") {
        return "mask-source-invalid";
      }

      const incomingMaskCount = (targetIncomingHandles ?? []).filter(
        (handle) => handle === "mask",
      ).length;
      if (incomingMaskCount >= 1) {
        return "mask-handle-incoming-limit";
      }

      return null;
    }

    if (sourceType === "mask") {
      return "mask-target-handle-required";
    }

    if (!ADJUSTMENT_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "adjustment-source-invalid";
    }
    const regularIncomingCount =
      targetIncomingHandles && targetIncomingHandles.length > 0
        ? targetIncomingHandles.filter((handle) => handle !== "mask").length
        : targetIncomingCount;

    if (regularIncomingCount >= 1) {
      return "adjustment-incoming-limit";
    }
  }

  if (targetType === "compare" && targetIncomingCount >= 2) {
    return "compare-incoming-limit";
  }

  if (
    isAdjustmentNodeType(sourceType) &&
    ADJUSTMENT_DISALLOWED_TARGET_TYPES.has(targetType)
  ) {
    return "adjustment-target-forbidden";
  }

  return null;
}

export function getCanvasConnectionValidationMessage(
  reason: CanvasConnectionValidationReason,
): string {
  switch (reason) {
    case "incomplete":
      return "Unvollstaendige Verbindung.";
    case "self-loop":
      return "Node kann nicht mit sich selbst verbunden werden.";
    case "unknown-node":
      return "Verbindung enthaelt unbekannte Nodes.";
    case "prompt-source-invalid":
      return "KI-Bild akzeptiert nur Bild-, Asset-, KI-Bild-, Render-, Text- oder KI-Text-Input.";
    case "prompt-image-incoming-limit":
      return `KI-Bild erlaubt maximal ${MAX_AI_IMAGE_REFERENCES} visuelle Referenzen.`;
    case "prompt-visual-incoming-limit":
      return `KI-Bild erlaubt maximal ${MAX_AI_IMAGE_REFERENCES} visuelle Referenzen.`;
    case "prompt-text-incoming-limit":
      return `KI-Bild erlaubt maximal ${MAX_PROMPT_TEXT_INPUTS} Text-Quellen.`;
    case "ai-video-source-invalid":
      return "KI-Video-Ausgabe akzeptiert nur Eingaben von KI-Video.";
    case "video-prompt-target-invalid":
      return "KI-Video kann nur mit KI-Video-Ausgabe verbunden werden.";
    case "crop-source-invalid":
      return "Crop akzeptiert nur Bild-, Asset-, KI-Bild-, Video-, KI-Video-, Crop- oder Adjustment-Input.";
    case "crop-incoming-limit":
      return "Crop-Nodes erlauben genau eine eingehende Verbindung.";
    case "adjustment-source-invalid":
      return "Adjustment-Nodes akzeptieren nur Bild-, Asset-, KI-Bild-, Crop- oder Adjustment-Input.";
    case "adjustment-incoming-limit":
      return "Adjustment-Nodes erlauben genau eine eingehende Verbindung.";
    case "compare-incoming-limit":
      return "Compare-Nodes erlauben genau zwei eingehende Verbindungen.";
    case "adjustment-target-forbidden":
      return "Adjustment-Ausgaben koennen nicht an Prompt- oder KI-Bild-Nodes angeschlossen werden.";
    case "render-source-invalid":
      return "Render akzeptiert nur Bild-, Asset-, KI-Bild-, Mixer-, Crop- oder Adjustment-Input.";
    case "transform-source-invalid":
      return "Transform-Nodes akzeptieren nur Bild-, Asset-, KI-Bild-, Render-, Crop- oder Transform-Input.";
    case "transform-incoming-limit":
      return "Transform-Nodes erlauben genau eine eingehende Verbindung.";
    case "style-transfer-target-handle-invalid":
      return "Style Transfer akzeptiert nur die Ziel-Handles 'image' und 'reference'.";
    case "style-transfer-handle-incoming-limit":
      return "Jeder Style-Transfer-Handle akzeptiert nur eine eingehende Verbindung.";
    case "style-transfer-incoming-limit":
      return "Style-Transfer-Nodes erlauben maximal zwei eingehende Verbindungen.";
    case "agent-source-invalid":
      return "Agent-Nodes akzeptieren nur Content- und Kontext-Inputs, keine Generierungs-Steuerknoten wie Prompt.";
    case "agent-incoming-limit":
      return "Agent-Nodes akzeptieren maximal 8 Kontext-Inputs.";
    case "ai-text-source-invalid":
      return "KI-Text akzeptiert nur Text- oder KI-Text-Ausgabe-Input.";
    case "ai-text-incoming-limit":
      return "KI-Text-Nodes erlauben genau eine eingehende Verbindung.";
    case "ai-text-draft-incoming-limit":
      return `KI-Text erlaubt maximal ${MAX_AI_TEXT_DRAFT_INPUTS} Rohfassungs-Quellen.`;
    case "ai-text-instruction-incoming-limit":
      return `KI-Text erlaubt maximal ${MAX_AI_TEXT_INSTRUCTION_INPUTS} Vorgaben-Quellen.`;
    case "ai-text-output-source-invalid":
      return "KI-Text-Ausgabe akzeptiert nur Eingaben von KI-Text-Nodes.";
    case "ai-text-output-incoming-limit":
      return "KI-Text-Ausgabe-Nodes erlauben genau eine eingehende Verbindung.";
    case "agent-output-source-invalid":
      return "Agent-Ausgabe akzeptiert nur Eingaben von Agent-Nodes.";
    case "instagram-post-mockup-source-invalid":
      return "Instagram-Mockups akzeptieren nur passende Text-, Prompt- oder Bildquellen fuer den gewaehlten Eingang.";
    case "instagram-post-mockup-target-handle-invalid":
      return "Instagram-Mockups akzeptieren nur definierte Ziel-Eingaenge.";
    case "instagram-post-mockup-handle-incoming-limit":
      return "Jeder Instagram-Mockup-Eingang akzeptiert nur eine Verbindung.";
    case "mask-source-invalid":
      return "Masken akzeptieren nur Bild-Inputs; Adjustment-Masken-Handles akzeptieren nur Mask-Nodes.";
    case "mask-incoming-limit":
      return "Mask-Nodes erlauben genau eine eingehende Bildverbindung.";
    case "mask-target-handle-required":
      return "Mask-Nodes koennen nur an den Masken-Handle eines Adjustment-Nodes angeschlossen werden.";
    case "mask-handle-incoming-limit":
      return "Jeder Adjustment-Masken-Handle akzeptiert nur eine Maske.";
    case "mixer-source-invalid":
      return "Mixer akzeptiert nur Text-, Bild-, Asset-, KI-Bild- oder Render-Input.";
    case "mixer-target-handle-invalid":
      return "Mixer akzeptiert nur die Ziel-Handles 'layer-in' bis 'layer-in-8'.";
    case "mixer-handle-incoming-limit":
      return "Jeder Mixer-Handle akzeptiert nur eine eingehende Verbindung.";
    case "mixer-incoming-limit":
      return `Mixer-Nodes erlauben maximal ${MAX_MIXER_LAYERS} eingehende Verbindungen.`;
    default:
      return "Verbindung ist fuer diese Node-Typen nicht erlaubt.";
  }
}
