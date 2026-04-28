---
id: TASK-013
title: Extract Convex provider polling flow
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:48'
labels:
  - convex
  - polling
  - freepik
  - refactor
  - tests
dependencies:
  - TASK-012
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared provider polling helpers for video and image-transform Freepik tasks across `convex/ai.ts`, `convex/image_transforms.ts`, and `convex/image_transform_mutations.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Timeout, retryable error, terminal failure, and next-poll scheduling behavior is centralized.
- [x] #2 Video polling behavior remains unchanged.
- [x] #3 Image transform polling behavior remains unchanged.
- [x] #4 Existing Freepik and image-transform polling tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for retry, terminal failure, timeout, and success polling paths if missing.
2. Create a polling helper module with shared timeout/retry/schedule/failure utilities.
3. Refactor video polling to use the shared helpers.
4. Refactor image-transform polling to use the shared helpers.
5. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/freepik-video-client.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Added `convex/provider_polling.ts` with shared helpers for provider poll delay, timeout detection, timeout messages, provider terminal failure messages, retry eligibility, and next-attempt schedule arguments.
- Refactored `convex/ai.ts` video polling to use the shared helpers while preserving the existing `pollVideoTask` Convex export and public behavior.
- Refactored `convex/image_transforms.ts` transform polling to use the same helpers while preserving the existing `pollImageTransformTask` Convex export and public behavior.
- Added characterization tests in `tests/convex/ai-errors.test.ts` for timeout messages, terminal provider failure fallback, retry eligibility, and immutable next-poll scheduling.
- Verification: `npm test -- tests/convex/ai-errors.test.ts` initially failed as expected with `Cannot find module '@/convex/provider_polling'` before implementation.
- Verification: `npm test -- tests/convex/ai-errors.test.ts` passed after implementation: 1 file, 14 tests passed.
- Verification: `npm test -- tests/convex/image-transforms.test.ts tests/convex/freepik-video-client.test.ts tests/convex/ai-errors.test.ts` passed: 3 files, 36 tests passed.
- Verification: `npm run lint` completed with 0 errors and 6 warnings in unrelated files (`components/canvas/nodes/mixer-node.tsx`, `lib/canvas-node-favorite.ts`, `lib/image-pipeline/backend/webgl/webgl-backend.ts`, `tests/image-pipeline/parity/fixtures.ts`).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:SUMMARY:BEGIN -->
Shared Convex provider polling flow has been extracted and both Freepik video and image-transform polling now use the centralized timeout, retry, terminal failure, and next-schedule helpers. Existing exports and verified behavior are preserved.
<!-- SECTION:SUMMARY:END -->
