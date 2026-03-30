"use client";

import { useEffect, useMemo, useState } from "react";
import type { PipelineStep } from "@/lib/image-pipeline/pipeline";

type PipelinePreviewState = {
  previewUrl: string | null;
  isRendering: boolean;
  error: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildCanvasFilter(steps: PipelineStep[]): string {
  let hueRotate = 0;
  let saturation = 100;
  let brightness = 100;
  let contrast = 100;

  for (const step of steps) {
    const params = step.params as Record<string, unknown>;

    if (step.type === "color-adjust") {
      const hue = typeof params.hue === "number" ? params.hue : 0;
      const sat = typeof params.saturation === "number" ? params.saturation : 0;
      const lum = typeof params.luminance === "number" ? params.luminance : 0;

      hueRotate += hue;
      saturation *= 1 + sat / 100;
      brightness *= 1 + lum / 200;
    }

    if (step.type === "light-adjust") {
      const lightBrightness =
        typeof params.brightness === "number" ? params.brightness : 0;
      const lightContrast =
        typeof params.contrast === "number" ? params.contrast : 0;
      const exposure = typeof params.exposure === "number" ? params.exposure : 0;

      brightness *= 1 + lightBrightness / 200 + exposure / 4;
      contrast *= 1 + lightContrast / 100;
    }

    if (step.type === "curves") {
      const levels = params.levels as Record<string, unknown> | undefined;
      const gamma =
        levels && typeof levels.gamma === "number" ? levels.gamma : 1;
      // Gamma < 1 -> heller, > 1 -> dunkler (grobe Annäherung für Preview)
      brightness *= clamp(2 - gamma, 0.5, 1.5);
    }
  }

  const normalizedHue = ((hueRotate % 360) + 360) % 360;
  const filterParts = [
    `hue-rotate(${normalizedHue}deg)`,
    `saturate(${clamp(saturation, 0, 300)}%)`,
    `brightness(${clamp(brightness, 20, 300)}%)`,
    `contrast(${clamp(contrast, 20, 300)}%)`,
  ];

  return filterParts.join(" ");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Preview-Bild konnte nicht geladen werden."));
    img.src = url;
  });
}

export function usePipelinePreview(
  sourceUrl: string | null,
  steps: PipelineStep[],
  previewWidth: number,
): PipelinePreviewState {
  const [state, setState] = useState<PipelinePreviewState>({
    previewUrl: null,
    isRendering: false,
    error: null,
  });

  const filter = useMemo(() => buildCanvasFilter(steps), [steps]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!sourceUrl) {
      setState({ previewUrl: null, isRendering: false, error: null });
      return;
    }

    setState((current) => ({ ...current, isRendering: true, error: null }));

    void (async () => {
      try {
        const img = await loadImage(sourceUrl);
        if (cancelled) return;

        const targetWidth = Math.max(64, Math.round(previewWidth));
        const ratio =
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? img.naturalWidth / img.naturalHeight
            : 1;
        const targetHeight = Math.max(64, Math.round(targetWidth / ratio));

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("2D-Context für Preview nicht verfügbar.");
        }

        ctx.filter = filter;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.82),
        );
        if (!blob) {
          throw new Error("Preview konnte nicht serialisiert werden.");
        }

        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setState((current) => {
          if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
          return { previewUrl: objectUrl, isRendering: false, error: null };
        });
      } catch (error) {
        if (cancelled) return;
        setState((current) => ({
          previewUrl: current.previewUrl,
          isRendering: false,
          error: error instanceof Error ? error.message : "Preview-Fehler",
        }));
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filter, previewWidth, sourceUrl]);

  return state;
}
