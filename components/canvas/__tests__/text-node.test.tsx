// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutputData } from "@editorjs/editorjs";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  setNodes: vi.fn(),
  latestEditorData: undefined as OutputData | undefined,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      label: "Text",
      emptyHint: "Select, then click here",
      placeholder: "Enter text...",
      loading: "Loading editor...",
    };
    return messages[key] ?? key;
  },
}));

vi.mock("@xyflow/react", () => ({
  Position: { Left: "left", Right: "right" },
  useReactFlow: () => ({
    setNodes: mocks.setNodes,
  }),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
  }),
}));

vi.mock("@/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: (callback: (...args: Array<unknown>) => void) => callback,
}));

vi.mock("@/components/canvas/canvas-handle", () => ({
  default: () => null,
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

vi.mock("@/components/canvas/nodes/editor-js-text-editor", () => ({
  default: ({
    data,
    onChange,
  }: {
    data: OutputData;
    onChange: (data: OutputData) => void;
  }) => {
    mocks.latestEditorData = data;
    return (
      <button
        type="button"
        data-testid="mock-editor"
        onClick={() =>
          onChange({
            time: 42,
            blocks: [
              {
                type: "header",
                data: { text: "Launch <strong>headline</strong>", level: 2 },
              },
              {
                type: "list",
                data: {
                  style: "unordered",
                  items: [{ content: "First <em>item</em>", meta: {}, items: [] }],
                },
              },
            ],
          })
        }
      >
        Mock Editor
      </button>
    );
  },
}));

import TextNode from "@/components/canvas/nodes/text-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function renderTextNode(root: Root, data: Record<string, unknown>, selected = true) {
  root.render(
    React.createElement(TextNode, {
      id: "text-1",
      selected,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      zIndex: 1,
      isConnectable: true,
      type: "text",
      data,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }),
  );
}

describe("TextNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    mocks.setNodes.mockClear();
    mocks.latestEditorData = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("opens the inline Editor.js editor from the normal selected text edit trigger", async () => {
    await act(async () => {
      renderTextNode(root!, { content: "Legacy text" }, true);
    });

    expect(container?.textContent).toContain("Legacy text");
    expect(container?.textContent).not.toContain("RichText Editor");

    const preview = container?.querySelector(".cursor-text");
    if (!(preview instanceof HTMLElement)) {
      throw new Error("Text preview not found");
    }

    await act(async () => {
      preview.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container?.querySelector('[data-testid="mock-editor"]')).toBeTruthy();
    expect(mocks.latestEditorData).toEqual({
      blocks: [{ type: "paragraph", data: { text: "Legacy text" } }],
      time: expect.any(Number),
    });
  });

  it("saves both the plain content mirror and structured richText data", async () => {
    await act(async () => {
      renderTextNode(root!, { content: "" }, true);
    });

    const preview = container?.querySelector(".cursor-text");
    if (!(preview instanceof HTMLElement)) {
      throw new Error("Text preview not found");
    }

    await act(async () => {
      preview.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const editor = container?.querySelector('[data-testid="mock-editor"]');
    if (!(editor instanceof HTMLButtonElement)) {
      throw new Error("Mock editor not found");
    }

    await act(async () => {
      editor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith({
      nodeId: "text-1",
      data: {
        content: "Launch headline\nFirst item",
        richText: {
          format: "editorjs",
          version: 1,
          time: 42,
          blocks: expect.any(Array),
        },
        _status: undefined,
        _statusMessage: undefined,
      },
    });
    expect(mocks.setNodes).toHaveBeenCalledWith(expect.any(Function));
  });
});
