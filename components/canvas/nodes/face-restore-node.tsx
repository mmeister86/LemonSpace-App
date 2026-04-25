"use client";

import type { NodeProps } from "@xyflow/react";

import ImageTransformNode, { type ImageTransformNodeType } from "./image-transform-node";

export default function FaceRestoreNode(props: NodeProps<ImageTransformNodeType>) {
  return <ImageTransformNode {...props} operationType="face-restore" />;
}
