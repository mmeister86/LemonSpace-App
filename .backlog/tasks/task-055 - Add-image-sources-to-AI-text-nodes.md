---
id: TASK-055
title: Add image sources to AI text nodes
status: Done
assignee: []
created_date: '2026-05-14 17:17'
updated_date: '2026-05-14 17:42'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Allow KI-Text nodes to use connected image, asset, ai-image, and render outputs as visual source material. Instruction inputs remain text-only; draft/content inputs can include visual sources. The stream route should send image references directly to multimodal text models and use an internal caption fallback only when the selected model cannot consume images.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 KI-Text draft/content handles accept visual sources while instruction handles remain text-only.
- [x] #2 KI-Text UI exposes a visual mode for connected images with context as the default and describe as the alternate mode.
- [x] #3 The text stream request and server lifecycle validate and resolve visual references for the current canvas before model invocation.
- [x] #4 AI text message construction supports multimodal image parts and internal caption fallback only when needed.
- [x] #5 Focused tests cover connection policy, repeating handles, stream protocol/messages, and AI text node request behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for AI text visual source connection policy and repeating handles.
2. Add failing tests for multimodal text stream protocol/message construction.
3. Add failing tests for AI text node collecting visual references and visual mode.
4. Implement connection policy and handle resolution changes.
5. Implement stream request/message/server visual reference support.
6. Implement AI text node UI and request payload changes.
7. Run focused tests and update task notes with verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented visual source support for KI-Text nodes. Verified draft/content handles accept image, asset, ai-image, and render while instruction handles remain text-only. Added visual mode UI, multimodal AI SDK message construction, stream protocol parsing, Convex-side visual reference validation/resolution, and focused tests. Verification: npm run test -- tests/convex/ai-text-pipeline-visual-references.test.ts tests/canvas-connection-policy.test.ts tests/canvas-repeating-input-handles.test.ts tests/lib/ai-stream-text-messages.test.ts tests/lib/ai-stream-protocol.test.ts tests/lib/agent-models.test.ts tests/ai-text-node.test.ts passed (96 tests). npm run lint exited 0 with existing warnings outside touched files. npx tsc --noEmit still fails on pre-existing test type issues in components/canvas/__tests__/comment-node.test.tsx and tests/prompt-node.test.ts.

Follow-up UX adjustment: removed the manual context/describe selector from the KI-Text node. Connected visual material is shown as source material only; the route now decides automatically from model capability. Vision-capable models receive image parts directly, while non-vision models use the existing internal caption fallback. Verification after adjustment: npm run test -- tests/convex/ai-text-pipeline-visual-references.test.ts tests/canvas-connection-policy.test.ts tests/canvas-repeating-input-handles.test.ts tests/lib/ai-stream-text-messages.test.ts tests/lib/ai-stream-protocol.test.ts tests/lib/agent-models.test.ts tests/ai-text-node.test.ts passed (96 tests). npm run lint exited 0 with existing warnings outside touched files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped KI-Text visual source support. Draft/content inputs accept image, asset, ai-image, and render sources; instruction inputs remain text-only. The AI text node now shows connected visual material without a manual context/describe choice. The server validates and resolves visual references for the canvas, sends image parts directly to vision-capable models, and keeps an internal caption fallback for non-vision models. Focused tests passed (96 tests); lint exits 0 with existing warnings outside touched files; tsc remains blocked by pre-existing test type errors outside this feature.
<!-- SECTION:FINAL_SUMMARY:END -->
