---
id: TASK-006
title: Unify adjustment node shell
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - node
  - adjustments
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unify `curves-node.tsx`, `color-adjust-node.tsx`, `light-adjust-node.tsx`, and `detail-adjust-node.tsx` behind a shared adjustment node shell/config path while preserving current preset behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The four adjustment nodes use one shared shell or factory-style composition path.
- [ ] #2 Node-specific labels, controls, defaults, and preset types remain distinct and correct.
- [ ] #3 No adjustment node adds its own `presets.list` query outside the existing provider flow.
- [ ] #4 Existing adjustment preview and node tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for one representative preset apply/save flow per adjustment family if missing.
2. Create a shared `AdjustmentNodeShell` and typed config for each adjustment node.
3. Move duplicated preset selection, status, wrapper, and save/apply wiring into the shell.
4. Reduce each adjustment node file to its config and default export composition.
5. Run `npm test -- tests/light-adjust-node.test.ts tests/adjustment-preview.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
