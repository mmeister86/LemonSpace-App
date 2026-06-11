export type CanvasPreviewQuality = "low" | "medium" | "high";
export type CanvasPreviewSourceQuality = "preview" | "full";

type ComputeZoomAwarePreviewQualityInput = {
  width: number;
  height: number;
  zoom: number;
  devicePixelRatio?: number;
  maxDevicePixelRatio?: number;
};

type ResolveZoomAwarePreviewUrlInput = {
  fullUrl?: string | null;
  previewUrl?: string | null;
  sourceQuality: CanvasPreviewSourceQuality;
};

const DEFAULT_MAX_DEVICE_PIXEL_RATIO = 1.5;

function clampDevicePixelRatio(devicePixelRatio: number, maxDevicePixelRatio: number): number {
  const safeMaxDevicePixelRatio = Number.isFinite(maxDevicePixelRatio)
    ? Math.max(1, maxDevicePixelRatio)
    : DEFAULT_MAX_DEVICE_PIXEL_RATIO;
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;

  return Math.min(Math.max(safeDevicePixelRatio, 1), safeMaxDevicePixelRatio);
}

export function computeZoomAwarePreviewQuality({
  width,
  height,
  zoom,
  devicePixelRatio = 1,
  maxDevicePixelRatio = DEFAULT_MAX_DEVICE_PIXEL_RATIO,
}: ComputeZoomAwarePreviewQualityInput): CanvasPreviewQuality {
  const mediaEdge = Math.max(width, height);
  const effectiveEdge = mediaEdge * zoom * clampDevicePixelRatio(devicePixelRatio, maxDevicePixelRatio);

  if (effectiveEdge <= 360) {
    return "low";
  }

  if (effectiveEdge <= 900) {
    return "medium";
  }

  return "high";
}

export function previewPipelineWidthForQuality(quality: CanvasPreviewQuality): number {
  switch (quality) {
    case "low":
      return 360;
    case "medium":
      return 720;
    case "high":
      return 1280;
  }
}

export function mixerRenderPreviewPipelineWidthForQuality(quality: CanvasPreviewQuality): number {
  switch (quality) {
    case "low":
      return 360;
    case "medium":
      return 1280;
    case "high":
      return 1920;
  }
}

export function sourceQualityForPreviewQuality(
  quality: CanvasPreviewQuality,
): CanvasPreviewSourceQuality {
  return quality === "high" ? "full" : "preview";
}

export function resolveZoomAwarePreviewUrl({
  fullUrl,
  previewUrl,
  sourceQuality,
}: ResolveZoomAwarePreviewUrlInput): string | undefined {
  if (sourceQuality === "preview") {
    return previewUrl || fullUrl || undefined;
  }

  return fullUrl || previewUrl || undefined;
}
