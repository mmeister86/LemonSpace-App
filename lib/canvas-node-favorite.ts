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

export function readNodeCollapsed(data: unknown): boolean {
  const source = toRecord(data);
  return source.isCollapsed === true;
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

function normalizeExpandedSize(
  value: unknown,
): { width: number; height: number } | undefined {
  if (!isRecord(value)) return undefined;
  const { width, height } = value;
  return typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
    ? { width, height }
    : undefined;
}

export function readNodeExpandedSize(
  data: unknown,
): { width: number; height: number } | undefined {
  return normalizeExpandedSize(toRecord(data).expandedSize);
}

export function setNodeCollapsed(
  nextValue: boolean,
  currentData: unknown,
  expandedSize?: { width: number; height: number },
): Record<string, unknown> {
  const source = toRecord(currentData);

  if (nextValue) {
    const normalizedExpandedSize =
      normalizeExpandedSize(expandedSize) ??
      normalizeExpandedSize(source.expandedSize);
    return {
      ...source,
      isCollapsed: true,
      ...(normalizedExpandedSize ? { expandedSize: normalizedExpandedSize } : {}),
    };
  }

  const next = { ...source };
  delete next.isCollapsed;
  delete next.expandedSize;
  return next;
}

export function preserveNodeMetadata(
  nextData: unknown,
  previousData: unknown,
): Record<string, unknown> {
  return setNodeCollapsed(
    readNodeCollapsed(previousData),
    setNodeBypassed(
      readNodeBypassed(previousData),
      setNodeFavorite(readNodeFavorite(previousData), nextData),
    ),
    readNodeExpandedSize(previousData),
  );
}

export function preserveNodeFavorite(
  nextData: unknown,
  previousData: unknown,
): Record<string, unknown> {
  return preserveNodeMetadata(nextData, previousData);
}
