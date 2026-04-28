---
id: TASK-017
title: Simplify Convex credit transitions
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:49'
labels:
  - convex
  - credits
  - refactor
  - tests
dependencies:
  - TASK-012
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Simplify repeated balance, tier, daily usage, reservation, release, and concurrency transition logic inside `convex/credits.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Balance and subscription/tier lookup helpers are centralized.
- [x] #2 Daily usage and concurrency increment/decrement helpers are centralized.
- [x] #3 Reservation release logic is shared where safe.
- [x] #4 Existing credit activity and credit transition tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for reserve, commit, release, stale release, and concurrency decrement if missing.
2. Extract local helper functions inside `credits.ts` first.
3. Replace repeated balance/tier/daily usage code with helpers.
4. Replace repeated reservation release code where behavior is identical.
5. Run `npm test -- tests/convex/credit-activity-query.test.ts tests/lib/credits-activity.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted reusable credit transition helpers in `convex/credits.ts` for available balance calculation, reserved/committed/released balance patches, tier lookup, daily usage lookup/increment, concurrency decrement, and safe reserved balance release.
- Reused the helpers in `reserve`, `commitInternal`, `releaseInternal`, `releaseStaleReservations`, `checkAbuseLimits`, `incrementUsage`, and `decrementConcurrency` without renaming public Convex functions.
- Added `tests/convex/credit-transition-helpers.test.ts` to characterize balance and daily usage transition patch behavior.
- Verification: `npm test -- tests/convex/credit-transition-helpers.test.ts` first failed as expected because `creditTransitionHelpersForTesting` was undefined; after implementation it passed with 1 file and 3 tests passing.
- Verification: `npm test -- tests/convex/credit-activity-query.test.ts tests/lib/credits-activity.test.ts tests/convex/credit-transition-helpers.test.ts` passed with 3 files and 10 tests passing.
- Verification: `npm test -- tests/convex/job-credit-flow.test.ts` passed with 1 file and 3 tests passing. The expected best-effort release warning was printed by that test.
- Verification: `npx eslint convex/credits.ts tests/convex/credit-transition-helpers.test.ts` passed with no output.
- Full lint: `npm run lint` could not complete because ESLint failed before linting with `ENOENT: no such file or directory, open '.../lib/canvas-op-queue.ts'`, caused by an unrelated deleted file already present in the worktree.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:SUMMARY:BEGIN -->
TASK-017 is complete. `convex/credits.ts` now centralizes repeated balance, tier, daily usage, reservation release, and concurrency transitions while preserving existing Convex function names and credit semantics.
<!-- SECTION:SUMMARY:END -->
