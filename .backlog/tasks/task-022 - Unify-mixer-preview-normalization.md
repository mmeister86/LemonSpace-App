---
id: TASK-022
title: Unify mixer preview normalization
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - lib
  - mixer
  - render
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unify duplicated mixer constants, normalization, crop/overlay rect handling, and layer source resolution between `lib/canvas-render-preview.ts` and `lib/canvas-mixer-preview.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mixer source node types and blend modes are defined once.
- [ ] #2 Opacity, overlay rect, content rect, and crop edge normalization are shared.
- [ ] #3 Render preview and UI mixer preview use the same normalized mixer model.
- [ ] #4 Existing render and mixer preview tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add cross-module tests that assert render preview and mixer preview normalize the same data consistently.
2. Create `lib/canvas-mixer-normalization.ts` with constants, types, and normalizers.
3. Move shared layer source resolution into the new module or a focused companion module.
4. Update `canvas-render-preview.ts` and `canvas-mixer-preview.ts` to consume the shared helpers.
5. Run `npm test -- tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
