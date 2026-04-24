"use client";

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
  Position,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import type { I18nDictionary, OutputBlockData, OutputData } from "@editorjs/editorjs";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import CanvasHandle from "@/components/canvas/canvas-handle";
import EditorJsTextEditor from "./editor-js-text-editor";
import {
  editorJsDataToPlainText,
  isEditorJsDataEmpty,
  normalizeTextNodeRichText,
  sanitizeEditorJsInlineHtml,
  toPersistedEditorJsRichText,
  type EditorJsRichTextData,
} from "./text-node-richtext";

type TextNodeData = {
  content?: string;
  richText?: EditorJsRichTextData;
  _status?: string;
  _statusMessage?: string;
};

export type TextNode = Node<TextNodeData, "text">;

function getInlineHtml(block: OutputBlockData): string {
  if (typeof block.data === "object" && block.data !== null && "text" in block.data) {
    const text = (block.data as { text?: unknown }).text;
    return typeof text === "string" ? sanitizeEditorJsInlineHtml(text) : "";
  }

  return "";
}

function renderListItems(items: unknown[], depth = 0): ReactNode {
  return items.map((item, index) => {
    if (typeof item === "string") {
      return (
        <li
          key={`${depth}-${index}`}
          dangerouslySetInnerHTML={{ __html: sanitizeEditorJsInlineHtml(item) }}
        />
      );
    }

    if (typeof item !== "object" || item === null) {
      return null;
    }

    const listItem = item as { content?: unknown; items?: unknown };
    const content = typeof listItem.content === "string" ? listItem.content : "";
    const nestedItems = Array.isArray(listItem.items) ? listItem.items : [];

    return (
      <li key={`${depth}-${index}`}>
        <span dangerouslySetInnerHTML={{ __html: sanitizeEditorJsInlineHtml(content) }} />
        {nestedItems.length > 0 ? (
          <ul className="ml-4 list-disc">{renderListItems(nestedItems, depth + 1)}</ul>
        ) : null}
      </li>
    );
  });
}

