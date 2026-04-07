export type VideoModelId =
  | "wan-2-2-480p"
  | "wan-2-2-720p"
  | "kling-std-2-1"
  | "seedance-pro-1080p"
  | "kling-pro-2-6";

export type VideoModelTier = "free" | "starter" | "pro";
export type VideoModelDurationSeconds = 5 | 10;

export interface VideoModel {
  id: VideoModelId;
  label: string;
  tier: VideoModelTier;
  freepikEndpoint: string;
  statusEndpointPath: string;
  creditCost: Record<VideoModelDurationSeconds, number>;
  supportsAudio: boolean;
  supportsImageToVideo: boolean;
  description: string;
}

export const VIDEO_MODELS = {
  "wan-2-2-480p": {
    id: "wan-2-2-480p",
    label: "WAN 2.2 480p",
    tier: "free",
    freepikEndpoint: "/v1/ai/text-to-video/wan-2-5-t2v-720p",
    statusEndpointPath: "/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}",
    creditCost: { 5: 28, 10: 56 },
    supportsAudio: false,
    supportsImageToVideo: false,
    description: "Schnell und guenstig - gut fuer Konzepte",
  },
  "wan-2-2-720p": {
    id: "wan-2-2-720p",
    label: "WAN 2.2 720p",
    tier: "free",
    freepikEndpoint: "/v1/ai/text-to-video/wan-2-5-t2v-720p",
    statusEndpointPath: "/v1/ai/text-to-video/wan-2-5-t2v-720p/{task-id}",
    creditCost: { 5: 52, 10: 104 },
    supportsAudio: false,
    supportsImageToVideo: false,
    description: "HD-Qualitaet, offenes Modell",
  },
  "kling-std-2-1": {
    id: "kling-std-2-1",
    label: "Kling Standard 2.1",
    tier: "starter",
    freepikEndpoint: "/v1/ai/image-to-video/kling-v2-1-std",
    statusEndpointPath: "/v1/ai/image-to-video/kling-v2-1/{task-id}",
    creditCost: { 5: 50, 10: 100 },
    supportsAudio: false,
    supportsImageToVideo: true,
    description: "Realistisch, stabile Bewegung",
  },
  "seedance-pro-1080p": {
    id: "seedance-pro-1080p",
    label: "Seedance Pro 1080p",
    tier: "starter",
    freepikEndpoint: "/v1/ai/video/seedance-1-5-pro-1080p",
    statusEndpointPath: "/v1/ai/video/seedance-1-5-pro-1080p/{task-id}",
    creditCost: { 5: 33, 10: 66 },
    supportsAudio: false,
    supportsImageToVideo: false,
    description: "Full-HD, gutes Preis-Leistungs-Verhaeltnis",
  },
  "kling-pro-2-6": {
    id: "kling-pro-2-6",
    label: "Kling Pro 2.6",
    tier: "pro",
    freepikEndpoint: "/v1/ai/image-to-video/kling-v2-6-pro",
    statusEndpointPath: "/v1/ai/image-to-video/kling-v2-6/{task-id}",
    creditCost: { 5: 59, 10: 118 },
    supportsAudio: false,
    supportsImageToVideo: true,
    description: "Beste Qualitaet, cineastische Bewegung",
  },
} as const satisfies Record<VideoModelId, VideoModel>;

export const DEFAULT_VIDEO_MODEL_ID: VideoModelId = "wan-2-2-720p";

const VIDEO_MODEL_IDS = Object.keys(VIDEO_MODELS) as VideoModelId[];
const VIDEO_MODEL_ID_SET = new Set<VideoModelId>(VIDEO_MODEL_IDS);

export function isVideoModelId(value: string): value is VideoModelId {
  return VIDEO_MODEL_ID_SET.has(value as VideoModelId);
}

export function getVideoModel(id: string): VideoModel | undefined {
  if (!isVideoModelId(id)) {
    return undefined;
  }

  return VIDEO_MODELS[id];
}

const VIDEO_MODEL_TIER_ORDER: Record<VideoModelTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
};

export function getAvailableVideoModels(tier: VideoModelTier): VideoModel[] {
  const maxTier = VIDEO_MODEL_TIER_ORDER[tier];
  return VIDEO_MODEL_IDS.map((id) => VIDEO_MODELS[id]).filter(
    (model) => VIDEO_MODEL_TIER_ORDER[model.tier] <= maxTier,
  );
}
