// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const defaultEdgeMock = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock("@/components/canvas/edges/default-edge", () => ({
  default: (props: Record<string, unknown>) => {
    defaultEdgeMock.props = props;
    return null;
  },
}));

import {
  CanvasEdgeTypesProvider,
  canvasEdgeTypes,
} from "@/components/canvas/use-canvas-edge-types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type EdgeHarnessProps = {
  edgeInsertMenuEdgeId: string | null;
  scissorsMode: boolean;
  onInsertClick: ReturnType<typeof vi.fn>;
  edgeId?: string;
};

function EdgeHarness({
  edgeInsertMenuEdgeId,
  scissorsMode,
  onInsertClick,
  edgeId = "edge-1",
}: EdgeHarnessProps) {
  const CanvasDefaultEdge = canvasEdgeTypes["canvas-default"] as React.ComponentType<{
    id: string;
  }>;

  return (
    <CanvasEdgeTypesProvider
      edgeInsertMenuEdgeId={edgeInsertMenuEdgeId}
      scissorsMode={scissorsMode}
      onInsertClick={onInsertClick}
    >
      <CanvasDefaultEdge id={edgeId} />
    </CanvasEdgeTypesProvider>
  );
}

describe("canvasEdgeTypes", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    defaultEdgeMock.props = null;
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("keeps the edgeTypes object stable while using latest UI state", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onInsertClickA = vi.fn();
    const onInsertClickB = vi.fn();
    const firstEdgeTypes = canvasEdgeTypes;

    act(() => {
      root?.render(
        <EdgeHarness
          edgeInsertMenuEdgeId={null}
          scissorsMode={false}
          onInsertClick={onInsertClickA}
        />,
      );
    });

    expect(defaultEdgeMock.props).toEqual(
      expect.objectContaining({
        edgeId: "edge-1",
        isMenuOpen: false,
        disabled: false,
        onInsertClick: onInsertClickA,
      }),
    );

    act(() => {
      root?.render(
        <EdgeHarness
          edgeInsertMenuEdgeId="edge-1"
          scissorsMode
          onInsertClick={onInsertClickB}
        />,
      );
    });

    expect(canvasEdgeTypes).toBe(firstEdgeTypes);
    expect(defaultEdgeMock.props).toEqual(
      expect.objectContaining({
        edgeId: "edge-1",
        isMenuOpen: true,
        disabled: true,
        onInsertClick: onInsertClickB,
      }),
    );
  });

  it("keeps the edgeTypes object stable after remounting under the same provider", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onInsertClick = vi.fn();
    const firstEdgeTypes = canvasEdgeTypes;

    act(() => {
      root?.render(
        <EdgeHarness
          edgeInsertMenuEdgeId={null}
          scissorsMode={false}
          onInsertClick={onInsertClick}
        />,
      );
    });

    act(() => {
      root?.render(null);
    });

    act(() => {
      root?.render(
        <EdgeHarness
          edgeInsertMenuEdgeId={null}
          scissorsMode={false}
          onInsertClick={onInsertClick}
        />,
      );
    });

    expect(canvasEdgeTypes).toBe(firstEdgeTypes);
  });
});
