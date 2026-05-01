"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas curves node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { CurvesData } from "@/lib/image-pipeline/adjustment-types";

type CurvesNodeData = CurvesData & Record<string, unknown> & {
  _status?: string;
  _statusMessage?: string;
};

export type CurvesNodeType = Node<CurvesNodeData, "curves">;

export default function CurvesNode(props: NodeProps<CurvesNodeType>) {
  return <AdjustmentNodeShell {...props} config={ADJUSTMENT_NODE_CONFIGS.curves} />;
}
