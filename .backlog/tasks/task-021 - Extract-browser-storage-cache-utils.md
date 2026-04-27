---
id: TASK-021
title: Extract browser storage cache utils
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 `getLocalStorage`, safe JSON parse, safe get/set/remove, and record checks are not duplicated across cache files.
- [ ] #2 Dashboard snapshot and credit activity caches use a shared versioned TTL helper where appropriate.
- [ ] #3 Canvas persistence and op queue fallback behavior remain unchanged.
- [ ] #4 Existing cache and storage tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tests for malformed JSON, unavailable storage, quota failure, TTL expiry, and version mismatch if missing.
2. Create `lib/browser-storage-cache.ts` with safe storage and TTL cache helpers.
3. Migrate `dashboard-snapshot-cache.ts` and `credit-activity-cache.ts` first.
4. Migrate shared safe storage helpers in `canvas-local-persistence.ts` and `canvas-op-queue.ts` without changing their data formats.
5. Run `npm test -- tests/lib/dashboard-snapshot-cache.test.ts tests/lib/credit-activity-cache.test.ts` plus canvas persistence tests and `npm run lint`.
<!-- SECTION:PLAN:END -->
