import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  CANVAS_NODE_DND_MIME,
} from "@/lib/canvas-connection-policy";
import {
  computeMediaNodeSize,
  NODE_DEFAULTS,
  NODE_HANDLE_MAP,
} from "@/lib/canvas-utils";
import {
  emitDashboardSnapshotCacheInvalidationSignal,
  invalidateDashboardSnapshotForLastSignedInUser,
} from "@/lib/dashboard-snapshot-cache";
import {
  isCanvasNodeType,
  type CanvasNodeType,
} from "@/lib/canvas-node-types";
import { toast } from "@/lib/toast";

import {
  getIntersectedEdgeId,
  hasHandleKey,
  isOptimisticEdgeId,
  logCanvasConnectionDebug,
  normalizeHandle,
  OPTIMISTIC_NODE_PREFIX,
} from "./canvas-helpers";
import {
  createCompressedImagePreview,
  getImageDimensions,
  getVideoMetadata,
} from "./canvas-media-utils";

const ALLOWED_DROPPED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_DROPPED_VIDEO_BYTES = 100 * 1024 * 1024;

type DroppedImageDimensions = { width: number; height: number };
type DroppedVideoMetadata = DroppedImageDimensions & { durationSeconds: number };
type DroppedImagePreviewUpload = {
  previewStorageId: string;
  previewWidth: number;
  previewHeight: number;
};

type UploadedMediaRegistrationArgs = {
  canvasId: Id<"canvases">;
  nodeId?: Id<"nodes">;
  storageId: Id<"_storage">;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

type RegisterUploadedMedia = (
  args: UploadedMediaRegistrationArgs,
) => Promise<{ ok: true }>;

type MediaNodeData = Record<string, unknown>;

export function createDroppedImageMetadata({
  canvasId,
  file,
  dimensions,
  previewUpload,
  storageId,
}: {
  canvasId: Id<"canvases">;
  file: File;
  dimensions?: DroppedImageDimensions;
  previewUpload?: DroppedImagePreviewUpload;
  storageId: string;
}): MediaNodeData {
  return {
    storageId,
    ...(previewUpload ?? {}),
    filename: file.name,
    mimeType: file.type,
    canvasId,
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
  };
}

export function createDroppedVideoMetadata({
  canvasId,
  file,
  metadata,
  storageId,
}: {
  canvasId: Id<"canvases">;
  file: File;
  metadata?: DroppedVideoMetadata;
  storageId: string;
}): MediaNodeData {
  return {
    storageId,
    filename: file.name,
    mimeType: file.type,
    canvasId,
    ...(metadata
      ? {
          width: metadata.width,
          height: metadata.height,
          durationSeconds: metadata.durationSeconds,
        }
      : {}),
  };
}

function createInitialDroppedMediaData({
  canvasId,
  file,
}: {
  canvasId: Id<"canvases">;
  file: File;
}): MediaNodeData {
  return {
    filename: file.name,
    mimeType: file.type,
    canvasId,
    _uploadState: "uploading",
  };
}

async function uploadFileToStorage({
  file,
  generateUploadUrl,
  contentType = file.type,
}: {
  file: Blob;
  generateUploadUrl: () => Promise<string>;
  contentType?: string;
}): Promise<string> {
  const uploadUrl = await generateUploadUrl();
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: file,
  });

  if (!result.ok) {
    throw new Error("Upload failed");
  }

  const { storageId } = (await result.json()) as { storageId: string };
  return storageId;
}

function mergeOptimisticMediaNodeData({
  getNode,
  optimisticNodeId,
  initialNodeData,
  patch,
  removeUploadState,
}: {
  getNode: (id: string) => { data?: unknown } | undefined;
  optimisticNodeId: Id<"nodes">;
  initialNodeData: MediaNodeData;
  patch?: MediaNodeData;
  removeUploadState?: boolean;
}): MediaNodeData {
  const latestNodeData =
    (getNode(optimisticNodeId as string)?.data as MediaNodeData | undefined) ??
    initialNodeData;
  const nextData: MediaNodeData = {
    ...latestNodeData,
    ...(patch ?? {}),
  };

  if (removeUploadState) {
    delete nextData._uploadState;
  }

  return nextData;
}

