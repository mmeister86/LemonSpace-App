"use client";

import { useMemo } from "react";
import { useViewport } from "@xyflow/react";

import {
  computeZoomAwarePreviewQuality,
  resolveZoomAwarePreviewUrl,
  sourceQualityForPreviewQuality,
  type CanvasPreviewQuality,
  type CanvasPreviewSourceQuality,
} from "@/lib/canvas-preview-quality";

type ZoomAwarePreviewQualityInput = {
  width?: number | null;
  height?: number | null;
  maxDevicePixelRatio?: number;
};

type ZoomAwarePreviewUrlInput = ZoomAwarePreviewQualityInput & {
  fullUrl?: string | null;
  previewUrl?: string | null;
};

function readDevicePixelRatio(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  return window.devicePixelRatio || 1;
}

function normalizeDimension(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function useZoomAwarePreviewQuality({
  width,
  height,
  maxDevicePixelRatio,
}: ZoomAwarePreviewQualityInput): {
  previewQuality: CanvasPreviewQuality;
  sourceQuality: CanvasPreviewSourceQuality;
  zoom: number;
} {
  const { zoom } = useViewport();
  const normalizedWidth = normalizeDimension(width, 320);
  const normalizedHeight = normalizeDimension(height, normalizedWidth);
  const devicePixelRatio = readDevicePixelRatio();

  return useMemo(() => {
    const previewQuality = computeZoomAwarePreviewQuality({
      width: normalizedWidth,
      height: normalizedHeight,
      zoom,
      devicePixelRatio,
      maxDevicePixelRatio,
    });

    return {
      previewQuality,
      sourceQuality: sourceQualityForPreviewQuality(previewQuality),
      zoom,
    };
  }, [devicePixelRatio, maxDevicePixelRatio, normalizedHeight, normalizedWidth, zoom]);
}

export function useZoomAwarePreviewUrl({
  width,
  height,
  maxDevicePixelRatio,
  fullUrl,
  previewUrl,
}: ZoomAwarePreviewUrlInput): {
  previewQuality: CanvasPreviewQuality;
  sourceQuality: CanvasPreviewSourceQuality;
  url: string | undefined;
} {
  const { previewQuality, sourceQuality } = useZoomAwarePreviewQuality({
    width,
    height,
    maxDevicePixelRatio,
  });

  const url = useMemo(
    () =>
      resolveZoomAwarePreviewUrl({
        fullUrl,
        previewUrl,
        sourceQuality,
      }),
    [fullUrl, previewUrl, sourceQuality],
  );

  return {
    previewQuality,
    sourceQuality,
    url,
  };
}
