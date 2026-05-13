---
id: TASK-049
title: Enable multi-image inputs for KI-Bild nodes
status: Done
assignee: []
created_date: '2026-05-13 18:43'
updated_date: '2026-05-13 19:35'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow the KI-Bild prompt node to combine up to six visual references from image, asset, ai-image, and render nodes. Preserve the existing single text-source override behavior. Render-node references must auto-bake the current preview visibly before generation when needed, and the OpenRouter image request must send numbered references as multiple image_url parts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt nodes accept up to six image-like references from image, asset, ai-image, and render nodes while still allowing exactly one text or KI-text source.
- [x] #2 Connected render nodes auto-bake the current preview visibly before generation when their current preview is not already uploaded, and generation uses that baked output.
- [x] #3 Image generation actions accept and persist a referenceImages array while preserving legacy single-reference arguments.
- [x] #4 OpenRouter image requests send prompt text first followed by all reference images as image_url content parts with numbered reference context.
- [x] #5 Image model selection gates unsupported reference workflows using synced frontend/backend capability flags.
- [x] #6 Relevant policy, prompt-node, ai-image-node, OpenRouter, and model-registry tests cover the new behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for prompt connection policy, model capability sync, OpenRouter multi-image request bodies, PromptNode reference collection/render materialization, and AiImageNode regeneration references.
2. Extend shared image model definitions with reference support capabilities and keep frontend/backend registries in sync.
3. Update canvas connection policy so prompt nodes accept up to six image-like references plus one text source.
4. Add reusable render-node materialization helpers that render/upload/persist current render preview output, then use them from PromptNode before generation.
5. Update PromptNode UI and generation payloads to collect ordered Ref 1..6 inputs, gate models, and send referenceImages.
6. Update AiImageNode regenerate flow and Convex ai image pipeline to carry referenceImages while preserving legacy referenceStorageId/referenceImageUrl.
7. Update OpenRouter image request builder to send text first followed by multiple image_url content parts, then run targeted tests and note verified acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented multi-reference KI-Bild support across connection policy, PromptNode generation, render reference materialization, AiImage regeneration, Convex pipeline, OpenRouter request formatting, storage URL resolution, and model capability gating. Verification: targeted Vitest suite passed (82 tests across 9 files); ESLint passed with 4 pre-existing warnings; git diff --check passed; tsc --noEmit is blocked by an existing unrelated comment-node test typing issue.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Multi-image KI-Bild references shipped: prompt nodes accept up to six ordered visual references including render nodes; stale render previews are materialized and uploaded before image generation; Convex/OpenRouter carry referenceImages while preserving legacy aliases; AI image regenerate and storage URL resolution support the new array flow; model gating and tests were updated.
<!-- SECTION:FINAL_SUMMARY:END -->
