---
id: TASK-016
title: Split Convex AI pipelines
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 10:04'
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
- [x] #1 Image generation helper code is separated from text and video helper code.
- [x] #2 Text generation helper code is separated from image and video helper code.
- [x] #3 Video generation and polling helper code is separated behind the existing exports.
- [x] #4 Existing AI-related tests pass.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Split the monolithic `convex/ai.ts` implementation into `convex/ai_image_pipeline.ts`, `convex/ai_text_pipeline.ts`, and `convex/ai_video_pipeline.ts`.
- Kept `convex/ai.ts` as the stable Convex export surface by registering the existing public/internal function names from pipeline definition factories.
- Added `tests/convex/ai-pipeline-modules.test.ts` to lock the module boundary and ensure provider-specific imports stay out of `convex/ai.ts`.
- Validation passed: `npm test -- tests/convex/openrouter.test.ts tests/convex/openrouter-structured-output.test.ts tests/convex/freepik-video-client.test.ts tests/convex/ai-errors.test.ts tests/convex/agent-orchestration-contract.test.ts tests/convex/ai-pipeline-modules.test.ts`.
- Validation passed for touched files: `npx eslint convex/ai.ts convex/ai_image_pipeline.ts convex/ai_text_pipeline.ts convex/ai_video_pipeline.ts tests/convex/ai-pipeline-modules.test.ts`.
- Full `npm run lint` is blocked by unrelated existing errors in `components/canvas/canvas-sync-queue-flusher.ts`; full `npx tsc --noEmit` is blocked by unrelated existing errors outside the touched AI pipeline files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL:BEGIN -->
TASK-016 completed. Image, text, and video AI pipeline concerns are now in separate modules behind the existing `convex/ai.ts` Convex exports, with focused structural coverage and AI-related regression tests passing.
<!-- SECTION:FINAL:END -->
