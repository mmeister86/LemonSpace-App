/**
 * Onboarding note:
 * Renders and manages the Canvas mixer diagnostics node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { computeVisibleMixerContentRect } from "@/lib/mixer-crop-layout";

import {
  computeAspectRatio,
  MIN_CROP_REMAINING_SIZE,
  type MixerLocalData,
} from "./mixer-types";

type DiagnosticsRect = {
  width: number;
  height: number;
};

export function roundDiagnosticNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

export function diffMixerData(before: MixerLocalData, after: MixerLocalData) {
  const keys: Array<keyof MixerLocalData> = [
    "blendMode",
    "opacity",
    "overlayX",
    "overlayY",
    "overlayWidth",
    "overlayHeight",
    "cropLeft",
    "cropTop",
    "cropRight",
    "cropBottom",
  ];

  return keys.reduce<Record<string, { before: unknown; after: unknown }>>((acc, key) => {
    if (before[key] !== after[key]) {
      acc[key] = {
        before: before[key],
        after: after[key],
      };
    }
    return acc;
  }, {});
}

export function buildMixerDiagnosticsPayload(args: {
  nodeId: string;
  reason: string;
  localData: MixerLocalData;
  interactionKind: string | null;
  previewRect: DiagnosticsRect | null | undefined;
  overlayNaturalSize: DiagnosticsRect | null | undefined;
  extra?: Record<string, unknown>;
}) {
  const { localData, previewRect } = args;
  const frameRect = previewRect
    ? {
        x: localData.overlayX * previewRect.width,
        y: localData.overlayY * previewRect.height,
        width: localData.overlayWidth * previewRect.width,
        height: localData.overlayHeight * previewRect.height,
      }
    : null;

  const contentBoundsRect = frameRect
    ? {
        x: frameRect.x + localData.cropLeft * frameRect.width,
        y: frameRect.y + localData.cropTop * frameRect.height,
        width:
          Math.max(1 - localData.cropLeft - localData.cropRight, MIN_CROP_REMAINING_SIZE) *
          frameRect.width,
        height:
          Math.max(1 - localData.cropTop - localData.cropBottom, MIN_CROP_REMAINING_SIZE) *
          frameRect.height,
      }
    : null;

  const visibleContentRect =
    frameRect && args.overlayNaturalSize
      ? computeVisibleMixerContentRect({
          frameAspectRatio: computeAspectRatio(frameRect.width, frameRect.height) ?? 1,
          sourceWidth: args.overlayNaturalSize.width,
          sourceHeight: args.overlayNaturalSize.height,
          cropLeft: localData.cropLeft,
          cropTop: localData.cropTop,
          cropRight: localData.cropRight,
          cropBottom: localData.cropBottom,
          fit: "width",
        })
      : null;
  const visibleContentRectPx =
    frameRect && visibleContentRect
      ? {
          x: frameRect.x + visibleContentRect.x * frameRect.width,
          y: frameRect.y + visibleContentRect.y * frameRect.height,
          width: visibleContentRect.width * frameRect.width,
          height: visibleContentRect.height * frameRect.height,
        }
      : null;

  const frameAspectRatio = frameRect
    ? computeAspectRatio(frameRect.width, frameRect.height)
    : null;
  const contentBoundsAspectRatio = contentBoundsRect
    ? computeAspectRatio(contentBoundsRect.width, contentBoundsRect.height)
    : null;
  const visibleContentAspectRatio = visibleContentRectPx
    ? computeAspectRatio(visibleContentRectPx.width, visibleContentRectPx.height)
    : null;
  const currentHandleRect = frameRect;
  const handleOffsetFromVisibleContent =
    currentHandleRect && visibleContentRectPx
      ? {
          x: roundDiagnosticNumber(currentHandleRect.x - visibleContentRectPx.x),
          y: roundDiagnosticNumber(currentHandleRect.y - visibleContentRectPx.y),
          width: roundDiagnosticNumber(currentHandleRect.width - visibleContentRectPx.width),
          height: roundDiagnosticNumber(currentHandleRect.height - visibleContentRectPx.height),
        }
      : null;

  return {
    nodeId: args.nodeId,
    reason: args.reason,
    mode: "frame-resize",
    intent: "move/resize should update overlay frame predictably",
    currentHandleAnchorSource: "frame",
    expectedHandleAnchorSource: "frame",
    interactionKind: args.interactionKind,
    previewRect: args.previewRect ?? null,
    frameRect,
    frameAspectRatio: roundDiagnosticNumber(frameAspectRatio),
    contentBoundsRect,
    contentBoundsAspectRatio: roundDiagnosticNumber(contentBoundsAspectRatio),
    visibleContentRect,
    visibleContentAspectRatio: roundDiagnosticNumber(visibleContentAspectRatio),
    currentHandleRect,
    handleOffsetFromVisibleContent,
    overlayNaturalSize: args.overlayNaturalSize ?? null,
    localData,
    ...args.extra,
  };
}
