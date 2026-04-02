const imageBitmapCache = new Map<string, Promise<ImageBitmap>>();

export async function loadSourceBitmap(sourceUrl: string): Promise<ImageBitmap> {
  if (!sourceUrl || sourceUrl.trim().length === 0) {
    throw new Error("Render sourceUrl is required.");
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error("ImageBitmap is not available in this environment.");
  }

  const cached = imageBitmapCache.get(sourceUrl);
  if (cached) {
    return await cached;
  }

  const promise = (async () => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Render source failed: ${response.status}`);
    }

    const blob = await response.blob();
    return await createImageBitmap(blob);
  })();

  imageBitmapCache.set(sourceUrl, promise);

  try {
    return await promise;
  } catch (error) {
    imageBitmapCache.delete(sourceUrl);
    throw error;
  }
}
