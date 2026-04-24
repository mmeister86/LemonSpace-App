import { isAdjustmentNodeType } from "@/lib/canvas-node-types";

export const CANVAS_NODE_DND_MIME = "application/lemonspace-node-type";

const ADJUSTMENT_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
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
  "mixer",
  "crop",
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

const AI_TEXT_ALLOWED_SOURCE_TYPES = new Set<string>(["text", "ai-text-output"]);

const MIXER_ALLOWED_SOURCE_TYPES = new Set<string>([
  "image",
  "asset",
  "ai-image",
  "render",
]);

const MIXER_TARGET_HANDLES = new Set<string>(["base", "overlay"]);

function normalizeMixerHandle(handle: string | null | undefined): string {
  if (handle == null || handle === "" || handle === "null") {
    return "base";
  }

  return handle;
}

const ADJUSTMENT_DISALLOWED_TARGET_TYPES = new Set<string>(["prompt", "ai-image"]);

export type CanvasConnectionValidationReason =
  | "incomplete"
  | "self-loop"
  | "unknown-node"
  | "ai-video-source-invalid"
  | "video-prompt-target-invalid"
  | "adjustment-source-invalid"
  | "adjustment-incoming-limit"
  | "crop-source-invalid"
  | "crop-incoming-limit"
  | "compare-incoming-limit"
  | "adjustment-target-forbidden"
  | "render-source-invalid"
  | "agent-source-invalid"
  | "ai-text-source-invalid"
  | "ai-text-incoming-limit"
  | "ai-text-output-source-invalid"
  | "ai-text-output-incoming-limit"
  | "agent-output-source-invalid"
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
}): CanvasConnectionValidationReason | null {
  const {
    sourceType,
    targetType,
    targetIncomingCount,
    targetHandle,
    targetIncomingHandles,
  } = args;

  if (targetType === "mixer") {
    if (!MIXER_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "mixer-source-invalid";
    }

    const normalizedTargetHandle = normalizeMixerHandle(targetHandle);
    if (!MIXER_TARGET_HANDLES.has(normalizedTargetHandle)) {
      return "mixer-target-handle-invalid";
    }

    if (targetIncomingCount >= 2) {
      return "mixer-incoming-limit";
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

  if (targetType === "agent-output" && sourceType !== "agent") {
    return "agent-output-source-invalid";
  }

  if (targetType === "ai-video" && sourceType !== "video-prompt") {
    return "ai-video-source-invalid";
  }

  if (sourceType === "video-prompt" && targetType !== "ai-video") {
    return "video-prompt-target-invalid";
  }

  if (targetType === "render" && !RENDER_ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return "render-source-invalid";
  }

  if (targetType === "crop") {
    if (!CROP_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "crop-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "crop-incoming-limit";
    }
  }

  if (targetType === "agent" && !AGENT_ALLOWED_SOURCE_TYPES.has(sourceType)) {
    return "agent-source-invalid";
  }

  if (targetType === "ai-text") {
    if (!AI_TEXT_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "ai-text-source-invalid";
    }
    if (targetIncomingCount >= 1) {
      return "ai-text-incoming-limit";
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
    if (!ADJUSTMENT_ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return "adjustment-source-invalid";
    }
    if (targetIncomingCount >= 1) {
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
    case "agent-source-invalid":
      return "Agent-Nodes akzeptieren nur Content- und Kontext-Inputs, keine Generierungs-Steuerknoten wie Prompt.";
    case "ai-text-source-invalid":
      return "KI-Text akzeptiert nur Text- oder KI-Text-Ausgabe-Input.";
    case "ai-text-incoming-limit":
      return "KI-Text-Nodes erlauben genau eine eingehende Verbindung.";
    case "ai-text-output-source-invalid":
      return "KI-Text-Ausgabe akzeptiert nur Eingaben von KI-Text-Nodes.";
    case "ai-text-output-incoming-limit":
      return "KI-Text-Ausgabe-Nodes erlauben genau eine eingehende Verbindung.";
    case "agent-output-source-invalid":
      return "Agent-Ausgabe akzeptiert nur Eingaben von Agent-Nodes.";
    case "mixer-source-invalid":
      return "Mixer akzeptiert nur Bild-, Asset-, KI-Bild- oder Render-Input.";
    case "mixer-target-handle-invalid":
      return "Mixer akzeptiert nur die Ziel-Handles 'base' und 'overlay'.";
    case "mixer-handle-incoming-limit":
      return "Jeder Mixer-Handle akzeptiert nur eine eingehende Verbindung.";
    case "mixer-incoming-limit":
      return "Mixer-Nodes erlauben maximal zwei eingehende Verbindungen.";
    default:
      return "Verbindung ist fuer diese Node-Typen nicht erlaubt.";
  }
}
