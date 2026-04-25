"use client";

import type { NodeProps } from "@xyflow/react";

import ImageTransformNode, { type ImageTransformNodeType } from "./image-transform-node";

export default function StyleTransferNode(props: NodeProps<ImageTransformNodeType>) {
  return <ImageTransformNode {...props} operationType="style-transfer" />;
}
