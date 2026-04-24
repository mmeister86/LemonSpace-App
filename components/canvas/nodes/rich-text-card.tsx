"use client";

import type React from "react";
import type { OutputBlockData, OutputData } from "@editorjs/editorjs";
import {
  normalizeTextNodeRichText,
  sanitizeEditorJsInlineHtml,
  type EditorJsRichTextData,
} from "@/lib/canvas-rich-text";

function getInlineHtml(block: OutputBlockData): string {
  if (typeof block.data === "object" && block.data !== null && "text" in block.data) {
    const text = (block.data as { text?: unknown }).text;
    return typeof text === "string" ? sanitizeEditorJsInlineHtml(text) : "";
  }

  return "";
}

function renderListItems(items: unknown[], depth = 0): React.ReactNode {
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

export function RichTextCard({
  data,
  className = "",
}: {
  data: OutputData | EditorJsRichTextData;
  className?: string;
}) {
  const normalizedData =
    "format" in data ? normalizeTextNodeRichText({ richText: data }) : data;

  return (
    <div className={`h-full w-full overflow-hidden bg-background p-3 text-foreground ${className}`}>
      <div className="space-y-1">
        {normalizedData.blocks.map((block, index) => {
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
                className={`ml-4 text-sm leading-5 ${
                  ListTag === "ol" ? "list-decimal" : "list-disc"
                }`}
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
    </div>
  );
}
