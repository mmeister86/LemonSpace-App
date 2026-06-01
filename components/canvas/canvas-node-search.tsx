"use client";

import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  type BuiltInEdge,
  type Node as RFNode,
  useReactFlow,
} from "@xyflow/react";

import { NodeSearchDialog } from "@/components/node-search";
import { Button } from "@/components/ui/button";
import { CANVAS_NODE_TEMPLATES } from "@/lib/canvas-node-templates";

const TEMPLATE_LABEL_BY_TYPE = new Map<string, string>(
  CANVAS_NODE_TEMPLATES.map((template) => [template.type, template.label]),
);

const SEARCH_DATA_KEYS = [
  "label",
  "name",
  "title",
  "fileName",
  "filename",
  "originalFilename",
  "originalFileName",
  "lastUploadFilename",
  "prompt",
  "instruction",
  "content",
  "inputText",
  "outputText",
  "statusMessage",
] as const;

function collectSearchText(value: unknown, output: string[], depth = 0) {
  if (depth > 3 || value == null) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text) output.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 16)) {
      collectSearchText(item, output, depth + 1);
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const nested of Object.values(value as Record<string, unknown>).slice(0, 24)) {
    collectSearchText(nested, output, depth + 1);
  }
}

export function getCanvasNodeDisplayLabel(node: RFNode): string {
  const data = node.data as Record<string, unknown> | undefined;
  const label = data?.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  if (node.type) {
    const templateLabel = TEMPLATE_LABEL_BY_TYPE.get(node.type);
    if (templateLabel) return templateLabel;
  }
  return node.id;
}

export function getCanvasNodeSearchText(node: RFNode): string {
  const parts = [node.id];
  if (node.type) {
    parts.push(node.type);
    const templateLabel = TEMPLATE_LABEL_BY_TYPE.get(node.type);
    if (templateLabel) parts.push(templateLabel);
  }

  const data = node.data as Record<string, unknown> | undefined;
  if (data) {
    for (const key of SEARCH_DATA_KEYS) {
      collectSearchText(data[key], parts);
    }
  }

  return Array.from(new Set(parts.filter(Boolean))).join(" ");
}

export function CanvasNodeSearchButton() {
  const [open, setOpen] = useState(false);
  const { fitView, getNodes, setNodes } = useReactFlow<RFNode, BuiltInEdge>();

  const handleSearch = useCallback(
    (searchString: string) => {
      const query = searchString.trim().toLowerCase();
      if (!query) return [];
      return getNodes().filter((node) =>
        getCanvasNodeSearchText(node).toLowerCase().includes(query),
      );
    },
    [getNodes],
  );

  const handleSelectNode = useCallback(
    (selectedNode: RFNode) => {
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: node.id === selectedNode.id,
        })),
      );
      fitView({ nodes: [selectedNode], duration: 500 });
    },
    [fitView, setNodes],
  );

  const searchDialog = useMemo(
    () =>
      open ? (
        <NodeSearchDialog
          getNodeLabel={getCanvasNodeDisplayLabel}
          onOpenChange={setOpen}
          onSearch={handleSearch}
          onSelectNode={handleSelectNode}
          open={open}
          placeholder="Knoten suchen..."
          title="Knoten suchen"
        />
      ) : null,
    [handleSearch, handleSelectNode, open],
  );

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0"
        aria-label="Knoten suchen"
        title="Knoten suchen"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
      </Button>
      {searchDialog}
    </>
  );
}
