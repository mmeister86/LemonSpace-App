/**
 * Onboarding note:
 * Shared mask node data contract and defaults. Keep this framework-light so UI,
 * graph resolution, and render backends can share the same editable model.
 */

export type MaskMode =
  | "brush"
  | "linear-gradient"
  | "radial-gradient"
  | "luminosity-range"
  | "color-range";

export type MaskBrushPoint = {
  x: number;
  y: number;
};

export type MaskBrushStroke = {
  id: string;
  operation: "paint" | "erase";
  size: number;
  hardness: number;
  flow: number;
  opacity: number;
  points: MaskBrushPoint[];
};

export type MaskNodeData = {
  mode: MaskMode;
  opacity: number;
  invert: boolean;
  feather: number;
  strokes: MaskBrushStroke[];
  gradient: {
    start: MaskBrushPoint;
    end: MaskBrushPoint;
    radius: number;
  };
  range: {
    min: number;
    max: number;
    tolerance: number;
    softness: number;
    color: string;
  };
};

export const DEFAULT_MASK_NODE_DATA: MaskNodeData = {
  mode: "brush",
  opacity: 100,
  invert: false,
  feather: 0,
  strokes: [],
  gradient: {
    start: { x: 0.25, y: 0.5 },
    end: { x: 0.75, y: 0.5 },
    radius: 0.45,
  },
  range: {
    min: 0.25,
    max: 0.75,
    tolerance: 0.1,
    softness: 0.1,
    color: "#ffffff",
  },
};
