---
id: TASK-002
title: Fix render-node creation from change-camera image output
status: Done
assignee: []
created_date: '2026-04-26 19:14'
updated_date: '2026-04-27 08:50'
labels:
  - bug
  - canvas
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dragging an edge from the image node produced by the change-camera flow and dropping it to create/connect a render node currently triggers a React maximum update depth error inside the color-adjust node slider controls. Investigate the root cause and fix the canvas workflow so this edge-drop path does not destabilize adjustment node rendering.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dropping an edge from a change-camera-produced image node to create/connect a render node completes without a node rendering error.
- [x] #2 Existing adjustment nodes such as color-adjust continue to render their slider controls without infinite update loops after the connection drop.
- [x] #3 The fix is covered by the narrowest practical automated test or documented manual verification if the UI path cannot be automated in the existing test setup.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace the edge-drop error stack and identify whether the render-node creation path or an existing adjustment node remount causes the update loop.
2. Add a focused regression test for the slider resize/layout behavior that can trigger repeated updates.
3. Fix the root cause in ParameterSlider by deduplicating resize observations and avoiding no-op layout state updates.
4. Verify with targeted canvas tests, full Vitest, and scoped lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: render-node creation changes the canvas graph and can remount/reflow existing adjustment nodes. ParameterSlider listened to every ResizeObserver notification and then ran layout state updates, even for unchanged measurements. In the browser this can feed ResizeObserver/layout/ref churn around Radix Slider thumbs and produce React's maximum update depth error.

Validation: added a focused regression test for resize-entry deduplication. Full Vitest passes: 105 files, 589 tests. Full `pnpm lint` is blocked by existing generated `.worktrees/change-camera-node/.next` artifacts being linted; scoped ESLint on the changed files passes.

Follow-up after browser reproduction still showed the error: the dev bundle did include the resize-deduplication fix, so this was not a deploy/hot-reload issue. The remaining root cause was Radix SliderThumb's internal React 19 ref-state loop (`SliderThumb.useComposedRefs`). ParameterSlider now uses a native range input with the existing custom visual track/thumb instead of Radix SliderThumb, removing that ref path entirely.

Follow-up after hard reload showed a new maximum-depth stack at `CanvasSelectionToolbar`. Root cause: `useOnSelectionChange` from `@xyflow/react` registers its handler in an effect keyed by handler identity. The toolbar passed an inline `onChange`, so each state-triggered rerender registered a fresh handler and updated the React Flow store again. The handler is now memoized with `useCallback`, and equivalent selected-node arrays are deduped before local state updates.

Follow-up: RenderNode auto-resize still re-entered history capture when CanvasSyncContext callback identities changed before the resize dimensions had committed. Added a pending resize guard keyed by source dimensions, target dimensions, and aspect ratio so identical auto-resize requests are skipped until the measured node size changes. Regression added to tests/use-pipeline-preview.test.ts by rerendering with a new queueNodeResize identity while props still contain the old dimensions.

Follow-up: Native ParameterSlider range input introduced while replacing Radix was missing React Flow's `nodrag`/`nowheel` interaction classes. This let React Flow treat slider drags as node/canvas interaction, causing adjustment slider edits to be overwritten shortly afterward. Added the classes to the slider surface and native range input, plus a regression test asserting the React Flow interaction guard is present.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the render-node creation path from change-camera image outputs across main workspace and .worktrees/change-camera-node. Replaced the Radix-backed ParameterSlider with a native range overlay to avoid React 19 ref update loops, stabilized CanvasSelectionToolbar selection-change registration, guarded RenderNode auto-resize so repeated context callback identity changes do not repeatedly capture history for the same pending resize, and marked the native slider input with React Flow `nodrag`/`nowheel` classes so adjustment slider edits are not stolen by node dragging. Verified targeted Vitest coverage and scoped ESLint in both workspaces.
<!-- SECTION:FINAL_SUMMARY:END -->
