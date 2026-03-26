/** OpenRouter / Gemini image_config.aspect_ratio values */
export const DEFAULT_ASPECT_RATIO = "1:1" as const;

export type ImageFormatGroup = "square" | "landscape" | "portrait";

export type ImageFormatPreset = {
  label: string;
  aspectRatio: string;
  group: ImageFormatGroup;
};

export const IMAGE_FORMAT_GROUP_LABELS: Record<ImageFormatGroup, string> = {
  square: "Quadratisch",
  landscape: "Querformat",
  portrait: "Hochformat",
};

/** Presets for Prompt Node Select (labels DE, ratios API-compatible) */
export const IMAGE_FORMAT_PRESETS: ImageFormatPreset[] = [
  { label: "1:1 · Quadrat", aspectRatio: "1:1", group: "square" },
  { label: "16:9 · Breitbild", aspectRatio: "16:9", group: "landscape" },
  { label: "21:9 · Kino", aspectRatio: "21:9", group: "landscape" },
  { label: "4:3 · Klassisch", aspectRatio: "4:3", group: "landscape" },
  { label: "3:2 · Foto (quer)", aspectRatio: "3:2", group: "landscape" },
  { label: "5:4 · leicht quer", aspectRatio: "5:4", group: "landscape" },
  { label: "9:16 · Story", aspectRatio: "9:16", group: "portrait" },
  { label: "3:4 · Porträt", aspectRatio: "3:4", group: "portrait" },
  { label: "2:3 · Foto (hoch)", aspectRatio: "2:3", group: "portrait" },
  { label: "4:5 · Social hoch", aspectRatio: "4:5", group: "portrait" },
];

/** Header row + footer strip (prompt preview) inside AI Image node */
export const AI_IMAGE_NODE_HEADER_PX = 40;
export const AI_IMAGE_NODE_FOOTER_PX = 48;

export function parseAspectRatioString(aspectRatio: string): {
  w: number;
  h: number;
} {
  const parts = aspectRatio.split(":").map((x) => Number.parseInt(x, 10));
  if (
    parts.length !== 2 ||
    parts.some((n) => !Number.isFinite(n) || n <= 0)
  ) {
    throw new Error(`Invalid aspect ratio: ${aspectRatio}`);
  }
  return { w: parts[0]!, h: parts[1]! };
}

/** Bildfläche: längere Kante = maxEdgePx */
export function getImageViewportSize(
  aspectRatio: string,
  options?: { maxEdge?: number }
): { width: number; height: number } {
  const maxEdge = options?.maxEdge ?? 320;
  const { w, h } = parseAspectRatioString(aspectRatio);
  if (w >= h) {
    return {
      width: maxEdge,
      height: Math.max(1, Math.round(maxEdge * (h / w))),
    };
  }
  return {
    width: Math.max(1, Math.round(maxEdge * (w / h))),
    height: maxEdge,
  };
}

/** Outer Convex / React Flow node size (includes chrome) */
export function getAiImageNodeOuterSize(viewport: {
  width: number;
  height: number;
}): { width: number; height: number } {
  return {
    width: viewport.width,
    height: AI_IMAGE_NODE_HEADER_PX + viewport.height + AI_IMAGE_NODE_FOOTER_PX,
  };
}

export function getPresetLabel(aspectRatio: string): string {
  return (
    IMAGE_FORMAT_PRESETS.find((p) => p.aspectRatio === aspectRatio)?.label ??
    aspectRatio
  );
}
