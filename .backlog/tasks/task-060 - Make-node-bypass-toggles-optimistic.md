---
id: TASK-060
title: Make node bypass toggles optimistic
status: In Progress
assignee:
  - '@Codex'
created_date: '2026-05-18 21:07'
updated_date: '2026-05-18 21:09'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure the Ausblenden/Einblenden toolbar toggle updates the local React Flow node state immediately while still queuing the existing Convex update for persistence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bypass toggle updates local node data immediately before Convex sync resolves
- [x] #2 Toolbar visual state and aria-pressed reflect the optimistic value after a click
- [x] #3 Queued update payload stays compatible with the existing updateData persistence path
- [x] #4 Focused tests cover the optimistic toggle behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current BaseNodeWrapper toggle and local React Flow update patterns.
2. Add a failing BaseNodeWrapper test proving bypass toggles set local node data immediately before queued sync resolves.
3. Implement optimistic local node data update in the bypass toggle while preserving the existing queued updateData payload.
4. Run focused Vitest for BaseNodeWrapper, then lint if needed.
5. Check acceptance criteria and leave TASK-060 In Progress until user confirms Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented optimistic local bypass toggling in BaseNodeWrapper: the handler now updates React Flow node data via setNodes immediately, then queues the existing updateData persistence payload.

TDD verification:
- Added a failing regression test proving the bypass click calls setNodes before a never-resolving queueNodeDataUpdate can complete.
- Confirmed the test failed before implementation and passed after the local update.

Verification run:
- npm test -- components/canvas/__tests__/base-node-wrapper.test.tsx passed: 20 tests.
- npm test passed: 147 files, 882 tests.
- npm run lint exited 0 with the same three pre-existing warnings in unrelated WebGL/parity files.

Task remains In Progress until explicit user confirmation to mark it Done.
<!-- SECTION:NOTES:END -->
