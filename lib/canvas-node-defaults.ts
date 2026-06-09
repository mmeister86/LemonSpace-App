/**
 * Onboarding note:
 * Shared TypeScript utility for canvas node defaults. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import { DEFAULT_AGENT_MODEL_ID } from "@/lib/agent-models";
import { DEFAULT_CROP_NODE_DATA } from "@/lib/image-pipeline/crop-node-data";
import { DEFAULT_MASK_NODE_DATA } from "@/lib/image-pipeline/mask-node-data";
import {
  DEFAULT_COLOR_ADJUST_DATA,
  DEFAULT_CURVES_DATA,
  DEFAULT_DETAIL_ADJUST_DATA,
  DEFAULT_LIGHT_ADJUST_DATA,
} from "@/lib/image-pipeline/adjustment-types";

/**
 * Default-Größen für neue Nodes je nach Typ.
 */
export const NODE_DEFAULTS: Record<
  string,
  { width: number; height: number; data: Record<string, unknown> }
> = {
  image: { width: 280, height: 200, data: {} },
  text: { width: 256, height: 120, data: { content: "" } },
  prompt: {
    width: 288,
    height: 260,
    data: { prompt: "", model: "google/gemini-2.5-flash-image", aspectRatio: "1:1" },
  },
  "video-prompt": {
    width: 288,
    height: 260,
    data: {
      prompt: "",
      modelId: "wan-2-2-720p",
      durationSeconds: 5,
      hasAudio: false,
    },
  },
  // 1:1 viewport 320 + chrome 88 ~= äußere Höhe (siehe lib/image-formats.ts)
  "ai-image": { width: 320, height: 408, data: {} },
  "ai-text": {
    width: 360,
    height: 360,
    data: {
      instruction: "",
      inputText: "",
      modelId: DEFAULT_AGENT_MODEL_ID,
    },
  },
  "ai-text-output": {
    width: 360,
    height: 280,
    data: {
      instruction: "",
      inputText: "",
      outputText: "",
      modelId: DEFAULT_AGENT_MODEL_ID,
    },
  },
  "ai-video": { width: 360, height: 280, data: {} },
  "bg-remove-output": {
    width: 280,
    height: 200,
    data: { source: "freepik-bg-remove" },
  },
  group: { width: 400, height: 300, data: { label: "Gruppe" } },
  frame: {
    width: 400,
    height: 300,
    data: { label: "Frame", resolution: "1080x1080" },
  },
  note: { width: 208, height: 100, data: { content: "" } },
  comment: {
    width: 300,
    height: 220,
    data: {
      resolved: false,
      content: {
        version: 1,
        blocks: [{ id: "comment-root", type: "paragraph", tokens: [] }],
      },
      replies: [],
    },
  },
  compare: { width: 500, height: 380, data: {} },
  asset: { width: 260, height: 240, data: {} },
  video: { width: 320, height: 180, data: {} },
  "asset-video": { width: 320, height: 180, data: {} },
  curves: { width: 320, height: 660, data: DEFAULT_CURVES_DATA },
  "color-adjust": { width: 320, height: 800, data: DEFAULT_COLOR_ADJUST_DATA },
  "light-adjust": { width: 320, height: 920, data: DEFAULT_LIGHT_ADJUST_DATA },
  "detail-adjust": { width: 320, height: 880, data: DEFAULT_DETAIL_ADJUST_DATA },
  mask: { width: 340, height: 360, data: DEFAULT_MASK_NODE_DATA },
  crop: { width: 340, height: 620, data: DEFAULT_CROP_NODE_DATA },
  "bg-remove": {
    width: 300,
    height: 340,
    data: { operation: "bg-remove", parameters: { type: "bg-remove" } },
  },
  upscale: {
    width: 300,
    height: 320,
    data: {
      operation: "upscale",
      parameters: {
        type: "upscale",
        scale: 2,
        outputFormat: "png",
        flavor: "photo",
        sharpen: 7,
        grain: 7,
        ultraDetail: 30,
      },
    },
  },
  "style-transfer": {
    width: 340,
    height: 620,
    data: {
      operation: "style-transfer",
      parameters: {
        type: "style-transfer",
        styleStrength: 100,
        structureStrength: 50,
        flavor: "faithful",
        engine: "balanced",
        fixedGeneration: false,
        isPortrait: false,
        portraitStyle: "standard",
        portraitBeautifier: "none",
      },
    },
  },
  "face-restore": {
    width: 300,
    height: 300,
    data: {
      operation: "face-restore",
      parameters: { type: "face-restore", mode: "faithful" },
    },
  },
  "change-camera": {
    width: 320,
    height: 440,
    data: {
      operation: "change-camera",
      parameters: {
        type: "change-camera",
        horizontalAngle: 0,
        verticalAngle: 0,
        zoom: 5,
        outputFormat: "png",
      },
    },
  },
  render: {
    width: 300,
    height: 420,
    data: { outputResolution: "original", format: "png", jpegQuality: 90 },
  },
  agent: {
    width: 360,
    height: 320,
    data: {
      templateId: "instagram-post-agent",
      modelId: DEFAULT_AGENT_MODEL_ID,
      clarificationQuestions: [],
      clarificationAnswers: {},
      outputNodeIds: [],
    },
  },
  mixer: {
    width: 360,
    height: 460,
    data: {
      mixerVersion: 2,
      stage: null,
      layers: [],
    },
  },
  "agent-output": {
    width: 360,
    height: 260,
    data: {
      title: "",
      channel: "",
      outputType: "",
      body: "",
    },
  },
  "instagram-post-mockup": {
    width: 520,
    height: 760,
    data: {
      title: "Instagram post mockup",
      channel: "Instagram Feed",
      snapshot: {
        username: "lemonspace",
        caption: "",
        hashtags: [],
      },
    },
  },
};

