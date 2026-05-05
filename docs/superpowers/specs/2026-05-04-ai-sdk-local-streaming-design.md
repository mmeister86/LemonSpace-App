# AI SDK Local Streaming Design

## Task

Backlog task: `TASK-043 - Add AI SDK streaming to text and agent nodes`

## Goal

Use the Vercel AI SDK to stream generated text locally in the active canvas while keeping Convex as the durable source of truth for auth, ownership, credits, status, step progress, and final persisted node data.

## Non-Goals

- Do not stream every token through Convex.
- Do not replace the image or video generation pipelines.
- Do not migrate the whole agent runtime away from the current Convex orchestration in one step.
- Do not introduce collaborative live token streaming across tabs or sessions.

## Current Shape

Text generation is currently started from `components/canvas/nodes/ai-text-node.tsx`, which creates an `ai-text-output` node and calls `api.ai.generateText`. The Convex text pipeline reserves credits, schedules generation, calls OpenRouter, then persists the completed `outputText`.

Agent generation is currently started from `components/canvas/nodes/agent-node.tsx`, which calls `api.agents.runAgent` or `api.agents.resumeAgent`. Convex owns the analyze, clarification, execute, structured output, status, step metadata, credit flow, and agent-output persistence. Agent tool calling is represented through `lib/agent-harness.ts` and OpenRouter helpers in `convex/openrouter.ts`.

## Chosen Approach

Add local streaming through Next.js route handlers backed by the Vercel AI SDK.

The browser starts a streaming request and renders chunks in local React state. Convex receives only durable lifecycle mutations: reserve/start, status or step updates, final success, and failure/release. This keeps the fast-changing stream out of the shared canvas sync channel while preserving all existing durable invariants.

For text nodes, the streamed draft is shown in the output node immediately. When the stream finishes, the final text is persisted to the existing `ai-text-output` shape.

For agent nodes, Convex continues to emit status and step updates. Streaming is used only for the visible text being generated for the current agent output or execution phase. The final persisted agent output remains normalized structured data.

## Architecture

### AI SDK Boundary

Create a narrow AI SDK adapter in app/server-side code rather than spreading SDK calls across UI components or Convex modules.

The adapter should:

- Convert LemonSpace model IDs into AI SDK model instances.
- Start `streamText` for plain text generation.
- Support `onFinish` or explicit stream completion handling for final persistence.
- Keep provider-specific configuration isolated.
- Avoid changing existing model registries unless a model ID truly cannot be mapped.

### Next Route Handlers

Add route handlers under `app/api/ai-stream/...`.

Route handlers are appropriate because Next.js App Router route handlers use Web `Request` and `Response` APIs, support `POST`, and are not cached by default. The Vercel AI SDK docs show `streamText` returning a stream response from a route handler.

Routes should authenticate the user and then call Convex for durable lifecycle operations. They should not directly mutate Convex tables.

### Convex Lifecycle

Convex remains responsible for:

- Auth and ownership validation.
- Credit reservation.
- Marking output nodes `executing`.
- Agent step and status updates.
- Final success persistence.
- Failure status and credit release.
- Credit commit after successful completion.

For text streaming, split the current `generateText` flow into smaller public/internal operations that can be called around the streaming route lifecycle.

For agent streaming, existing `runAgent`/`resumeAgent` behavior should be preserved where possible. Streaming should first target the execute phase that produces visible output, not the clarification analysis phase.

## Text Node Flow

1. User clicks generate on an `ai-text` node.
2. Client creates the connected `ai-text-output` node as it does today.
3. Client starts a streaming `POST` request to the text stream route with `canvasId`, `sourceNodeId`, `outputNodeId`, `modelId`, `instruction`, and `inputText`.
4. Route authenticates and asks Convex to start the durable text job lifecycle: validate ownership, reserve credits, mark the output node executing, and return a reservation/job context.
5. Route calls AI SDK `streamText`.
6. Client renders received text chunks locally in the output node.
7. On successful completion, the route finalizes via Convex with final `outputText`, metadata, and credit commit.
8. On failure or abort before completion, Convex releases the reservation and marks the output node failed with a useful status message.

## Agent Node Flow

1. User starts or resumes an agent node from the existing UI.
2. Convex performs analyze and clarification flow as it does today.
3. During execution, Convex updates `statusMessage`, `executionStepIndex`, and `executionStepTotal`.
4. The active execution output stream is surfaced locally in the canvas while tokens arrive.
5. At step completion, final text is normalized into the existing `agent-output` data shape and persisted through Convex.
6. The agent node continues to show Convex-backed status and step metadata, so refreshes and other sessions still see durable progress even though token drafts are local.

## UI Behavior

For `ai-text-output`, the node should prefer a local streaming draft while the current browser owns an active stream. If no local draft exists, it renders persisted `outputText` as it does today.

For `agent-output`, the node should prefer a local streaming draft for the active step/output. When final structured data arrives from Convex, the draft is cleared and the persisted structure is rendered.

If the user navigates away or refreshes during a stream, local draft text can be lost. The durable node should still resolve to either final persisted output or an error/released state.

## Error Handling

The route must finalize exactly once.

Success should commit credits and mark output nodes done.

Failure should release credits best-effort and mark output nodes error.

Abort handling should be explicit: if the browser disconnects before completion, the route should attempt to release credits and record an interrupted status. If the provider completed but final persistence failed, the route should surface a terminal persistence error rather than silently charging without saved output.

## Testing Strategy

Use TDD for implementation.

Focused tests should cover:

- A local stream state helper appends chunks without mutating persisted node data.
- Final text persistence clears local draft state.
- Text lifecycle finalization commits on success and releases on failure.
- Agent step/status updates remain Convex-backed while stream drafts stay local.
- The AI SDK route adapter calls finalization once for success and once for failure paths.

## Rollout

Implement text node streaming first because it has a simpler final shape. Then add agent execution streaming once the route, lifecycle, and UI draft model are proven.

Keep the old non-streaming Convex action available during the first pass if practical, so the feature can be switched back quickly if streaming route behavior exposes deployment constraints.

## Implementation Decisions

- Finalization happens route-side. The client renders chunks locally, but does not own commit/release decisions.
- Use an AI SDK OpenRouter provider package if the currently published package supports the required LemonSpace model IDs. If it does not, add a tiny server-only adapter that exposes only the model construction needed by `streamText`, keeping the direct OpenRouter fallback isolated from UI code.
