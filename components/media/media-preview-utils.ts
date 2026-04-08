type MediaPreviewReference<TStorageId extends string = string> = {
  storageId: TStorageId;
  previewStorageId?: TStorageId;
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
  if (item.previewStorageId) {
    const previewUrl = urlMap[item.previewStorageId];
    if (previewUrl) {
      return previewUrl;
    }
  }

  return urlMap[item.storageId];
}
