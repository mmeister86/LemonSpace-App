/**
 * Onboarding note:
 * Media library UI module for media preview utils. Keep archive display separate from Canvas graph persistence and storage URL resolution.
 */

type MediaPreviewReference<TStorageId extends string = string> = {
  kind?: "image" | "video" | "asset";
  storageId?: TStorageId;
  previewStorageId?: TStorageId;
  previewUrl?: string;
  originalUrl?: string;
  sourceUrl?: string;
  url?: string;
};

export function collectMediaStorageIdsForResolution<TStorageId extends string>(
  items: readonly MediaPreviewReference<TStorageId>[],
): TStorageId[] {
  const ordered = new Set<TStorageId>();

  for (const item of items) {
    const preferredId = item.previewStorageId ?? item.storageId;
    if (preferredId) {
      ordered.add(preferredId);
    }
    if (item.storageId) {
      ordered.add(item.storageId);
    }
  }

  return [...ordered];
}

export function resolveMediaPreviewUrl(
  item: MediaPreviewReference,
  urlMap: Record<string, string | undefined>,
): string | undefined {
  if (item.previewUrl) {
    return item.previewUrl;
  }

  if (item.previewStorageId) {
    const previewUrl = urlMap[item.previewStorageId];
    if (previewUrl) {
      return previewUrl;
    }
  }

  if (item.originalUrl) {
    return item.originalUrl;
  }

  if (item.sourceUrl) {
    return item.sourceUrl;
  }

  if (item.url) {
    return item.url;
  }

  if (!item.storageId) {
    return undefined;
  }

  return urlMap[item.storageId];
}
