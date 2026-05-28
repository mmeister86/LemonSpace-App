/**
 * Onboarding note:
 * Renders and manages the Canvas image transform node types node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { Node } from "@xyflow/react";

import type {
  ImageTransformOperation,
  ImageTransformType,
} from "@/lib/image-transform-models";

export type TransformNodeData = {
  canvasId?: string;
  operation?: ImageTransformType;
  outputNodeId?: string;
  taskId?: string;
  lastError?: string;
  materializedInput?: {
    storageId?: string;
    url?: string;
    width?: number;
    height?: number;
    mimeType?: string;
    pipelineHash?: string;
  };
  parameters?: Partial<ImageTransformOperation> & Record<string, unknown>;
  _status?: string;
  _statusMessage?: string;
};

export type ImageTransformNodeType = Node<TransformNodeData, ImageTransformType>;

export type SourcePreviewMeta = { url: string; width?: number; height?: number };
