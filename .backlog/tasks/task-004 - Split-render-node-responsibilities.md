---
id: TASK-004
title: Split render node responsibilities
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - node
  - render
  - refactor
  - tests
dependencies:
  - TASK-022
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Break `components/canvas/nodes/render-node.tsx` into state, preview, rendering/upload, and UI subcomponents while preserving current render/download/upload behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Render data sanitization and persistence live outside the main component.
- [ ] #2 Preview resolution and pipeline hash state are isolated in a hook.
- [ ] #3 Download/upload rendering flow is isolated in a hook or service module.
- [ ] #4 Fullscreen dialog, preview surface, status overlay, menu, and histogram UI are separate components.
- [ ] #5 Existing render-node and pipeline preview tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for download metadata, upload metadata, and error state preservation if missing.
2. Create `components/canvas/nodes/render-node-state.ts` for sanitization and persisted data helpers.
3. Create `components/canvas/nodes/use-render-node-preview.ts` for preview input, pipeline hash, and preview state.
4. Create `components/canvas/nodes/use-render-node-rendering.ts` for `handleRender`, worker fallback, upload, abort, and run-id logic.
5. Create `RenderNodeMenu`, `RenderNodePreviewSurface`, `RenderNodeStatusOverlay`, `RenderNodeFullscreenDialog`, and `RenderNodeHistogram` components.
6. Reduce `render-node.tsx` to composition and prop wiring.
7. Run `npm test -- tests/use-pipeline-preview.test.ts tests/lib/canvas-render-preview.test.ts` plus any render-node focused tests and `npm run lint`.
<!-- SECTION:PLAN:END -->