function createMediaRegistrationArgs({
  canvasId,
  nodeId,
  storageId,
  file,
  dimensions,
  durationSeconds,
}: {
  canvasId: Id<"canvases">;
  nodeId?: Id<"nodes">;
  storageId: string;
  file: File;
  dimensions?: DroppedImageDimensions;
  durationSeconds?: number;
}): UploadedMediaRegistrationArgs {
  return {
    canvasId,
    nodeId,
    storageId: storageId as Id<"_storage">,
    filename: file.name,
    mimeType: file.type,
    width: dimensions?.width,
    height: dimensions?.height,
    durationSeconds,
  };
}

async function uploadDroppedMediaNode({
  canvasId,
  file,
  type,
  position,
  clientRequestId,
  optimisticNodeId,
  initialNodeData,
  getNode,
  generateUploadUrl,
  runCreateNodeOnlineOnly,
  queueNodeDataUpdate,
  queueNodeResize,
  syncPendingMoveForClientRequest,
  readMetadata,
  buildNodeData,
  registerUploadedMedia,
  getRegistrationDetails,
  syncErrorMessage,
  registrationWarningMessage,
}: {
  canvasId: Id<"canvases">;
  file: File;
  type: "image" | "video";
  position: { x: number; y: number };
  clientRequestId: string;
  optimisticNodeId: Id<"nodes">;
  initialNodeData: MediaNodeData;
  getNode: (id: string) => { data?: unknown } | undefined;
  generateUploadUrl: () => Promise<string>;
  runCreateNodeOnlineOnly: UseCanvasDropParams["runCreateNodeOnlineOnly"];
  queueNodeDataUpdate: UseCanvasDropParams["queueNodeDataUpdate"];
  queueNodeResize: UseCanvasDropParams["queueNodeResize"];
  syncPendingMoveForClientRequest: UseCanvasDropParams["syncPendingMoveForClientRequest"];
  readMetadata: () => Promise<DroppedImageDimensions | DroppedVideoMetadata | undefined>;
  buildNodeData: (args: {
    storageId: string;
    metadata?: DroppedImageDimensions | DroppedVideoMetadata;
  }) => Promise<MediaNodeData>;
  registerUploadedMedia?: RegisterUploadedMedia;
  getRegistrationDetails: (
    metadata?: DroppedImageDimensions | DroppedVideoMetadata,
  ) => { dimensions?: DroppedImageDimensions; durationSeconds?: number };
  syncErrorMessage: string;
  registrationWarningMessage: string;
}): Promise<void> {
  const createNodePromise = runCreateNodeOnlineOnly({
    canvasId,
    type,
    positionX: position.x,
    positionY: position.y,
    width: NODE_DEFAULTS[type].width,
    height: NODE_DEFAULTS[type].height,
    data: initialNodeData,
    clientRequestId,
  });

  void createNodePromise
    .then((realId) => {
      void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
        (error: unknown) => {
          console.error(syncErrorMessage, error);
        },
      );
    })
    .catch(() => undefined);

  const metadata = await readMetadata();
  const storageId = await uploadFileToStorage({ file, generateUploadUrl });
  const uploadedNodeData = await buildNodeData({ storageId, metadata });

  await queueNodeDataUpdate({
    nodeId: optimisticNodeId,
    data: mergeOptimisticMediaNodeData({
      getNode,
      optimisticNodeId,
      initialNodeData,
      patch: {
        ...uploadedNodeData,
        _uploadState: "resolving-url",
      },
    }),
  });

  if (metadata) {
    const targetSize = computeMediaNodeSize(type, {
      intrinsicWidth: metadata.width,
      intrinsicHeight: metadata.height,
    });

    await queueNodeResize({
      nodeId: optimisticNodeId,
      width: targetSize.width,
      height: targetSize.height,
    });
  }

  void createNodePromise
    .then((realId) => {
      invalidateDashboardSnapshotForLastSignedInUser();
      emitDashboardSnapshotCacheInvalidationSignal();

      if (!registerUploadedMedia) {
        return;
      }

      const registrationDetails = getRegistrationDetails(metadata);
      return registerUploadedMedia(
        createMediaRegistrationArgs({
          canvasId,
          nodeId: realId,
          storageId,
          file,
          ...registrationDetails,
        }),
      ).catch((error: unknown) => {
        console.warn(registrationWarningMessage, error);
      });
    })
    .catch(() => {
      if (!registerUploadedMedia) {
        return;
      }

      const registrationDetails = getRegistrationDetails(metadata);
      return registerUploadedMedia(
        createMediaRegistrationArgs({
          canvasId,
          storageId,
          file,
          ...registrationDetails,
        }),
      )
        .then(() => {
          invalidateDashboardSnapshotForLastSignedInUser();
          emitDashboardSnapshotCacheInvalidationSignal();
        })
        .catch((error: unknown) => {
          console.warn(registrationWarningMessage, error);
        });
    });
}

