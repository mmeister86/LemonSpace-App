# Preview Graph Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make upstream adjustment changes propagate to downstream node previews and the render preview immediately from local client state, without waiting for the sync queue or Convex roundtrip.

**Architecture:** Add a local-first preview graph overlay inside the canvas graph provider so node-local adjustment state can temporarily override persisted node data for preview resolution. Then make preview rendering react to that local overlay with a lower hot-path debounce and optional histogram deferral, so the pipeline feels immediate while the persisted graph keeps its current sync semantics.

**Tech Stack:** React 19, Next 16, `@xyflow/react`, client context providers, Vitest, WebGL preview backend, existing worker-client preview pipeline.

---

### Task 1: Add a local preview override layer to the canvas graph

**Files:**
- Modify: `components/canvas/canvas-graph-context.tsx`
- Modify: `lib/canvas-render-preview.ts`
- Create: `tests/canvas-render-preview.test.ts`

**Step 1: Write the failing test**

```ts
it("prefers local preview overrides over persisted node data", () => {
  const graph = buildGraphSnapshot(
    [
      { id: "image-1", type: "image", data: { url: "https://cdn.example.com/source.png" } },
      { id: "color-1", type: "color-adjust", data: { temperature: 0 } },
      { id: "render-1", type: "render", data: {} },
    ],
    [
      { source: "image-1", target: "color-1" },
      { source: "color-1", target: "render-1" },
    ],
    false,
    new Map([["color-1", { temperature: 42 }]]),
  );

  expect(resolveRenderPreviewInputFromGraph({ nodeId: "render-1", graph }).steps).toMatchObject([
    { nodeId: "color-1", type: "color-adjust", params: { temperature: 42 } },
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/canvas-render-preview.test.ts`
Expected: FAIL because `buildGraphSnapshot` does not accept or apply preview overrides yet.

**Step 3: Write minimal implementation**

```ts
export function buildGraphSnapshot(
  nodes: readonly CanvasGraphNodeLike[],
  edges: readonly CanvasGraphEdgeLike[],
  includeTempEdges = false,
  nodeDataOverrides?: ReadonlyMap<string, unknown>,
): CanvasGraphSnapshot {
  const nodesById = new Map<string, CanvasGraphNodeLike>();
  for (const node of nodes) {
    const override = nodeDataOverrides?.get(node.id);
    nodesById.set(node.id, override === undefined ? node : { ...node, data: override });
  }
  // existing edge logic unchanged
}
```

Add a second context export in `components/canvas/canvas-graph-context.tsx` for local preview overrides:

```ts
type CanvasGraphPreviewOverrides = {
  setNodePreviewOverride: (nodeId: string, data: unknown) => void;
  clearNodePreviewOverride: (nodeId: string) => void;
  hasPreviewOverrides: boolean;
};
```

