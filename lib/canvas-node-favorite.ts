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

  const { isFavorite: _isFavorite, ...rest } = source;
  return rest;
}

export function preserveNodeFavorite(
  nextData: unknown,
  previousData: unknown,
): Record<string, unknown> {
  return setNodeFavorite(readNodeFavorite(previousData), nextData);
}
