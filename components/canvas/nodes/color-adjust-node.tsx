"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas color adjust node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { Node, NodeProps } from "@xyflow/react";

import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeShell,
} from "@/components/canvas/nodes/adjustment-node-shell";
import type { ColorAdjustData } from "@/lib/image-pipeline/adjustment-types";

type ColorAdjustNodeData = ColorAdjustData & Record<string, unknown> & {
  _status?: string;
  _statusMessage?: string;
};

export type ColorAdjustNodeType = Node<ColorAdjustNodeData, "color-adjust">;

export default function ColorAdjustNode(props: NodeProps<ColorAdjustNodeType>) {
  return <AdjustmentNodeShell {...props} config={ADJUSTMENT_NODE_CONFIGS["color-adjust"]} />;
}
