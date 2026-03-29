import type { Doc } from "@/convex/_generated/dataModel";
import { nodeTypes } from "@/components/canvas/node-types";
import {
  CANVAS_NODE_TEMPLATES,
  type CanvasNodeTemplate,
} from "@/lib/canvas-node-templates";

/** PRD-Kategorien (Reihenfolge für Sidebar / Dropdown). */
export type NodeCategoryId =
  | "source"
  | "ai-output"
  | "transform"
  | "image-edit"
  | "control"
  | "layout";

export const NODE_CATEGORY_META: Record<
  NodeCategoryId,
  { label: string; order: number }
> = {
  source: { label: "Quelle", order: 0 },
  "ai-output": { label: "KI-Ausgabe", order: 1 },
  transform: { label: "Transformation", order: 2 },
  "image-edit": { label: "Bildbearbeitung", order: 3 },
  control: { label: "Steuerung & Flow", order: 4 },
  layout: { label: "Canvas & Layout", order: 5 },
};

export const NODE_CATEGORIES_ORDERED: NodeCategoryId[] = (
  Object.keys(NODE_CATEGORY_META) as NodeCategoryId[]
).sort((a, b) => NODE_CATEGORY_META[a].order - NODE_CATEGORY_META[b].order);

export type CatalogNodeType = Doc<"nodes">["type"];

export type NodeCatalogEntry = {
  type: CatalogNodeType;
  label: string;
  category: NodeCategoryId;
  phase: 1 | 2 | 3;
  /** React-Flow-Komponente vorhanden. */
  implemented: boolean;
  /** Wird typischerweise vom KI-System erzeugt — nicht aus Palette/DnD anlegbar. */
  systemOutput?: boolean;
  /** Kurzer Hinweis für Tooltip (disabled). */
  disabledHint?: string;
};

const REACT_FLOW_TYPES = new Set<string>(Object.keys(nodeTypes));

function entry(
  partial: Omit<NodeCatalogEntry, "implemented"> & { implemented?: boolean },
): NodeCatalogEntry {
  const implemented = partial.implemented ?? REACT_FLOW_TYPES.has(partial.type);
  return { ...partial, implemented };
}

/**
 * Vollständige Node-Taxonomie laut PRD / Convex `nodeType` (eine Zeile pro PRD-Node).
 */
export const NODE_CATALOG: readonly NodeCatalogEntry[] = [
  // Quelle
  entry({
    type: "image",
    label: "Bild",
    category: "source",
    phase: 1,
  }),
  entry({
    type: "text",
    label: "Text",
    category: "source",
    phase: 1,
  }),
  entry({
    type: "color",
    label: "Farbe / Palette",
    category: "source",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "video",
    label: "Video",
    category: "source",
    phase: 2,
  }),
  entry({
    type: "asset",
    label: "Asset (Stock)",
    category: "source",
    phase: 2,
  }),
  // KI-Ausgabe (Prompt-Knoten: steuert Generierung, ersetzt früheres „KI-Bild“ in der Palette)
  entry({
    type: "prompt",
    label: "KI-Bild",
    category: "ai-output",
    phase: 1,
  }),
  entry({
    type: "ai-text",
    label: "KI-Text",
    category: "ai-output",
    phase: 2,
    systemOutput: true,
    disabledHint: "Wird von der KI erzeugt",
  }),
  entry({
    type: "ai-video",
    label: "KI-Video",
    category: "ai-output",
    phase: 2,
    systemOutput: true,
    disabledHint: "Wird von der KI erzeugt",
  }),
  entry({
    type: "agent-output",
    label: "Agent-Ausgabe",
    category: "ai-output",
    phase: 3,
    systemOutput: true,
    disabledHint: "Wird vom Agenten erzeugt",
  }),
  // Transformation
  entry({
    type: "crop",
    label: "Crop / Resize",
    category: "transform",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "bg-remove",
    label: "BG entfernen",
    category: "transform",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "upscale",
    label: "Upscale",
    category: "transform",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "style-transfer",
    label: "Style Transfer",
    category: "transform",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
  entry({
    type: "face-restore",
    label: "Gesicht",
    category: "transform",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
  // Bildbearbeitung
  entry({
    type: "curves",
    label: "Kurven",
    category: "image-edit",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "color-adjust",
    label: "Farbe",
    category: "image-edit",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "light-adjust",
    label: "Licht",
    category: "image-edit",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "detail-adjust",
    label: "Detail",
    category: "image-edit",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "render",
    label: "Render",
    category: "image-edit",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  // Steuerung & Flow
  entry({
    type: "splitter",
    label: "Splitter",
    category: "control",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "loop",
    label: "Loop",
    category: "control",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "agent",
    label: "Agent",
    category: "control",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "mixer",
    label: "Mixer / Merge",
    category: "control",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
  entry({
    type: "switch",
    label: "Weiche",
    category: "control",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
  // Canvas & Layout
  entry({
    type: "group",
    label: "Gruppe",
    category: "layout",
    phase: 1,
  }),
  entry({
    type: "frame",
    label: "Frame",
    category: "layout",
    phase: 1,
  }),
  entry({
    type: "note",
    label: "Notiz",
    category: "layout",
    phase: 1,
  }),
  entry({
    type: "text-overlay",
    label: "Text-Overlay",
    category: "layout",
    phase: 2,
    implemented: false,
    disabledHint: "Folgt in Phase 2",
  }),
  entry({
    type: "compare",
    label: "Vergleich",
    category: "layout",
    phase: 1,
  }),
  entry({
    type: "comment",
    label: "Kommentar",
    category: "layout",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
  entry({
    type: "presentation",
    label: "Präsentation",
    category: "layout",
    phase: 3,
    implemented: false,
    disabledHint: "Folgt in Phase 3",
  }),
] as const;

const TEMPLATE_BY_TYPE = new Map<string, CanvasNodeTemplate>(
  CANVAS_NODE_TEMPLATES.map((t) => [t.type, t]),
);

/** Sidebar / „+“: nur mit React-Flow-Typ, ohne systemOutput, mit Template. */
export function isNodePaletteEnabled(entry: NodeCatalogEntry): boolean {
  if (!entry.implemented || entry.systemOutput) return false;
  return TEMPLATE_BY_TYPE.has(entry.type);
}

export function getTemplateForCatalogType(
  type: string,
): CanvasNodeTemplate | undefined {
  return TEMPLATE_BY_TYPE.get(type);
}

export function catalogEntriesByCategory(): Map<
  NodeCategoryId,
  NodeCatalogEntry[]
> {
  const map = new Map<NodeCategoryId, NodeCatalogEntry[]>();
  for (const id of NODE_CATEGORIES_ORDERED) {
    map.set(id, []);
  }
  for (const e of NODE_CATALOG) {
    map.get(e.category)?.push(e);
  }
  return map;
}
