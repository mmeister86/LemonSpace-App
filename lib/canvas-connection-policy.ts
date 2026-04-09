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
  "text",
  "note",
  "frame",
  "compare",
  "render",
  "ai-image",
  "ai-video",
]);

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
  | "agent-output-source-invalid";

export function validateCanvasConnectionPolicy(args: {
  sourceType: string;
  targetType: string;
  targetIncomingCount: number;
}): CanvasConnectionValidationReason | null {
  const { sourceType, targetType, targetIncomingCount } = args;

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
      return "Render akzeptiert nur Bild-, Asset-, KI-Bild-, Crop- oder Adjustment-Input.";
    case "agent-source-invalid":
      return "Agent-Nodes akzeptieren nur Content- und Kontext-Inputs, keine Generierungs-Steuerknoten wie Prompt.";
    case "agent-output-source-invalid":
      return "Agent-Ausgabe akzeptiert nur Eingaben von Agent-Nodes.";
    default:
      return "Verbindung ist fuer diese Node-Typen nicht erlaubt.";
  }
}
