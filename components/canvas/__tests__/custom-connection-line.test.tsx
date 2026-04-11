// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ConnectionLineType,
  Position,
  type ConnectionLineComponentProps,
} from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CanvasConnectionMagnetismProvider,
} from "@/components/canvas/canvas-connection-magnetism-context";
import CustomConnectionLine from "@/components/canvas/custom-connection-line";
import { connectionLineAccentRgb } from "@/lib/canvas-utils";

const reactFlowStateRef: {
  current: {
    nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: object }>;
    edges: Array<{ id: string; source: string; target: string; targetHandle?: string | null }>;
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => { x: number; y: number };
  };
} = {
  current: {
    nodes: [],
    edges: [],
    screenToFlowPosition: ({ x, y }) => ({ x, y }),
  },
};

const connectionStateRef: {
  current: {
    fromHandle?: { type?: "source" | "target" };
  };
} = {
  current: {
    fromHandle: { type: "source" },
  },
};

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");

  return {
    ...actual,
    useReactFlow: () => ({
      getNodes: () => reactFlowStateRef.current.nodes,
      getEdges: () => reactFlowStateRef.current.edges,
      screenToFlowPosition: reactFlowStateRef.current.screenToFlowPosition,
    }),
    useConnection: () => connectionStateRef.current,
  };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseProps = {
  connectionLineType: ConnectionLineType.Straight,
  fromNode: {
    id: "source-node",
    type: "image",
  },
  fromHandle: {
    id: "image-out",
    type: "source",
    nodeId: "source-node",
    position: Position.Right,
    x: 0,
    y: 0,
    width: 12,
    height: 12,
  },
  fromX: 20,
  fromY: 40,
  toX: 290,
  toY: 210,
  fromPosition: Position.Right,
  toPosition: Position.Left,
  connectionStatus: "valid",
} as unknown as ConnectionLineComponentProps;

