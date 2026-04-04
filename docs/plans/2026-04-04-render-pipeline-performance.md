# Render Pipeline Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce repeated preview/render CPU work by caching decoded sources, skipping unused histogram work, deduplicating identical preview requests, and coalescing rapid preview updates.

**Architecture:** The implementation keeps the existing preview/render feature set but tightens the hot path in layers. First, `source-loader` becomes safely shareable across abortable requests. Next, preview rendering becomes histogram-aware per caller instead of always-on. Then the worker client and hook layer collapse duplicate requests and rapid-fire updates toward the latest relevant preview. All work stays inside the current React/worker pipeline so the rollout is incremental and low-risk.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Web Workers, React Flow

---

### Task 1: Make source bitmap caching work for abortable preview/render requests

**Files:**
- Modify: `lib/image-pipeline/source-loader.ts`
- Create: `tests/image-pipeline/source-loader.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- two abortable calls for the same URL reuse one underlying fetch/decode pipeline
- an aborted consumer does not poison a later successful consumer
- a failed fetch clears the cache so the next attempt can retry

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/source-loader.test.ts`
Expected: FAIL because the cache currently bypasses any request with `signal`.

**Step 3: Write minimal implementation**

Refactor `loadSourceBitmap` so fetch/decode caching is keyed by `sourceUrl` regardless of `signal`, while each caller still gets local abort semantics. Keep failure cleanup behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/image-pipeline/source-loader.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add tests/image-pipeline/source-loader.test.ts lib/image-pipeline/source-loader.ts`
- `git commit -m "fix(image-pipeline): reuse source bitmaps for abortable requests"`

### Task 2: Make preview histogram generation opt-in

**Files:**
- Modify: `lib/image-pipeline/preview-renderer.ts`
- Modify: `lib/image-pipeline/worker-client.ts`
- Modify: `lib/image-pipeline/image-pipeline.worker.ts`
- Modify: `hooks/use-pipeline-preview.ts`
- Modify: `components/canvas/nodes/adjustment-preview.tsx`
- Modify: `components/canvas/nodes/compare-surface.tsx`
- Modify: `components/canvas/nodes/render-node.tsx`
- Modify: `tests/use-pipeline-preview.test.ts`

**Step 1: Write the failing tests**

Extend tests so they prove:
- callers can disable histogram work and still get image output
- histogram defaults remain available where explicitly needed
- compare/fullscreen preview call sites request no histogram

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: FAIL because the preview API does not yet accept histogram control.

**Step 3: Write minimal implementation**

Add an `includeHistogram` option through preview renderer, worker request/response handling, and `usePipelinePreview`. Keep histogram enabled for `AdjustmentPreview`, disable it for `CompareSurface` and the fullscreen preview in `render-node`.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add tests/use-pipeline-preview.test.ts lib/image-pipeline/preview-renderer.ts lib/image-pipeline/worker-client.ts lib/image-pipeline/image-pipeline.worker.ts hooks/use-pipeline-preview.ts components/canvas/nodes/adjustment-preview.tsx components/canvas/nodes/compare-surface.tsx components/canvas/nodes/render-node.tsx`
- `git commit -m "perf(image-pipeline): skip unused preview histograms"`

### Task 3: Deduplicate identical in-flight preview requests

**Files:**
- Modify: `lib/image-pipeline/worker-client.ts`
- Modify: `tests/use-pipeline-preview.test.ts`
- Create: `tests/image-pipeline/worker-client.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- two identical preview requests share one worker/fallback execution
- a different preview width or histogram flag creates a separate request
- aborted subscribers are removed without cancelling surviving identical consumers

**Step 2: Run tests to verify they fail**

Run: `pnpm test tests/image-pipeline/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: FAIL because every preview call currently creates a fresh worker request.

**Step 3: Write minimal implementation**

Add an in-flight dedupe layer keyed by source URL, pipeline steps, preview width, and histogram flag. Keep abort handling per consumer so the shared underlying request only aborts when no consumers remain.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/image-pipeline/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add tests/image-pipeline/worker-client.test.ts tests/use-pipeline-preview.test.ts lib/image-pipeline/worker-client.ts`
- `git commit -m "perf(image-pipeline): dedupe inflight preview requests"`

### Task 4: Coalesce rapid preview updates toward the latest state

**Files:**
- Modify: `hooks/use-pipeline-preview.ts`
- Modify: `tests/use-pipeline-preview.test.ts`
- Modify: `components/canvas/nodes/use-node-local-data.ts`
- Create or Modify: targeted test covering rapid preview invalidation behavior

**Step 1: Write the failing tests**

Add tests that prove:
- rapid sequential preview invalidations only commit the latest visible result
- stale finished renders do not overwrite newer preview state
- preview rendering is deferred/coalesced enough that intermediate slider churn does not fan out one render per transient value

**Step 2: Run tests to verify they fail**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: FAIL because preview work is only lightly delayed today and each update schedules its own render path.

**Step 3: Write minimal implementation**

Tighten preview scheduling so it is latest-only and non-urgent during rapid edits. Keep persistence behavior intact, but ensure preview updates collapse around the newest pipeline hash rather than every intermediate one.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add tests/use-pipeline-preview.test.ts hooks/use-pipeline-preview.ts components/canvas/nodes/use-node-local-data.ts`
- `git commit -m "perf(image-pipeline): coalesce rapid preview updates"`

### Task 5: Verify the optimization stack end-to-end

**Files:**
- Verify only

**Step 1: Run targeted pipeline tests**

Run: `pnpm test tests/image-pipeline/source-loader.test.ts tests/image-pipeline/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 2: Run broader canvas/image regression coverage**

Run: `pnpm test tests/light-adjust-node.test.ts components/canvas/__tests__/compare-node.test.tsx`
Expected: `tests/light-adjust-node.test.ts` should pass. `components/canvas/__tests__/compare-node.test.tsx` is currently failing in the clean baseline with missing `CanvasGraphProvider`; if still failing for the same reason, document it as a pre-existing unrelated failure instead of treating it as a regression.

**Step 3: Run lint on touched files**

Run: `pnpm lint lib/image-pipeline/source-loader.ts lib/image-pipeline/preview-renderer.ts lib/image-pipeline/worker-client.ts lib/image-pipeline/image-pipeline.worker.ts hooks/use-pipeline-preview.ts components/canvas/nodes/adjustment-preview.tsx components/canvas/nodes/compare-surface.tsx components/canvas/nodes/render-node.tsx components/canvas/nodes/use-node-local-data.ts tests/image-pipeline/source-loader.test.ts tests/image-pipeline/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 4: Summarize verification evidence**

Capture test/lint output and note any remaining pre-existing failures separately from new work.
