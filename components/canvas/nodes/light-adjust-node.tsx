"use client";

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { LightAdjustData } from "@/lib/image-pipeline/adjustment-types";

type LightAdjustNodeData = LightAdjustData & {
  _status?: string;
  _statusMessage?: string;
};

export type LightAdjustNodeType = Node<LightAdjustNodeData, "light-adjust">;

export default function LightAdjustNode(props: NodeProps<LightAdjustNodeType>) {
  return <AdjustmentNodeShell {...(props as never)} config={ADJUSTMENT_NODE_CONFIGS["light-adjust"]} />;
}
