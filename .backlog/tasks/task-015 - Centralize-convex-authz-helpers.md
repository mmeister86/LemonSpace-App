---
id: TASK-015
title: Centralize Convex authz helpers
status: Done
assignee:
  - Codex
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 07:38'
labels:
  - convex
  - authz
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Centralize owned-canvas and node-on-canvas authorization helpers used by Convex modules while preserving each caller's existing null, empty array, or throw semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared helpers cover owned canvas lookup and node-on-canvas assertions.
- [x] #2 Existing unauthenticated and unauthorized behavior remains unchanged per caller.
- [x] #3 `nodes.ts`, `edges.ts`, `storage.ts`, `canvases.ts`, `ai.ts`, `image_transforms.ts`, and `agents.ts` use the helpers where appropriate.
- [x] #4 Existing Convex authz-related tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for caller-specific unauthorized behavior if missing.
2. Create `convex/authz_helpers.ts` with `requireOwnedCanvas`, `getOwnedCanvasOrNull`, `requireNodeOnCanvas`, and node type assertion helpers.
3. Migrate low-risk callers first, preserving return/throw behavior.
4. Migrate AI, image transform, and agent callers after low-risk callers pass.
5. Run `npm test -- tests/convex/canvas-graph-query.test.ts tests/convex/edges-create.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started Phase 1 implementation in worktree .worktrees/clever-lagoon-modularization on branch codex/clever-lagoon-modularization.

Returned to To Do after the verified TASK-021/TASK-022 slice; no TASK-015 code changes were made in this pass.

Resumed implementation after commit 7782956. Will handle after or alongside TASK-019 in worktree .worktrees/clever-lagoon-modularization.

Implemented `convex/authz_helpers.ts` with owned-canvas and node-on-canvas helpers. Migrated low-risk Convex callers in `nodes.ts`, `edges.ts`, `storage.ts`, and `canvases.ts`, plus AI/image-transform/agent node membership checks while preserving null/empty-array/throw semantics. Verification: red test first failed for missing `@/convex/authz_helpers`; after implementation, `pnpm test -- tests/convex/authz-helpers.test.ts` passed, and the focused backend suite passed with 110 files / 614 tests. `pnpm lint` exited 0 with 6 existing warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Centralized Convex authz helpers for owned canvas lookup and node-on-canvas assertions. Migrated nodes, edges, storage, canvases, AI, image transforms, and agents while preserving caller-specific null, empty-array, and throw behavior. Verified with authz and focused backend tests plus lint.
<!-- SECTION:FINAL_SUMMARY:END -->
