import { v, type Validator } from "convex/values";

import {
  ADJUSTMENT_NODE_TYPES,
  CANVAS_NODE_TYPES,
  PHASE1_CANVAS_NODE_TYPES,
} from "../lib/canvas-node-types";

function buildNodeTypeUnion<
  const TValues extends readonly [string, string, ...string[]],
>(values: TValues): Validator<TValues[number], "required", string> {
  return v.union(
    ...values.map((value) => v.literal(value)) as [
      Validator<TValues[number], "required", string>,
      Validator<TValues[number], "required", string>,
      ...Validator<TValues[number], "required", string>[],
    ],
  );
}

export const phase1NodeTypeValidator = buildNodeTypeUnion(PHASE1_CANVAS_NODE_TYPES);
export const nodeTypeValidator = buildNodeTypeUnion(CANVAS_NODE_TYPES);
export const adjustmentNodeTypeValidator = buildNodeTypeUnion(ADJUSTMENT_NODE_TYPES);
