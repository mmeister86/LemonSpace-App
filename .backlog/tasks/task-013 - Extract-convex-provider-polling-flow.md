---
id: TASK-013
title: Extract Convex provider polling flow
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
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
- [ ] #1 Timeout, retryable error, terminal failure, and next-poll scheduling behavior is centralized.
- [ ] #2 Video polling behavior remains unchanged.
- [ ] #3 Image transform polling behavior remains unchanged.
- [ ] #4 Existing Freepik and image-transform polling tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for retry, terminal failure, timeout, and success polling paths if missing.
2. Create a polling helper module with shared timeout/retry/schedule/failure utilities.
3. Refactor video polling to use the shared helpers.
4. Refactor image-transform polling to use the shared helpers.
5. Run `npm test -- tests/convex/image-transforms.test.ts tests/convex/freepik-video-client.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
