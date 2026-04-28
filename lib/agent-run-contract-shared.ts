export const SAFE_FALLBACK_TITLE = "Untitled";
export const SAFE_FALLBACK_CHANNEL = "general";
export const SAFE_FALLBACK_OUTPUT_TYPE = "text";
export const SAFE_FALLBACK_GOAL = "Deliver channel-ready output.";

export function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStepId(value: unknown): string {
  return trimString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/\s+/g, "-");
}

export function normalizeStringArray(raw: unknown, options?: { lowerCase?: boolean }): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of raw) {
    const trimmed = trimString(item);
    if (trimmed === "") {
      continue;
    }

    const value = options?.lowerCase ? trimmed.toLowerCase() : trimmed;
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}
