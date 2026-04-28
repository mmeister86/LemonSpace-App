---
id: TASK-008
title: Split canvas connection flow
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 10:10'
labels:
  - canvas
  - connections
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `components/canvas/use-canvas-connections.ts` into smaller helpers for drop target resolution, auto-split behavior, and connection-menu node actions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Connection drop target resolution is isolated and testable.
- [x] #2 Adjustment auto-split logic is isolated from hook state wiring.
- [x] #3 Connection menu node creation actions are isolated.
- [x] #4 Existing connection policy and connection hook tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for connect end, auto-split, and menu-created node behavior if missing.
2. Extract drop target and magnet fallback resolution helpers.
3. Extract adjustment auto-split decision and mutation arguments helpers.
4. Extract connection drop-menu action helpers.
5. Keep `useCanvasConnections` as the orchestration layer.
6. Run `npm test -- tests/canvas-connection-policy.test.ts tests/canvas-connection-validation.test.ts components/canvas/__tests__/use-canvas-connections.test.tsx` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted drop target and magnet fallback conversion into `components/canvas/canvas-connection-drop-target.ts`.
- Extracted adjustment auto-split resolution into `components/canvas/canvas-connection-auto-split.ts`.
- Extracted connection drop-menu node action construction and settle behavior into `components/canvas/canvas-connection-drop-menu-actions.ts`.
- Added helper-level tests and included them in `vitest.config.ts`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`useCanvasConnections` remains the exported orchestration hook while drop target resolution, magnet fallback conversion, adjustment auto-split resolution, and drop-menu node creation actions are now isolated in focused helpers with tests. Required connection tests pass; lint completes with pre-existing warnings only.
<!-- SECTION:FINAL_SUMMARY:END -->
