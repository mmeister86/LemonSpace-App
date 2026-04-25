"use client";

import type { NodeProps } from "@xyflow/react";

import ImageTransformNode, { type ImageTransformNodeType } from "./image-transform-node";

export default function BgRemoveNode(props: NodeProps<ImageTransformNodeType>) {
  return <ImageTransformNode {...props} operationType="bg-remove" />;
}
