/**
 * Onboarding note:
 * Supports the Canvas editor workflow for canvas media utils. Preserve the boundary between React Flow interaction state, Convex persistence, and local optimistic state.
 */

export async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const image = await decodeImageFile(file);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

export async function getVideoMetadata(
  file: File,
): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = video.duration;
      cleanup();

      if (!width || !height) {
        reject(new Error("Could not read video dimensions"));
        return;
      }

      resolve({
        width,
        height,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not decode video"));
    };

    video.src = objectUrl;
  });
}

export type ImagePreviewOptions = {
  maxEdge?: number;
  format?: string;
  quality?: number;
};

export type CompressedImagePreview = {
  blob: Blob;
  width: number;
  height: number;
};

export async function createCompressedImagePreview(
  file: File,
  options: ImagePreviewOptions = {},
): Promise<CompressedImagePreview> {
  const maxEdge = options.maxEdge ?? 640;
  const format = options.format ?? "image/webp";
  const quality = options.quality ?? 0.75;
  const image = await decodeImageFile(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions");
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not encode preview image"));
          return;
        }
        resolve(result);
      },
      format,
      quality,
    );
  });

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
  };
}

async function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(objectUrl);

      if (!width || !height) {
        reject(new Error("Could not read image dimensions"));
        return;
      }

      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image"));
    };

    image.src = objectUrl;
  });
}
