const MIN_CROP_REMAINING_SIZE = 0.1;

type MixerSurfaceFit = "contain" | "cover";

function formatPercent(value: number): string {
  const normalized = Math.abs(value) < 1e-10 ? 0 : value;
  return `${normalized}%`;
}

function computeFittedRect(args: {
  sourceWidth: number;
  sourceHeight: number;
  boundsX: number;
  boundsY: number;
  boundsWidth: number;
  boundsHeight: number;
  fit?: MixerSurfaceFit;
}): { x: number; y: number; width: number; height: number } {
  const {
    sourceWidth,
    sourceHeight,
    boundsX,
    boundsY,
    boundsWidth,
    boundsHeight,
    fit = "contain",
  } = args;

  if (sourceWidth <= 0 || sourceHeight <= 0 || boundsWidth <= 0 || boundsHeight <= 0) {
    return {
      x: boundsX,
      y: boundsY,
      width: boundsWidth,
      height: boundsHeight,
    };
  }

  const scale =
    fit === "cover"
      ? Math.max(boundsWidth / sourceWidth, boundsHeight / sourceHeight)
      : Math.min(boundsWidth / sourceWidth, boundsHeight / sourceHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return {
      x: boundsX,
      y: boundsY,
      width: boundsWidth,
      height: boundsHeight,
    };
  }

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    x: boundsX + (boundsWidth - width) / 2,
    y: boundsY + (boundsHeight - height) / 2,
    width,
    height,
  };
}

export function computeMixerFrameRectInSurface(args: {
  surfaceWidth: number;
  surfaceHeight: number;
  baseWidth: number;
  baseHeight: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  fit?: MixerSurfaceFit;
}): { x: number; y: number; width: number; height: number } | null {
  if (args.baseWidth <= 0 || args.baseHeight <= 0 || args.surfaceWidth <= 0 || args.surfaceHeight <= 0) {
    return null;
  }

  const baseRect = computeFittedRect({
    sourceWidth: args.baseWidth,
    sourceHeight: args.baseHeight,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: args.surfaceWidth,
    boundsHeight: args.surfaceHeight,
    fit: args.fit,
  });

  return {
    x: (baseRect.x + args.overlayX * baseRect.width) / args.surfaceWidth,
    y: (baseRect.y + args.overlayY * baseRect.height) / args.surfaceHeight,
    width: (args.overlayWidth * baseRect.width) / args.surfaceWidth,
    height: (args.overlayHeight * baseRect.height) / args.surfaceHeight,
  };
}

export function computeVisibleMixerContentRect(args: {
  frameAspectRatio: number;
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}): { x: number; y: number; width: number; height: number } | null {
  if (args.sourceWidth <= 0 || args.sourceHeight <= 0) {
    return null;
  }

  const cropWidth = Math.max(1 - args.cropLeft - args.cropRight, MIN_CROP_REMAINING_SIZE);
  const cropHeight = Math.max(1 - args.cropTop - args.cropBottom, MIN_CROP_REMAINING_SIZE);
  const frameAspectRatio = args.frameAspectRatio > 0 ? args.frameAspectRatio : 1;

  const rect = computeFittedRect({
    sourceWidth: args.sourceWidth * cropWidth,
    sourceHeight: args.sourceHeight * cropHeight,
    boundsX: 0,
    boundsY: 0,
    boundsWidth: frameAspectRatio,
    boundsHeight: 1,
  });

  return {
    x: rect.x / frameAspectRatio,
    y: rect.y,
    width: rect.width / frameAspectRatio,
    height: rect.height,
  };
}

export function computeMixerCropImageStyle(args: {
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}) {
  const safeWidth = Math.max(1 - args.cropLeft - args.cropRight, MIN_CROP_REMAINING_SIZE);
  const safeHeight = Math.max(1 - args.cropTop - args.cropBottom, MIN_CROP_REMAINING_SIZE);
  return {
    left: formatPercent((-args.cropLeft / safeWidth) * 100),
    top: formatPercent((-args.cropTop / safeHeight) * 100),
    width: formatPercent((1 / safeWidth) * 100),
    height: formatPercent((1 / safeHeight) * 100),
  } as const;
}

export function computeMixerCompareOverlayImageStyle(args: {
  surfaceWidth: number;
  surfaceHeight: number;
  baseWidth: number;
  baseHeight: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}) {
  return computeMixerCropImageStyle({
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
    cropLeft: args.cropLeft,
    cropTop: args.cropTop,
    cropRight: args.cropRight,
    cropBottom: args.cropBottom,
  });
}

export function isMixerCropImageReady(args: {
  currentOverlayUrl: string | null | undefined;
  loadedOverlayUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
}): boolean {
  return Boolean(
    args.currentOverlayUrl &&
      args.loadedOverlayUrl === args.currentOverlayUrl &&
      args.sourceWidth > 0 &&
      args.sourceHeight > 0,
  );
}
