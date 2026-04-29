// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommentContentFromText,
  type CommentNodeData,
} from "@/components/canvas/nodes/comment-node-data";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
  }),
}));

vi.mock("@/hooks/use-debounced-callback", () => ({
  useDebouncedCallback: (callback: (...args: Array<unknown>) => void) => callback,
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

import CommentNode from "@/components/canvas/nodes/comment-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function renderCommentNode(root: Root, data: Partial<CommentNodeData> = {}, selected = true) {
  root.render(
    React.createElement(CommentNode, {
      id: "comment-1",
      selected,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: true,
      zIndex: 1,
      isConnectable: true,
      type: "comment",
      data,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }),
  );
}

describe("CommentNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.queueNodeDataUpdate.mockClear();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "reply-1"),
    });
    vi.setSystemTime(new Date("2026-04-29T08:00:00.000Z"));
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders unresolved comments and mention tokens", async () => {
    await act(async () => {
      renderCommentNode(root!, {
        content: {
          version: 1,
          blocks: [
            {
              id: "block-1",
              type: "paragraph",
              tokens: [
                { kind: "text", text: "Review this with " },
                { kind: "mention", label: "Ana", userId: "user-1" },
              ],
            },
          ],
        },
      });
    });

    expect(container?.textContent).toContain("Kommentar");
    expect(container?.textContent).toContain("Offen");
    expect(container?.textContent).toContain("Review this with @Ana");
  });

  it("edits and clears the main comment content", async () => {
    await act(async () => {
      renderCommentNode(root!, {
        content: createCommentContentFromText("Initial comment"),
      });
    });

    const editButton = container?.querySelector('button[aria-label="Kommentar bearbeiten"]');
    if (!(editButton instanceof HTMLButtonElement)) throw new Error("Edit button not found");

    await act(async () => {
      editButton.click();
    });

    const textarea = container?.querySelector('textarea[aria-label="Kommentartext"]');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("Textarea not found");

    await act(async () => {
      textarea.value = "Updated comment";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({
        resolved: false,
        content: expect.objectContaining({
          blocks: [
            expect.objectContaining({
              tokens: [{ kind: "text", text: "Updated comment" }],
            }),
          ],
        }),
      }),
    });

    const clearButton = container?.querySelector('button[aria-label="Kommentartext löschen"]');
    if (!(clearButton instanceof HTMLButtonElement)) throw new Error("Clear button not found");

    await act(async () => {
      clearButton.click();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({
        content: expect.objectContaining({
          blocks: [
            expect.objectContaining({
              tokens: [],
            }),
          ],
        }),
      }),
    });
  });

  it("adds edits deletes replies and toggles resolved state", async () => {
    await act(async () => {
      renderCommentNode(root!, {
        content: createCommentContentFromText("Main"),
        replies: [
          {
            id: "existing-reply",
            content: createCommentContentFromText("Old reply"),
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });
    });

    const replyInput = container?.querySelector('textarea[aria-label="Antwort hinzufügen"]');
    if (!(replyInput instanceof HTMLTextAreaElement)) throw new Error("Reply input not found");

    await act(async () => {
      replyInput.value = "New reply";
      replyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const addReply = container?.querySelector('button[aria-label="Antwort speichern"]');
    if (!(addReply instanceof HTMLButtonElement)) throw new Error("Add reply button not found");

    await act(async () => {
      addReply.click();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({
        replies: expect.arrayContaining([
          expect.objectContaining({
            id: "reply-1",
            createdAt: Date.parse("2026-04-29T08:00:00.000Z"),
            updatedAt: Date.parse("2026-04-29T08:00:00.000Z"),
          }),
        ]),
      }),
    });

    const editReply = container?.querySelector('button[aria-label="Antwort bearbeiten"]');
    if (!(editReply instanceof HTMLButtonElement)) throw new Error("Edit reply button not found");

    await act(async () => {
      editReply.click();
    });

    const replyEditInput = container?.querySelector('textarea[aria-label="Antworttext"]');
    if (!(replyEditInput instanceof HTMLTextAreaElement)) throw new Error("Reply edit input not found");

    await act(async () => {
      replyEditInput.value = "Edited reply";
      replyEditInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({
        replies: [
          expect.objectContaining({
            id: "existing-reply",
            content: expect.objectContaining({
              blocks: [
                expect.objectContaining({
                  tokens: [{ kind: "text", text: "Edited reply" }],
                }),
              ],
            }),
          }),
        ],
      }),
    });

    const deleteReply = container?.querySelector('button[aria-label="Antwort löschen"]');
    if (!(deleteReply instanceof HTMLButtonElement)) throw new Error("Delete reply button not found");

    await act(async () => {
      deleteReply.click();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({ replies: [] }),
    });

    const resolveButton = container?.querySelector('button[aria-label="Kommentar als erledigt markieren"]');
    if (!(resolveButton instanceof HTMLButtonElement)) throw new Error("Resolve button not found");

    await act(async () => {
      resolveButton.click();
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenLastCalledWith({
      nodeId: "comment-1",
      data: expect.objectContaining({ resolved: true }),
    });
  });
});
