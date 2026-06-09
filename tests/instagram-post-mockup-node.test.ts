// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasGraphProvider } from "@/components/canvas/canvas-graph-context";

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, id }: { type: string; id?: string }) =>
    React.createElement("div", {
      "data-handle-type": type,
      "data-handle-id": id,
    }),
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

import InstagramPostMockupNode from "@/components/canvas/nodes/instagram-post-mockup-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CanvasGraphProviderProps = React.ComponentProps<typeof CanvasGraphProvider>;
const TestCanvasGraphProvider = CanvasGraphProvider as React.ComponentType<
  Omit<CanvasGraphProviderProps, "children"> & { children?: React.ReactNode }
>;

function renderMockup(args: { caption: string; visualPrompt: string; root: Root }) {
  const nodes = [
    {
      id: "mockup-1",
      type: "instagram-post-mockup",
      data: {
        title: "Instagram post mockup",
        snapshot: {
          username: "lemonspace",
          caption: "Fallback caption",
          hashtags: ["#fallback"],
        },
      },
    },
    { id: "caption-1", type: "text", data: { content: args.caption } },
    { id: "hashtags-1", type: "text", data: { content: "#lemonspace #canvas" } },
    { id: "prompt-1", type: "prompt", data: { prompt: args.visualPrompt } },
    { id: "image-1", type: "image", data: { url: "https://example.com/post.png" } },
  ];
  const edges = [
    { source: "caption-1", target: "mockup-1", targetHandle: "caption-in" },
    { source: "hashtags-1", target: "mockup-1", targetHandle: "hashtags-in" },
    { source: "prompt-1", target: "mockup-1", targetHandle: "visual-prompt-in" },
    { source: "image-1", target: "mockup-1", targetHandle: "visual-in" },
  ];

  args.root.render(
    React.createElement(
      TestCanvasGraphProvider,
      {
        nodes,
        edges,
      },
      React.createElement(InstagramPostMockupNode, {
        id: "mockup-1",
        selected: false,
        dragging: false,
        draggable: true,
        selectable: true,
        deletable: true,
        zIndex: 1,
        isConnectable: true,
        type: "instagram-post-mockup",
        data: nodes[0].data,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      }),
    ),
  );
}

describe("InstagramPostMockupNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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

  it("updates the preview from edited connected field node data", async () => {
    if (!container || !root) {
      throw new Error("Missing test root");
    }
    const testRoot = root;

    await act(async () => {
      renderMockup({
        caption: "First editable caption",
        visualPrompt: "First visual prompt",
        root: testRoot,
      });
    });
    expect(container.textContent).toContain("First editable caption");
    expect(container.textContent).toContain("First visual prompt");
    expect(container.textContent).not.toContain("Updated editable caption");
    expect(container.textContent).not.toContain("Updated visual prompt");

    await act(async () => {
      renderMockup({
        caption: "Updated editable caption",
        visualPrompt: "Updated visual prompt",
        root: testRoot,
      });
    });
    expect(container.textContent).toContain("Updated editable caption");
    expect(container.textContent).toContain("Updated visual prompt");
    expect(container.textContent).not.toContain("First editable caption");
    expect(container.textContent).not.toContain("First visual prompt");
  });
});
