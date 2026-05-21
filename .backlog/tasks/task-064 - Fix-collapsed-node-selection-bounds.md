---
id: TASK-064
title: Fix collapsed node selection bounds
status: Done
assignee: []
created_date: '2026-05-21 14:05'
updated_date: '2026-05-21 14:42'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix collapsed Canvas nodes so React Flow box/lasso selection uses the visible collapsed node bounds instead of stale expanded measured dimensions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Collapsed nodes are selected when the selection rectangle encloses only the visible collapsed bar.
- [x] #2 React Flow node width, height, measured dimensions, and style stay aligned to the collapsed visual size.
- [x] #3 Expanded-node resize minimum clamping remains unchanged.
- [x] #4 Focused unit tests cover collapsed dimension-change handling, optimistic collapse dimensions, and reconciliation of stale expanded measurements.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing reconciliation test for selected media node grouped from root into a group; incoming relative position must win when parentId changes.
2. Update mergeNodesPreservingLocalState so interactive media position preservation only applies when parentId is unchanged.
3. Run focused grouping/reconciliation tests plus previous collapsed-node tests.
4. Update Backlog notes and acceptance criteria based on verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented collapsed node dimension-source fix. RED tests failed for collapsed dimension clamping, optimistic local dimensions, and stale measured reconciliation before the production changes. GREEN verification: npm run test -- components/canvas/__tests__/canvas-node-interaction-helpers.test.ts components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts => 50 tests passed. Lint verification: npm run lint -- affected files => exit 0. Manual browser check reached localhost public auth page only (Anmelden/Registrieren), so the actual lasso gesture still needs manual verification in an authenticated canvas.

Follow-up reported by user: grouping selected nodes after the collapsed selection fix can make individual nodes jump across the canvas. Investigation hypothesis: mergeNodesPreservingLocalState preserves selected media node positions even when grouping changes parentId, causing absolute positions to be reused as relative child positions.

User confirmed the collapsed-node box selection now works, so AC #1 is checked. Implemented grouping jump follow-up: selected media node positions are no longer preserved when incoming reconciliation changes parentId, preventing absolute root positions from being reused as relative child positions during grouping. RED: npm run test -- components/canvas/__tests__/canvas-helpers.test.ts failed with image position {x:420,y:160} instead of relative {x:24,y:44}. GREEN: same test passed after fix. Broader verification: npm run test -- components/canvas/__tests__/canvas-helpers.test.ts components/canvas/__tests__/canvas-grouping-helpers.test.ts components/canvas/__tests__/canvas-selection-toolbar.test.tsx components/canvas/__tests__/group-node.test.tsx components/canvas/__tests__/canvas-node-interaction-helpers.test.ts components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts => 93 tests passed. Lint for affected files exited 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed collapsed-node selection bounds and the follow-up grouping jump. Collapsed nodes now keep React Flow direct width/height/measured/style aligned to the visible collapsed bar, collapsed dimension changes skip expanded minimum clamping, and reconciliation no longer preserves selected media-node absolute positions when parentId changes during grouping. Verification: focused Canvas tests passed (7 files, 93 tests), affected-file lint exited 0, and git diff --check is clean. User confirmed collapsed-node marking works; grouping jump regression is covered by a RED/GREEN test.
<!-- SECTION:FINAL_SUMMARY:END -->