Build the graph snapshot with the override map applied.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/canvas-render-preview.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add components/canvas/canvas-graph-context.tsx lib/canvas-render-preview.ts tests/canvas-render-preview.test.ts
git commit -m "feat(canvas): add local preview graph overrides"
```

### Task 2: Feed node-local adjustment state into the preview override layer

**Files:**
- Modify: `components/canvas/nodes/use-node-local-data.ts`
- Modify: `components/canvas/nodes/color-adjust-node.tsx`
- Modify: `components/canvas/nodes/light-adjust-node.tsx`
- Modify: `components/canvas/nodes/curves-node.tsx`
- Modify: `components/canvas/nodes/detail-adjust-node.tsx`
- Create: `components/canvas/__tests__/use-node-local-data-preview-overrides.test.tsx`

**Step 1: Write the failing test**

```tsx
it("pushes local adjustment changes into preview overrides before save completes", async () => {
  const setNodePreviewOverride = vi.fn();
  const clearNodePreviewOverride = vi.fn();

  render(
    <CanvasGraphPreviewOverridesTestProvider
      value={{ setNodePreviewOverride, clearNodePreviewOverride, hasPreviewOverrides: false }}
    >
      <Harness nodeId="color-1" data={{ temperature: 0 }} />
    </CanvasGraphPreviewOverridesTestProvider>,
  );

  await userEvent.click(screen.getByRole("button", { name: /change/i }));

  expect(setNodePreviewOverride).toHaveBeenCalledWith("color-1", expect.objectContaining({ temperature: 42 }));
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test components/canvas/__tests__/use-node-local-data-preview-overrides.test.tsx`
Expected: FAIL because `useNodeLocalData` does not know about preview overrides.

**Step 3: Write minimal implementation**

Add `nodeId` to the hook contract and wire the override context into the hot path:

```ts
const { setNodePreviewOverride, clearNodePreviewOverride } = useCanvasGraphPreviewOverrides();

const applyLocalData = useCallback((next: T) => {
  hasPendingLocalChangesRef.current = true;
  setNodePreviewOverride(nodeId, next);
  localDataRef.current = next;
  setLocalDataState(next);
  queueSave();
}, [nodeId, queueSave, setNodePreviewOverride]);
```

When the persisted data catches up, clear the override:

```ts
if (incomingHash === localHash) {
  hasPendingLocalChangesRef.current = false;
  clearNodePreviewOverride(nodeId);
  return;
}
```

Also clear the override on unmount.

**Step 4: Run test to verify it passes**

Run: `pnpm test components/canvas/__tests__/use-node-local-data-preview-overrides.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/canvas/nodes/use-node-local-data.ts components/canvas/nodes/color-adjust-node.tsx components/canvas/nodes/light-adjust-node.tsx components/canvas/nodes/curves-node.tsx components/canvas/nodes/detail-adjust-node.tsx components/canvas/__tests__/use-node-local-data-preview-overrides.test.tsx
git commit -m "feat(canvas): mirror local adjustment state into preview graph"
```

### Task 3: Make downstream previews and the render node react to local overlay changes immediately

**Files:**
- Modify: `components/canvas/nodes/adjustment-preview.tsx`
- Modify: `components/canvas/nodes/render-node.tsx`
- Modify: `components/canvas/nodes/compare-node.tsx`
- Modify: `hooks/use-pipeline-preview.ts`
- Modify: `tests/use-pipeline-preview.test.ts`
- Modify: `components/canvas/__tests__/compare-node.test.tsx`

**Step 1: Write the failing test**

```ts
it("uses a lower debounce while preview overrides are active", async () => {
  vi.useFakeTimers();
  workerClientMocks.renderPreviewWithWorkerFallback.mockResolvedValue(createPreviewResult(100, 80));

  render(
    <Harness
      sourceUrl="https://cdn.example.com/source.png"
      steps={createLightAdjustSteps(10)}
      previewDebounceMs={16}
    />,
  );

  await act(async () => {
    vi.advanceTimersByTime(17);
  });

  expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledTimes(1);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: FAIL because `usePipelinePreview` has a fixed 48ms debounce.

**Step 3: Write minimal implementation**

Extend the hook options:

```ts
type UsePipelinePreviewOptions = {
  // existing fields
  debounceMs?: number;
};
```

Use it in the timeout:

```ts
const renderDebounceMs = Math.max(0, options.debounceMs ?? PREVIEW_RENDER_DEBOUNCE_MS);
const timer = window.setTimeout(runPreview, renderDebounceMs);
```

Then in preview consumers derive the hot-path value from preview overrides:

```tsx
const { hasPreviewOverrides } = useCanvasGraphPreviewOverrides();

usePipelinePreview({
  sourceUrl,
  steps,
  nodeWidth,
  debounceMs: hasPreviewOverrides ? 16 : undefined,
});
```

This keeps the slower debounce for passive updates but lowers it during active local edits.

**Step 4: Run tests to verify they pass**

Run:
- `pnpm test tests/use-pipeline-preview.test.ts`
- `pnpm test components/canvas/__tests__/compare-node.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add components/canvas/nodes/adjustment-preview.tsx components/canvas/nodes/render-node.tsx components/canvas/nodes/compare-node.tsx hooks/use-pipeline-preview.ts tests/use-pipeline-preview.test.ts components/canvas/__tests__/compare-node.test.tsx
git commit -m "feat(canvas): prioritize local preview updates in downstream nodes"
```

### Task 4: Defer non-critical histogram work during active local edits

**Files:**
- Modify: `components/canvas/nodes/adjustment-preview.tsx`
- Modify: `hooks/use-pipeline-preview.ts`
- Modify: `tests/use-pipeline-preview.test.ts`

**Step 1: Write the failing test**

```ts
it("skips histogram work while local preview overrides are active", async () => {
  render(
    <Harness
      sourceUrl="https://cdn.example.com/source.png"
      steps={createLightAdjustSteps(10)}
      includeHistogram={false}
    />,
  );

  await act(async () => {
    vi.advanceTimersByTime(20);
  });

  expect(workerClientMocks.renderPreviewWithWorkerFallback).toHaveBeenCalledWith(
    expect.objectContaining({ includeHistogram: false }),
  );
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: FAIL if adjustment previews still always request histograms during active edits.

**Step 3: Write minimal implementation**

During active local preview overrides, let small adjustment previews omit histograms:

```tsx
const includeHistogram = !hasPreviewOverrides;

usePipelinePreview({
  sourceUrl,
  steps,
  nodeWidth,
  includeHistogram,
  debounceMs: hasPreviewOverrides ? 16 : undefined,
});
```

Keep the render node fullscreen preview on `includeHistogram: false` as it is today; keep the inline render preview behavior unchanged unless measurements show it is still too slow.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add components/canvas/nodes/adjustment-preview.tsx hooks/use-pipeline-preview.ts tests/use-pipeline-preview.test.ts
git commit -m "perf(canvas): defer histogram work during active preview edits"
```

### Task 5: Final verification and manual latency check

**Files:**
- Modify: `docs/plans/2026-04-05-preview-graph-architecture.md`

**Step 1: Run the focused automated test set**

Run:

```bash
pnpm test tests/canvas-render-preview.test.ts \
  components/canvas/__tests__/use-node-local-data-preview-overrides.test.tsx \
  tests/use-pipeline-preview.test.ts \
  components/canvas/__tests__/compare-node.test.tsx \
  tests/worker-client.test.ts \
  tests/image-pipeline/backend-capabilities.test.ts \
  tests/image-pipeline/backend-router.test.ts \
  tests/image-pipeline/webgl-backend-poc.test.ts \
  tests/preview-renderer.test.ts
```

Expected: PASS

**Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS

**Step 3: Manual verification in browser**

Check that:
- downstream previews update visibly during dragging without waiting for persisted sync
- the active adjustment preview responds near-immediately and skips histogram work while dragging
- WebGL-backed adjustments (`light-adjust`, `detail-adjust`, repaired `curves`/`color-adjust`) remain visually responsive
- deleting a connected middle node no longer triggers a stray `edges:create` failure

**Step 4: Update the plan with measured before/after latency notes**

Add a short bullet list with measured timings and any follow-up work that remains.

**Step 5: Commit**

```bash
git add docs/plans/2026-04-05-preview-graph-architecture.md
git commit -m "docs: record preview graph architecture verification"
```

---

## Verification Notes

- Focused preview architecture suite passed: `45/45` tests.
- Full suite passed in the worktree: `121/121` tests.
- Baseline harness fixes were required for `compare-node` and `light-adjust-node` tests after `CanvasGraphProvider` became mandatory for node-local preview state.
- Manual browser verification is still recommended for before/after latency numbers with `window.__LEMONSPACE_DEBUG_PREVIEW_LATENCY__ = true`.