function TextNodePreview({ data, emptyHint }: { data: OutputData; emptyHint: string }) {
  if (isEditorJsDataEmpty(data)) {
    return (
      <span className="text-muted-foreground">
        {emptyHint}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {data.blocks.map((block, index) => {
        if (block.type === "header") {
          return (
            <div
              key={block.id ?? index}
              className="text-sm font-semibold leading-5"
              dangerouslySetInnerHTML={{ __html: getInlineHtml(block) }}
            />
          );
        }

        if (block.type === "list") {
          const blockData = block.data as { style?: unknown; items?: unknown };
          const items = Array.isArray(blockData.items) ? blockData.items : [];
          const ListTag = blockData.style === "ordered" ? "ol" : "ul";

          return (
            <ListTag
              key={block.id ?? index}
              className={`ml-4 text-sm leading-5 ${ListTag === "ol" ? "list-decimal" : "list-disc"}`}
            >
              {renderListItems(items)}
            </ListTag>
          );
        }

        return (
          <p
            key={block.id ?? index}
            className="text-sm leading-5"
            dangerouslySetInnerHTML={{ __html: getInlineHtml(block) }}
          />
        );
      })}
    </div>
  );
}

function buildEditorJsI18nMessages(
  t: ReturnType<typeof useTranslations<"textNode">>,
): I18nDictionary {
  return {
    ui: {
      popover: {
        Filter: t("editorJs.ui.popover.filter"),
        "Nothing found": t("editorJs.ui.popover.nothingFound"),
        "Convert to": t("editorJs.ui.popover.convertTo"),
      },
      toolbar: {
        toolbox: {
          Add: t("editorJs.ui.toolbar.toolbox.add"),
        },
      },
      inlineToolbar: {
        converter: {
          "Convert to": t("editorJs.ui.inlineToolbar.converter.convertTo"),
        },
      },
      blockTunes: {
        toggler: {
          "Click to tune": t("editorJs.ui.blockTunes.toggler.clickToTune"),
          "or drag to move": t("editorJs.ui.blockTunes.toggler.orDragToMove"),
        },
      },
    },
    toolNames: {
      Text: t("editorJs.toolNames.text"),
      Heading: t("editorJs.toolNames.heading"),
      "Unordered List": t("editorJs.toolNames.unorderedList"),
      "Ordered List": t("editorJs.toolNames.orderedList"),
      Checklist: t("editorJs.toolNames.checklist"),
      Link: t("editorJs.toolNames.link"),
      Bold: t("editorJs.toolNames.bold"),
      Italic: t("editorJs.toolNames.italic"),
    },
    tools: {
      link: {
        "Add a link": t("editorJs.tools.link.addLink"),
      },
      header: {
        "Heading 2": t("editorJs.tools.header.heading2"),
        "Heading 3": t("editorJs.tools.header.heading3"),
      },
      list: {
        Unordered: t("editorJs.tools.list.unordered"),
        Ordered: t("editorJs.tools.list.ordered"),
        Checklist: t("editorJs.tools.list.checklist"),
        "Start with": t("editorJs.tools.list.startWith"),
        "Counter type": t("editorJs.tools.list.counterType"),
        Numeric: t("editorJs.tools.list.numeric"),
        "Lower Roman": t("editorJs.tools.list.lowerRoman"),
        "Upper Roman": t("editorJs.tools.list.upperRoman"),
        "Lower Alpha": t("editorJs.tools.list.lowerAlpha"),
        "Upper Alpha": t("editorJs.tools.list.upperAlpha"),
      },
    },
    blockTunes: {
      delete: {
        Delete: t("editorJs.blockTunes.delete.delete"),
        "Click to delete": t("editorJs.blockTunes.delete.clickToDelete"),
      },
      moveUp: {
        "Move up": t("editorJs.blockTunes.moveUp"),
      },
      moveDown: {
        "Move down": t("editorJs.blockTunes.moveDown"),
      },
    },
  };
}

export default function TextNode({ id, data, selected }: NodeProps<TextNode>) {
  const t = useTranslations("textNode");
  const { setNodes } = useReactFlow();
  const { queueNodeDataUpdate } = useCanvasSync();
  const [content, setContent] = useState(data.content ?? "");
  const [editorData, setEditorData] = useState<OutputData>(() =>
    normalizeTextNodeRichText(data),
  );
  const [isEditing, setIsEditing] = useState(false);

  // Sync von außen (Convex-Update) wenn nicht gerade editiert wird
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent(data.content ?? "");
      setEditorData(normalizeTextNodeRichText(data));
    }
  }, [data, isEditing]);

  const normalizedPreviewData = useMemo(
    () => (isEditing ? editorData : normalizeTextNodeRichText({ content, richText: data.richText })),
    [content, data.richText, editorData, isEditing],
  );
  const editorJsI18nMessages = useMemo(() => buildEditorJsI18nMessages(t), [t]);

  // Debounced Save — 500ms nach letztem Tastendruck
  const saveContent = useDebouncedCallback(
    (newContent: string, richText: EditorJsRichTextData) => {
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          content: newContent,
          richText,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    },
    500,
  );

  const updateContent = useCallback(
    (newEditorData: OutputData) => {
      const newContent = editorJsDataToPlainText(newEditorData);
      const richText = toPersistedEditorJsRichText(newEditorData);
      setContent(newContent);
      setEditorData(newEditorData);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: newContent,
                  richText,
                },
              }
            : node,
        ),
      );
      saveContent(newContent, richText);
    },
    [id, saveContent, setNodes],
  );

  return (
    <div>
      <BaseNodeWrapper
        nodeType="text"
        selected={selected}
        status={data._status}
        className={`relative ${isEditing ? "min-h-[280px]" : ""}`}
      >
      <CanvasHandle
        nodeId={id}
        nodeType="text"
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />

      <div className="w-full p-3">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          📝 {t("label")}
        </div>
        {isEditing ? (
          <EditorJsTextEditor
            data={editorData}
            placeholder={t("placeholder")}
            loadingLabel={t("loading")}
            i18nMessages={editorJsI18nMessages}
            onChange={updateContent}
            onRequestClose={() => setIsEditing(false)}
          />
        ) : (
          <div
            onClick={() => {
              if (selected) setIsEditing(true);
            }}
            onDoubleClick={() => {
              if (selected) setIsEditing(true);
            }}
            className="nodrag nowheel min-h-[2rem] cursor-text whitespace-pre-wrap break-words text-sm"
          >
            <TextNodePreview data={normalizedPreviewData} emptyHint={t("emptyHint")} />
          </div>
        )}
      </div>
        <CanvasHandle
          nodeId={id}
          nodeType="text"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !bg-primary !border-2 !border-background"
        />
      </BaseNodeWrapper>
    </div>
  );
}