describe("CustomConnectionLine", () => {
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
    document
      .querySelectorAll("[data-testid='custom-line-magnet-handle']")
      .forEach((element) => element.remove());
    document.documentElement.classList.remove("dark");
    container = null;
    root = null;
  });

  function renderLine(args?: {
    withMagnetHandle?: boolean;
    connectionStatus?: ConnectionLineComponentProps["connectionStatus"];
    omitFromHandleType?: boolean;
    toX?: number;
    toY?: number;
    pointer?: { x: number; y: number };
  }) {
    document
      .querySelectorAll("[data-testid='custom-line-magnet-handle']")
      .forEach((element) => element.remove());

    reactFlowStateRef.current = {
      nodes: [
        { id: "source-node", type: "image", position: { x: 0, y: 0 }, data: {} },
        { id: "target-node", type: "render", position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      screenToFlowPosition: ({ x, y }) => ({ x, y }),
    };

    connectionStateRef.current = {
      fromHandle: { type: "source" },
    };

    if (args?.withMagnetHandle && container) {
      const handleEl = document.createElement("div");
      handleEl.setAttribute("data-testid", "custom-line-magnet-handle");
      handleEl.setAttribute("data-node-id", "target-node");
      handleEl.setAttribute("data-handle-id", "");
      handleEl.setAttribute("data-handle-type", "target");
      handleEl.getBoundingClientRect = () =>
        ({
          x: 294,
          y: 214,
          top: 214,
          left: 294,
          right: 306,
          bottom: 226,
          width: 12,
          height: 12,
          toJSON: () => ({}),
        }) as DOMRect;
      document.body.appendChild(handleEl);
    }

    act(() => {
        const lineProps = {
          ...baseProps,
          ...(args?.toX !== undefined ? { toX: args.toX } : null),
          ...(args?.toY !== undefined ? { toY: args.toY } : null),
          ...(args?.pointer ? { pointer: args.pointer } : null),
          fromHandle: {
            ...baseProps.fromHandle,
            ...(args?.omitFromHandleType ? { type: undefined } : null),
        },
      } as ConnectionLineComponentProps;

      root?.render(
        <CanvasConnectionMagnetismProvider>
          <svg>
            <CustomConnectionLine
              {...lineProps}
              connectionStatus={args?.connectionStatus ?? "valid"}
            />
          </svg>
        </CanvasConnectionMagnetismProvider>,
      );
    });
  }

  function getPath() {
    const path = container?.querySelector("path");
    if (!(path instanceof Element) || path.tagName.toLowerCase() !== "path") {
      throw new Error("Connection line path not rendered");
    }
    return path as SVGElement;
  }

  it("renders with the existing accent color when no magnet target is active", () => {
    renderLine();

    const [r, g, b] = connectionLineAccentRgb("image", "image-out");
    const path = getPath();

    expect(path.style.stroke).toBe(`rgb(${r}, ${g}, ${b})`);
    expect(path.getAttribute("d")).toContain("290");
    expect(path.getAttribute("d")).toContain("210");
  });

  it("snaps endpoint to active magnet target center", () => {
    renderLine({
      withMagnetHandle: true,
    });

    const path = getPath();
    expect(path.getAttribute("d")).toContain("300");
    expect(path.getAttribute("d")).toContain("220");
  });

  it("still resolves magnet target when fromHandle.type is missing", () => {
    renderLine({
      withMagnetHandle: true,
      omitFromHandleType: true,
    });

    const path = getPath();
    expect(path.getAttribute("d")).toContain("300");
    expect(path.getAttribute("d")).toContain("220");
  });

  it("strengthens stroke visual feedback while snapped", () => {
    renderLine();
    const idlePath = getPath();
    const idleStrokeWidth = idlePath.style.strokeWidth;
    const idleFilter = idlePath.style.filter;

    renderLine({
      withMagnetHandle: true,
    });
    const snappedPath = getPath();

    expect(snappedPath.style.strokeWidth).not.toBe(idleStrokeWidth);
    expect(snappedPath.style.filter).not.toBe(idleFilter);
  });

  it("ramps stroke feedback up as pointer gets closer before snap", () => {
    renderLine({
      withMagnetHandle: true,
      toX: 252,
      toY: 220,
      pointer: { x: 252, y: 220 },
    });
    const farNearPath = getPath();
    const farNearWidth = Number(farNearPath.style.strokeWidth || "0");

    renderLine({
      withMagnetHandle: true,
      toX: 266,
      toY: 220,
      pointer: { x: 266, y: 220 },
    });
    const closeNearPath = getPath();
    const closeNearWidth = Number(closeNearPath.style.strokeWidth || "0");

    expect(farNearWidth).toBeGreaterThan(2.5);
    expect(closeNearWidth).toBeGreaterThan(farNearWidth);
  });

  it("keeps invalid connection opacity behavior while snapped", () => {
    renderLine({
      withMagnetHandle: true,
      connectionStatus: "invalid",
    });

    const path = getPath();
    expect(path.style.opacity).toBe("0.45");
  });

  it("uses client pointer coordinates for magnet lookup and converts snapped endpoint back to flow space", () => {
    reactFlowStateRef.current.screenToFlowPosition = ({ x, y }) => ({
      x: Math.round(x / 10),
      y: Math.round(y / 10),
    });

    renderLine({
      withMagnetHandle: true,
      toX: 29,
      toY: 21,
      pointer: { x: 300, y: 220 },
    });

    const path = getPath();
    expect(path.getAttribute("d")).toContain("30");
    expect(path.getAttribute("d")).toContain("22");
  });

  it("adjusts glow filter between light and dark mode", () => {
    renderLine({
      withMagnetHandle: true,
      toX: 266,
      toY: 220,
      pointer: { x: 266, y: 220 },
    });
    const lightPath = getPath();
    const lightFilter = lightPath.style.filter;

    document.documentElement.classList.add("dark");

    renderLine({
      withMagnetHandle: true,
      toX: 266,
      toY: 220,
      pointer: { x: 266, y: 220 },
    });
    const darkPath = getPath();
    const darkFilter = darkPath.style.filter;

    expect(lightFilter).not.toBe("");
    expect(darkFilter).not.toBe("");
    expect(darkFilter).not.toBe(lightFilter);
  });
});
