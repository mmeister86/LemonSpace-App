"use client";

/**
 * Onboarding note:
 * Lets collapsed Canvas nodes expose their persisted editable data in a side drawer without
 * mounting their full React Flow node chrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useOnSelectionChange,
  useStore,
  type Edge as RFEdge,
  type Node as RFNode,
} from "@xyflow/react";
import { X } from "lucide-react";

import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  ADJUSTMENT_NODE_CONFIGS,
  AdjustmentNodeBody,
} from "@/components/canvas/nodes/adjustment-node-shell";
import { CropNodeBody } from "@/components/canvas/nodes/crop-node";
import { ImageTransformNodeBody } from "@/components/canvas/nodes/image-transform-node";
import { MixerNodeBody } from "@/components/canvas/nodes/mixer-node";
import { NoteNodeBody } from "@/components/canvas/nodes/note-node";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Id } from "@/convex/_generated/dataModel";
import { readNodeCollapsed } from "@/lib/canvas-node-favorite";
import { cn } from "@/lib/utils";

const EDITABLE_COLLAPSED_NODE_TYPES = new Set([
  "prompt",
  "video-prompt",
  "ai-text",
  "agent",
  "note",
  "comment",
  "text",
  "curves",
  "color-adjust",
  "light-adjust",
  "detail-adjust",
  "crop",
  "bg-remove",
  "upscale",
  "style-transfer",
  "face-restore",
  "change-camera",
  "render",
  "mixer",
]);

const NODE_TYPE_LABELS: Record<string, string> = {
  prompt: "KI-Bild",
  "video-prompt": "KI-Video",
  "ai-text": "KI-Text",
  agent: "Instagram Agent",
  note: "Notiz",
  comment: "Kommentar",
  text: "Text",
  curves: "Kurven",
  "color-adjust": "Farbe",
  "light-adjust": "Licht",
  "detail-adjust": "Detail",
  crop: "Crop / Resize",
  "bg-remove": "BG entfernen",
  upscale: "Upscale",
  "style-transfer": "Style Transfer",
  "face-restore": "Gesicht",
  "change-camera": "Kamera ändern",
  render: "Render",
  mixer: "Mixer / Merge",
};

const INTERNAL_FIELD_NAMES = new Set([
  "_status",
  "_statusMessage",
  "_groupDropTarget",
  "_uploadState",
  "_executionStepIndex",
  "_executionStepTotal",
  "isCollapsed",
  "expandedSize",
  "isFavorite",
  "isBypassed",
  "canvasId",
  "url",
  "previewUrl",
  "storageId",
  "retryCount",
  "lastRenderedAt",
  "lastRenderedHash",
  "lastRenderError",
  "lastRenderErrorHash",
  "lastUploadError",
  "lastUploadErrorHash",
  "lastUploadedAt",
  "lastUploadedHash",
]);

type EditablePrimitive = string | number | boolean | null;
type FieldPath = Array<string | number>;
type CropRect = { x: number; y: number; width: number; height: number };
type DrawerSurfaceProps = {
  node: RFNode;
};
type DrawerSurfaceConfig = {
  render: (props: DrawerSurfaceProps) => ReactNode;
  wide?: boolean;
};

const COLLAPSED_NODE_DRAWER_SURFACES: Partial<Record<string, DrawerSurfaceConfig>> = {
  crop: {
    wide: true,
    render: ({ node }) => (
      <CropNodeBody id={node.id} data={toRecord(node.data) as never} width={480} />
    ),
  },
  curves: {
    wide: true,
    render: ({ node }) => (
      <AdjustmentNodeBody
        id={node.id}
        data={toRecord(node.data) as never}
        width={480}
        config={ADJUSTMENT_NODE_CONFIGS.curves}
      />
    ),
  },
  "color-adjust": {
    wide: true,
    render: ({ node }) => (
      <AdjustmentNodeBody
        id={node.id}
        data={toRecord(node.data) as never}
        width={480}
        config={ADJUSTMENT_NODE_CONFIGS["color-adjust"]}
      />
    ),
  },
  "light-adjust": {
    wide: true,
    render: ({ node }) => (
      <AdjustmentNodeBody
        id={node.id}
        data={toRecord(node.data) as never}
        width={480}
        config={ADJUSTMENT_NODE_CONFIGS["light-adjust"]}
      />
    ),
  },
  "detail-adjust": {
    wide: true,
    render: ({ node }) => (
      <AdjustmentNodeBody
        id={node.id}
        data={toRecord(node.data) as never}
        width={480}
        config={ADJUSTMENT_NODE_CONFIGS["detail-adjust"]}
      />
    ),
  },
  mixer: {
    wide: true,
    render: ({ node }) => (
      <MixerNodeBody id={node.id} data={node.data} width={480} height={420} />
    ),
  },
  note: {
    render: ({ node }) => (
      <div className="p-3">
        <NoteNodeBody id={node.id} data={toRecord(node.data)} />
      </div>
    ),
  },
  "bg-remove": {
    wide: true,
    render: ({ node }) => (
      <ImageTransformNodeBody id={node.id} data={toRecord(node.data) as never} operationType="bg-remove" />
    ),
  },
  upscale: {
    wide: true,
    render: ({ node }) => (
      <ImageTransformNodeBody id={node.id} data={toRecord(node.data) as never} operationType="upscale" />
    ),
  },
  "style-transfer": {
    wide: true,
    render: ({ node }) => (
      <ImageTransformNodeBody id={node.id} data={toRecord(node.data) as never} operationType="style-transfer" />
    ),
  },
  "face-restore": {
    wide: true,
    render: ({ node }) => (
      <ImageTransformNodeBody id={node.id} data={toRecord(node.data) as never} operationType="face-restore" />
    ),
  },
  "change-camera": {
    wide: true,
    render: ({ node }) => (
      <ImageTransformNodeBody id={node.id} data={toRecord(node.data) as never} operationType="change-camera" />
    ),
  },
};

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditablePrimitive(value: unknown): value is EditablePrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function hasEditableField(value: unknown): boolean {
  if (isEditablePrimitive(value)) return true;
  if (!isPlainRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => !INTERNAL_FIELD_NAMES.has(key) && hasEditableField(child),
  );
}

function resolveNodeLabel(node: RFNode): string {
  const data = toRecord(node.data);
  const candidates = [data.label, data.title, data.filename, data.name, data.templateName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  if (data.templateId === "instagram-post-agent") {
    return "Instagram Post Agent";
  }
  return NODE_TYPE_LABELS[node.type ?? ""] ?? node.type ?? "Node";
}

function updateAtPath(
  value: Record<string, unknown>,
  path: FieldPath,
  nextValue: unknown,
): Record<string, unknown> {
  if (path.length === 0) return value;
  const [head, ...tail] = path;
  const next = { ...value };
  if (tail.length === 0) {
    next[String(head)] = nextValue;
    return next;
  }

  next[String(head)] = updateAtPath(toRecord(next[String(head)]), tail, nextValue);
  return next;
}

function formatFieldLabel(path: FieldPath): string {
  const raw = String(path[path.length - 1] ?? "");
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shouldUseTextarea(path: FieldPath): boolean {
  const key = String(path[path.length - 1] ?? "").toLowerCase();
  return (
    key.includes("prompt") ||
    key.includes("content") ||
    key.includes("instruction") ||
    key.includes("description") ||
    key.includes("text")
  );
}

function readPreviewUrl(data: unknown): string | null {
  const record = toRecord(data);
  const candidates = [record.url, record.previewUrl, record.imageUrl, record.thumbnailUrl];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveSourcePreviewUrl(args: {
  node: RFNode;
  nodes: RFNode[];
  edges: RFEdge[];
}): string | null {
  const ownUrl = readPreviewUrl(args.node.data);
  if (ownUrl) return ownUrl;

  const incomingEdges = args.edges.filter((edge) => edge.target === args.node.id);
  for (const edge of incomingEdges) {
    const sourceNode = args.nodes.find((node) => node.id === edge.source);
    const sourceUrl = readPreviewUrl(sourceNode?.data);
    if (sourceUrl) return sourceUrl;
  }

  return null;
}

function readCropRect(data: unknown): CropRect | null {
  const crop = toRecord(toRecord(data).crop);
  const x = crop.x;
  const y = crop.y;
  const width = crop.width;
  const height = crop.height;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  return { x, y, width, height };
}

function findActiveCollapsedEditableNode(
  selectedNodes: RFNode[],
  allNodes: RFNode[],
): RFNode | null {
  if (selectedNodes.length !== 1) return null;
  const selectedNode = selectedNodes[0];
  if (!selectedNode) return null;
  const latestNode = allNodes.find((node) => node.id === selectedNode.id);
  if (!latestNode) return null;
  if (!latestNode.type || !EDITABLE_COLLAPSED_NODE_TYPES.has(latestNode.type)) return null;
  return readNodeCollapsed(latestNode.data) ? latestNode : null;
}

function isDrawerOutsideInteractionExempt(target: Element): boolean {
  return Boolean(
    target.closest(
      [
        ".react-flow__node-toolbar",
        "[data-testid='node-toolbar']",
        "[data-testid='selection-toolbar']",
        "[data-testid='canvas-toolbar']",
        "[data-slot='select-content']",
        "[data-radix-popper-content-wrapper]",
      ].join(","),
    ),
  );
}

function isPointerInsideCanvasNode(target: Element, nodeId: string): boolean {
  const nodeElement = target.closest(".react-flow__node");
  return nodeElement instanceof HTMLElement && nodeElement.dataset.id === nodeId;
}

export function CollapsedNodeEditDrawer() {
  const allNodes = useStore((store) => store.nodes);
  const allEdges = useStore((store) => store.edges);
  const [selectedNodes, setSelectedNodes] = useState<RFNode[]>([]);
  const [manualClosedSelectionId, setManualClosedSelectionId] = useState<string | null>(null);
  const drawerContentRef = useRef<HTMLDivElement | null>(null);

  const handleSelectionChange = useCallback(({ nodes }: { nodes: RFNode[] }) => {
    setSelectedNodes(nodes);
    setManualClosedSelectionId(null);
  }, []);

  useOnSelectionChange({
    onChange: handleSelectionChange,
  });

  const activeNode = useMemo(
    () => findActiveCollapsedEditableNode(selectedNodes, allNodes),
    [allNodes, selectedNodes],
  );
  const isOpen = Boolean(activeNode && activeNode.id !== manualClosedSelectionId);
  const activeSurface = activeNode?.type
    ? COLLAPSED_NODE_DRAWER_SURFACES[activeNode.type]
    : undefined;
  const drawerWidthClass = activeSurface?.wide
    ? "w-[min(520px,92vw)] sm:max-w-[520px]"
    : "w-[min(420px,92vw)] sm:max-w-[420px]";

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setManualClosedSelectionId(null);
      return;
    }
    if (activeNode) {
      setManualClosedSelectionId(activeNode.id);
    }
  };

  useEffect(() => {
    if (!activeNode) return;

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (isPointerInsideCanvasNode(target, activeNode.id)) {
        setManualClosedSelectionId(null);
        return;
      }
      if (!isOpen) return;
      if (drawerContentRef.current?.contains(target)) return;
      if (isDrawerOutsideInteractionExempt(target)) return;

      setManualClosedSelectionId(activeNode.id);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [activeNode, isOpen]);

  return (
    <Drawer
      open={isOpen}
      onOpenChange={handleOpenChange}
      direction="right"
      handleOnly
      modal={false}
      shouldScaleBackground={false}
    >
      {activeNode ? (
        <DrawerContent
          ref={drawerContentRef}
          showOverlay={false}
          className={cn("nodrag nopan nowheel", drawerWidthClass)}
        >
          <DrawerHeader className="border-b border-border pr-12">
            <DrawerTitle>{resolveNodeLabel(activeNode)}</DrawerTitle>
            <DrawerDescription>
              Werte bearbeiten, ohne die Node aufzuklappen.
            </DrawerDescription>
            <button
              type="button"
              aria-label="Drawer schließen"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => handleOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </DrawerHeader>
          {activeSurface ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeSurface.render({ node: activeNode })}
            </div>
          ) : (
            <>
              <CollapsedNodePreview node={activeNode} nodes={allNodes} edges={allEdges} />
              <CollapsedNodeDataEditor key={activeNode.id} node={activeNode} />
            </>
          )}
        </DrawerContent>
      ) : null}
    </Drawer>
  );
}

function CollapsedNodePreview({
  node,
  nodes,
  edges,
}: {
  node: RFNode;
  nodes: RFNode[];
  edges: RFEdge[];
}) {
  const previewUrl = resolveSourcePreviewUrl({ node, nodes, edges });
  if (!previewUrl) return null;

  const cropRect = node.type === "crop" ? readCropRect(node.data) : null;

  return (
    <div className="border-b border-border bg-muted/20 p-4">
      <div className="relative overflow-hidden rounded-md border border-border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="collapsed-node-preview-image"
          src={previewUrl}
          alt=""
          draggable={false}
          className="max-h-56 w-full object-contain"
        />
        {cropRect ? (
          <div className="pointer-events-none absolute inset-0">
            <div
              data-testid="collapsed-node-crop-overlay"
              className="absolute border border-primary bg-primary/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.width * 100}%`,
                height: `${cropRect.height * 100}%`,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CollapsedNodeDataEditor({ node }: { node: RFNode }) {
  const { queueNodeDataUpdate } = useCanvasSync();
  const [localData, setLocalData] = useState<Record<string, unknown>>(() => toRecord(node.data));

  const editableEntries = useMemo(
    () =>
      Object.entries(localData).filter(
        ([key, value]) => !INTERNAL_FIELD_NAMES.has(key) && hasEditableField(value),
      ),
    [localData],
  );

  const updateField = useCallback(
    (path: FieldPath, value: unknown) => {
      setLocalData((current) => {
        const next = updateAtPath(current, path, value);
        void queueNodeDataUpdate({
          nodeId: node.id as Id<"nodes">,
          data: next,
        });
        return next;
      });
    },
    [node.id, queueNodeDataUpdate],
  );

  if (editableEntries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Für diese eingeklappte Node gibt es aktuell keine direkt editierbaren Werte.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {editableEntries.map(([key, value]) => (
        <EditableField
          key={key}
          path={[key]}
          value={value}
          depth={0}
          onChange={updateField}
        />
      ))}
    </div>
  );
}

function EditableField({
  path,
  value,
  depth,
  onChange,
}: {
  path: FieldPath;
  value: unknown;
  depth: number;
  onChange: (path: FieldPath, value: unknown) => void;
}) {
  if (typeof value === "string" || value === null) {
    const stringValue = value ?? "";
    const className =
      "w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

    return (
      <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>{formatFieldLabel(path)}</span>
        {shouldUseTextarea(path) ? (
          <textarea
            value={stringValue}
            rows={4}
            onInput={(event) => onChange(path, event.currentTarget.value)}
            className={cn(className, "min-h-24 resize-y py-2")}
          />
        ) : (
          <input
            type="text"
            value={stringValue}
            onInput={(event) => onChange(path, event.currentTarget.value)}
            className={cn(className, "h-9")}
          />
        )}
      </label>
    );
  }

  if (typeof value === "number") {
    return (
      <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
        <span>{formatFieldLabel(path)}</span>
        <input
          type="number"
          value={value}
          onInput={(event) => {
            const nextValue = Number(event.currentTarget.value);
            if (Number.isFinite(nextValue)) {
              onChange(path, nextValue);
            }
          }}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
    );
  }

  if (typeof value === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>{formatFieldLabel(path)}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(path, event.currentTarget.checked)}
          className="h-4 w-4 rounded border-input"
        />
      </label>
    );
  }

  if (isPlainRecord(value)) {
    const entries = Object.entries(value).filter(
      ([key, child]) => !INTERNAL_FIELD_NAMES.has(key) && hasEditableField(child),
    );
    if (entries.length === 0) return null;

    return (
      <fieldset
        className={cn(
          "space-y-3 rounded-md border border-border/80 p-3",
          depth > 0 && "bg-muted/20",
        )}
      >
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          {formatFieldLabel(path)}
        </legend>
        {entries.map(([key, child]) => (
          <EditableField
            key={key}
            path={[...path, key]}
            value={child}
            depth={depth + 1}
            onChange={onChange}
          />
        ))}
      </fieldset>
    );
  }

  return null;
}
