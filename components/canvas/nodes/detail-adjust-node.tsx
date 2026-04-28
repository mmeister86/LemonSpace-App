"use client";

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { DetailAdjustData } from "@/lib/image-pipeline/adjustment-types";

type DetailAdjustNodeData = DetailAdjustData & {
  _status?: string;
  _statusMessage?: string;
};

export type DetailAdjustNodeType = Node<DetailAdjustNodeData, "detail-adjust">;

export default function DetailAdjustNode(props: NodeProps<DetailAdjustNodeType>) {
  return <AdjustmentNodeShell {...(props as never)} config={ADJUSTMENT_NODE_CONFIGS["detail-adjust"]} />;
}
