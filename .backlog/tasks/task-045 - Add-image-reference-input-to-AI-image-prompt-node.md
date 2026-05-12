---
id: TASK-045
title: Add image reference input to AI image prompt node
status: Done
assignee: []
created_date: '2026-05-12 05:36'
updated_date: '2026-05-12 06:55'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow the AI image prompt node to accept one connected image or asset as a reference source so users can generate image variants while keeping one optional text prompt source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt nodes accept image or asset inputs as a single reference image source.
- [x] #2 Prompt nodes still accept one text or AI text output input as the prompt source.
- [x] #3 The generate action passes the connected reference image to AI image generation.
- [x] #4 Regenerate from an AI image output reuses the prompt node's connected reference image.
- [x] #5 Connection policy and node behavior are covered by focused tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing connection policy tests for image/asset/text inputs into prompt nodes and input group limits.
2. Implement prompt input connection policy with incoming source-type awareness.
3. Add failing PromptNode tests for referenceStorageId/referenceImageUrl generation.
4. Implement PromptNode reference input resolution and compact reference UI.
5. Add failing AiImageNode regenerate test for prompt-source reference reuse.
6. Implement AiImageNode regenerate reference lookup through the prompt node.
7. Run focused Vitest verification and update Backlog acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented prompt input policy, PromptNode reference resolution/UI, and AiImageNode regenerate reference lookup. Verified with focused Vitest and ESLint on changed files. Task remains In Progress pending user manual confirmation.

Full npm test run attempted after implementation: 132 test files passed, 5 suites failed during collection because components/kibo-ui/comparison/index.tsx cannot resolve motion/react. The focused feature tests and changed-file ESLint pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped image and asset reference inputs for AI image prompt nodes, including grouped connection limits, prompt-node reference UI, reference-aware generation, and regenerate lookup through the source prompt node. Focused Vitest coverage passes; full suite still has unrelated motion/react collection failures noted in implementation notes.
<!-- SECTION:FINAL_SUMMARY:END -->
