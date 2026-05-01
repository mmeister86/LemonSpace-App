"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas bg remove node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { NodeProps } from "@xyflow/react";

import ImageTransformNode, { type ImageTransformNodeType } from "./image-transform-node";

export default function BgRemoveNode(props: NodeProps<ImageTransformNodeType>) {
  return <ImageTransformNode {...props} operationType="bg-remove" />;
}
