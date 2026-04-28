---
id: TASK-004
title: Split render node responsibilities
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:55'
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
- [x] #1 Render data sanitization and persistence live outside the main component.
- [x] #2 Preview resolution and pipeline hash state are isolated in a hook.
- [x] #3 Download/upload rendering flow is isolated in a hook or service module.
- [x] #4 Fullscreen dialog, preview surface, status overlay, menu, and histogram UI are separate components.
- [x] #5 Existing render-node and pipeline preview tests pass.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `render-node-state.ts` for render data types, sanitization, dimensions, formatting, and debug helpers.
- Added `use-render-node-preview.ts` to isolate graph preview resolution, pipeline hash state, fast-preview debounce, histogram plot, and resize aspect logic.
- Added `use-render-node-rendering.ts` to isolate download/upload rendering, worker fallback execution, upload persistence, abort/run-id handling, and render errors.
- Added `render-node-ui.tsx` for the menu, preview surface, status overlays, histogram, and fullscreen dialog components.
- Added focused characterization coverage for render-node state sanitization and metadata preservation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-004 is complete. `render-node.tsx` now preserves the default export while composing extracted state, preview, rendering, and UI modules; focused render-node/pipeline preview tests passed, and ESLint passed for all TASK-004 touched files. Full-project lint is currently blocked by an unrelated `react-hooks/static-components` error in `components/canvas/nodes/image-transform-node.tsx`.
<!-- SECTION:FINAL_SUMMARY:END -->

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
