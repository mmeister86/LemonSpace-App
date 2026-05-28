---
id: TASK-070
title: Fix AI image output preview rendering
status: Done
assignee: []
created_date: '2026-05-28 09:44'
updated_date: '2026-05-28 09:57'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate and fix why the AI image output node no longer shows its own image preview even though connected adjustment nodes can access the generated result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AI image output nodes display a preview for generated image results.
- [x] #2 Downstream adjustment nodes continue to receive the same generated image data.
- [x] #3 The root cause is documented with the relevant files or commits considered.
- [x] #4 Targeted verification confirms the preview works without regressing connected adjustment nodes.
<!-- AC:END -->



## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the canvas and routing docs that govern node rendering.
2. Reproduce or inspect the current page state and console/runtime errors around the AI output preview.
3. Trace data flow from generated image result storage through the AI output node and downstream adjustment node.
4. Compare recent commits and nearby working node implementations to identify the regression point.
5. Add the smallest fix at the source and verify the AI output preview plus downstream adjustment behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started systematic debugging. Observed from user screenshot/app state: AI image output node has text metadata and an outgoing connection; curves/adjustment node displays the generated image, so image data likely exists in shared node/result state but is not rendered by the AI output preview component.

Root cause found: commit 30b9c21 introduced a BaseNodeWrapper measurement layer around node children. AiImageNode still put its flex-column layout classes on the outer node chrome, so the preview child with flex-1 was no longer inside a flex container and collapsed visually. Downstream adjustment preview kept working because it reads the same graph image URL and renders in its own fixed-aspect preview box.
Fix: added BaseNodeWrapper.contentClassName for the measured content layer and applied the flex column layout there from AiImageNode.
Verification: npm test -- components/canvas/__tests__/base-node-wrapper.test.tsx tests/ai-image-node.test.ts passed; npm run lint passed with 3 pre-existing warnings in webgl/parity files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the AI image output preview collapse by applying the node's flex layout to BaseNodeWrapper's measured content layer. Verified with targeted Vitest coverage and lint; downstream adjustment previews continue to use the same graph image URL path.
<!-- SECTION:FINAL_SUMMARY:END -->
