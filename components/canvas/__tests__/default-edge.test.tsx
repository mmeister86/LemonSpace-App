// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Position } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DefaultEdge from "@/components/canvas/edges/default-edge";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>(
    "@xyflow/react",
  );

  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: ReactNode }) => (
      <foreignObject>{children}</foreignObject>
    ),
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type EdgeInsertAnchor = {
  edgeId: string;
  screenX: number;
  screenY: number;
};

type DefaultEdgeRenderProps = {
  id: string;
  edgeId?: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  isMenuOpen?: boolean;
  disabled?: boolean;
  onInsertClick?: (anchor: EdgeInsertAnchor) => void;
};

const DefaultEdgeComponent = DefaultEdge as unknown as (
  props: DefaultEdgeRenderProps,
) => React.JSX.Element;

const baseProps: DefaultEdgeRenderProps = {
  id: "edge-1",
  edgeId: "edge-1",
  source: "node-a",
  target: "node-b",
  sourceX: 40,
  sourceY: 80,
  targetX: 260,
  targetY: 80,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
};

function renderEdge(overrides: Partial<DefaultEdgeRenderProps> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <svg>
        <DefaultEdgeComponent {...baseProps} {...overrides} />
      </svg>,
    );
  });

  return { container, root };
}

function getInsertButton(container: HTMLDivElement): HTMLButtonElement {
  const button = container.querySelector(
    '[data-testid="default-edge-insert-button"]',
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Insert button was not rendered");
  }

  return button;
}

describe("DefaultEdge", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.restoreAllMocks();
  });

  it("keeps plus hidden initially and shows it on hover and when menu is open", () => {
    const onInsertClick = vi.fn<(anchor: EdgeInsertAnchor) => void>();
    ({ container, root } = renderEdge({ onInsertClick }));

    const insertButton = getInsertButton(container);
    expect(insertButton.getAttribute("data-visible")).toBe("false");

    const edgeContainer = container.querySelector('[data-testid="default-edge"]');
    if (!(edgeContainer instanceof Element)) {
      throw new Error("Edge container was not rendered");
    }

    act(() => {
      edgeContainer.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(insertButton.getAttribute("data-visible")).toBe("true");

    act(() => {
      root?.render(
        <svg>
          <DefaultEdgeComponent {...baseProps} onInsertClick={onInsertClick} isMenuOpen />
        </svg>,
      );
    });

    expect(insertButton.getAttribute("data-visible")).toBe("true");
  });

  it("calls onInsertClick with edge id and anchor screen coordinates", () => {
    const onInsertClick = vi.fn<(anchor: EdgeInsertAnchor) => void>();
    ({ container, root } = renderEdge({ onInsertClick, isMenuOpen: true }));

    const insertButton = getInsertButton(container);
    vi.spyOn(insertButton, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 200,
      left: 100,
      right: 160,
      bottom: 260,
      width: 60,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect);

    act(() => {
      insertButton.click();
    });

    expect(onInsertClick).toHaveBeenCalledWith({
      edgeId: "edge-1",
      screenX: 130,
      screenY: 230,
    });
  });

  it("suppresses insert interaction in disabled mode", () => {
    const onInsertClick = vi.fn<(anchor: EdgeInsertAnchor) => void>();
    ({ container, root } = renderEdge({ onInsertClick, isMenuOpen: true, disabled: true }));

    const insertButton = getInsertButton(container);
    expect(insertButton.disabled).toBe(true);
    expect(insertButton.getAttribute("data-visible")).toBe("false");

    act(() => {
      insertButton.click();
    });

    expect(onInsertClick).not.toHaveBeenCalled();
  });

  it("renders the edge path", () => {
    ({ container, root } = renderEdge());

    const edgePath = container.querySelector("path.react-flow__edge-path");
    expect(edgePath).not.toBeNull();
    expect(edgePath?.getAttribute("d")).toBeTruthy();
  });
});
