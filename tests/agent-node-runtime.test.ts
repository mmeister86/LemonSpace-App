// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueNodeDataUpdate: vi.fn(async () => undefined),
  runAgent: vi.fn(async () => ({ queued: true })),
  resumeAgent: vi.fn(async () => ({ queued: true })),
  toastWarning: vi.fn(),
  subscription: { tier: "starter" as const },
  isOffline: false,
}));

vi.mock("convex/react", () => ({
  useAction: (reference: unknown) => {
    if (reference === "agents.resumeAgent") {
      return mocks.resumeAgent;
    }
    return mocks.runAgent;
  },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    credits: {
      getSubscription: "credits.getSubscription",
    },
    agents: {
      runAgent: "agents.runAgent",
      resumeAgent: "agents.resumeAgent",
    },
  },
}));

vi.mock("@/hooks/use-auth-query", () => ({
  useAuthQuery: () => mocks.subscription,
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({
    queueNodeDataUpdate: mocks.queueNodeDataUpdate,
    status: { isOffline: mocks.isOffline, isSyncing: false, pendingCount: 0 },
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    warning: mocks.toastWarning,
  },
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
    React.createElement("label", { htmlFor }, children),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) =>
    React.createElement(
      "select",
      {
        "aria-label": "agent-model",
        value,
        onChange: (event: Event) => {
          onValueChange((event.target as HTMLSelectElement).value);
        },
      },
      children,
    ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => children,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement("option", { value }, children),
}));

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

import AgentNode from "@/components/canvas/nodes/agent-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AgentNode runtime", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    mocks.subscription = { tier: "starter" };
    mocks.isOffline = false;
    mocks.queueNodeDataUpdate.mockClear();
    mocks.runAgent.mockClear();
    mocks.resumeAgent.mockClear();
    mocks.toastWarning.mockClear();
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

  it("renders tier-aware model picker, updates node data, and triggers run/resume actions", async () => {
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
            canvasId: "canvas-1",
            templateId: "campaign-distributor",
            modelId: "openai/gpt-5.4-mini",
            clarificationQuestions: [
              { id: "audience", prompt: "Target audience?", required: true },
            ],
            clarificationAnswers: {},
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const modelSelect = container.querySelector('select[aria-label="agent-model"]');
    if (!(modelSelect instanceof HTMLSelectElement)) {
      throw new Error("Agent model select not found");
    }

    const modelOptionValues = Array.from(modelSelect.querySelectorAll("option")).map(
      (option) => (option as HTMLOptionElement).value,
    );
    expect(modelOptionValues).toContain("openai/gpt-5.4-mini");
    expect(modelOptionValues).not.toContain("openai/gpt-5.4-pro");

    expect(container.textContent).toContain("GPT-5.4 Mini");
    expect(container.textContent).toContain("15 Cr");
    expect(container.textContent).toContain("Channels");
    expect(container.textContent).toContain("Expected Inputs");
    expect(container.textContent).toContain("Expected Outputs");

    await act(async () => {
      modelSelect.value = "openai/gpt-5.4";
      modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "agent-1",
        data: expect.objectContaining({ modelId: "openai/gpt-5.4" }),
      }),
    );

    const clarificationInput = container.querySelector('input[name="clarification-audience"]');
    if (!(clarificationInput instanceof HTMLInputElement)) {
      throw new Error("Clarification input not found");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(clarificationInput, "SaaS founders");
      clarificationInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(mocks.queueNodeDataUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "agent-1",
        data: expect.objectContaining({
          clarificationAnswers: expect.objectContaining({ audience: "SaaS founders" }),
        }),
      }),
    );

    const runButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Run agent"),
    );
    if (!(runButton instanceof HTMLButtonElement)) {
      throw new Error("Run button not found");
    }

    await act(async () => {
      runButton.click();
    });

    expect(mocks.runAgent).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      nodeId: "agent-1",
      modelId: "openai/gpt-5.4",
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Submit clarification"),
    );
    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error("Submit clarification button not found");
    }

    await act(async () => {
      submitButton.click();
    });

    expect(mocks.resumeAgent).toHaveBeenCalledWith({
      canvasId: "canvas-1",
      nodeId: "agent-1",
      clarificationAnswers: { audience: "SaaS founders" },
    });
  });

  it("warns and skips actions when offline", async () => {
    mocks.isOffline = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentNode, {
          id: "agent-2",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent",
          data: {
            canvasId: "canvas-1",
            templateId: "campaign-distributor",
            modelId: "openai/gpt-5.4-mini",
            clarificationQuestions: [{ id: "q1", prompt: "Goal?", required: true }],
            clarificationAnswers: { q1: "More signups" },
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const runButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Run agent"),
    );
    const submitButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Submit clarification"),
    );

    if (!(runButton instanceof HTMLButtonElement) || !(submitButton instanceof HTMLButtonElement)) {
      throw new Error("Runtime action buttons not found");
    }

    await act(async () => {
      runButton.click();
      submitButton.click();
    });

    expect(mocks.toastWarning).toHaveBeenCalledTimes(2);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    expect(mocks.resumeAgent).not.toHaveBeenCalled();
  });

  it("disables run button and shows progress while executing", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AgentNode, {
          id: "agent-3",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "agent",
          data: {
            canvasId: "canvas-1",
            templateId: "campaign-distributor",
            modelId: "openai/gpt-5.4-mini",
            _status: "executing",
            _statusMessage: "Executing step 2/4",
          } as Record<string, unknown>,
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    const runButton = Array.from(container.querySelectorAll("button")).find((element) =>
      element.textContent?.includes("Run agent"),
    );
    if (!(runButton instanceof HTMLButtonElement)) {
      throw new Error("Run button not found");
    }

    expect(runButton.disabled).toBe(true);
    expect(container.textContent).toContain("Executing step 2/4");

    await act(async () => {
      runButton.click();
    });

    expect(mocks.runAgent).not.toHaveBeenCalled();
  });
});
