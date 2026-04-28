"use client";

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { CurvesData } from "@/lib/image-pipeline/adjustment-types";

type CurvesNodeData = CurvesData & {
  _status?: string;
  _statusMessage?: string;
};

export type CurvesNodeType = Node<CurvesNodeData, "curves">;

export default function CurvesNode(props: NodeProps<CurvesNodeType>) {
  return <AdjustmentNodeShell {...(props as never)} config={ADJUSTMENT_NODE_CONFIGS.curves} />;
}
