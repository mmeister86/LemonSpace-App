/**
 * Onboarding note:
 * Renders and manages the Canvas mixer types node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import type { MixerBlendMode } from "@/lib/canvas-mixer-normalization";

export const MIN_OVERLAY_SIZE = 0.1;
export const MIN_CROP_REMAINING_SIZE = 0.1;
export const MAX_OVERLAY_POSITION = 1;

export type MixerLocalData = {
  blendMode: MixerBlendMode;
  opacity: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
};

export type FrameHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type LoadedImageSize = {
  url: string | null;
  width: number;
  height: number;
};

export type PreviewSurfaceSize = {
  width: number;
  height: number;
};

export const ZERO_SURFACE_SIZE: PreviewSurfaceSize = { width: 0, height: 0 };

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeAspectRatio(width: number, height: number): number | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const ratio = width / height;
  return Number.isFinite(ratio) ? ratio : null;
}
