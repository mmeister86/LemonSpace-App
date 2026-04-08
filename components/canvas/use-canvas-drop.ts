import { useCallback } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  CANVAS_NODE_DND_MIME,
} from "@/lib/canvas-connection-policy";
import { NODE_DEFAULTS, NODE_HANDLE_MAP } from "@/lib/canvas-utils";
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
} from "./canvas-helpers";
import {
  createCompressedImagePreview,
  getImageDimensions,
} from "./canvas-media-utils";

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
  runCreateNodeOnlineOnly,
  runCreateNodeWithEdgeSplitOnlineOnly,
  notifyOfflineUnsupported,
  syncPendingMoveForClientRequest,
}: UseCanvasDropParams) {
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
            try {
              let dimensions: { width: number; height: number } | undefined;
              let previewUpload:
                | {
                    previewStorageId: string;
                    previewWidth: number;
                    previewHeight: number;
                  }
                | undefined;
              try {
                dimensions = await getImageDimensions(file);
              } catch {
                dimensions = undefined;
              }

              const uploadUrl = await generateUploadUrl();
              const result = await fetch(uploadUrl, {
                method: "POST",
                headers: { "Content-Type": file.type },
                body: file,
              });

              if (!result.ok) {
                throw new Error("Upload failed");
              }

              const { storageId } = (await result.json()) as { storageId: string };

              try {
                const preview = await createCompressedImagePreview(file);
                const previewUploadUrl = await generateUploadUrl();
                const previewUploadResult = await fetch(previewUploadUrl, {
                  method: "POST",
                  headers: { "Content-Type": preview.blob.type || "image/webp" },
                  body: preview.blob,
                });

                if (!previewUploadResult.ok) {
                  throw new Error("Preview upload failed");
                }

                const { storageId: previewStorageId } =
                  (await previewUploadResult.json()) as { storageId: string };
                previewUpload = {
                  previewStorageId,
                  previewWidth: preview.width,
                  previewHeight: preview.height,
                };
              } catch (previewError) {
                console.warn("[Canvas] dropped image preview generation/upload failed", previewError);
              }

              const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });
              const clientRequestId = crypto.randomUUID();

              const createNodePromise = runCreateNodeOnlineOnly({
                canvasId,
                type: "image",
                positionX: position.x,
                positionY: position.y,
                width: NODE_DEFAULTS.image.width,
                height: NODE_DEFAULTS.image.height,
                data: {
                  storageId,
                  ...(previewUpload ?? {}),
                  filename: file.name,
                  mimeType: file.type,
                  ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                  canvasId,
                },
                clientRequestId,
              });

              void createNodePromise.then((realId) => {
                void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
                  (error: unknown) => {
                    console.error("[Canvas] drop createNode syncPendingMove failed", error);
                  },
                );

                invalidateDashboardSnapshotForLastSignedInUser();
                emitDashboardSnapshotCacheInvalidationSignal();

                if (!registerUploadedImageMedia) {
                  return;
                }

                void registerUploadedImageMedia({
                  canvasId,
                  nodeId: realId,
                  storageId: storageId as Id<"_storage">,
                  filename: file.name,
                  mimeType: file.type,
                  width: dimensions?.width,
                  height: dimensions?.height,
                }).catch((error: unknown) => {
                  console.warn("[Canvas] dropped image media registration failed", error);
                });
              }, () => {
                if (!registerUploadedImageMedia) {
                  return;
                }

                void registerUploadedImageMedia({
                  canvasId,
                  storageId: storageId as Id<"_storage">,
                  filename: file.name,
                  mimeType: file.type,
                  width: dimensions?.width,
                  height: dimensions?.height,
                })
                  .then(() => {
                    invalidateDashboardSnapshotForLastSignedInUser();
                    emitDashboardSnapshotCacheInvalidationSignal();
                  })
                  .catch((error: unknown) => {
                    console.warn("[Canvas] dropped image media registration failed", error);
                  });
              });
            } catch (error) {
              console.error("Failed to upload dropped file:", error);
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
      isSyncOnline,
      notifyOfflineUnsupported,
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
