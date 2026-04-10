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
  "agentNode.templates.campaignDistributor.name": "Campaign Distributor",
  "agentNode.templates.campaignDistributor.description":
    "Develops and distributes LemonSpace campaign content across social media and messenger channels.",
  "agentNode.modelLabel": "Model",
  "agentNode.modelCreditMeta": "{model} - {credits} Cr",
  "agentNode.briefingLabel": "Briefing",
  "agentNode.briefingPlaceholder": "Describe the core task and desired output.",
  "agentNode.constraintsLabel": "Constraints",
  "agentNode.audienceLabel": "Audience",
  "agentNode.toneLabel": "Tone",
  "agentNode.targetChannelsLabel": "Target channels",
  "agentNode.targetChannelsPlaceholder": "LinkedIn, Instagram Feed",
  "agentNode.hardConstraintsLabel": "Hard constraints",
  "agentNode.hardConstraintsPlaceholder": "No emojis\nMax 120 words",
  "agentNode.runAgentButton": "Run agent",
  "agentNode.clarificationsLabel": "Clarifications",
  "agentNode.submitClarificationButton": "Submit clarification",
  "agentNode.templateReferenceLabel": "Template reference",
  "agentNode.templateReferenceChannelsLabel": "Channels",
  "agentNode.templateReferenceInputsLabel": "Inputs",
  "agentNode.templateReferenceOutputsLabel": "Outputs",
};

vi.mock("next-intl", () => ({
  useLocale: () => "de",
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

import AgentNode from "@/components/canvas/nodes/agent-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentNode", () => {
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

  it("renders campaign distributor metadata and source/target handles", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentNode, {
          id: "agent-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent",
          data: {
            templateId: "campaign-distributor",
            _status: "idle",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Campaign Distributor");
    expect(container.textContent).toContain("Briefing");
    expect(container.textContent).toContain("Constraints");
    expect(container.textContent).toContain("Template reference");
    expect(handleCalls.filter((call) => call.type === "target")).toHaveLength(1);
    expect(handleCalls.filter((call) => call.type === "source")).toHaveLength(1);
  });

  it("falls back to the default template when templateId is missing", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentNode, {
          id: "agent-2",
          selected: true,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent",
          data: {
            _status: "done",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Campaign Distributor");
  });
});
