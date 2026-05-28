/**
 * Onboarding note:
 * Renders and manages the Canvas use image transform runner node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useState } from "react";
import type { Node } from "@xyflow/react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { toast } from "@/lib/toast";
import { computeMediaNodeSize } from "@/lib/canvas-utils";
import type {
  ImageTransformOperation,
  ImageTransformType,
} from "@/lib/image-transform-models";
import type { CanvasNodeType } from "@/lib/canvas-node-types";
import type { CanvasGraphSnapshot } from "@/lib/canvas-render-preview";

import { hasStyleTransferReferenceInput } from "./image-transform-preview-utils";
import { materializeImageTransformInput } from "./image-transform-input-materialization";
import type { SourcePreviewMeta, TransformNodeData } from "./image-transform-node-types";

type Translate = (key: string) => string;

export function getImageTransformOutputNodeType(
  operationType: ImageTransformType,
): Extract<CanvasNodeType, "image" | "bg-remove-output"> {
  return operationType === "bg-remove" ? "bg-remove-output" : "image";
}

export function useImageTransformRunner({
  id,
  nodeData,
  operation,
  operationType,
  sourcePreview,
  graph,
  edges,
  getNode,
  createNodeConnectedFromSource,
  isOffline,
  t,
}: {
  id: string;
  nodeData: TransformNodeData;
  operation: ImageTransformOperation;
  operationType: ImageTransformType;
  sourcePreview: SourcePreviewMeta | null;
  graph: CanvasGraphSnapshot;
  edges: Array<{ target: string; targetHandle?: string | null } & Record<string, unknown>>;
  getNode: (id: string) => Node | undefined;
  createNodeConnectedFromSource: (args: {
    type: Extract<CanvasNodeType, "image" | "bg-remove-output">;
    position: { x: number; y: number };
    data: Record<string, unknown>;
    width?: number;
    height?: number;
    clientRequestId: string;
    sourceNodeId: Id<"nodes">;
  }) => Promise<Id<"nodes">>;
  isOffline: boolean;
  t: Translate;
}) {
  const generateTransform = useAction(
    (api as unknown as {
      image_transforms: {
        generateTransform: FunctionReference<
          "action",
          "public",
          {
            canvasId: Id<"canvases">;
            transformNodeId: Id<"nodes">;
            outputNodeId: Id<"nodes">;
            operation: ImageTransformOperation;
            materializedInput?: {
              storageId: Id<"_storage">;
              width?: number;
              height?: number;
              mimeType?: string;
              pipelineHash?: string;
            };
          },
          { queued: true; outputNodeId: Id<"nodes"> }
        >;
      };
    }).image_transforms.generateTransform,
  );
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const [isRunning, setIsRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isExecuting = isRunning || nodeData._status === "executing";

  useEffect(() => {
    if (nodeData._status === "executing" || nodeData._status === "done") {
      setLocalError(null);
    }
  }, [nodeData._status]);

  const ensureOutputNode = useCallback(async () => {
    const outputNodeType = getImageTransformOutputNodeType(operationType);
    const existingOutputId = nodeData.outputNodeId;
    if (existingOutputId && getNode(existingOutputId)?.type === outputNodeType) {
      return existingOutputId as Id<"nodes">;
    }

    const currentNode = getNode(id);
    const offsetX = (currentNode?.measured?.width ?? 300) + 32;
    const outputSize =
      sourcePreview?.width && sourcePreview.height
        ? computeMediaNodeSize("image", {
            intrinsicWidth:
              operation.type === "upscale"
                ? sourcePreview.width * operation.scale
                : sourcePreview.width,
            intrinsicHeight:
              operation.type === "upscale"
                ? sourcePreview.height * operation.scale
                : sourcePreview.height,
          })
        : undefined;
    const outputNodeId = await createNodeConnectedFromSource({
      type: outputNodeType,
      position: {
        x: (currentNode?.position?.x ?? 0) + offsetX,
        y: currentNode?.position?.y ?? 0,
      },
      data: {
        source:
          operationType === "bg-remove"
            ? "freepik-bg-remove"
            : "freepik-transform",
        transform: {
          operation: operationType,
          transformNodeId: id,
          provider: "freepik",
        },
      },
      ...(outputSize ? { width: outputSize.width, height: outputSize.height } : {}),
      clientRequestId: crypto.randomUUID(),
      sourceNodeId: id as Id<"nodes">,
    });
    return outputNodeId;
  }, [
    createNodeConnectedFromSource,
    getNode,
    id,
    nodeData.outputNodeId,
    operation,
    operationType,
    sourcePreview,
  ]);

  const runTransform = useCallback(async () => {
    if (isExecuting) return;
    if (isOffline) {
      toast.warning(t("offlineTitle"), t("offlineDescription"));
      return;
    }
    if (!nodeData.canvasId) {
      setLocalError(t("errors.missingCanvas"));
      return;
    }
    if (
      operation.type === "style-transfer" &&
      !hasStyleTransferReferenceInput({ nodeId: id, edges })
    ) {
      setLocalError(t("errors.missingReference"));
      return;
    }

    setIsRunning(true);
    setLocalError(null);
    try {
      const outputNodeId = await ensureOutputNode();
      const materializedInput = await materializeImageTransformInput({
        nodeId: id,
        graph,
        generateUploadUrl,
      });
      await toast.promise(
        generateTransform({
          canvasId: nodeData.canvasId as Id<"canvases">,
          transformNodeId: id as Id<"nodes">,
          outputNodeId,
          operation,
          ...(materializedInput ? { materializedInput } : {}),
        }),
        {
          loading: t("toasts.loading"),
          success: t("toasts.success"),
          error: t("toasts.error"),
        },
      );
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  }, [
    edges,
    ensureOutputNode,
    generateTransform,
    generateUploadUrl,
    graph,
    id,
    isExecuting,
    isOffline,
    nodeData.canvasId,
    operation,
    t,
  ]);

  return { isExecuting, localError, runTransform };
}
