---
id: TASK-080
title: Fix Instagram agent success status and mockup visual fallback
status: In Progress
assignee: []
created_date: '2026-06-09 15:37'
updated_date: '2026-06-09 15:44'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure successful Instagram tool-harness runs remain done even if post-run credit or concurrency cleanup times out, and make the live Instagram mockup fall back to its snapshot image when a connected visual source has no resolved URL yet.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Successful Instagram package creation and final summary keep the agent node done even when credit commit or concurrency cleanup throws.
- [x] #2 Actual tool or package failures before successful finalization still mark the agent node error.
- [x] #3 A connected visual source without a resolved URL falls back to the mockup snapshot image.
- [x] #4 A connected visual source with a resolved URL still overrides the snapshot image.
- [x] #5 Focused regression tests cover the agent status path and visual fallback behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing resolver tests for visual-in snapshot fallback and live URL precedence
2. Add failing agent harness test for post-finalization billing/concurrency failure preserving done status
3. Update Instagram mockup resolver to use snapshot image when live visual URL is missing
4. Split successful harness finalization from best-effort credit/concurrency cleanup
5. Run focused tests and update acceptance criteria notes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented TDD fix. Red tests failed for missing visual snapshot fallback and missing post-success cleanup helper; green tests now pass. The Instagram tool-harness success finalization is separated from best-effort credit/concurrency cleanup, and mockup visual-in falls back to snapshot image when the live visual URL is not resolved yet.

Verification: focused Vitest suite passed (20 tests across instagram-post-mockup, mockup-node, instagram-agent-harness, agent-orchestration-contract). npm run lint passed with 0 errors and 3 pre-existing warnings. npx tsc --noEmit still fails on existing repo-wide test type errors outside this change. npm run build passed outside the sandbox after the sandboxed Turbopack run failed with EPERM port binding.
<!-- SECTION:NOTES:END -->
