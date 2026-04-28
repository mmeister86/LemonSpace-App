---
id: TASK-022
title: Unify mixer preview normalization
status: Done
assignee:
  - Codex
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:24'
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
- [x] #1 Mixer source node types and blend modes are defined once.
- [x] #2 Opacity, overlay rect, content rect, and crop edge normalization are shared.
- [x] #3 Render preview and UI mixer preview use the same normalized mixer model.
- [x] #4 Existing render and mixer preview tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add cross-module tests that assert render preview and mixer preview normalize the same data consistently.
2. Create `lib/canvas-mixer-normalization.ts` with constants, types, and normalizers.
3. Move shared layer source resolution into the new module or a focused companion module.
4. Update `canvas-render-preview.ts` and `canvas-mixer-preview.ts` to consume the shared helpers.
5. Run `npm test -- tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started Phase 1 implementation in worktree .worktrees/clever-lagoon-modularization on branch codex/clever-lagoon-modularization.

Implemented shared `lib/canvas-mixer-normalization.ts` for mixer source types, blend mode, opacity, overlay rect, and crop/content rect normalization. Migrated render preview and mixer preview to consume the shared helper. Verification: `pnpm test -- tests/lib/canvas-mixer-normalization.test.ts tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts` passed, and phase-focused verification command passed with 108 files / 610 tests. `pnpm lint` exited 0 with 6 pre-existing warnings in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Centralized mixer preview normalization in `lib/canvas-mixer-normalization.ts`, including mixer source node types, blend modes, opacity clamping, overlay rect normalization, and crop/content rect normalization. Updated both `lib/canvas-render-preview.ts` and `lib/canvas-mixer-preview.ts` to consume the shared model, with focused coverage in `tests/lib/canvas-mixer-normalization.test.ts`. Verification during implementation: `pnpm test -- tests/lib/canvas-mixer-normalization.test.ts tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts` passed; phase-focused verification also passed with 108 files / 610 tests; `pnpm lint` exited 0 with 6 pre-existing warnings in unrelated files. User confirmed manual testing on 2026-04-27.
<!-- SECTION:FINAL_SUMMARY:END -->