type UseCanvasDropParams = {
  canvasId: Id<"canvases">;
  isSyncOnline: boolean;
  t: (key: string) => string;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    className?: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  generateUploadUrl: () => Promise<string>;
  registerUploadedImageMedia?: (args: {
    canvasId: Id<"canvases">;
    nodeId?: Id<"nodes">;
    storageId: Id<"_storage">;
    filename?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }) => Promise<{ ok: true }>;
  registerUploadedVideoMedia?: (args: {
    canvasId: Id<"canvases">;
    nodeId?: Id<"nodes">;
    storageId: Id<"_storage">;
    filename?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }) => Promise<{ ok: true }>;
  runCreateNodeOnlineOnly: (args: {
    canvasId: Id<"canvases">;
    type: CanvasNodeType;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: Record<string, unknown>;
    clientRequestId?: string;
  }) => Promise<Id<"nodes">>;
  runCreateNodeWithEdgeSplitOnlineOnly: (args: {
    canvasId: Id<"canvases">;
    type: CanvasNodeType;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    data: Record<string, unknown>;
    splitEdgeId: Id<"edges">;
    newNodeTargetHandle?: string;
    newNodeSourceHandle?: string;
    splitSourceHandle?: string;
    splitTargetHandle?: string;
    clientRequestId?: string;
  }) => Promise<Id<"nodes">>;
  notifyOfflineUnsupported: (featureLabel: string) => void;
  queueNodeDataUpdate: (args: {
    nodeId: Id<"nodes">;
    data: unknown;
  }) => Promise<void>;
  queueNodeResize: (args: {
    nodeId: Id<"nodes">;
    width: number;
    height: number;
  }) => Promise<void>;
  syncPendingMoveForClientRequest: (
    clientRequestId: string,
    realId?: Id<"nodes">,
  ) => Promise<void>;
};

function parseCanvasDropPayload(rawData: string): {
  nodeType: CanvasNodeType;
  payloadData?: Record<string, unknown>;
} | null {
  try {
    const parsed = JSON.parse(rawData);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { type?: unknown }).type === "string" &&
      isCanvasNodeType((parsed as { type: string }).type)
    ) {
      return {
        nodeType: (parsed as { type: CanvasNodeType }).type,
        payloadData: (parsed as { data?: Record<string, unknown> }).data,
      };
    }
  } catch {
    if (isCanvasNodeType(rawData)) {
      return { nodeType: rawData };
    }
  }

  return null;
}

