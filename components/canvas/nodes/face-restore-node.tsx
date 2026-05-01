"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas face restore node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { NodeProps } from "@xyflow/react";

import ImageTransformNode, { type ImageTransformNodeType } from "./image-transform-node";

export default function FaceRestoreNode(props: NodeProps<ImageTransformNodeType>) {
  return <ImageTransformNode {...props} operationType="face-restore" />;
}
