/**
 * Onboarding note:
 * Shared TypeScript utility for canvas rich text. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

import type { OutputBlockData, OutputData } from "@editorjs/editorjs";

export type EditorJsRichTextData = {
  format: "editorjs";
  version: 1;
  blocks: OutputData["blocks"];
  time?: number;
};

const EMPTY_PARAGRAPH_BLOCK: OutputBlockData = {
  type: "paragraph",
  data: { text: "" },
};

const ALLOWED_INLINE_TAGS = new Set(["B", "STRONG", "I", "EM", "A", "BR"]);
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBlockTextValue(block: OutputBlockData): string {
  const data = isRecord(block.data) ? block.data : {};
  const text = data.text;
  return typeof text === "string" ? text : "";
}

export function createEditorJsDataFromPlainText(content: string): OutputData {
  return {
    time: Date.now(),
    blocks: [
      {
        type: "paragraph",
        data: {
          text: content,
        },
      },
    ],
  };
}

export function normalizeTextNodeRichText(data: {
  content?: string;
  richText?: unknown;
}): OutputData {
  const richText = data.richText;
  if (isRecord(richText) && richText.format === "editorjs" && Array.isArray(richText.blocks)) {
    return {
      time: typeof richText.time === "number" ? richText.time : undefined,
      blocks: richText.blocks as OutputData["blocks"],
    };
  }

  return createEditorJsDataFromPlainText(data.content ?? "");
}

export function toPersistedEditorJsRichText(output: OutputData): EditorJsRichTextData {
  return {
    format: "editorjs",
    version: 1,
    blocks: output.blocks.length > 0 ? output.blocks : [EMPTY_PARAGRAPH_BLOCK],
    time: output.time,
  };
}

export function stripInlineHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent ?? "";
}

function collectListItemText(item: unknown, lines: string[]): void {
  if (typeof item === "string") {
    lines.push(stripInlineHtml(item));
    return;
  }

  if (!isRecord(item)) {
    return;
  }

  const content = item.content;
  if (typeof content === "string") {
    lines.push(stripInlineHtml(content));
  }

  const nestedItems = item.items;
  if (Array.isArray(nestedItems)) {
    for (const nestedItem of nestedItems) {
      collectListItemText(nestedItem, lines);
    }
  }
}

export function editorJsDataToPlainText(output: OutputData): string {
  const lines: string[] = [];

  for (const block of output.blocks) {
    if (block.type === "list") {
      const items = isRecord(block.data) ? block.data.items : undefined;
      if (Array.isArray(items)) {
        for (const item of items) {
          collectListItemText(item, lines);
        }
      }
      continue;
    }

    const text = getBlockTextValue(block);
    if (text.length > 0) {
      lines.push(stripInlineHtml(text));
    }
  }

  return lines.join("\n").trim();
}

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return SAFE_URL_PROTOCOLS.has(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as Element;
  if (!ALLOWED_INLINE_TAGS.has(element.tagName)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      const sanitizedChild = sanitizeNode(child, doc);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    }
    return fragment;
  }

  if (element.tagName === "BR") {
    return doc.createElement("br");
  }

  const sanitizedElement = doc.createElement(element.tagName.toLowerCase());
  if (element.tagName === "A") {
    const href = element.getAttribute("href");
    const safeHref = href ? sanitizeUrl(href) : null;
    if (!safeHref) {
      const fragment = doc.createDocumentFragment();
      for (const child of Array.from(element.childNodes)) {
        const sanitizedChild = sanitizeNode(child, doc);
        if (sanitizedChild) {
          fragment.appendChild(sanitizedChild);
        }
      }
      return fragment;
    }
    sanitizedElement.setAttribute("href", safeHref);
    sanitizedElement.setAttribute("target", "_blank");
    sanitizedElement.setAttribute("rel", "noopener noreferrer");
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitizedChild = sanitizeNode(child, doc);
    if (sanitizedChild) {
      sanitizedElement.appendChild(sanitizedChild);
    }
  }

  return sanitizedElement;
}

export function sanitizeEditorJsInlineHtml(html: string): string {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");

  for (const child of Array.from(parsed.body.childNodes)) {
    const sanitizedChild = sanitizeNode(child, output);
    if (sanitizedChild) {
      output.body.appendChild(sanitizedChild);
    }
  }

  return output.body.innerHTML;
}

export function isEditorJsDataEmpty(output: OutputData): boolean {
  return editorJsDataToPlainText(output).length === 0;
}