export function useCanvasDrop({
  canvasId,
  isSyncOnline,
  t,
  edges,
  screenToFlowPosition,
  generateUploadUrl,
  registerUploadedImageMedia,
  registerUploadedVideoMedia,
  runCreateNodeOnlineOnly,
  runCreateNodeWithEdgeSplitOnlineOnly,
  notifyOfflineUnsupported,
  queueNodeDataUpdate,
  queueNodeResize,
  syncPendingMoveForClientRequest,
}: UseCanvasDropParams) {
  const { getNode } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const hasFiles = event.dataTransfer.types.includes("Files");
    event.dataTransfer.dropEffect = hasFiles ? "copy" : "move";
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData(CANVAS_NODE_DND_MIME);
      if (!rawData) {
        const hasFiles = event.dataTransfer.files && event.dataTransfer.files.length > 0;
        if (hasFiles) {
          if (!isSyncOnline) {
            notifyOfflineUnsupported("Upload per Drag-and-drop");
            return;
          }

          const file = event.dataTransfer.files[0];
          if (file.type.startsWith("image/")) {
            const clientRequestId = crypto.randomUUID();
            const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}` as Id<"nodes">;
            const initialNodeData = createInitialDroppedMediaData({ canvasId, file });

            try {
              const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });

              await uploadDroppedMediaNode({
                canvasId,
                file,
                type: "image",
                position,
                clientRequestId,
                optimisticNodeId,
                initialNodeData,
                getNode,
                generateUploadUrl,
                runCreateNodeOnlineOnly,
                queueNodeDataUpdate,
                queueNodeResize,
                syncPendingMoveForClientRequest,
                readMetadata: async () => {
                  try {
                    return await getImageDimensions(file);
                  } catch {
                    return undefined;
                  }
                },
                buildNodeData: async ({ storageId, metadata }) => {
                  let previewUpload: DroppedImagePreviewUpload | undefined;

                  try {
                    const preview = await createCompressedImagePreview(file);
                    const previewStorageId = await uploadFileToStorage({
                      file: preview.blob,
                      generateUploadUrl,
                      contentType: preview.blob.type || "image/webp",
                    });
                    previewUpload = {
                      previewStorageId,
                      previewWidth: preview.width,
                      previewHeight: preview.height,
                    };
                  } catch (previewError) {
                    console.warn("[Canvas] dropped image preview generation/upload failed", previewError);
                  }

                  return createDroppedImageMetadata({
                    canvasId,
                    file,
                    dimensions: metadata,
                    previewUpload,
                    storageId,
                  });
                },
                registerUploadedMedia: registerUploadedImageMedia,
                getRegistrationDetails: (metadata) => ({ dimensions: metadata }),
                syncErrorMessage: "[Canvas] drop createNode syncPendingMove failed",
                registrationWarningMessage: "[Canvas] dropped image media registration failed",
              });
            } catch (error) {
              console.error("Failed to upload dropped file:", error);
              void queueNodeDataUpdate({
                nodeId: optimisticNodeId,
                data: mergeOptimisticMediaNodeData({
                  getNode,
                  optimisticNodeId,
                  initialNodeData,
                  removeUploadState: true,
                }),
              }).catch((updateError: unknown) => {
                console.warn("[Canvas] drop upload cleanup failed", updateError);
              });
              toast.error(
                t("canvas.uploadFailed"),
                error instanceof Error ? error.message : undefined,
              );
            }
          } else if (file.type.startsWith("video/")) {
            if (!ALLOWED_DROPPED_VIDEO_TYPES.has(file.type)) {
              toast.error(
                t("canvas.uploadFailed"),
                `Videoformat nicht unterstützt: ${file.type || file.name}`,
              );
              return;
            }

            if (file.size > MAX_DROPPED_VIDEO_BYTES) {
              toast.error(
                t("canvas.uploadFailed"),
                "Videos dürfen maximal 100 MB groß sein.",
              );
              return;
            }

            const clientRequestId = crypto.randomUUID();
            const optimisticNodeId = `${OPTIMISTIC_NODE_PREFIX}${clientRequestId}` as Id<"nodes">;
            const initialNodeData = createInitialDroppedMediaData({ canvasId, file });

            try {
              const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });

              await uploadDroppedMediaNode({
                canvasId,
                file,
                type: "video",
                position,
                clientRequestId,
                optimisticNodeId,
                initialNodeData,
                getNode,
                generateUploadUrl,
                runCreateNodeOnlineOnly,
                queueNodeDataUpdate,
                queueNodeResize,
                syncPendingMoveForClientRequest,
                readMetadata: async () => {
                  try {
                    return await getVideoMetadata(file);
                  } catch {
                    return undefined;
                  }
                },
                buildNodeData: async ({ storageId, metadata }) =>
                  createDroppedVideoMetadata({
                    canvasId,
                    file,
                    metadata: metadata as DroppedVideoMetadata | undefined,
                    storageId,
                  }),
                registerUploadedMedia: registerUploadedVideoMedia,
                getRegistrationDetails: (metadata) => ({
                  dimensions: metadata,
                  durationSeconds: (metadata as DroppedVideoMetadata | undefined)?.durationSeconds,
                }),
                syncErrorMessage: "[Canvas] drop video createNode syncPendingMove failed",
                registrationWarningMessage: "[Canvas] dropped video media registration failed",
              });
            } catch (error) {
              console.error("Failed to upload dropped video:", error);
              void queueNodeDataUpdate({
                nodeId: optimisticNodeId,
                data: mergeOptimisticMediaNodeData({
                  getNode,
                  optimisticNodeId,
                  initialNodeData,
                  removeUploadState: true,
                }),
              }).catch((updateError: unknown) => {
                console.warn("[Canvas] drop video upload cleanup failed", updateError);
              });
              toast.error(
                t("canvas.uploadFailed"),
                error instanceof Error ? error.message : undefined,
              );
            }
          }

          return;
        }

        return;
      }

      const parsedPayload = parseCanvasDropPayload(rawData);
      if (!parsedPayload) {
        toast.warning(
          "Node-Typ nicht verfuegbar",
          "Unbekannter Node konnte nicht erstellt werden.",
        );
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const intersectedEdgeId =
        typeof document !== "undefined" &&
        typeof document.elementsFromPoint === "function"
          ? getIntersectedEdgeId({
              x: event.clientX,
              y: event.clientY,
            })
          : null;
      const defaults = NODE_DEFAULTS[parsedPayload.nodeType] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const clientRequestId = crypto.randomUUID();
      const hitEdge = intersectedEdgeId
        ? edges.find(
            (edge) =>
              edge.id === intersectedEdgeId &&
              edge.className !== "temp" &&
              !isOptimisticEdgeId(edge.id),
          )
        : undefined;
      const handles = NODE_HANDLE_MAP[parsedPayload.nodeType];
      const canSplitEdge =
        hitEdge !== undefined &&
        handles !== undefined &&
        hasHandleKey(handles, "source") &&
        hasHandleKey(handles, "target");

      logCanvasConnectionDebug("node-drop", {
        nodeType: parsedPayload.nodeType,
        clientPoint: { x: event.clientX, y: event.clientY },
        flowPoint: position,
        intersectedEdgeId,
        hitEdgeId: hitEdge?.id ?? null,
        usesEdgeSplitPath: canSplitEdge,
      });

      const createNodePromise = canSplitEdge
        ? (() => {
            logCanvasConnectionDebug("node-drop:split-edge", {
              nodeType: parsedPayload.nodeType,
              clientPoint: { x: event.clientX, y: event.clientY },
              flowPoint: position,
              intersectedEdgeId,
              splitEdgeId: hitEdge.id,
            });
            return runCreateNodeWithEdgeSplitOnlineOnly({
              canvasId,
              type: parsedPayload.nodeType,
              positionX: position.x,
              positionY: position.y,
              width: defaults.width,
              height: defaults.height,
              data: { ...defaults.data, ...parsedPayload.payloadData, canvasId },
              splitEdgeId: hitEdge.id as Id<"edges">,
              newNodeTargetHandle: normalizeHandle(handles.target),
              newNodeSourceHandle: normalizeHandle(handles.source),
              splitSourceHandle: normalizeHandle(hitEdge.sourceHandle),
              splitTargetHandle: normalizeHandle(hitEdge.targetHandle),
              clientRequestId,
            });
          })()
        : (() => {
            if (intersectedEdgeId) {
              logCanvasConnectionDebug("node-drop:edge-detected-no-split", {
                nodeType: parsedPayload.nodeType,
                clientPoint: { x: event.clientX, y: event.clientY },
                flowPoint: position,
                intersectedEdgeId,
              });
            }

            return runCreateNodeOnlineOnly({
              canvasId,
              type: parsedPayload.nodeType,
              positionX: position.x,
              positionY: position.y,
              width: defaults.width,
              height: defaults.height,
              data: { ...defaults.data, ...parsedPayload.payloadData, canvasId },
              clientRequestId,
            });
          })();

      void createNodePromise.then((realId) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error("[Canvas] createNode syncPendingMove failed", error);
          },
        );
      });
    },
    [
      canvasId,
      edges,
      generateUploadUrl,
      registerUploadedImageMedia,
      registerUploadedVideoMedia,
      isSyncOnline,
      notifyOfflineUnsupported,
      getNode,
      queueNodeDataUpdate,
      queueNodeResize,
      runCreateNodeWithEdgeSplitOnlineOnly,
      runCreateNodeOnlineOnly,
      screenToFlowPosition,
      syncPendingMoveForClientRequest,
      t,
    ],
  );

  return {
    onDragOver,
    onDrop,
  };
}
