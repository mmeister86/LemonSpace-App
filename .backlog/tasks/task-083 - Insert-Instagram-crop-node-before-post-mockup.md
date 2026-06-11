---
id: TASK-083
title: Insert Instagram crop node before post mockup
status: Done
assignee: []
created_date: '2026-06-10 08:11'
updated_date: '2026-06-11 11:40'
labels: []
dependencies: []
modified_files:
  - convex/agent_instagram_harness.ts
  - convex/agents.ts
  - lib/canvas-connection-policy.ts
  - lib/instagram-post-mockup.ts
  - components/canvas/nodes/instagram-post-mockup-node.tsx
  - tests/convex/instagram-agent-harness.test.ts
  - tests/lib/canvas-connection-policy.test.ts
  - tests/lib/instagram-post-mockup.test.ts
  - tests/instagram-post-mockup-node.test.ts
  - tests/instagram-post.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the Instagram Agent's visible AI-image prompt node handoff with an editable crop node that prepares ready visual inputs for the Instagram post mockup at a 4:5 feed format.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Instagram post packages no longer create a visible visualPrompt prompt/KI-Bild node.
- [x] #2 When a ready visual input exists, the package creates a crop node configured for a centered 4:5, 1080x1350 output and wires visual source -> crop -> instagram mockup visual-in.
- [x] #3 The Instagram mockup accepts and renders crop-node previews through the existing client preview pipeline without requiring a persisted image URL.
- [x] #4 Crop remains absent when no ready visual input exists, and the mockup still reports a missing visual input.
- [x] #5 Targeted Instagram harness, connection policy, resolver/mockup, and image safety tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect existing uncommitted changes in Instagram harness/mockup files and preserve user work.
2. Update tests first for the crop-before-mockup behavior and verify RED.
3. Implement harness artifact shape: remove visible visualPrompt prompt node, add optional crop artifact and bindings.
4. Implement Convex package creation wiring source -> crop -> mockup visual-in.
5. Allow crop visual sources and update resolver/UI to render crop preview slots.
6. Run targeted tests and record verified acceptance criteria without closing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification 2026-06-10:
- npm run test -- tests/convex/instagram-agent-harness.test.ts tests/lib/canvas-connection-policy.test.ts tests/lib/instagram-post-mockup.test.ts tests/instagram-post-mockup-node.test.ts tests/instagram-post.test.ts -> pass, 5 files / 29 tests
- npm run test -- tests/canvas-connection-policy.test.ts tests/crop-node.test.ts tests/image-pipeline/geometry-transform.test.ts tests/crop-node-data-validation.test.ts -> pass, 4 files / 69 tests
- npm run lint -> exit 0, existing warnings only in webgl-backend.ts and parity fixtures

Browser smoke 2026-06-10:
- Reloaded http://localhost:3000/canvas/j57amnz5f9ta3yz3a8dxkv2m7187vf89 in the in-app browser. Canvas rendered with Instagram mockup and preview frames present.
- Console still reports Convex onboarding:getState errors in OnboardingRuntime; observed but out of scope for this Instagram crop task.

Follow-up fix 2026-06-10:
- Root cause 1: resolveInstagramPostPackageArgs respected a lower-priority model-selected image before considering stronger connected render sources. Added deterministic visual-source priority so render wins over ai-image/asset/image, with selected ID only breaking ties.
- Root cause 2: CropNode preview used a URL-only upstream lookup, so render -> crop could collapse to the first upstream image in a mixer path, e.g. the LemonSpace logo. Crop preview now uses resolveRenderPreviewInputFromGraph and forwards sourceComposition.
- Added RED/GREEN regression tests for render-over-logo selection, render -> crop sourceComposition resolution, and CropNode sourceComposition handoff.
- Verification: npm run test -- tests/convex/instagram-agent-harness.test.ts tests/lib/canvas-connection-policy.test.ts tests/lib/instagram-post-mockup.test.ts tests/instagram-post-mockup-node.test.ts tests/instagram-post.test.ts tests/lib/canvas-render-preview.test.ts tests/crop-node.test.ts tests/crop-node-data-validation.test.ts tests/image-pipeline/geometry-transform.test.ts -> pass, 9 files / 68 tests.
- Verification: npm run lint -> exit 0, existing warnings only in webgl-backend.ts and tests/image-pipeline/parity/fixtures.ts.
- Browser reload check was blocked by existing Convex errors in onboarding:getState and storage:batchGetUrlsForCanvas; before reload, DOM confirmed current crop was already wired render -> crop -> mockup, so the visible logo fallback was the preview resolver issue.

Follow-up visual polish 2026-06-10:
- Root cause: InstagramPost image area was still aspect-square while the crop output is 4:5, so RenderNodePreviewSurface correctly contained the 4:5 canvas and exposed grey side gutters.
- Added optional InstagramPost imageAspectRatio=portrait-4-5 and data-testid for the image area. InstagramPostMockupNode now uses portrait-4-5 when the visual source is a crop node.
- Crop mockup preview now lets RenderNodePreviewSurface fill the 4:5 slot at 100% x 100% instead of passing a fixed 376px x 470px display size.
- Verification: npm run test -- tests/convex/instagram-agent-harness.test.ts tests/lib/canvas-connection-policy.test.ts tests/lib/instagram-post-mockup.test.ts tests/instagram-post-mockup-node.test.ts tests/instagram-post.test.ts tests/lib/canvas-render-preview.test.ts tests/crop-node.test.ts tests/crop-node-data-validation.test.ts tests/image-pipeline/geometry-transform.test.ts components/canvas/__tests__/render-node-ui.test.tsx -> pass, 10 files / 75 tests.
- Verification: npm run lint -> exit 0, existing warnings only.
- Browser measurement after reload: mockup image area class relative aspect-[4/5] overflow-hidden; image area 78x98, preview frame 78x98, frame style 100% x 100%.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped the Instagram Agent crop-before-mockup flow. The agent no longer creates a visible KI-Bild/visualPrompt node, ready visual sources are routed through an editable 4:5 crop node, crop/render previews resolve live compositions, and the Instagram mockup uses a 4:5 crop image area without side gutters. Verified with targeted Instagram/crop/render tests and lint.
<!-- SECTION:FINAL_SUMMARY:END -->
