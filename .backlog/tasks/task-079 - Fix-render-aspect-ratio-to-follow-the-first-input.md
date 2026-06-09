---
id: TASK-079
title: Fix render aspect ratio to follow the first input
status: In Progress
assignee:
  - Codex
created_date: '2026-06-09 15:10'
updated_date: '2026-06-09 15:20'
labels: []
dependencies: []
modified_files:
  - components/canvas/nodes/use-render-node-preview.ts
  - tests/use-render-node-preview.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render nodes currently appear to derive their output aspect ratio from a later connected input in multi-input image workflows. Ensure the render output preserves the aspect ratio of the first/base input so the final image dimensions match the intended source ordering.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a render node receives a multi-input composition, its output aspect ratio is derived from the first/base input rather than the second input.
- [x] #2 Existing mixer layer ordering and preview behavior remain unchanged except for the corrected render sizing semantics.
- [x] #3 Add or update focused regression coverage for the aspect-ratio selection logic, or document why no automated coverage is practical.
- [x] #4 Relevant validation passes without introducing TypeScript or test failures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the aspect-ratio bug with a focused failing test around render preview aspect selection for mixer inputs.
2. Fix render preview aspect selection so mixer inputs prefer the resolved mixer composition stage, falling back to source-node/preview aspect only when needed.
3. Run the focused tests for render preview/render node behavior and relevant type checks if practical.
4. Update task notes and acceptance criteria with the verified outcome; leave status In Progress until user confirms manual testing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed: RenderNode auto-sizing used findSourceNodeFromGraph for mixer inputs, and that traversal can choose a later mixer layer because incoming edges are sorted generically rather than by mixer layer semantics. The render bake path already carries sourceComposition.stage, so the fix makes RenderNode targetAspectRatio prefer the resolved mixer composition stage/layer-in aspect before falling back to the generic source node or preview ratio.

Validation:
- RED first: `npm test -- tests/use-render-node-preview.test.ts` failed with expected 0.7 but got 6.
- GREEN: `npm test -- tests/use-render-node-preview.test.ts` passed.
- `npm test -- tests/use-render-node-preview.test.ts tests/lib/canvas-render-preview.test.ts components/canvas/__tests__/render-node.test.tsx` passed (24 tests).
- `npm test -- tests/use-pipeline-preview.test.ts` passed (16 tests).
- `npm test -- tests/image-pipeline/source-loader.test.ts` passed (15 tests).
- `npm run lint -- components/canvas/nodes/use-render-node-preview.ts tests/use-render-node-preview.test.ts` passed.
- `git diff --check` passed.
- `npx tsc --noEmit --pretty false` still fails on existing unrelated test typing issues in base-node-wrapper, comment-node, rate-limit, and prompt-node tests; no reported errors are in the modified files.
- Browser verification on http://localhost:3000/canvas/j57amnz5f9ta3yz3a8dxkv2m7187vf89 measured render preview frame/canvas ratios around 0.75 and found no browser console errors.

Follow-up after code review: The first fix still allowed a mixer composition with no resolvable stage/base dimensions to fall back to the old generic source traversal. Added a second regression test for that fallback path and updated targetAspectRatio selection so any existing sourceComposition avoids generic source-node fallback; it now uses composition stage/layer-in dimensions, then the actual preview aspect ratio.

Post-review validation:
- RED: second test in `tests/use-render-node-preview.test.ts` failed with expected 0.7 but got 6 before the follow-up fix.
- GREEN: `npm test -- tests/use-render-node-preview.test.ts` passed (2 tests).
- `npm test -- tests/use-render-node-preview.test.ts tests/lib/canvas-render-preview.test.ts components/canvas/__tests__/render-node.test.tsx` passed (25 tests).
- `npm test -- tests/use-pipeline-preview.test.ts` passed (16 tests).
- `npm test -- tests/image-pipeline/source-loader.test.ts` passed (15 tests).
- `npm run lint -- components/canvas/nodes/use-render-node-preview.ts tests/use-render-node-preview.test.ts` passed.
- `git diff --check` passed.
- Browser reload and measurement still shows render preview frame/canvas ratios around 0.75 with no browser console errors.
- `npx tsc --noEmit --pretty false` still fails only on unrelated existing test typing issues outside the modified files.
<!-- SECTION:NOTES:END -->
