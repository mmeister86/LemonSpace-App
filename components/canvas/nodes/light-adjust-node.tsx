"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas light adjust node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { LightAdjustData } from "@/lib/image-pipeline/adjustment-types";

type LightAdjustNodeData = LightAdjustData & Record<string, unknown> & {
  _status?: string;
  _statusMessage?: string;
};

export type LightAdjustNodeType = Node<LightAdjustNodeData, "light-adjust">;

export default function LightAdjustNode(props: NodeProps<LightAdjustNodeType>) {
  return <AdjustmentNodeShell {...props} config={ADJUSTMENT_NODE_CONFIGS["light-adjust"]} />;
}
