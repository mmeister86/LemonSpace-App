// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

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
  useConnection: () => ({ inProgress: false }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    React.createElement("img", { alt, src }),
}));

const translations: Record<string, string> = {
  "agentOutputNode.defaultTitle": "Agent output",
  "agentOutputNode.plannedOutputDefaultTitle": "Planned output",
  "agentOutputNode.skeletonBadge": "Skeleton",
  "agentOutputNode.plannedOutputLabel": "Planned output",
  "agentOutputNode.channelLabel": "Channel",
  "agentOutputNode.artifactTypeLabel": "Artifact type",
  "agentOutputNode.sectionsLabel": "Sections",
  "agentOutputNode.metadataLabel": "Metadata",
  "agentOutputNode.qualityChecksLabel": "Quality checks",
  "agentOutputNode.detailsLabel": "Details",
  "agentOutputNode.previewLabel": "Preview",
  "agentOutputNode.previewFallback": "No preview available",
  "agentOutputNode.emptyValue": "-",
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
    resetLocalNodeStreamsForTests();
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

  it("renders structured output with deliverable first and default-collapsed details", async () => {
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
            artifactType: "caption-pack",
            previewText: "A short punchy caption with hashtags",
            sections: [
              { id: "hook", label: "Hook", content: "Launch day is here." },
              { id: "body", label: "Body", content: "Built for modern teams." },
            ],
            metadata: {
              objective: "Drive signups",
              tags: ["launch", "product"],
            },
            qualityChecks: ["channel-fit", "cta-present"],
            body: "Legacy body fallback",
            _status: "done",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Instagram Caption");
    expect(container.textContent).toContain("instagram-feed");
    expect(container.textContent).toContain("caption-pack");
    expect(container.textContent).toContain("Sections");
    expect(container.textContent).toContain("Hook");
    expect(container.textContent).toContain("Launch day is here.");
    expect(container.textContent).toContain("Metadata");
    expect(container.textContent).toContain("objective");
    expect(container.textContent).toContain("Drive signups");
    expect(container.textContent).toContain("Quality checks");
    expect(container.textContent).toContain("channel-fit");
    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("A short punchy caption with hashtags");
    expect(container.querySelector('[data-testid="agent-output-meta-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-output-sections"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-output-metadata"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-output-quality-checks"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-output-preview"]')).not.toBeNull();
    const details = container.querySelector('[data-testid="agent-output-details"]') as
      | HTMLDetailsElement
      | null;
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
  });

  it("renders local agent stream draft before persisted body", async () => {
    setLocalNodeStream("agent-output-streaming", {
      text: "Live agent draft",
      status: "streaming",
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-streaming",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Agent output",
            body: "Persisted body",
            _status: "executing",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Live agent draft");
    expect(container.textContent).not.toContain("Persisted body");
  });

  it("renders instagram post artifacts through the Instagram preview component", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-instagram",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Instagram launch post",
            channel: "Instagram Feed",
            artifactType: "instagram-post",
            instagramPost: {
              username: "lemonspace",
              location: "Berlin",
              imageUrl: "https://example.com/post.jpg",
              likesCount: 128,
              caption: "Launch your next visual campaign from one canvas.",
              hashtags: ["#lemonspace", "#creativeworkflow"],
            },
            metadata: {
              syntheticPreviewFields: ["likesCount", "location"],
            },
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const preview = container.querySelector('[data-testid="agent-output-instagram-preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("lemonspace");
    expect(preview?.textContent).toContain("Berlin");
    expect(preview?.textContent).toContain("128 Likes");
    expect(preview?.textContent).toContain("Launch your next visual campaign");
    expect(preview?.textContent).toContain("#lemonspace");
  });

  it("prioritizes social caption sections and moves secondary notes into details", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-caption-pack",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Caption Pack",
            channel: "instagram-feed",
            artifactType: "social-caption-pack",
            sections: [
              { id: "hook", label: "Hook", content: "Start strong" },
              { id: "format", label: "Format note", content: "Best as 4:5" },
              { id: "cta", label: "CTA", content: "Save this post" },
              { id: "hashtags", label: "Hashtags", content: "#buildinpublic #launch" },
              { id: "caption", label: "Caption", content: "Launch day is here" },
              { id: "assumptions", label: "Assumptions", content: "Audience is founder-led" },
            ],
            qualityChecks: ["channel-fit"],
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const primarySections = container.querySelector('[data-testid="agent-output-sections"]');
    expect(primarySections).not.toBeNull();
    const primaryText = primarySections?.textContent ?? "";
    expect(primaryText).toContain("Caption");
    expect(primaryText).toContain("Hashtags");
    expect(primaryText).toContain("CTA");
    expect(primaryText.indexOf("Caption")).toBeLessThan(primaryText.indexOf("Hashtags"));
    expect(primaryText.indexOf("Hashtags")).toBeLessThan(primaryText.indexOf("CTA"));
    expect(primaryText).not.toContain("Format note");
    expect(primaryText).not.toContain("Assumptions");

    const secondarySections = container.querySelector('[data-testid="agent-output-secondary-sections"]');
    expect(secondarySections).not.toBeNull();
    expect(secondarySections?.textContent).toContain("Format note");
    expect(secondarySections?.textContent).toContain("Assumptions");
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
            artifactType: "payload",
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

  it("falls back to legacy text body when structured fields are absent", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentOutputNode, {
          id: "agent-output-legacy",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent-output",
          data: {
            title: "Legacy output",
            channel: "linkedin",
            artifactType: "post",
            body: "Legacy body content",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.querySelector('[data-testid="agent-output-text-body"]')).not.toBeNull();
    expect(container.textContent).toContain("Legacy body content");
    expect(container.querySelector('[data-testid="agent-output-sections"]')).toBeNull();
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
            artifactType: "post",
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
            artifactType: "post",
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
