---
id: TASK-019
title: Centralize Convex node status patches
status: Done
assignee:
  - Codex
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 07:38'
labels:
  - convex
  - nodes
  - status
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Centralize repeated Convex node status/data patch builders for executing, retry, error, and done states across AI, agents, image transforms, and nodes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shared patch builders exist for executing, retry, error, and done states.
- [x] #2 Node data merge behavior is centralized.
- [x] #3 Existing cleanup fields like task IDs, reservations, and status messages remain correct.
- [x] #4 Existing node status related tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for AI, agent, and transform status transitions if missing.
2. Create `convex/node_status_helpers.ts` with pure patch builder and merge helpers.
3. Replace repeated patch literals in `ai.ts`, `agents.ts`, `image_transform_mutations.ts`, and `nodes.ts`.
4. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/agent-orchestration-contract.test.ts tests/convex/ai-errors.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started Phase 1 implementation in worktree .worktrees/clever-lagoon-modularization on branch codex/clever-lagoon-modularization.

Returned to To Do after the verified TASK-021/TASK-022 slice; no TASK-019 code changes were made in this pass.

Resumed implementation after commit 7782956. Starting TASK-019 in worktree .worktrees/clever-lagoon-modularization.

Implemented `convex/node_status_helpers.ts` with executing/retry/error/done patch builders and centralized data merging. Migrated `convex/ai.ts`, `convex/agents.ts`, `convex/image_transform_mutations.ts`, and `convex/nodes.ts`. Verification: `pnpm test -- tests/convex/authz-helpers.test.ts tests/convex/node-status-helpers.test.ts tests/convex/image-transforms.test.ts tests/convex/agent-orchestration-contract.test.ts tests/convex/ai-errors.test.ts tests/convex/canvas-graph-query.test.ts tests/convex/edges-create.test.ts` passed with 110 files / 614 tests; `pnpm lint` exited 0 with 6 existing warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Centralized Convex node status patch builders and node data merge helpers. Migrated AI, agent, image-transform mutation, and node status update paths to shared helpers. Verified with node-status and focused backend tests plus lint.
<!-- SECTION:FINAL_SUMMARY:END -->
