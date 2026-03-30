import type { PipelineStep } from "@/lib/image-pipeline/pipeline";

export type RenderResolutionMode = "original" | "2x" | "custom";

export type RenderTarget = {
  mode: RenderResolutionMode;
  customWidth?: number;
  customHeight?: number;
  maxWidth?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mimeTypeForFormat(format: "png" | "jpeg" | "webp"): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    img.src = url;
  });
}

function buildCanvasFilter(steps: PipelineStep[]): string {
  let hueRotate = 0;
  let saturation = 100;
  let brightness = 100;
  let contrast = 100;
  let blurPx = 0;

  for (const step of steps) {
    const params = step.params as Record<string, unknown>;

    if (step.type === "color-adjust") {
      const hue = typeof params.hue === "number" ? params.hue : 0;
      const sat = typeof params.saturation === "number" ? params.saturation : 0;
      const lum = typeof params.luminance === "number" ? params.luminance : 0;
      const vibrance = typeof params.vibrance === "number" ? params.vibrance : 0;

      hueRotate += hue;
      saturation *= 1 + sat / 100 + vibrance / 400;
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
      const gamma = levels && typeof levels.gamma === "number" ? levels.gamma : 1;
      brightness *= clamp(2 - gamma, 0.5, 1.5);
    }

    if (step.type === "detail-adjust") {
      const denoise = params.denoise as Record<string, unknown> | undefined;
      const denoiseLum =
        denoise && typeof denoise.luminance === "number" ? denoise.luminance : 0;
      blurPx += denoiseLum / 100;
    }
  }

  const normalizedHue = ((hueRotate % 360) + 360) % 360;
  const parts = [
    `hue-rotate(${normalizedHue}deg)`,
    `saturate(${clamp(saturation, 0, 300)}%)`,
    `brightness(${clamp(brightness, 20, 300)}%)`,
    `contrast(${clamp(contrast, 20, 300)}%)`,
  ];
  if (blurPx > 0) {
    parts.push(`blur(${clamp(blurPx, 0, 2)}px)`);
  }
  return parts.join(" ");
}

export function resolveRenderSize(
  sourceWidth: number,
  sourceHeight: number,
  target: RenderTarget,
): { width: number; height: number } {
  const ratio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
  let width = sourceWidth;
  let height = sourceHeight;

  if (target.mode === "2x") {
    width = Math.max(1, Math.round(sourceWidth * 2));
    height = Math.max(1, Math.round(sourceHeight * 2));
  } else if (target.mode === "custom") {
    width = Math.max(64, Math.round(target.customWidth ?? sourceWidth));
    height = Math.max(64, Math.round(target.customHeight ?? sourceHeight));
  } else if (typeof target.maxWidth === "number" && target.maxWidth > 0) {
    width = Math.max(64, Math.round(target.maxWidth));
    height = Math.max(64, Math.round(width / ratio));
  }

  return { width, height };
}

export function renderPipelineToCanvas(
  image: HTMLImageElement,
  steps: PipelineStep[],
  target: RenderTarget,
): HTMLCanvasElement {
  const naturalWidth = image.naturalWidth > 0 ? image.naturalWidth : image.width;
  const naturalHeight = image.naturalHeight > 0 ? image.naturalHeight : image.height;
  const { width, height } = resolveRenderSize(naturalWidth, naturalHeight, target);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D-Render-Context nicht verfügbar.");
  }

  ctx.filter = buildCanvasFilter(steps);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: "png" | "jpeg" | "webp",
  quality: number,
): Promise<Blob> {
  const mimeType = mimeTypeForFormat(format);
  const normalizedQuality = (format === "jpeg" || format === "webp")
    ? clamp(quality / 100, 0.01, 1)
    : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Render-Blob konnte nicht erzeugt werden."));
        return;
      }
      resolve(blob);
    }, mimeType, normalizedQuality);
  });
}
