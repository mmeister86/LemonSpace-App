// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node as RFNode } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fitView: vi.fn(),
  getNodes: vi.fn(() => [] as RFNode[]),
  setNodes: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    fitView: mocks.fitView,
    getNodes: mocks.getNodes,
    setNodes: mocks.setNodes,
  }),
}));

vi.mock("@/components/node-search", () => ({
  NodeSearchDialog: ({
    getNodeLabel,
    onSearch,
    onSelectNode,
    open,
    placeholder,
    title,
  }: {
    getNodeLabel?: (node: RFNode) => string;
    onSearch?: (searchString: string) => RFNode[];
    onSelectNode?: (node: RFNode) => void;
    open?: boolean;
    placeholder?: string;
    title?: string;
  }) => {
    if (!open) return null;
    const results = onSearch?.("business") ?? [];
    return (
      <div role="dialog" aria-label={title}>
        <input placeholder={placeholder} />
        {results.map((result) => (
          <button key={result.id} type="button" onClick={() => onSelectNode?.(result)}>
            {getNodeLabel?.(result) ?? result.id}
          </button>
        ))}
      </div>
    );
  },
}));

import {
  CanvasNodeSearchButton,
  getCanvasNodeSearchText,
} from "@/components/canvas/canvas-node-search";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function node(input: {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}): RFNode {
  return {
    id: input.id,
    type: input.type,
    position: { x: 0, y: 0 },
    data: input.data ?? {},
  };
}

describe("getCanvasNodeSearchText", () => {
  it("includes LemonSpace template labels and custom labels", () => {
    const text = getCanvasNodeSearchText(
      node({
        id: "frame-1",
        type: "frame",
        data: { label: "Storyboard Hero" },
      }),
    );

    expect(text).toContain("frame");
    expect(text).toContain("Storyboard Hero");
  });

  it("includes file/name fields and prompt snippets", () => {
    const text = getCanvasNodeSearchText(
      node({
        id: "prompt-1",
        type: "prompt",
        data: {
          fileName: "IMG_4428.JPG",
          prompt: "Business casual portrait",
          instruction: "Keep the background unchanged",
        },
      }),
    );

    expect(text).toContain("IMG_4428.JPG");
    expect(text).toContain("Business casual portrait");
    expect(text).toContain("Keep the background unchanged");
  });

  it("falls back to node id when no readable data is present", () => {
    const text = getCanvasNodeSearchText(node({ id: "js123fallback", data: {} }));

    expect(text).toContain("js123fallback");
  });
});

describe("CanvasNodeSearchButton", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.fitView.mockClear();
    mocks.getNodes.mockReset();
    mocks.setNodes.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("searches LemonSpace node text and selects/fits the picked result", async () => {
    const nodes = [
      node({
        id: "prompt-1",
        type: "prompt",
        data: { prompt: "Business casual portrait" },
      }),
      node({ id: "image-1", type: "image", data: { fileName: "IMG_4428.JPG" } }),
    ];
    mocks.getNodes.mockReturnValue(nodes);

    await act(async () => {
      root?.render(<CanvasNodeSearchButton />);
    });

    const searchButton = container?.querySelector('button[aria-label="Knoten suchen"]');
    if (!(searchButton instanceof HTMLButtonElement)) {
      throw new Error("Search button not found");
    }

    await act(async () => {
      searchButton.click();
    });

    const resultButton = document.body.querySelector("button:not([aria-label])");
    if (!(resultButton instanceof HTMLButtonElement)) {
      throw new Error("Search result not found");
    }

    await act(async () => {
      resultButton.click();
    });

    const updater = mocks.setNodes.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    expect((updater as (value: RFNode[]) => RFNode[])(nodes)).toEqual([
      expect.objectContaining({ id: "prompt-1", selected: true }),
      expect.objectContaining({ id: "image-1", selected: false }),
    ]);
    expect(mocks.fitView).toHaveBeenCalledWith({ nodes: [nodes[0]], duration: 500 });
  });
});
