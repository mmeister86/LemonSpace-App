---
id: TASK-026
title: Split canvas utils module
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - lib
  - canvas
  - refactor
  - tests
dependencies:
  - TASK-022
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `lib/canvas-utils.ts` into focused modules for Convex/React Flow adapters, handle style/glow helpers, node defaults, media sizing, and bridge-edge creation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 React Flow adapter functions are isolated.
- [ ] #2 Handle accent/glow style helpers are isolated.
- [ ] #3 Node defaults align with node templates and remain available to current callers.
- [ ] #4 Bridge-edge logic is isolated and tested.
- [ ] #5 Existing canvas utility tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for RF adapter output, handle colors, media sizing, and bridge edges if missing.
2. Create `lib/canvas-rf-adapters.ts`.
3. Create `lib/canvas-handle-style.ts`.
4. Create `lib/canvas-node-defaults.ts` or align defaults with existing template module.
5. Create `lib/canvas-bridge-edges.ts`.
6. Preserve old imports through re-exports or update all consumers in one task.
7. Run `npm test -- components/canvas/__tests__/canvas-helpers.test.ts tests/canvas-connection-policy.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
