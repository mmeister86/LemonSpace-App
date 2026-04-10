// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleCalls: Array<{ type: string; id?: string }> = [];

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, id }: { type: string; id?: string }) => {
    handleCalls.push({ type, id });
    return React.createElement("div", {
      "data-handle-type": type,
      "data-handle-id": id,
    });
  },
  Position: { Left: "left", Right: "right" },
}));

const translations: Record<string, string> = {
  "agentOutputNode.defaultTitle": "Agent output",
  "agentOutputNode.plannedOutputDefaultTitle": "Planned output",
  "agentOutputNode.skeletonBadge": "Skeleton",
  "agentOutputNode.plannedOutputLabel": "Planned output",
  "agentOutputNode.channelLabel": "Channel",
  "agentOutputNode.typeLabel": "Type",
  "agentOutputNode.bodyLabel": "Body",
  "agentOutputNode.plannedContent": "Planned content",
};

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) =>
    (key: string, values?: Record<string, unknown>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      let text = translations[fullKey] ?? key;
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
}));

import AgentOutputNode from "@/components/canvas/nodes/agent-output-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentOutputNode", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    handleCalls.length = 0;
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

  it("renders title, channel, output type, and body", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Instagram Caption",
            channel: "instagram-feed",
            outputType: "caption",
            body: "A short punchy caption with hashtags",
            _status: "done",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Instagram Caption");
    expect(container.textContent).toContain("instagram-feed");
    expect(container.textContent).toContain("caption");
    expect(container.textContent).toContain("A short punchy caption with hashtags");
    expect(container.querySelector('[data-testid="agent-output-meta-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-output-text-body"]')).not.toBeNull();
  });

  it("renders parseable json body in a pretty-printed code block", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-4",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "JSON output",
            channel: "api",
            outputType: "payload",
            body: '{"post":"Hello","tags":["launch","news"]}',
            _status: "done",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const jsonBody = container.querySelector('[data-testid="agent-output-json-body"]');
    expect(jsonBody).not.toBeNull();
    expect(jsonBody?.textContent).toContain('"post": "Hello"');
    expect(jsonBody?.textContent).toContain('"tags": [');
    expect(container.querySelector('[data-testid="agent-output-text-body"]')).toBeNull();
  });

  it("renders input-only handle agent-output-in", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-2",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "LinkedIn Post",
            channel: "linkedin",
            outputType: "post",
            body: "Body",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(handleCalls).toEqual([{ type: "target", id: "agent-output-in" }]);
  });

  it("renders skeleton mode with counter and placeholder", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-3",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Planned headline",
            channel: "linkedin",
            outputType: "post",
            isSkeleton: true,
            stepIndex: 1,
            stepTotal: 4,
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Skeleton");
    expect(container.textContent).toContain("2/4");
    expect(container.querySelector('[data-testid="agent-output-skeleton-body"]')).not.toBeNull();
    expect(handleCalls).toEqual([{ type: "target", id: "agent-output-in" }]);
  });
});
