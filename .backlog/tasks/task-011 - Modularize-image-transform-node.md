---
id: TASK-011
title: Modularize image transform node
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - freepik
  - node
  - refactor
  - tests
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Modularize `components/canvas/nodes/image-transform-node.tsx` by extracting operation config/defaults, transform runner logic, per-operation controls, and the Change Camera stage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Operation defaults and normalization are in focused helpers.
- [ ] #2 Transform runner logic is isolated from UI rendering.
- [ ] #3 Operation-specific controls are separate components or config-driven renderers.
- [ ] #4 Change Camera visual stage is isolated.
- [ ] #5 Existing transform node tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for each operation's defaults and run payload if missing.
2. Extract operation config and normalization helpers.
3. Extract transform runner hook.
4. Extract operation control renderers and `ChangeCameraStage`.
5. Keep the main node as a thin wrapper around config, runner, and UI sections.
6. Run `npm test -- tests/change-camera-node.test.ts tests/image-transform-node-utils.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
