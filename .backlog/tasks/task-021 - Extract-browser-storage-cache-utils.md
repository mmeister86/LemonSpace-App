---
id: TASK-021
title: Extract browser storage cache utils
status: Done
assignee:
  - Codex
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:24'
labels:
  - lib
  - cache
  - storage
  - refactor
  - tests
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared safe browser storage, JSON parsing, and versioned TTL cache helpers used by dashboard snapshot, credit activity, canvas local persistence, and canvas op queue modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `getLocalStorage`, safe JSON parse, safe get/set/remove, and record checks are not duplicated across cache files.
- [x] #2 Dashboard snapshot and credit activity caches use a shared versioned TTL helper where appropriate.
- [x] #3 Canvas persistence and op queue fallback behavior remain unchanged.
- [x] #4 Existing cache and storage tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for malformed JSON, unavailable storage, quota failure, TTL expiry, and version mismatch if missing.
2. Create `lib/browser-storage-cache.ts` with safe storage and TTL cache helpers.
3. Migrate `dashboard-snapshot-cache.ts` and `credit-activity-cache.ts` first.
4. Migrate shared safe storage helpers in `canvas-local-persistence.ts` and `canvas-op-queue.ts` without changing their data formats.
5. Run `npm test -- tests/lib/dashboard-snapshot-cache.test.ts tests/lib/credit-activity-cache.test.ts` plus canvas persistence tests and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started Phase 1 implementation in worktree .worktrees/clever-lagoon-modularization on branch codex/clever-lagoon-modularization.

Implemented shared `lib/browser-storage-cache.ts` helpers and migrated dashboard snapshot, credit activity, canvas local persistence, and canvas sync queue fallback storage to use them. Verification: `pnpm test -- tests/lib/credit-activity-cache.test.ts tests/lib/dashboard-snapshot-cache.test.ts tests/lib/browser-storage-cache.test.ts tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts tests/lib/canvas-mixer-normalization.test.ts tests/convex/canvas-graph-query.test.ts tests/convex/edges-create.test.ts tests/convex/ai-errors.test.ts` passed with 108 files / 610 tests. `pnpm lint` exited 0 with 6 pre-existing warnings in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted shared browser storage/cache utilities into `lib/browser-storage-cache.ts` and migrated dashboard snapshot cache, credit activity cache, canvas local persistence, and canvas sync queue fallback storage to use shared safe storage, JSON parsing, record checks, and versioned TTL cache helpers. Added focused coverage in `tests/lib/browser-storage-cache.test.ts`. Verification during implementation: phase-focused `pnpm test -- tests/lib/credit-activity-cache.test.ts tests/lib/dashboard-snapshot-cache.test.ts tests/lib/browser-storage-cache.test.ts tests/lib/canvas-render-preview.test.ts tests/lib/canvas-mixer-preview.test.ts tests/lib/canvas-mixer-normalization.test.ts tests/convex/canvas-graph-query.test.ts tests/convex/edges-create.test.ts tests/convex/ai-errors.test.ts` passed with 108 files / 610 tests; `pnpm lint` exited 0 with 6 pre-existing warnings in unrelated files. User confirmed manual testing on 2026-04-27.
<!-- SECTION:FINAL_SUMMARY:END -->
