# AI SDK Local Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vercel AI SDK powered local streaming for AI text output and agent execution output while preserving Convex as the durable source of truth.

**Architecture:** Next.js route handlers stream tokens to the active browser with `streamText`. Convex public actions own lifecycle operations: validate ownership, reserve credits, mark nodes executing, commit final output, release on failure, and publish agent step/status updates. React nodes read local stream drafts from a small client-only store and fall back to persisted Convex data.

**Tech Stack:** Next.js 16 App Router route handlers, Vercel AI SDK `ai`, `@openrouter/ai-sdk-provider`, Convex actions/mutations, React 19, Vitest.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-05-04-ai-sdk-local-streaming-design.md`
- Backlog: `TASK-043 - Add AI SDK streaming to text and agent nodes`
- AI SDK docs resolved through Context7: `/vercel/ai`
- OpenRouter provider docs resolved through Context7: `/openrouterteam/ai-sdk-provider`
- Next route handler docs: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

## File Structure

- Modify: `package.json` and lockfile to add `ai` and `@openrouter/ai-sdk-provider`.
- Create: `lib/ai-stream/text-messages.ts` for shared text prompt construction.
- Create: `lib/ai-stream/local-node-streams.ts` for client-local draft stream state.
- Create: `lib/ai-stream/openrouter-provider.ts` for server-only AI SDK provider construction.
- Create: `lib/ai-stream/stream-protocol.ts` for request/response payload validation helpers.
- Create: `app/api/ai-stream/text/route.ts` for text node streaming.
- Modify: `convex/ai_text_pipeline.ts` to expose streaming lifecycle actions.
- Modify: `convex/ai.ts` to export streaming lifecycle actions.
- Modify: `components/canvas/nodes/ai-text-node.tsx` to call the stream route.
- Modify: `components/canvas/nodes/ai-text-output-node.tsx` to render local drafts.
- Modify: `components/canvas/nodes/agent-node.tsx` after text streaming is green, adding the streaming execution entry point.
- Modify: `components/canvas/nodes/agent-output-node.tsx` to render local agent draft text while a step is streaming.
- Add tests under `tests/lib`, `tests/convex`, and existing node component tests.

---

### Task 1: Add Dependencies and Shared Text Prompt Builder

**Files:**
- Modify: `package.json`
- Create: `lib/ai-stream/text-messages.ts`
- Test: `tests/lib/ai-stream-text-messages.test.ts`

- [ ] **Step 1: Install AI SDK packages**

Run:

```bash
npm install ai @openrouter/ai-sdk-provider
```

Expected: `package.json` contains `ai` and `@openrouter/ai-sdk-provider`, and the lockfile is updated.

- [ ] **Step 2: Write the failing prompt builder test**

Create `tests/lib/ai-stream-text-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildAiTextStreamMessages, trimOptionalText } from "@/lib/ai-stream/text-messages";

