---
id: TASK-084
title: Add Instagram mockup send simulation
status: In Progress
assignee:
  - Codex
created_date: '2026-06-11 08:48'
updated_date: '2026-06-11 09:19'
labels: []
dependencies: []
modified_files:
  - components/canvas/nodes/instagram-post-mockup-node.tsx
  - components/agents/instagram/ui/instagram-post.tsx
  - tests/instagram-post-mockup-node.test.ts
  - tests/instagram-post.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a client-only demo publishing simulation to the Instagram post mockup node so a tech demo can show direct posting to the user's own Instagram feed without calling Instagram, Convex, or any backend API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Instagram post mockup node shows a visible node-level Senden button below the post preview.
- [x] #2 Clicking Senden opens a modal with German staged publish status text and a determinate progress bar.
- [x] #3 The simulation advances through the requested Instagram posting stages, reaches 100% success, and auto-closes shortly after success.
- [x] #4 Manual modal close resets the simulation so a later click starts from the first stage again.
- [x] #5 Vitest coverage verifies opening, staged progress text, success, and auto-close behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing Vitest coverage in tests/instagram-post-mockup-node.test.ts for the Senden CTA, dialog opening, staged text/progress, success, auto-close, and reset after manual close.
2. Run the targeted Vitest file and confirm the new test fails because the feature is not implemented.
3. Update components/canvas/nodes/instagram-post-mockup-node.tsx only: import React state/effect plus Button/Dialog/Progress/Send, add a private publish simulation dialog, render the node-level Senden CTA below the preview, and keep the flow client-only with no backend calls.
4. Run the targeted Vitest file until green.
5. Run focused lint/test verification for the touched files where available, update Backlog acceptance criteria and notes, but do not mark the task Done until user confirmation.

Follow-up layout fix: reproduce the mockup whitespace by asserting the Instagram preview root can fill its containing node width, then remove the preview's hard max-width so the card, send button, and details align to the same width. Verify with focused tests/lint and browser visual check if browser tooling is available.

Follow-up preview quality fix: wire the Instagram mockup crop/live pipeline preview to the existing zoom-aware preview quality helper so zoomed-in mockups render with higher pipeline resolution while zoomed-out views stay cheaper. Add a failing test by mocking useZoomAwarePreviewQuality/usePipelinePreview to assert the crop slot forwards high zoom previewQuality, then implement and verify targeted tests/lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the client-only Instagram mockup send simulation in components/canvas/nodes/instagram-post-mockup-node.tsx with a node-level Senden CTA, local Dialog + Progress staged flow, 900ms auto-close after success, and reset on manual close. Added tests in tests/instagram-post-mockup-node.test.ts covering open, every requested stage/progress value, auto-close, and manual reset. Verification: npm run test -- tests/instagram-post-mockup-node.test.ts passed with 5/5 tests; npm run lint -- components/canvas/nodes/instagram-post-mockup-node.tsx tests/instagram-post-mockup-node.test.ts passed. Subagent code review approved with no blocking findings.

Follow-up layout fix: removed the InstagramPost card's hard max-w-[470px] so it fills the mockup node width and aligns with the Senden button/details. Added tests/instagram-post.test.ts coverage for flexible parent width. Verification: npm run test -- tests/instagram-post.test.ts tests/instagram-post-mockup-node.test.ts passed with 9/9 tests; npm run lint -- components/agents/instagram/ui/instagram-post.tsx components/canvas/nodes/instagram-post-mockup-node.tsx tests/instagram-post.test.ts tests/instagram-post-mockup-node.test.ts passed. Browser measurement after reload showed preview, card, send button, and details all at the same rendered width.

Follow-up: Wired the Instagram mockup crop preview into zoom-aware pipeline quality with a Retina-friendly DPR cap. Verified the mockup now renders through the live preview canvas instead of a static image when connected to a crop node.
Verification: npm run test -- tests/instagram-post.test.ts tests/instagram-post-mockup-node.test.ts; npm run lint -- components/agents/instagram/ui/instagram-post.tsx components/canvas/nodes/instagram-post-mockup-node.tsx tests/instagram-post.test.ts tests/instagram-post-mockup-node.test.ts; git diff --check -- components/agents/instagram/ui/instagram-post.tsx components/canvas/nodes/instagram-post-mockup-node.tsx tests/instagram-post.test.ts tests/instagram-post-mockup-node.test.ts.
<!-- SECTION:NOTES:END -->
