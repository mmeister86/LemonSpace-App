---
id: TASK-008
title: Split canvas connection flow
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Connection drop target resolution is isolated and testable.
- [ ] #2 Adjustment auto-split logic is isolated from hook state wiring.
- [ ] #3 Connection menu node creation actions are isolated.
- [ ] #4 Existing connection policy and connection hook tests pass.
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
