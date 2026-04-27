---
id: TASK-015
title: Centralize Convex authz helpers
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Shared helpers cover owned canvas lookup and node-on-canvas assertions.
- [ ] #2 Existing unauthenticated and unauthorized behavior remains unchanged per caller.
- [ ] #3 `nodes.ts`, `edges.ts`, `storage.ts`, `canvases.ts`, `ai.ts`, `image_transforms.ts`, and `agents.ts` use the helpers where appropriate.
- [ ] #4 Existing Convex authz-related tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for caller-specific unauthorized behavior if missing.
2. Create `convex/authz_helpers.ts` with `requireOwnedCanvas`, `getOwnedCanvasOrNull`, `requireNodeOnCanvas`, and node type assertion helpers.
3. Migrate low-risk callers first, preserving return/throw behavior.
4. Migrate AI, image transform, and agent callers after low-risk callers pass.
5. Run `npm test -- tests/convex/canvas-graph-query.test.ts tests/convex/edges-create.test.ts tests/convex/image-transforms.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
