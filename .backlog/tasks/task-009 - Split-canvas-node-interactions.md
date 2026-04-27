---
id: TASK-009
title: Split canvas node interactions
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - interactions
  - groups
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `components/canvas/use-canvas-node-interactions.ts` into helpers for resize persistence, group drop target computation, parent changes, and edge-split interaction logic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Resize persistence logic is isolated.
- [ ] #2 Group/frame drop target computation is isolated.
- [ ] #3 Parent change computation is isolated.
- [ ] #4 Edge intersection split helpers are isolated.
- [ ] #5 Existing node interaction tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for resize, group drop, parent assignment, and edge-split interaction flows.
2. Extract resize persistence helpers.
3. Extract group/frame drop target helpers.
4. Extract parent change helpers.
5. Extract edge intersection split helpers.
6. Keep `useCanvasNodeInteractions` as the hook composition layer.
7. Run `npm test -- components/canvas/__tests__/use-canvas-node-interactions.test.tsx` and `npm run lint`.
<!-- SECTION:PLAN:END -->
