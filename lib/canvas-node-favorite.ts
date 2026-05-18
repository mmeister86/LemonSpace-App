/**
 * Onboarding note:
 * Shared TypeScript utility for canvas node favorite. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function readNodeFavorite(data: unknown): boolean {
  const source = toRecord(data);
  return source.isFavorite === true;
}

export function readNodeBypassed(data: unknown): boolean {
  const source = toRecord(data);
  return source.isBypassed === true;
}

export function setNodeFavorite(
  nextValue: boolean,
  currentData: unknown,
): Record<string, unknown> {
  const source = toRecord(currentData);

  if (nextValue) {
    return {
      ...source,
      isFavorite: true,
    };
  }

  const next = { ...source };
  delete next.isFavorite;
  return next;
}

export function setNodeBypassed(
  nextValue: boolean,
  currentData: unknown,
): Record<string, unknown> {
  const source = toRecord(currentData);

  if (nextValue) {
    return {
      ...source,
      isBypassed: true,
    };
  }

  const next = { ...source };
  delete next.isBypassed;
  return next;
}

export function preserveNodeMetadata(
  nextData: unknown,
  previousData: unknown,
): Record<string, unknown> {
  return setNodeBypassed(
    readNodeBypassed(previousData),
    setNodeFavorite(readNodeFavorite(previousData), nextData),
  );
}

export function preserveNodeFavorite(
  nextData: unknown,
  previousData: unknown,
): Record<string, unknown> {
  return preserveNodeMetadata(nextData, previousData);
}
