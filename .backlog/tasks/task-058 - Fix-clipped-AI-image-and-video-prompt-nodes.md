---
id: TASK-058
title: Fix clipped AI image and video prompt nodes
status: In Progress
assignee: []
created_date: '2026-05-15 06:52'
updated_date: '2026-05-18 20:08'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Investigate and fix the canvas UI bug where KI-Bild and KI-Video prompt nodes are visually clipped at the bottom compared with KI-Text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 KI-Bild prompt node renders its full bottom border and generate button without clipping.
- [x] #2 KI-Video prompt node renders its full bottom border and generate button without clipping.
- [x] #3 Relevant tests or verification cover the node sizing behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compare KI-Text, KI-Bild, and KI-Video prompt node sizing and wrapper behavior.
2. Add a focused failing regression check for prompt node minimum height/default sizing.
3. Adjust the root cause so the full node chrome and bottom button render.
4. Run focused tests and update acceptance criteria notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: prompt and video-prompt controls grew beyond the old 220px default/min height. KI-Text avoided the symptom because it starts taller and uses data-canvas-node-autosize-content.
Implemented: prompt and video-prompt now default/min-height to 320px and their content roots participate in content-aware autosizing for existing undersized nodes.
Verification: pnpm vitest run tests/prompt-node.test.ts tests/video-prompt-node.test.ts tests/lib/canvas-utils-modules.test.ts passed. Browser reached localhost:3000 but only unauthenticated landing page was available, so no authenticated canvas visual check.

User visual review showed 320px was too tall. Adjusted prompt and video-prompt default/min height down by 60px to 260px while keeping content-aware autosize attributes in place. Verification rerun passed: pnpm vitest run tests/prompt-node.test.ts tests/video-prompt-node.test.ts tests/lib/canvas-utils-modules.test.ts.

Follow-up regression: every newly placed selected node expanded on both axes. Root cause was BaseNodeWrapper autosize measuring the full node chrome, so selected toolbar/resize chrome could be interpreted as content overflow. Fix: measure a dedicated canvas-node-measure content wrapper and keep toolbar/resize chrome outside autosize measurements. Added regression test: selected toolbar overflow no longer queues node resize. Verification passed: pnpm vitest run components/canvas/__tests__/base-node-wrapper.test.tsx tests/prompt-node.test.ts tests/video-prompt-node.test.ts tests/lib/canvas-utils-modules.test.ts.

Systematic debugging follow-up (2026-05-18): user reported resize loop persists and deletes reappear after reload. Root cause traced across Reconciliation -> local op mirror -> Convex snapshot. Pending resize/delete state existed only in memory after reload; Convex could reintroduce stale node sizes and pending-deleted nodes before queued ops flushed, which re-triggered autosize and made deletes look non-persistent. Fix: restore pending batchRemoveNodes IDs and resizeNode size pins from the local op mirror, feed them into canvas reconciliation, and keep toolbar/resize chrome outside autosize measurement. Added regressions for pending delete hiding, pending resize pins, and local op extraction. Verification: focused vitest suite passed (103 tests). TypeScript noEmit still has unrelated pre-existing test typing errors in comment-node, rate-limit, and prompt-node tests.

Added development diagnostics for the persistent resize/delete issue. Logs are emitted for all node types except group/comment/note in autosize and reconciliation, plus resize queue/delete lifecycle logs. Events: autosize-queue-resize, queue-node-resize, reconcile-node-size, reconcile-pending-deletes, delete-nodes-start, delete-nodes-batch-remove-accepted, delete-nodes-batch-remove-failed. Verification: pnpm vitest run components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/use-canvas-flow-reconciliation.test.ts tests/canvas-delete-handlers.test.ts components/canvas/__tests__/use-canvas-sync-engine.test.ts passed.

Investigated user console logs: repeated autosize for asset-video showed width growing 1888 -> 2340 -> 2644 while height stayed 180. Root cause was horizontal content autosize reading self-scaling media scrollWidth and persisting it back as node width. Changed content-aware autosize so width only grows when explicitly opted in; vertical autosize remains. Added regression coverage for asset-video self-scaling media overflow and prompt vertical growth. Verification: focused Canvas/node tests pass (99 tests). TypeScript check still fails on existing unrelated test typing errors in comment-node, rate-limit, and prompt-node tests.
<!-- SECTION:NOTES:END -->
