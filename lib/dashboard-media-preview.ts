/**
 * Onboarding note:
 * Shared TypeScript utility for dashboard media preview. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type DashboardMediaPreviewItem = {
  kind: "image" | "video" | "asset";
  storageId?: string;
  previewUrl?: string;
  originalUrl?: string;
  sourceUrl?: string;
  filename?: string;
  width?: number;
  height?: number;
  createdAt: number;
};

export function formatDashboardMediaDimensions(
  width: number | undefined,
  height: number | undefined,
  unknownSizeLabel: string,
): string {
  if (typeof width === "number" && typeof height === "number") {
    return `${width} x ${height}px`;
  }

  return unknownSizeLabel;
}

export function getDashboardMediaItemKey(item: DashboardMediaPreviewItem): string {
  if (item.storageId) {
    return item.storageId;
  }

  if (item.originalUrl) {
    return `url:${item.originalUrl}`;
  }

  if (item.previewUrl) {
    return `preview:${item.previewUrl}`;
  }

  if (item.sourceUrl) {
    return `source:${item.sourceUrl}`;
  }

  return `${item.kind}:${item.createdAt}:${item.filename ?? "unnamed"}`;
}

export function getDashboardMediaItemMeta(
  item: DashboardMediaPreviewItem,
  labels: {
    unknownSize: string;
    videoFile: string;
  },
): string {
  if (item.kind === "video") {
    return labels.videoFile;
  }

  return formatDashboardMediaDimensions(item.width, item.height, labels.unknownSize);
}

export function getDashboardMediaItemLabel(
  item: DashboardMediaPreviewItem,
  labels: {
    untitledImage: string;
    untitledVideo: string;
    untitledAsset: string;
  },
): string {
  if (item.filename) {
    return item.filename;
  }

  if (item.kind === "video") {
    return labels.untitledVideo;
  }

  if (item.kind === "asset") {
    return labels.untitledAsset;
  }

  return labels.untitledImage;
}
