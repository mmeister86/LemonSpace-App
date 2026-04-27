---
id: TASK-019
title: Centralize Convex node status patches
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Shared patch builders exist for executing, retry, error, and done states.
- [ ] #2 Node data merge behavior is centralized.
- [ ] #3 Existing cleanup fields like task IDs, reservations, and status messages remain correct.
- [ ] #4 Existing node status related tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for AI, agent, and transform status transitions if missing.
2. Create `convex/node_status_helpers.ts` with pure patch builder and merge helpers.
3. Replace repeated patch literals in `ai.ts`, `agents.ts`, `image_transform_mutations.ts`, and `nodes.ts`.
4. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/agent-orchestration-contract.test.ts tests/convex/ai-errors.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
