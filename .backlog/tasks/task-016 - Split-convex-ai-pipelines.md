---
id: TASK-016
title: Split Convex AI pipelines
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - convex
  - ai
  - refactor
  - tests
dependencies:
  - TASK-012
  - TASK-013
  - TASK-019
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split `convex/ai.ts` into image, text, and video pipeline helpers while keeping the current public `ai.ts` Convex exports stable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Image generation helper code is separated from text and video helper code.
- [ ] #2 Text generation helper code is separated from image and video helper code.
- [ ] #3 Video generation and polling helper code is separated behind the existing exports.
- [ ] #4 Existing AI-related tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm tests cover image, text, and video success/failure paths.
2. Extract image-specific helpers from `convex/ai.ts`.
3. Extract text-specific helpers from `convex/ai.ts`.
4. Extract video-specific helpers from `convex/ai.ts`.
5. Keep public actions/internal actions exported from `convex/ai.ts`.
6. Run `npm test -- tests/convex/openrouter.test.ts tests/convex/freepik-video-client.test.ts tests/convex/ai-errors.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
