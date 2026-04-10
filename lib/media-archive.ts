export type MediaArchiveKind = "image" | "video" | "asset";

export type MediaArchiveSource =
  | "upload"
  | "ai-image"
  | "ai-video"
  | "freepik-asset"
  | "pexels-video";

type MediaArchiveCommonFields = {
  kind: MediaArchiveKind;
  source: MediaArchiveSource;
  dedupeKey: string;
  title?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  firstSourceCanvasId?: string;
  firstSourceNodeId?: string;
};

type MediaArchiveStoredFields = {
  storageId?: string;
  previewStorageId?: string;
};

type MediaArchiveExternalFields = {
  originalUrl?: string;
  previewUrl?: string;
  sourceUrl?: string;
  providerAssetId?: string;
};

export type MediaArchiveInput = MediaArchiveCommonFields &
  MediaArchiveStoredFields &
  MediaArchiveExternalFields & {
    [key: string]: unknown;
  };

export type NormalizedMediaArchiveInput =
  | (MediaArchiveCommonFields & MediaArchiveStoredFields)
  | (MediaArchiveCommonFields & MediaArchiveExternalFields);

export type MediaArchiveRow = (MediaArchiveCommonFields &
  MediaArchiveStoredFields &
  MediaArchiveExternalFields & {
    _id: string;
    createdAt: number;
    updatedAt: number;
    lastUsedAt: number;
  });

export type MediaArchiveListItem = Omit<MediaArchiveRow, "_id"> & {
  id: string;
};

export function buildStoredMediaDedupeKey(storageId: string): string {
  return `storage:${storageId}`;
}

export function buildFreepikAssetDedupeKey(assetType: string, assetId: number | string): string {
  return `freepik:${assetType}:${assetId}`;
}

export function buildPexelsVideoDedupeKey(videoId: number | string): string {
  return `pexels:video:${videoId}`;
}

function isExternalSource(source: MediaArchiveSource): boolean {
  return source === "freepik-asset" || source === "pexels-video";
}

export function normalizeMediaArchiveInput(input: MediaArchiveInput): NormalizedMediaArchiveInput {
  const base: MediaArchiveCommonFields = {
    kind: input.kind,
    source: input.source,
    dedupeKey: input.dedupeKey,
    title: input.title,
    filename: input.filename,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    metadata: input.metadata,
    firstSourceCanvasId: input.firstSourceCanvasId,
    firstSourceNodeId: input.firstSourceNodeId,
  };

  if (isExternalSource(input.source)) {
    return {
      ...base,
      originalUrl: input.originalUrl,
      previewUrl: input.previewUrl,
      sourceUrl: input.sourceUrl,
      providerAssetId: input.providerAssetId,
    };
  }

  return {
    ...base,
    storageId: input.storageId,
    previewStorageId: input.previewStorageId,
  };
}

export function mapMediaArchiveRowToListItem(row: MediaArchiveRow): MediaArchiveListItem {
  const { _id, ...rest } = row;
  return {
    id: _id,
    ...rest,
  };
}