describe("AI text stream messages", () => {
  it("trims optional text and omits empty values", () => {
    expect(trimOptionalText("  Rewrite this  ")).toBe("Rewrite this");
    expect(trimOptionalText("   ")).toBeUndefined();
    expect(trimOptionalText(undefined)).toBeUndefined();
  });

  it("builds plain text streaming messages without JSON-only instructions", () => {
    const messages = buildAiTextStreamMessages({
      instruction: "  Make this clearer  ",
      inputText: "  Raw draft  ",
    });

    expect(messages).toEqual([
      {
        role: "system",
        content: expect.stringContaining("Write only the final text content."),
      },
      {
        role: "user",
        content: expect.stringContaining("Task:\nMake this clearer"),
      },
    ]);
    expect(messages[0]!.content).not.toContain("Return JSON");
    expect(messages[1]!.content).toContain("Text or draft:\nRaw draft");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm test tests/lib/ai-stream-text-messages.test.ts
```

Expected: FAIL because `@/lib/ai-stream/text-messages` does not exist.

- [ ] **Step 4: Implement the shared prompt builder**

Create `lib/ai-stream/text-messages.ts`:

```ts
export type AiStreamMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function trimOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildAiTextStreamMessages(args: {
  instruction?: string;
  inputText?: string;
}): AiStreamMessage[] {
  const instruction = trimOptionalText(args.instruction);
  const inputText = trimOptionalText(args.inputText);
  const hasSourceMaterial = Boolean(inputText);
  const requestedTask = instruction
    ? instruction
    : hasSourceMaterial
      ? "Improve the text for clarity, structure, flow, and correctness while preserving the intended meaning."
      : "Create a fresh text from the available context.";

  return [
    {
      role: "system",
      content: [
        "You are the LemonSpace AI text node.",
        "Write only the final text content.",
        "Do not add explanations, headings, bullet-point rationales, or markdown code fences unless the user explicitly asks for them.",
        "Keep the dominant language of the provided context and instructions.",
        hasSourceMaterial
          ? "If source material is provided, transform or improve it according to the instruction."
          : "If no source material is provided, create a new text from the instruction.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Task:\n${requestedTask}`,
        inputText
          ? `Text or draft:\n${inputText}`
          : "No source material was provided. Generate the requested text from scratch.",
      ].join("\n\n"),
    },
  ];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
npm test tests/lib/ai-stream-text-messages.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/ai-stream/text-messages.ts tests/lib/ai-stream-text-messages.test.ts
git commit -m "feat: add ai stream text prompt builder"
```

---

### Task 2: Add Client-Local Stream Draft Store

**Files:**
- Create: `lib/ai-stream/local-node-streams.ts`
- Test: `tests/lib/local-node-streams.test.ts`

- [ ] **Step 1: Write the failing local stream store test**

Create `tests/lib/local-node-streams.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendLocalNodeStreamChunk,
  clearLocalNodeStream,
  getLocalNodeStreamSnapshot,
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

describe("local node streams", () => {
  beforeEach(() => {
    resetLocalNodeStreamsForTests();
  });

  it("appends chunks and notifies subscribers without touching persisted data", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLocalNodeStream("node-1", listener);

    setLocalNodeStream("node-1", { text: "", status: "streaming" });
    appendLocalNodeStreamChunk("node-1", "Hello");
    appendLocalNodeStreamChunk("node-1", " world");

    expect(getLocalNodeStreamSnapshot("node-1")).toEqual({
      text: "Hello world",
      status: "streaming",
    });
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    appendLocalNodeStreamChunk("node-1", "!");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("clears local state after final persistence", () => {
    setLocalNodeStream("node-1", { text: "Draft", status: "streaming" });
    clearLocalNodeStream("node-1");
    expect(getLocalNodeStreamSnapshot("node-1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test tests/lib/local-node-streams.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the local stream store**

Create `lib/ai-stream/local-node-streams.ts`:

```ts
export type LocalNodeStreamStatus = "streaming" | "error";

export type LocalNodeStreamSnapshot = {
  text: string;
  status: LocalNodeStreamStatus;
  error?: string;
};

const streams = new Map<string, LocalNodeStreamSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function emit(nodeId: string): void {
  const nodeListeners = listeners.get(nodeId);
  if (!nodeListeners) return;
  for (const listener of nodeListeners) {
    listener();
  }
}

export function subscribeToLocalNodeStream(nodeId: string, listener: () => void): () => void {
  const nodeListeners = listeners.get(nodeId) ?? new Set<() => void>();
  nodeListeners.add(listener);
  listeners.set(nodeId, nodeListeners);

  return () => {
    nodeListeners.delete(listener);
    if (nodeListeners.size === 0) {
      listeners.delete(nodeId);
    }
  };
}

export function getLocalNodeStreamSnapshot(
  nodeId: string,
): LocalNodeStreamSnapshot | undefined {
  return streams.get(nodeId);
}

export function setLocalNodeStream(
  nodeId: string,
  snapshot: LocalNodeStreamSnapshot,
): void {
  streams.set(nodeId, snapshot);
  emit(nodeId);
}

export function appendLocalNodeStreamChunk(nodeId: string, chunk: string): void {
  const current = streams.get(nodeId) ?? { text: "", status: "streaming" as const };
  streams.set(nodeId, {
    ...current,
    text: `${current.text}${chunk}`,
    status: "streaming",
  });
  emit(nodeId);
}

export function markLocalNodeStreamError(nodeId: string, error: string): void {
  const current = streams.get(nodeId) ?? { text: "", status: "error" as const };
  streams.set(nodeId, {
    ...current,
    status: "error",
    error,
  });
  emit(nodeId);
}

export function clearLocalNodeStream(nodeId: string): void {
  streams.delete(nodeId);
  emit(nodeId);
}

export function resetLocalNodeStreamsForTests(): void {
  streams.clear();
  listeners.clear();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test tests/lib/local-node-streams.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ai-stream/local-node-streams.ts tests/lib/local-node-streams.test.ts
git commit -m "feat: add local node stream store"
```

---

### Task 3: Add Convex Text Streaming Lifecycle Actions

**Files:**
- Modify: `convex/ai_text_pipeline.ts`
- Modify: `convex/ai.ts`
- Test: `tests/convex/ai-pipeline-modules.test.ts`

- [ ] **Step 1: Write the failing module boundary test**

Modify `tests/convex/ai-pipeline-modules.test.ts` by adding these assertions inside the existing test:

```ts
expect(textSource).toContain("definePrepareTextStream");
expect(textSource).toContain("defineFinalizeTextStreamSuccess");
expect(textSource).toContain("defineFinalizeTextStreamFailure");
expect(aiSource).toContain("prepareTextStream");
expect(aiSource).toContain("finalizeTextStreamSuccess");
expect(aiSource).toContain("finalizeTextStreamFailure");
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test tests/convex/ai-pipeline-modules.test.ts
```

Expected: FAIL because the streaming lifecycle exports are missing.

- [ ] **Step 3: Add public streaming lifecycle action factories**

In `convex/ai_text_pipeline.ts`, add three factory exports after `defineGenerateText`. Keep the existing non-streaming action unchanged.

Add:

```ts
export function definePrepareTextStream(register: typeof action) {
  return register({
    args: {
      canvasId: v.id("canvases"),
      sourceNodeId: v.id("nodes"),
      outputNodeId: v.id("nodes"),
      modelId: v.string(),
      instruction: v.optional(v.string()),
      inputText: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{
      outputNodeId: Id<"nodes">;
      modelId: string;
      instruction?: string;
      inputText?: string;
      reservationId?: Id<"creditTransactions">;
      shouldDecrementConcurrency: boolean;
      userId: string;
      creditCost: number;
    }> => {
      const canvas = await ctx.runQuery(api.canvases.get, { canvasId: args.canvasId });
      if (!canvas) throw new Error("Canvas not found");

      const sourceNode = await ctx.runQuery(
        api.nodes.get as FunctionReference<"query", "public">,
        { nodeId: args.sourceNodeId, includeStorageUrl: false },
      );
      if (!sourceNode) throw new Error("Source node not found");
      assertNodeBelongsToCanvasOrThrow(sourceNode, args.canvasId);
      if (sourceNode.type !== "ai-text") throw new Error("Source node must be an AI text node");

      const outputNode = await ctx.runQuery(
        api.nodes.get as FunctionReference<"query", "public">,
        { nodeId: args.outputNodeId, includeStorageUrl: false },
      );
      if (!outputNode) throw new Error("Output node not found");
      assertNodeBelongsToCanvasOrThrow(outputNode, args.canvasId);
      if (outputNode.type !== "ai-text-output") {
        throw new Error("Output node must be an AI text output node");
      }

      const instruction = trimOptionalText(args.instruction);
      const inputText = trimOptionalText(args.inputText);
      if (!instruction && !inputText) {
        throw new Error("AI text generation needs instructions or input text");
      }

      const selectedModel = getAiTextModel(args.modelId);
      if (!selectedModel) throw new Error(`Unknown AI text model: ${args.modelId}`);

      const subscription = await ctx.runQuery(api.credits.getSubscription, {});
      const userTier = normalizePublicTier(subscription?.tier);
      if (!isAiTextModelAvailableForTier(userTier, selectedModel.id)) {
        throw new Error(`Model ${selectedModel.id} requires ${selectedModel.minTier} tier`);
      }

      const { reservationId, shouldDecrementConcurrency } = await startPublicJobCreditFlow(ctx, {
        estimatedCost: selectedModel.creditCost,
        description: `KI-Text - ${selectedModel.label}`,
        model: selectedModel.id,
        nodeId: args.outputNodeId,
        canvasId: args.canvasId,
        provider: "openrouter",
      });

      try {
        await ctx.runMutation(internal.ai.markNodeExecuting, { nodeId: args.outputNodeId });
      } catch (error) {
        await releasePublicReservationBestEffort(ctx, reservationId, "ai");
        await decrementConcurrencyIfNeeded(ctx, shouldDecrementConcurrency, canvas.ownerId);
        throw error;
      }

      return {
        outputNodeId: args.outputNodeId,
        modelId: selectedModel.id,
        instruction,
        inputText,
        reservationId: reservationId ?? undefined,
        shouldDecrementConcurrency,
        userId: canvas.ownerId,
        creditCost: selectedModel.creditCost,
      };
    },
  });
}
```

Add success and failure actions:

```ts
export function defineFinalizeTextStreamSuccess(register: typeof action) {
  return register({
    args: {
      outputNodeId: v.id("nodes"),
      modelId: v.string(),
      instruction: v.optional(v.string()),
      inputText: v.optional(v.string()),
      outputText: v.string(),
      reservationId: v.optional(v.id("creditTransactions")),
      shouldDecrementConcurrency: v.boolean(),
      userId: v.string(),
    },
    handler: async (ctx, args) => {
      const outputText = trimOptionalText(args.outputText);
      if (!outputText) throw new Error("AI text generation returned an empty result");

      const { creditCost } = await ctx.runMutation(internal.ai.finalizeTextSuccess, {
        nodeId: args.outputNodeId,
        modelId: args.modelId,
        instruction: args.instruction,
        inputText: args.inputText,
        outputText,
      });
      await commitInternalReservationIfNeeded(ctx, args.reservationId, creditCost);
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
      return { ok: true as const };
    },
  });
}

export function defineFinalizeTextStreamFailure(register: typeof action) {
  return register({
    args: {
      outputNodeId: v.id("nodes"),
      statusMessage: v.string(),
      reservationId: v.optional(v.id("creditTransactions")),
      shouldDecrementConcurrency: v.boolean(),
      userId: v.string(),
    },
    handler: async (ctx, args) => {
      await releasePublicReservationBestEffort(ctx, args.reservationId, "ai");
      await ctx.runMutation(internal.ai.finalizeTextFailure, {
        nodeId: args.outputNodeId,
        statusMessage: args.statusMessage,
      });
      await decrementConcurrencyIfNeeded(ctx, args.shouldDecrementConcurrency, args.userId);
      return { ok: true as const };
    },
  });
}
```

- [ ] **Step 4: Export lifecycle actions from `convex/ai.ts`**

Update imports from `./ai_text_pipeline`:

```ts
import {
  defineFinalizeTextFailure,
  defineFinalizeTextStreamFailure,
  defineFinalizeTextStreamSuccess,
  defineFinalizeTextSuccess,
  defineGenerateText,
  definePrepareTextStream,
  defineProcessTextGeneration,
} from "./ai_text_pipeline";
```

Add exports near the existing text exports:

```ts
export const prepareTextStream = definePrepareTextStream(action);
export const finalizeTextStreamSuccess = defineFinalizeTextStreamSuccess(action);
export const finalizeTextStreamFailure = defineFinalizeTextStreamFailure(action);
```

- [ ] **Step 5: Run the module boundary test**

Run:

```bash
npm test tests/convex/ai-pipeline-modules.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/ai_text_pipeline.ts convex/ai.ts tests/convex/ai-pipeline-modules.test.ts
git commit -m "feat: add convex text stream lifecycle"
```

---

### Task 4: Add Text Streaming Route

**Files:**
- Create: `lib/ai-stream/openrouter-provider.ts`
- Create: `lib/ai-stream/stream-protocol.ts`
- Create: `app/api/ai-stream/text/route.ts`
- Test: `tests/lib/ai-stream-protocol.test.ts`

- [ ] **Step 1: Write the failing protocol validation test**

Create `tests/lib/ai-stream-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseTextStreamRequest } from "@/lib/ai-stream/stream-protocol";

describe("AI stream protocol", () => {
  it("accepts a valid text stream request", () => {
    expect(
      parseTextStreamRequest({
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        instruction: "Improve it",
        inputText: "Draft",
      }),
    ).toEqual({
      ok: true,
      value: {
        canvasId: "canvas-1",
        sourceNodeId: "source-1",
        outputNodeId: "output-1",
        modelId: "openai/gpt-5.4-mini",
        instruction: "Improve it",
        inputText: "Draft",
      },
    });
  });

  it("rejects missing required identifiers", () => {
    expect(parseTextStreamRequest({ modelId: "openai/gpt-5.4-mini" })).toEqual({
      ok: false,
      status: 400,
      message: "Invalid text stream request",
    });
  });
});
```

- [ ] **Step 2: Run the protocol test to verify it fails**

Run:

```bash
npm test tests/lib/ai-stream-protocol.test.ts
```

Expected: FAIL because `stream-protocol` does not exist.

- [ ] **Step 3: Implement request validation**

Create `lib/ai-stream/stream-protocol.ts`:

```ts
export type TextStreamRequest = {
  canvasId: string;
  sourceNodeId: string;
  outputNodeId: string;
  modelId: string;
  instruction?: string;
  inputText?: string;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function parseTextStreamRequest(value: unknown):
  | { ok: true; value: TextStreamRequest }
  | { ok: false; status: 400; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, status: 400, message: "Invalid text stream request" };
  }

  const record = value as Record<string, unknown>;
  const canvasId = optionalString(record.canvasId);
  const sourceNodeId = optionalString(record.sourceNodeId);
  const outputNodeId = optionalString(record.outputNodeId);
  const modelId = optionalString(record.modelId);

  if (!canvasId || !sourceNodeId || !outputNodeId || !modelId) {
    return { ok: false, status: 400, message: "Invalid text stream request" };
  }

  return {
    ok: true,
    value: {
      canvasId,
      sourceNodeId,
      outputNodeId,
      modelId,
      instruction: optionalString(record.instruction),
      inputText: optionalString(record.inputText),
    },
  };
}
```

- [ ] **Step 4: Implement server-only OpenRouter provider helper**

Create `lib/ai-stream/openrouter-provider.ts`:

```ts
import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export function getOpenRouterModel(modelId: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: "LemonSpace",
    appUrl: "https://app.lemonspace.io",
    compatibility: "compatible",
  });

  return openrouter(modelId);
}
```

- [ ] **Step 5: Implement the streaming route**

Create `app/api/ai-stream/text/route.ts`:

```ts
import { streamText } from "ai";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthAction } from "@/lib/auth-server";
import { getOpenRouterModel } from "@/lib/ai-stream/openrouter-provider";
import { buildAiTextStreamMessages } from "@/lib/ai-stream/text-messages";
import { parseTextStreamRequest } from "@/lib/ai-stream/stream-protocol";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const parsed = parseTextStreamRequest(json);
  if (!parsed.ok) {
    return new NextResponse(parsed.message, { status: parsed.status });
  }

  const prepared = await fetchAuthAction(api.ai.prepareTextStream, {
    canvasId: parsed.value.canvasId as Id<"canvases">,
    sourceNodeId: parsed.value.sourceNodeId as Id<"nodes">,
    outputNodeId: parsed.value.outputNodeId as Id<"nodes">,
    modelId: parsed.value.modelId,
    instruction: parsed.value.instruction,
    inputText: parsed.value.inputText,
  });

  let finalized = false;
  async function finalizeFailure(statusMessage: string): Promise<void> {
    if (finalized) return;
    finalized = true;
    await fetchAuthAction(api.ai.finalizeTextStreamFailure, {
      outputNodeId: prepared.outputNodeId,
      statusMessage,
      reservationId: prepared.reservationId,
      shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
      userId: prepared.userId,
    });
  }

  try {
    const result = streamText({
      model: getOpenRouterModel(prepared.modelId),
      messages: buildAiTextStreamMessages({
        instruction: prepared.instruction,
        inputText: prepared.inputText,
      }),
      onFinish: async ({ text }) => {
        finalized = true;
        await fetchAuthAction(api.ai.finalizeTextStreamSuccess, {
          outputNodeId: prepared.outputNodeId,
          modelId: prepared.modelId,
          instruction: prepared.instruction,
          inputText: prepared.inputText,
          outputText: text,
          reservationId: prepared.reservationId,
          shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
          userId: prepared.userId,
        });
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI text stream failed";
    await finalizeFailure(message);
    return new NextResponse(message, { status: 500 });
  }
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test tests/lib/ai-stream-protocol.test.ts tests/lib/ai-stream-text-messages.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/ai-stream/openrouter-provider.ts lib/ai-stream/stream-protocol.ts app/api/ai-stream/text/route.ts tests/lib/ai-stream-protocol.test.ts
git commit -m "feat: add ai text streaming route"
```

---

### Task 5: Wire AI Text Node UI to Local Streaming

**Files:**
- Modify: `components/canvas/nodes/ai-text-node.tsx`
- Modify: `components/canvas/nodes/ai-text-output-node.tsx`
- Test: `tests/ai-text-node.test.ts`
- Test: add `tests/ai-text-output-node.test.ts` if none exists for the output node.

- [ ] **Step 1: Add a failing output node draft rendering test**

Create `tests/ai-text-output-node.test.ts`:

```ts
// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

vi.mock("@/components/canvas/nodes/base-node-wrapper", () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));

vi.mock("@/components/canvas/canvas-sync-context", () => ({
  useCanvasSync: () => ({ status: { isOffline: false } }),
}));

vi.mock("convex/react", () => ({ useAction: () => vi.fn() }));
vi.mock("@/convex/_generated/api", () => ({ api: { ai: { generateText: "ai.generateText" } } }));
vi.mock("@/lib/toast", () => ({ toast: { warning: vi.fn(), promise: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ai-errors", () => ({ classifyError: () => ({ rawMessage: undefined }) }));
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
  useConnection: () => ({ inProgress: false }),
  useReactFlow: () => ({ getEdges: () => [], getNode: () => null }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import AiTextOutputNode from "@/components/canvas/nodes/ai-text-output-node";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AiTextOutputNode streaming draft", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetLocalNodeStreamsForTests();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it("renders local stream draft before persisted output text", async () => {
    setLocalNodeStream("output-1", { text: "Streaming draft", status: "streaming" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(AiTextOutputNode, {
          id: "output-1",
          selected: false,
          dragging: false,
          draggable: true,
          selectable: true,
          deletable: true,
          zIndex: 1,
          isConnectable: true,
          type: "ai-text-output",
          data: { outputText: "Persisted text", _status: "executing" },
          positionAbsoluteX: 0,
          positionAbsoluteY: 0,
        }),
      );
    });

    expect(container.textContent).toContain("Streaming draft");
    expect(container.textContent).not.toContain("Persisted text");
  });
});
```

- [ ] **Step 2: Run the output node test to verify it fails**

Run:

```bash
npm test tests/ai-text-output-node.test.ts
```

Expected: FAIL because `AiTextOutputNode` does not subscribe to local stream drafts.

- [ ] **Step 3: Update `AiTextOutputNode` to read local stream state**

In `components/canvas/nodes/ai-text-output-node.tsx`, import `useSyncExternalStore` and local stream helpers:

```ts
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getLocalNodeStreamSnapshot,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";
```

Inside the component, add:

```ts
const localStream = useSyncExternalStore(
  (listener) => subscribeToLocalNodeStream(id, listener),
  () => getLocalNodeStreamSnapshot(id),
  () => undefined,
);
```

Replace the `outputText` assignment with:

```ts
const persistedOutputText =
  typeof nodeData.outputText === "string" ? nodeData.outputText.trim() : "";
const outputText = localStream?.text.trim() || persistedOutputText;
```

Update `isLoading` so local streaming keeps the body visible:

```ts
const isLoading =
  !localStream &&
  (status === "executing" || status === "analyzing" || status === "clarifying" || isRetrying);
```

- [ ] **Step 4: Update `AiTextNode` to call the stream route**

In `components/canvas/nodes/ai-text-node.tsx`, import stream helpers:

```ts
import {
  appendLocalNodeStreamChunk,
  clearLocalNodeStream,
  markLocalNodeStreamError,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";
```

Add a helper inside the component file:

```ts
async function readTextStream(response: Response, outputNodeId: string): Promise<void> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (!response.body) {
    throw new Error("AI text stream response had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    appendLocalNodeStreamChunk(outputNodeId, decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) appendLocalNodeStreamChunk(outputNodeId, tail);
}
```

Replace the `generateText(...)` call in `handleGenerate` with:

```ts
setLocalNodeStream(outputNodeId, { text: "", status: "streaming" });
await toast.promise(
  fetch("/api/ai-stream/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      canvasId,
      sourceNodeId: id,
      outputNodeId,
      modelId: resolvedModelId,
      instruction: instruction.trim() || undefined,
      inputText: effectiveInputText || undefined,
    }),
  }).then((response) => readTextStream(response, outputNodeId)),
  {
    loading: t("generating"),
    success: t("generationQueuedTitle"),
    error: t("generationFailed"),
    description: { success: t("generationQueuedDescription") },
  },
);
clearLocalNodeStream(outputNodeId);
```

In the `catch`, add before `setLocalError(...)`:

```ts
if (typeof outputNodeId === "string") {
  markLocalNodeStreamError(outputNodeId, classified.rawMessage ?? t("generationFailed"));
}
```

Use a `let outputNodeId: Id<"nodes"> | null = null;` declared before `try` so the catch can see it.

- [ ] **Step 5: Keep retry on old non-streaming path or migrate it**

For the first pass, keep `AiTextOutputNode` retry using `api.ai.generateText`. This preserves a fallback path and keeps retry behavior durable even if the original active stream was lost.

- [ ] **Step 6: Run UI tests**

Run:

```bash
npm test tests/ai-text-node.test.ts tests/ai-text-output-node.test.ts tests/lib/local-node-streams.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/canvas/nodes/ai-text-node.tsx components/canvas/nodes/ai-text-output-node.tsx tests/ai-text-output-node.test.ts
git commit -m "feat: stream ai text output locally"
```

---

### Task 6: Add Agent Output Local Draft Rendering

**Files:**
- Modify: `components/canvas/nodes/agent-output-node.tsx`
- Test: `tests/agent-output-node.test.ts`

- [ ] **Step 1: Add failing agent-output draft test**

Append this test to `tests/agent-output-node.test.ts`:

```ts
import {
  resetLocalNodeStreamsForTests,
  setLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";

it("renders local agent stream draft before persisted body", async () => {
  resetLocalNodeStreamsForTests();
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test tests/agent-output-node.test.ts
```

Expected: FAIL because `AgentOutputNode` does not read local stream drafts.

- [ ] **Step 3: Update `AgentOutputNode` to prefer local stream drafts**

In `components/canvas/nodes/agent-output-node.tsx`, import:

```ts
import { useSyncExternalStore } from "react";
import {
  getLocalNodeStreamSnapshot,
  subscribeToLocalNodeStream,
} from "@/lib/ai-stream/local-node-streams";
```

Inside the component:

```ts
const localStream = useSyncExternalStore(
  (listener) => subscribeToLocalNodeStream(id, listener),
  () => getLocalNodeStreamSnapshot(id),
  () => undefined,
);
```

Before the structured output rendering branch, render a streaming body when present:

```tsx
{localStream?.text ? (
  <section data-testid="agent-output-stream-draft" className="space-y-1">
    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
      {localStream.text}
    </p>
  </section>
) : null}
```

Guard the persisted body/structured sections so they render only when `!localStream?.text`.

- [ ] **Step 4: Run the agent output test**

Run:

```bash
npm test tests/agent-output-node.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/canvas/nodes/agent-output-node.tsx tests/agent-output-node.test.ts
git commit -m "feat: render local agent output streams"
```

---

### Task 7: Stream Agent Execute Output After Text Path Is Stable

**Files:**
- Modify: `convex/agents.ts`
- Create: `app/api/ai-stream/agent/route.ts`
- Modify: `components/canvas/nodes/agent-node.tsx`
- Test: `tests/agent-node-runtime.test.ts`
- Test: `tests/lib/agent-stream-protocol.test.ts`

- [ ] **Step 1: Keep scope narrow**

Implement agent streaming only for the execution phase that creates visible `agent-output` text. Do not stream analyze or clarification questions. Existing Convex status/step updates stay in place.

- [ ] **Step 2: Add protocol test for agent route payload**

Create `tests/lib/agent-stream-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseAgentStreamRequest } from "@/lib/ai-stream/stream-protocol";

describe("agent stream protocol", () => {
  it("accepts an agent stream request", () => {
    expect(
      parseAgentStreamRequest({
        canvasId: "canvas-1",
        nodeId: "agent-1",
        modelId: "openai/gpt-5.4-mini",
        locale: "de",
      }),
    ).toEqual({
      ok: true,
      value: {
        canvasId: "canvas-1",
        nodeId: "agent-1",
        modelId: "openai/gpt-5.4-mini",
        locale: "de",
      },
    });
  });
});
```

- [ ] **Step 3: Extend `stream-protocol.ts`**

Add:

```ts
export type AgentStreamRequest = {
  canvasId: string;
  nodeId: string;
  modelId: string;
  locale: "de" | "en";
};

export function parseAgentStreamRequest(value: unknown):
  | { ok: true; value: AgentStreamRequest }
  | { ok: false; status: 400; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, status: 400, message: "Invalid agent stream request" };
  }
  const record = value as Record<string, unknown>;
  const canvasId = optionalString(record.canvasId);
  const nodeId = optionalString(record.nodeId);
  const modelId = optionalString(record.modelId);
  const locale = record.locale === "en" ? "en" : record.locale === "de" ? "de" : undefined;
  if (!canvasId || !nodeId || !modelId || !locale) {
    return { ok: false, status: 400, message: "Invalid agent stream request" };
  }
  return { ok: true, value: { canvasId, nodeId, modelId, locale } };
}
```

- [ ] **Step 4: Extract shared agent run preparation helpers**

In `convex/agents.ts`, extract the first half of `runAgent` into a helper named `prepareAgentRunOrThrow`. The helper performs the existing canvas lookup, agent node lookup, ownership check, definition lookup, model lookup, tier check, credit reservation, and `setAgentAnalyzing` mutation. It returns the values needed by both `runAgent` and the streaming route preparation action.

Extend the existing server import to include `type ActionCtx`:

```ts
import {
  action,
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
```

Add this type near `getSelectedModelOrThrow`:

```ts
type PreparedAgentRun = {
  canvas: Doc<"canvases">;
  node: Doc<"nodes">;
  definition: ReturnType<typeof getAgentDefinitionOrThrow>;
  selectedModel: AgentModel;
  reservationId?: Id<"creditTransactions">;
  shouldDecrementConcurrency: boolean;
};
```

Implement this helper:

```ts
async function prepareAgentRunOrThrow(
  ctx: ActionCtx,
  args: {
    canvasId: Id<"canvases">;
    nodeId: Id<"nodes">;
    modelId: string;
  },
): Promise<PreparedAgentRun> {
  const canvas = await ctx.runQuery(api.canvases.get, { canvasId: args.canvasId });
  if (!canvas) throw new Error("Canvas not found");

  const node = await ctx.runQuery(api.nodes.get, {
    nodeId: args.nodeId,
    includeStorageUrl: false,
  });
  if (!node) throw new Error("Node not found");
  assertNodeBelongsToCanvasOrThrow(node, args.canvasId);
  if (node.type !== "agent") throw new Error("Node must be an agent node");

  const nodeData = getNodeDataRecord(node.data);
  const definition = getAgentDefinitionOrThrow(nodeData.templateId);
  const selectedModel = getSelectedModelOrThrow(args.modelId);
  const subscription = await ctx.runQuery(api.credits.getSubscription, {});
  assertAgentModelTier(selectedModel, subscription?.tier);

  const { reservationId, shouldDecrementConcurrency } = await startPublicJobCreditFlow(ctx, {
    estimatedCost: selectedModel.creditCost,
    description: `Agent-Lauf - ${selectedModel.label}`,
    nodeId: args.nodeId,
    canvasId: args.canvasId,
    model: selectedModel.id,
    provider: "openrouter",
  });

  await ctx.runMutation(internalApi.agents.setAgentAnalyzing, {
    nodeId: args.nodeId,
    modelId: selectedModel.id,
    reservationId: reservationId ?? undefined,
    shouldDecrementConcurrency,
  });

  return {
    canvas,
    node,
    definition,
    selectedModel,
    reservationId: reservationId ?? undefined,
    shouldDecrementConcurrency,
  };
}
```

Update `runAgent` to call `prepareAgentRunOrThrow` and keep its scheduler behavior identical. If scheduling throws, release the returned reservation and decrement concurrency for `prepared.canvas.ownerId`.

- [ ] **Step 5: Add a streaming preparation action for the current tool-harness agent**

Add `prepareAgentStream` in `convex/agents.ts`. For the current `instagram-post-agent` tool harness, this action starts the same durable lifecycle as `runAgent`, but returns a stream prompt that asks for a short visible running summary before the existing harness job continues through Convex.

```ts
export const prepareAgentStream = action({
  args: {
    canvasId: v.id("canvases"),
    nodeId: v.id("nodes"),
    modelId: v.string(),
    locale: v.union(v.literal("de"), v.literal("en")),
  },
  handler: async (ctx, args): Promise<{
    modelId: string;
    outputNodeId: Id<"nodes">;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    reservationId?: Id<"creditTransactions">;
    shouldDecrementConcurrency: boolean;
    userId: string;
  }> => {
    const prepared = await prepareAgentRunOrThrow(ctx, args);
    if (prepared.definition.runtime.kind !== "tool-harness") {
      throw new Error(`Agent ${prepared.definition.id} is not configured for streaming harness output`);
    }

    const outputNodeIds = await ctx.runMutation(internalApi.agents.createExecutionSkeletonOutputs, {
      canvasId: args.canvasId,
      nodeId: args.nodeId,
      analysisSummary: "Streaming agent output",
      definitionVersion: prepared.definition.version,
      executionPlan: {
        summary: "Streaming agent output",
        steps: [
          {
            id: "stream-summary",
            title: "Agent run summary",
            channel: "canvas",
            outputType: "text",
            artifactType: "agent-stream-summary",
            goal: "Show the running agent output locally while durable harness outputs are created.",
            requiredSections: ["Summary"],
            qualityChecks: ["Concise", "Context aware"],
          },
        ],
      },
    });

    const outputNodeId = outputNodeIds.outputNodeIds[0];
    if (!outputNodeId) throw new Error("Agent stream output node was not created");

    await ctx.scheduler.runAfter(0, internalApi.agents.runToolHarnessAgent, {
      canvasId: args.canvasId,
      nodeId: args.nodeId,
      modelId: prepared.selectedModel.id,
      locale: normalizeAgentLocale(args.locale),
      userId: prepared.canvas.ownerId,
      reservationId: prepared.reservationId,
      shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
    });

    return {
      modelId: prepared.selectedModel.id,
      outputNodeId,
      messages: [
        {
          role: "system",
          content: "You are LemonSpace. Write a concise live summary of what this agent run is preparing. Return plain text only.",
        },
        {
          role: "user",
          content: `Agent: ${prepared.definition.metadata.name}\nLocale: ${args.locale}\nStatus: The durable tool harness has started and will create the final canvas artifacts.`,
        },
      ],
      reservationId: prepared.reservationId,
      shouldDecrementConcurrency: false,
      userId: prepared.canvas.ownerId,
    };
  },
});
```

This action intentionally does not commit or release the agent reservation; the scheduled `runToolHarnessAgent` remains responsible for the durable agent credit lifecycle. The stream summary is local UX only.

Add a public finalizer for the local summary output:

```ts
export const finalizeAgentStreamSummary = action({
  args: {
    nodeId: v.id("nodes"),
    outputNodeId: v.id("nodes"),
    outputText: v.string(),
  },
  handler: async (ctx, args) => {
    const body = trimText(args.outputText);
    if (!body) throw new Error("Agent stream summary returned an empty result");

    await ctx.runMutation(internalApi.agents.completeExecutionStepOutput, {
      nodeId: args.nodeId,
      outputNodeId: args.outputNodeId,
      stepId: "stream-summary",
      stepIndex: 0,
      stepTotal: 1,
      title: "Agent run summary",
      channel: "canvas",
      outputType: "text",
      artifactType: "agent-stream-summary",
      goal: "Show the running agent output locally while durable harness outputs are created.",
      requiredSections: ["Summary"],
      qualityChecks: ["Concise", "Context aware"],
      previewText: body.slice(0, 240),
      sections: [{ id: "summary", label: "Summary", content: body }],
      metadata: {},
      metadataLabels: {},
      body,
    });

    return { ok: true as const };
  },
});
```

- [ ] **Step 6: Add the agent stream route**

Create `app/api/ai-stream/agent/route.ts` using the text route pattern:

```ts
import { streamText } from "ai";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthAction } from "@/lib/auth-server";
import { getOpenRouterModel } from "@/lib/ai-stream/openrouter-provider";
import { parseAgentStreamRequest } from "@/lib/ai-stream/stream-protocol";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const parsed = parseAgentStreamRequest(await request.json());
  if (!parsed.ok) return new NextResponse(parsed.message, { status: parsed.status });

  const prepared = await fetchAuthAction(api.agents.prepareAgentStream, {
    canvasId: parsed.value.canvasId as Id<"canvases">,
    nodeId: parsed.value.nodeId as Id<"nodes">,
    modelId: parsed.value.modelId,
    locale: parsed.value.locale,
  });

  const result = streamText({
    model: getOpenRouterModel(prepared.modelId),
    messages: prepared.messages,
    onFinish: async ({ text }) => {
      await fetchAuthAction(api.agents.finalizeAgentStreamSummary, {
        nodeId: parsed.value.nodeId as Id<"nodes">,
        outputNodeId: prepared.outputNodeId,
        outputText: text,
      });
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "x-lemonspace-output-node-id": prepared.outputNodeId,
    },
  });
}
```

The route does not finalize credits because the durable `runToolHarnessAgent` action owns the reservation lifecycle. It finalizes only the local summary output node identified by the response header.

- [ ] **Step 7: Update `AgentNode` to call the agent stream route**

In `components/canvas/nodes/agent-node.tsx`, replace `runAgent(...)` for the streaming-capable path with a fetch to `/api/ai-stream/agent`. Use the `x-lemonspace-output-node-id` response header to target the local stream draft:

```ts
const response = await fetch("/api/ai-stream/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    canvasId,
    nodeId: id,
    modelId: resolvedModelId,
    locale: normalizedLocale,
  }),
});
const outputNodeId = response.headers.get("x-lemonspace-output-node-id");
if (!outputNodeId) throw new Error("Agent stream did not return an output node id");
setLocalNodeStream(outputNodeId, { text: "", status: "streaming" });
await readTextStream(response, outputNodeId);
clearLocalNodeStream(outputNodeId);
```

Keep `resumeAgent` on the existing Convex action because clarification streaming is outside this task.

- [ ] **Step 8: Run focused tests**

Run:

```bash
npm test tests/lib/agent-stream-protocol.test.ts tests/agent-node-runtime.test.ts tests/agent-output-node.test.ts tests/lib/local-node-streams.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add convex/agents.ts app/api/ai-stream/agent/route.ts components/canvas/nodes/agent-node.tsx lib/ai-stream/stream-protocol.ts tests/lib/agent-stream-protocol.test.ts tests/agent-node-runtime.test.ts
git commit -m "feat: stream agent execution output locally"
```

---

### Task 8: Full Verification and Backlog Updates

**Files:**
- Modify: `.backlog` through MCP only.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test tests/lib/ai-stream-text-messages.test.ts tests/lib/ai-stream-protocol.test.ts tests/lib/local-node-streams.test.ts tests/ai-text-node.test.ts tests/ai-text-output-node.test.ts tests/agent-output-node.test.ts tests/agent-node-runtime.test.ts tests/convex/ai-pipeline-modules.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run:

```bash
npm run dev
```

Expected: Next dev server starts. In the browser, generating an AI text node shows text progressively in the created output node and persists final text after completion. Running an agent shows Convex-backed status/step updates and local draft text in the active output node.

- [ ] **Step 5: Update Backlog acceptance criteria**

Use MCP `task_edit` for `TASK-043` to check acceptance criteria that are verified. Do not mark the task `Done` until the user explicitly confirms manual testing.

---

## Plan Self-Review

- Spec coverage: Text local streaming is covered by Tasks 1-5. Agent status/step plus local draft output is covered by Tasks 6-7. Credit/auth/final persistence is covered by Task 3 and route finalization in Tasks 4 and 7. Verification is covered by Task 8.
- Placeholder scan: No placeholder markers remain. The agent phase is intentionally scoped to a local streaming summary while the durable tool harness continues to own final artifact creation and credit finalization.
- Type consistency: Text route payload uses `canvasId`, `sourceNodeId`, `outputNodeId`, `modelId`, `instruction`, and `inputText` consistently across protocol, route, Convex action, and UI. Agent route payload uses `canvasId`, `nodeId`, `modelId`, and `locale` consistently.
