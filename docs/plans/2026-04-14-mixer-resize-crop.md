# Mixer Resize/Crop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct mixer interactions so resize scales the overlay proportionally while crop trims visible content from any side without changing displayed image size.

**Architecture:** Split displayed overlay geometry from source crop geometry. Keep `overlayX/Y/Width/Height` for display frame placement and size. Introduce explicit crop-edge semantics so preview, compare, and bake all trim the same source region and map it into the unchanged frame.

**Tech Stack:** Next.js 16, React 19, `@xyflow/react`, Vitest, local node preview state via `useNodeLocalData`, image pipeline source-loader.

---

### Task 1: Add failing tests for the approved resize/crop semantics

**Files:**
- Modify: `components/canvas/__tests__/mixer-node.test.tsx`
- Modify: `tests/image-pipeline/source-loader.test.ts`
- Modify: `tests/lib/canvas-mixer-preview.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:

- frame resize keeps aspect ratio locked
- crop handle drag trims edges without changing displayed overlay frame size
- crop drag inside crop box repositions crop region only
- resize does not mutate crop fields
- crop does not mutate `overlayWidth` / `overlayHeight`

**Step 2: Run tests to verify RED**

Run:

```bash
pnpm exec vitest run components/canvas/__tests__/mixer-node.test.tsx tests/image-pipeline/source-loader.test.ts tests/lib/canvas-mixer-preview.test.ts
```

Expected: failures showing current crop behavior still behaves like zoom/scale instead of edge trimming.

**Step 3: Commit**

```bash
git add components/canvas/__tests__/mixer-node.test.tsx tests/image-pipeline/source-loader.test.ts tests/lib/canvas-mixer-preview.test.ts
git commit -m "test(canvas): cover mixer resize and crop semantics"
```

---

### Task 2: Replace zoom-like content fields with crop-edge normalization

**Files:**
- Modify: `lib/canvas-mixer-preview.ts`
- Modify: `lib/canvas-utils.ts`
- Modify: `lib/canvas-node-templates.ts`
- Modify: `components/canvas/nodes/mixer-node.tsx`

**Step 1: Implement minimal normalized crop model**

Prefer explicit crop trims:

```ts
type MixerCropData = {
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
};
```

Normalization rules:

- clamp each crop edge to `0..1`
- enforce minimum remaining source width/height
- preserve display frame fields separately
- map legacy `contentX/Y/Width/Height` into equivalent crop trims during normalization if needed

**Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/lib/canvas-mixer-preview.test.ts
```

Expected: GREEN for normalization and backward-compatibility cases.

**Step 3: Commit**

```bash
git add lib/canvas-mixer-preview.ts lib/canvas-utils.ts lib/canvas-node-templates.ts components/canvas/nodes/mixer-node.tsx tests/lib/canvas-mixer-preview.test.ts
git commit -m "feat(canvas): add explicit mixer crop edge model"
```

---

### Task 3: Fix mixer node interactions

**Files:**
- Modify: `components/canvas/nodes/mixer-node.tsx`
- Modify: `components/canvas/__tests__/mixer-node.test.tsx`

**Step 1: Implement proportional resize**

- use display frame aspect ratio as the locked ratio
- corner drag scales frame proportionally
- side handles either hide in resize mode or preserve ratio while scaling
- resize mutates only `overlay*`

**Step 2: Implement classic crop handles**

- render 8 crop handles in crop mode
- edge handles trim one side
- corner handles trim two sides
- dragging inside crop box repositions crop region
- crop mutates only crop fields

**Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run components/canvas/__tests__/mixer-node.test.tsx
```

Expected: GREEN for resize and crop semantics.

**Step 4: Commit**

```bash
git add components/canvas/nodes/mixer-node.tsx components/canvas/__tests__/mixer-node.test.tsx
git commit -m "feat(canvas): separate mixer resize and crop interactions"
```

---

### Task 4: Align compare and bake semantics

**Files:**
- Modify: `components/canvas/nodes/compare-surface.tsx`
- Modify: `lib/image-pipeline/source-loader.ts`
- Modify: `tests/image-pipeline/source-loader.test.ts`
- Modify: `tests/lib/canvas-render-preview.test.ts`
- Optional modify: `components/canvas/__tests__/compare-node.test.tsx`

**Step 1: Implement crop-edge sampling everywhere**

- compare preview uses crop edges, not zoom-like content scaling
- bake path samples cropped source region into overlay frame
- non-mixer behavior stays unchanged

**Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/image-pipeline/source-loader.test.ts tests/lib/canvas-render-preview.test.ts components/canvas/__tests__/compare-node.test.tsx
```

Expected: GREEN with preview/bake parity.

**Step 3: Commit**

```bash
git add components/canvas/nodes/compare-surface.tsx lib/image-pipeline/source-loader.ts tests/image-pipeline/source-loader.test.ts tests/lib/canvas-render-preview.test.ts components/canvas/__tests__/compare-node.test.tsx
git commit -m "fix(canvas): align mixer crop semantics across preview and bake"
```

---

### Task 5: Final verification

**Files:**
- Modify only if docs or small follow-up fixes are needed

**Step 1: Run the verification suite**

```bash
pnpm exec vitest run components/canvas/__tests__/mixer-node.test.tsx tests/lib/canvas-mixer-preview.test.ts tests/lib/canvas-render-preview.test.ts tests/image-pipeline/source-loader.test.ts components/canvas/__tests__/compare-node.test.tsx
pnpm lint
pnpm build
```

Expected: all green.

**Step 2: Commit docs/follow-ups if needed**

```bash
git add components/canvas/CLAUDE.md convex/CLAUDE.md
git commit -m "docs(canvas): document mixer resize and crop semantics"
```

---

## Notes

- Keep `nodrag` and `nopan` on every interactive surface and handle.
- Prefer the smallest migration path from legacy `content*` fields into crop trims.
- Do not broaden into rotation, masks, or non-uniform scaling.
