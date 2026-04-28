import {
  normalizeStepId,
  normalizeStringArray,
  SAFE_FALLBACK_CHANNEL,
  SAFE_FALLBACK_OUTPUT_TYPE,
  SAFE_FALLBACK_TITLE,
  trimString,
} from "@/lib/agent-run-contract-shared";

export type AgentOutputDraft = {
  title?: string;
  channel?: string;
  outputType?: string;
  body?: string;
};

export type AgentOutputSection = {
  id: string;
  label: string;
  content: string;
};

export type AgentStructuredOutput = {
  title: string;
  channel: string;
  artifactType: string;
  previewText: string;
  sections: AgentOutputSection[];
  metadata: Record<string, string | string[]>;
  metadataLabels: Record<string, string>;
  qualityChecks: string[];
  body: string;
};

export type AgentStructuredMetadataEntry = {
  key: string;
  values: string[];
};

export type AgentStructuredOutputDraft = Partial<
  Omit<AgentStructuredOutput, "sections" | "metadata">
> & {
  sections?: unknown[];
  metadata?: Record<string, unknown>;
  metadataEntries?: unknown[];
};

function normalizeOutputSections(raw: unknown): AgentOutputSection[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const sections: AgentOutputSection[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const sectionRecord = item as Record<string, unknown>;
    const label = trimString(sectionRecord.label);
    const content = trimString(sectionRecord.content);
    if (label === "" || content === "") {
      continue;
    }

    const normalizedBaseId = normalizeStepId(sectionRecord.id) || normalizeStepId(label) || "section";
    let sectionId = normalizedBaseId;
    let suffix = 2;
    while (seenIds.has(sectionId)) {
      sectionId = `${normalizedBaseId}-${suffix}`;
      suffix += 1;
    }
    seenIds.add(sectionId);

    sections.push({
      id: sectionId,
      label,
      content,
    });
  }

  return sections;
}

function normalizeStructuredMetadata(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const metadata: Record<string, string | string[]> = {};

  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    const key = trimString(rawKey);
    if (key === "") {
      continue;
    }

    const value = trimString(rawValue);
    if (value !== "") {
      metadata[key] = value;
      continue;
    }

    const listValue = normalizeStringArray(rawValue);
    if (listValue.length > 0) {
      metadata[key] = listValue;
    }
  }

  return metadata;
}

function normalizeStructuredMetadataEntries(raw: unknown): Record<string, string | string[]> {
  if (!Array.isArray(raw)) {
    return {};
  }

  const metadata: Record<string, string | string[]> = {};

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const key = trimString(record.key);
    if (key === "") {
      continue;
    }

    const values = normalizeStringArray(record.values);
    const singleValue = trimString(record.value);

    if (values.length > 1) {
      metadata[key] = values;
      continue;
    }

    if (values.length === 1) {
      metadata[key] = values[0]!;
      continue;
    }

    if (singleValue !== "") {
      metadata[key] = singleValue;
    }
  }

  return metadata;
}

function slugifyMetadataKey(value: string): string {
  const normalized = value
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "metadata";
}

function sanitizeStructuredMetadata(raw: Record<string, string | string[]>): {
  metadata: Record<string, string | string[]>;
  metadataLabels: Record<string, string>;
} {
  const metadata: Record<string, string | string[]> = {};
  const metadataLabels: Record<string, string> = {};

  for (const [rawKey, value] of Object.entries(raw)) {
    const trimmedKey = trimString(rawKey);
    if (trimmedKey === "") {
      continue;
    }

    const slugBase = slugifyMetadataKey(trimmedKey);
    let slug = slugBase;
    let suffix = 2;

    while (slug in metadata) {
      slug = `${slugBase}_${suffix}`;
      suffix += 1;
    }

    metadata[slug] = value;
    metadataLabels[slug] = trimmedKey;
  }

  return { metadata, metadataLabels };
}

function derivePreviewTextFromSections(sections: AgentOutputSection[]): string {
  return sections[0]?.content ?? "";
}

function deriveBodyFromStructuredOutput(input: {
  sections: AgentOutputSection[];
  previewText: string;
  title: string;
}): string {
  if (input.sections.length > 0) {
    return input.sections.map((section) => `${section.label}:\n${section.content}`).join("\n\n");
  }
  if (input.previewText !== "") {
    return input.previewText;
  }
  return input.title;
}

export function normalizeAgentOutputDraft(
  draft: AgentOutputDraft,
): AgentOutputDraft & {
  title: string;
  channel: string;
  outputType: string;
  body: string;
} {
  const title = trimString(draft.title) || SAFE_FALLBACK_TITLE;
  const channel = trimString(draft.channel) || SAFE_FALLBACK_CHANNEL;
  const outputType = trimString(draft.outputType) || SAFE_FALLBACK_OUTPUT_TYPE;

  return {
    ...draft,
    title,
    channel,
    outputType,
    body: trimString(draft.body),
  };
}

export function normalizeAgentStructuredOutput(
  draft: AgentStructuredOutputDraft,
  fallback: {
    title: string;
    channel: string;
    artifactType: string;
  },
): AgentStructuredOutput {
  const title = trimString(draft.title) || trimString(fallback.title) || SAFE_FALLBACK_TITLE;
  const channel = trimString(draft.channel) || trimString(fallback.channel) || SAFE_FALLBACK_CHANNEL;
  const artifactType =
    trimString(draft.artifactType) || trimString(fallback.artifactType) || SAFE_FALLBACK_OUTPUT_TYPE;
  const sections = normalizeOutputSections(draft.sections);
  const previewText = trimString(draft.previewText) || derivePreviewTextFromSections(sections);
  const metadataFromEntries = normalizeStructuredMetadataEntries(draft.metadataEntries);
  const rawMetadata =
    Object.keys(metadataFromEntries).length > 0
      ? metadataFromEntries
      : normalizeStructuredMetadata(draft.metadata);
  const { metadata, metadataLabels } = sanitizeStructuredMetadata(rawMetadata);
  const qualityChecks = normalizeStringArray(draft.qualityChecks);
  const body =
    trimString(draft.body) ||
    deriveBodyFromStructuredOutput({
      sections,
      previewText,
      title,
    });

  return {
    title,
    channel,
    artifactType,
    previewText,
    sections,
    metadata,
    metadataLabels,
    qualityChecks,
    body,
  };
}
