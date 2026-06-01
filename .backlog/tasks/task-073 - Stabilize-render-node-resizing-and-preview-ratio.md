---
id: TASK-073
title: Stabilize render node resizing and preview ratio
status: In Progress
assignee: []
created_date: '2026-05-31 10:04'
updated_date: '2026-05-31 10:43'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stabilize the Canvas render node after recent regressions: restore reliable resizing, lock visible preview sizing to the input aspect ratio, remove decorative inner gradient overlays, and stop preview-driven automatic node growth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Render nodes are selectable and resizable with visible corner controls like other canvas nodes.
- [x] #2 Render node resizing keeps the visible preview area aligned to the connected input aspect ratio.
- [x] #3 Decorative inner gradient/shadow overlays no longer sit over the render content while status/actions/histogram remain available.
- [x] #4 Render nodes do not automatically resize themselves from preview effects after user sizing or collapse/minimize actions.
- [x] #5 Regression tests cover render preview object containment and render resize aspect-ratio behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add regression tests for render preview containment and render resize ratio locking
2. Remove preview-driven automatic render node resizing
3. Route render resize ratio enforcement through canvas dimension changes
4. Remove decorative preview gradient and keep functional overlays
5. Run targeted tests and record results
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented render node stabilization on branch codex/render-node-stabilization. Removed preview-driven queueNodeResize, moved render ratio locking into dimension change normalization, removed decorative preview gradient, switched render preview canvas to object-contain, disabled render content auto-growth, and added regression coverage. Verification: render-node-ui.test.tsx passed (5 tests), canvas-node-interaction-helpers.test.ts passed (16 tests), targeted ESLint passed with no warnings/errors, npm run build passed outside sandbox after Turbopack hit sandbox port binding restrictions.

User reported aspect ratio still visually broken after implementation: render node can still show a large empty lower area while the preview content stays at the top. Reopening investigation before finalizing AC #1.

Follow-up fix after visual report: added shared render aspect size helper and a guarded RenderNode normalization effect. It corrects persisted/legacy oversized render nodes to the detected preview aspect ratio, skips collapsed nodes, and de-duplicates identical resize requests to avoid the previous resize loop. Verification after follow-up: render-node-ui.test.tsx passed (5 tests), canvas-node-interaction-helpers.test.ts passed (17 tests), targeted ESLint passed, npm run build passed outside sandbox.

User clarified the core remaining issue: the render node frame/resize follows aspect ratio, but the rendered canvas output itself remains visually small instead of resizing with the node. Investigating RenderNodePreviewSurface sizing rather than transparency.

Follow-up fix after visual report: added resolveRenderPreviewDisplaySize and pass the computed ratio-locked display size into RenderNodePreviewSurface so the rendered canvas itself scales with the resized render node instead of staying visually small inside a larger frame. Verified render-node-ui and canvas-node-interaction helper tests, targeted ESLint, and production build outside sandbox after Turbopack port-binding sandbox failure.

Second follow-up after user confirmed no visual improvement: compared render canvas to working image/crop patterns and removed the extra object-fit layer from the render canvas itself. The ratio is now owned by the preview frame, while the canvas fills that frame directly. Verification: render-node-ui.test.tsx passed, canvas-node-interaction-helpers.test.ts passed, targeted ESLint passed, and production build passed outside sandbox.
<!-- SECTION:NOTES:END -->
