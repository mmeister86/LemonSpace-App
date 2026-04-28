---
id: TASK-012
title: Extract Convex job credit flow
status: Done
assignee:
  - Codex
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 07:38'
labels:
  - convex
  - credits
  - jobs
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared credit reservation, release, commit, and concurrency cleanup helpers used by `convex/ai.ts`, `convex/agents.ts`, and `convex/image_transforms.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI, agent, and image transform jobs use shared credit/concurrency helper functions.
- [x] #2 `INTERNAL_CREDITS_ENABLED` behavior remains unchanged.
- [x] #3 Failure cleanup still releases reservations and decrements concurrency exactly once.
- [x] #4 Existing Convex AI, agent, transform, and credit tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add or confirm tests for success, provider failure, timeout, and early validation failure credit cleanup.
2. Create `convex/job_credit_flow.ts` with reservation, release, commit, and concurrency helpers.
3. Replace local duplicated helper implementations in AI, agent, and transform flows.
4. Keep public Convex action/mutation names unchanged.
5. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/credit-activity-query.test.ts tests/convex/agent-orchestration-contract.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started after commit d17f130 in worktree .worktrees/clever-lagoon-modularization. Scope: extract shared credit reservation/release/commit/concurrency helpers while preserving public Convex action/mutation names.

Implemented `convex/job_credit_flow.ts` with shared public start/reservation logic plus internal commit, public/internal release, and conditional concurrency cleanup helpers. Migrated AI image/text/video, agent run/execute/analyze, and image-transform generation paths to use the shared helpers while preserving `INTERNAL_CREDITS_ENABLED` behavior. Verification: helper test first failed for missing module, then `pnpm test -- tests/convex/job-credit-flow.test.ts tests/convex/image-transforms.test.ts tests/convex/credit-activity-query.test.ts tests/convex/agent-orchestration-contract.test.ts tests/convex/ai-errors.test.ts tests/convex/freepik-video-client.test.ts` passed with 111 files / 617 tests; `pnpm lint` exited 0 with 6 existing warnings; filtered `tsc` check showed no current-change matches.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted shared Convex job credit flow helpers for public reservation/usage start, internal commit, best-effort release, and conditional concurrency cleanup. Migrated AI image/text/video, agent, and image-transform flows while preserving INTERNAL_CREDITS_ENABLED behavior. Verified with focused Convex tests and lint.
<!-- SECTION:FINAL_SUMMARY:END -->
