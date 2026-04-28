"use client";

import { useEffect, useState, type RefObject } from "react";

import { ZERO_SURFACE_SIZE, type PreviewSurfaceSize } from "./mixer-types";

export function useMixerPreviewSize(previewRef: RefObject<HTMLElement | null>) {
  const [previewSurfaceSize, setPreviewSurfaceSize] =
    useState<PreviewSurfaceSize>(ZERO_SURFACE_SIZE);

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement) {
      return;
    }

    const updatePreviewSurfaceSize = (nextWidth: number, nextHeight: number) => {
      setPreviewSurfaceSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    const measurePreview = () => {
      const rect = previewElement.getBoundingClientRect();
      updatePreviewSurfaceSize(rect.width, rect.height);
    };

    measurePreview();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updatePreviewSurfaceSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(previewElement);
    return () => observer.disconnect();
  }, [previewRef]);

  return previewSurfaceSize;
}
