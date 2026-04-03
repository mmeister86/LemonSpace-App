import { useCallback } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  CANVAS_NODE_DND_MIME,
} from "@/lib/canvas-connection-policy";
import { NODE_DEFAULTS } from "@/lib/canvas-utils";
import {
  isCanvasNodeType,
  type CanvasNodeType,
} from "@/lib/canvas-node-types";
import { toast } from "@/lib/toast";

import { getImageDimensions } from "./canvas-media-utils";

type UseCanvasDropParams = {
  canvasId: Id<"canvases">;
  isSyncOnline: boolean;
  t: (key: string) => string;
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
  generateUploadUrl: () => Promise<string>;
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
  screenToFlowPosition,
  generateUploadUrl,
  runCreateNodeOnlineOnly,
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
              const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });
              const clientRequestId = crypto.randomUUID();

              void runCreateNodeOnlineOnly({
                canvasId,
                type: "image",
                positionX: position.x,
                positionY: position.y,
                width: NODE_DEFAULTS.image.width,
                height: NODE_DEFAULTS.image.height,
                data: {
                  storageId,
                  filename: file.name,
                  mimeType: file.type,
                  ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
                  canvasId,
                },
                clientRequestId,
              }).then((realId) => {
                void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
                  (error: unknown) => {
                    console.error("[Canvas] drop createNode syncPendingMove failed", error);
                  },
                );
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
      const defaults = NODE_DEFAULTS[parsedPayload.nodeType] ?? {
        width: 200,
        height: 100,
        data: {},
      };
      const clientRequestId = crypto.randomUUID();

      void runCreateNodeOnlineOnly({
        canvasId,
        type: parsedPayload.nodeType,
        positionX: position.x,
        positionY: position.y,
        width: defaults.width,
        height: defaults.height,
        data: { ...defaults.data, ...parsedPayload.payloadData, canvasId },
        clientRequestId,
      }).then((realId) => {
        void syncPendingMoveForClientRequest(clientRequestId, realId).catch(
          (error: unknown) => {
            console.error("[Canvas] createNode syncPendingMove failed", error);
          },
        );
      });
    },
    [
      canvasId,
      generateUploadUrl,
      isSyncOnline,
      notifyOfflineUnsupported,
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
