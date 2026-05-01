"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas image transform node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position, useReactFlow, useStore, type NodeProps } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { Camera, ImageOff, Loader2, Sparkles, Wand2 } from "lucide-react";

import { useCanvasPlacement } from "@/components/canvas/canvas-placement-context";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import CanvasHandle from "@/components/canvas/canvas-handle";
import BaseNodeWrapper from "@/components/canvas/nodes/base-node-wrapper";
import type { Id } from "@/convex/_generated/dataModel";
import { getImageTransformCreditCost, type ImageTransformOperation, type ImageTransformType } from "@/lib/image-transform-models";

import { ChangeCameraStage } from "./change-camera-stage";
import { ImageTransformOperationControls } from "./image-transform-operation-controls";
import { normalizeOperation } from "./image-transform-operation-config";
import { getSourcePreviewMeta } from "./image-transform-preview-utils";
import type { ImageTransformNodeType, TransformNodeData } from "./image-transform-node-types";
import { useImageTransformRunner } from "./use-image-transform-runner";

export { defaultOperation, normalizeOperation } from "./image-transform-operation-config";
export { getSourcePreviewMeta, hasStyleTransferReferenceInput } from "./image-transform-preview-utils";
export type { ImageTransformNodeType } from "./image-transform-node-types";

type ImageTransformNodeProps = NodeProps<ImageTransformNodeType> & {
  operationType: ImageTransformType;
};

function renderIcon(type: ImageTransformType) {
  const className = "h-3.5 w-3.5";
  if (type === "bg-remove") return <ImageOff className={className} />;
  if (type === "face-restore") return <Sparkles className={className} />;
  if (type === "change-camera") return <Camera className={className} />;
  return <Wand2 className={className} />;
}

export default function ImageTransformNode({
  id,
  data,
  selected,
  operationType,
}: ImageTransformNodeProps) {
  const t = useTranslations("imageTransformNode");
  const { queueNodeDataUpdate, status } = useCanvasSync();
  const { createNodeConnectedFromSource } = useCanvasPlacement();
  const { getNode } = useReactFlow();
  const edges = useStore((store) => store.edges);
  const nodes = useStore((store) => store.nodes);

  const nodeData = data as TransformNodeData;
  const [operation, setOperation] = useState<ImageTransformOperation>(() =>
    normalizeOperation(operationType, nodeData.parameters),
  );
  const operationRef = useRef(operation);
  const sourcePreview = useMemo(
    () =>
      getSourcePreviewMeta({
        nodeId: id,
        targetHandle: operationType === "style-transfer" ? "image" : undefined,
        edges,
        nodes,
      }),
    [edges, id, nodes, operationType],
  );
  const referencePreview = useMemo(
    () =>
      operationType === "style-transfer"
        ? getSourcePreviewMeta({
            nodeId: id,
            targetHandle: "reference",
            edges,
            nodes,
          })
        : null,
    [edges, id, nodes, operationType],
  );
  const sourceAspectRatio =
    sourcePreview?.width && sourcePreview.height
      ? `${sourcePreview.width} / ${sourcePreview.height}`
      : undefined;
  const creditCost = getImageTransformCreditCost(operation);
  const { isExecuting, localError, runTransform } = useImageTransformRunner({
    id,
    nodeData,
    operation,
    operationType,
    sourcePreview,
    edges,
    getNode,
    createNodeConnectedFromSource,
    isOffline: status.isOffline,
    t,
  });
  const visibleError =
    nodeData._status === "error"
      ? localError ?? nodeData.lastError ?? nodeData._statusMessage
      : localError;

  useEffect(() => {
    operationRef.current = operation;
  }, [operation]);

  const saveOperation = useCallback(
    (next: ImageTransformOperation) => {
      operationRef.current = next;
      setOperation(next);
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...nodeData,
          operation: operationType,
          parameters: next,
        },
      });
    },
    [id, nodeData, operationType, queueNodeDataUpdate],
  );

  return (
    <BaseNodeWrapper
      nodeType={operationType}
      selected={selected}
      status={nodeData._status}
      statusMessage={nodeData._statusMessage}
      className="min-w-[280px] border-teal-500/30"
    >
      {operationType === "style-transfer" ? (
        <>
          <CanvasHandle
            nodeId={id}
            nodeType={operationType}
            type="target"
            position={Position.Left}
            id="image"
            style={{ top: "34%" }}
            className="!h-3 !w-3 !border-2 !border-background"
          />
          <CanvasHandle
            nodeId={id}
            nodeType={operationType}
            type="target"
            position={Position.Left}
            id="reference"
            style={{ top: "56%" }}
            className="!h-3 !w-3 !border-2 !border-background"
          />
        </>
      ) : (
        <CanvasHandle
          nodeId={id}
          nodeType={operationType}
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
        />
      )}

      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">
            {renderIcon(operationType)}
            {t(`labels.${operationType}`)}
          </div>
          <div className="text-[10px] text-muted-foreground">{creditCost} Cr</div>
        </div>

        {operation.type === "style-transfer" ? (
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "image" as const, preview: sourcePreview },
              { key: "reference" as const, preview: referencePreview },
            ].map(({ key, preview }) => (
              <div key={key} className="space-y-1">
                <div className="text-[10px] font-medium uppercase text-muted-foreground">
                  {t(`inputs.${key}`)}
                </div>
                <div className="relative h-24 overflow-hidden rounded-md border border-border bg-muted/40">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.url}
                      alt=""
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
                      {t(`emptyInputs.${key}`)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : operation.type === "change-camera" ? (
          <ChangeCameraStage
            operation={operation}
            sourcePreview={sourcePreview}
            emptyLabel={t("emptyInputs.image")}
          />
        ) : (
          <div
            className={`relative w-full overflow-hidden rounded-md border border-border bg-muted/40 ${
              sourcePreview ? "" : "h-28"
            }`}
            style={sourceAspectRatio ? { aspectRatio: sourceAspectRatio } : undefined}
          >
            {sourcePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourcePreview.url}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                {t("emptyInputs.image")}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          {t(`descriptions.${operationType}`)}
        </p>

        <ImageTransformOperationControls
          operation={operation}
          operationRef={operationRef}
          saveOperation={saveOperation}
          t={t}
        />

        {visibleError && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
            {visibleError}
          </div>
        )}

        <button
          type="button"
          className="nodrag mt-auto flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isExecuting}
          onClick={runTransform}
        >
          {isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {nodeData._status === "error" ? t("retryButton") : t("runButton")}
        </button>
      </div>

      <CanvasHandle
        nodeId={id}
        nodeType={operationType}
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-teal-500"
      />
    </BaseNodeWrapper>
  );
}