export type MediaNodeKind = "asset" | "image" | "video";

const MEDIA_NODE_CONFIG: Record<
  MediaNodeKind,
  {
    width: number;
    chromeHeight: number;
    minPreviewHeight: number;
    maxPreviewHeight: number;
  }
> = {
  asset: {
    width: 260,
    chromeHeight: 88,
    minPreviewHeight: 120,
    maxPreviewHeight: 300,
  },
  image: {
    width: 280,
    chromeHeight: 52,
    minPreviewHeight: 120,
    maxPreviewHeight: 320,
  },
  video: {
    width: 320,
    chromeHeight: 42,
    minPreviewHeight: 120,
    maxPreviewHeight: 320,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fallbackAspectRatio(orientation?: string): number {
  if (orientation === "horizontal") return 4 / 3;
  if (orientation === "vertical") return 3 / 4;
  return 1;
}

export function resolveMediaAspectRatio(
  intrinsicWidth?: number,
  intrinsicHeight?: number,
  orientation?: string,
): number {
  if (
    typeof intrinsicWidth === "number" &&
    typeof intrinsicHeight === "number" &&
    intrinsicWidth > 0 &&
    intrinsicHeight > 0
  ) {
    return intrinsicWidth / intrinsicHeight;
  }
  return fallbackAspectRatio(orientation);
}

export function computeMediaNodeSize(
  kind: MediaNodeKind,
  options?: {
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    orientation?: string;
  },
): { width: number; height: number; previewHeight: number; aspectRatio: number } {
  const config = MEDIA_NODE_CONFIG[kind];
  const aspectRatio = resolveMediaAspectRatio(
    options?.intrinsicWidth,
    options?.intrinsicHeight,
    options?.orientation,
  );
  const previewHeight = clamp(
    Math.round(config.width / aspectRatio),
    config.minPreviewHeight,
    config.maxPreviewHeight,
  );

  return {
    width: config.width,
    height: previewHeight + config.chromeHeight,
    previewHeight,
    aspectRatio,
  };
}
