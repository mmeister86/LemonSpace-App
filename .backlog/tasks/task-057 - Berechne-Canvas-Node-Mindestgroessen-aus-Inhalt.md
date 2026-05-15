---
id: TASK-057
title: Berechne Canvas-Node-Mindestgroessen aus Inhalt
status: Done
assignee: []
created_date: '2026-05-14 20:44'
updated_date: '2026-05-15 06:48'
labels:
  - canvas
  - nodes
  - bugfix
dependencies: []
modified_files:
  - components/canvas/canvas-node-size-helpers.ts
  - components/canvas/nodes/base-node-wrapper.tsx
  - components/canvas/canvas-node-change-helpers.ts
  - components/canvas/__tests__/base-node-wrapper.test.tsx
  - components/canvas/__tests__/canvas-node-interaction-helpers.test.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nodes im Canvas sollen ihre Mindestbreite und Mindesthoehe aus ihrem sichtbaren Inhalt ableiten, damit Eingaben, Controls und Statusbereiche nicht ausserhalb des Node-Rahmens gerendert werden.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canvas-Nodes berechnen eine inhaltsabhaengige Mindestbreite und Mindesthoehe und unterschreiten diese beim Rendern nicht.
- [x] #2 Mehrzeilige Textfelder, Controls und Statusbereiche bleiben innerhalb des Node-Rahmens sichtbar.
- [x] #3 Bestehende Node-Typen behalten ihre aktuelle Interaktion und Verbindungslogik bei.
- [x] #4 Die Groessenlogik ist durch fokussierte Tests oder eine gleichwertige automatisierte Verifikation abgedeckt.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Centralize canvas node resize metadata in a pure helper that can compute static and content-aware minimum sizes.
2. Add a failing test for content overflow: when rendered content needs more width/height than the current node, the helper returns a larger minimum and a grow-only target size.
3. Wire the helper into BaseNodeWrapper so NodeResizeControl receives the measured minimum size and undersized nodes are queued for resize based on rendered content overflow.
4. Apply the same static minimum guard in canvas-node-change-helpers so persisted dimension changes cannot fall below known node minima.
5. Run focused Vitest coverage for the helper/BaseNodeWrapper path and then lint or a broader relevant test command if feasible.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause investigation: BaseNodeWrapper has static RESIZE_CONFIGS, NodeResizeControl receives those fixed minima, and use-canvas-node-interactions only adjusts dimension changes for asset and ai-image. Content-heavy nodes such as adjustment nodes can render controls/actions beyond the stored node height or width. Context7 docs confirm @xyflow/react NodeResizeControl supports minWidth/minHeight, so we can feed it dynamic measured minima.

Implemented shared content-aware node sizing helpers, wired BaseNodeWrapper to measure rendered content overflow and queue grow-only node resize, and clamped generic dimension changes to node-specific minima. Verification: focused tests passed (12/12), targeted lint passed, full components/canvas test suite passed (43 files, 283 tests). Browser check: local Next app loaded at http://localhost:3000/; canvas-specific manual visual check still needs an authenticated canvas session.

Regression follow-up from user: Canvas load crashed with React maximum update depth at BaseNodeWrapper setContentMinimumSize. Root cause: the layout measurement path invoked setContentMinimumSize from useLayoutEffect even when the measured minimum had not grown, so loading many nodes could enqueue nested layout updates. Fix: added resolveNextContentMinimumSize guard and a ref-backed monotonic content minimum so the wrapper only schedules state updates when content needs more space. Verification: targeted wrapper/helper tests passed (15/15), targeted lint passed, full components/canvas suite passed (43 files, 286 tests).

Fresh browser check after the guard fix: unauthenticated reload of /canvas/j571wg8g5d2kgn1tjhba6qqcmx86kev4 redirected to /auth/sign-in without new runtime errors in the dev-server log. Authenticated canvas visual verification still needs the user's session.

User repro after reinstall still crashes, now in PromptNode Radix SelectTrigger/Slot refs. Root cause appears to be auto-size work running during/around initial layout commits and using history-capturing resize, which can repeatedly re-render nodes with Radix Select triggers during canvas load. Next patch: defer measurement via frame-scheduled observers and mark auto-size resizes as history-skipping.

Second stability patch shipped: BaseNodeWrapper now schedules auto-size measurement after commit via requestAnimationFrame/setTimeout, observes size and subtree mutations instead of measuring on every layout pass, and marks auto-size resizes with skipHistory so they do not capture undo history. Verification: focused base wrapper/helper tests passed, targeted lint passed, full components/canvas/__tests__ passed (43 files, 286 tests). Browser root load on localhost:3000 produced no console errors; authenticated canvas route still needs user session/manual reload.

New bug report: text node placed on canvas can expand infinitely to the right. Investigation points to content-aware width measurement using the whole node chrome scrollWidth; right-side handles/chrome can make scrollWidth exceed clientWidth by a few pixels after every resize. Hypothesis: text nodes must not auto-grow horizontally; they should wrap text and only auto-grow vertically when content needs it.

Fixed text-node infinite right expansion. Verified RED first: canvas-node-interaction-helpers regression expected text minWidth to remain 220 when scrollWidth was only horizontal chrome overflow; it failed with minWidth 306. Implemented ResizeConfig autoGrowWidth/autoGrowHeight and disabled autoGrowWidth for text nodes, preserving vertical growth. Added BaseNodeWrapper regression ensuring text nodes do not queue auto-resize from horizontal chrome overflow. Verification: focused helper/wrapper tests passed (17 tests), targeted lint passed, full components/canvas/__tests__ passed (43 files, 288 tests), git diff --check clean.

Explored dynamic nodes for next sizing step: ai-text and agent spawn run status/tool-call/clarification UI inside BaseNodeWrapper; ai-text-output and agent-output render streaming or structured output, but some dynamic areas use overflow-hidden/overflow-auto/max-h, so outer chrome measurement alone cannot always see needed content height. Proposed design should use central autosize policies plus content probes for dynamic node bodies.

Implemented central dynamic autosize contract for ai-text, ai-text-output, agent, and agent-output. Added tests that dynamic text-heavy node types keep width stable while growing vertically and wrapper queues height-only auto-resizes. Adjusted ai-text-output and agent-output main generated-content containers so generated/streamed text is visible to BaseNodeWrapper measurement instead of being capped by outer max-height/overflow hidden. Verification: focused helper/wrapper tests passed (19 tests), targeted lint passed, full components/canvas/__tests__ passed (43 files, 290 tests), git diff --check clean.

Follow-up overlap/overflow fix: screenshot showed ai-text status panel overflowing below node and ai-text-output footer/meta overlapping generated text. Root cause: dynamic node components kept content columns in fixed flex-height layouts (h-full/flex-1/min-h-0), so content could shrink/overflow instead of contributing to measured scroll height. Changed ai-text, agent, and agent-output dynamic content columns to shrink-0 flow containers; changed ai-text-output main body to shrink-0. Added regression test that scans these node components for measurable flow layout classes. Verification: focused policy/wrapper tests passed (20 tests), targeted lint passed, full components/canvas/__tests__ passed (43 files, 291 tests), git diff --check clean.

User confirms ai-text-output is fixed, ai-text node still overflows below boundary. Investigation: ai-text body is visually overflowing in a flex layout; relying on chrome.scrollHeight alone can miss the real bottom edge. Next fix: add an explicit autosize content probe that BaseNodeWrapper measures by bounding rect, and mark the ai-text dynamic body with that probe.

Follow-up for remaining ai-text overflow: ai-text-output now works, ai-text still overflowed below boundary. Added explicit autosize content probes: BaseNodeWrapper measures [data-canvas-node-autosize-content] bounding bottom (normalized for React Flow zoom) in addition to scrollHeight; ai-text marks its dynamic body with data-canvas-node-autosize-content. This catches flex overflow that chrome.scrollHeight can miss. Verification: focused helper/wrapper tests passed (22 tests), targeted lint passed, full components/canvas/__tests__ passed (43 files, 293 tests), git diff --check clean.

Systematic debugging follow-up: confirmed a stale-height replay failure. BaseNodeWrapper queued the correct ai-text autosize once, but lastQueuedAutoSizeRef suppressed requeueing the same target size even when getNode still reported/replayed the older smaller height. Added a regression that reproduces stale height replay and changed the duplicate guard to skip only when the current dimensions already meet the queued target. Verification: focused wrapper test red before fix; base-node-wrapper test passed (12/12), focused sizing tests passed (23/23), targeted lint passed, full components/canvas test suite passed (43 files, 294 tests).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped content-aware minimum sizing for Canvas nodes, dynamic autosize measurement for AI/agent nodes, horizontal-growth guards for text-heavy nodes, and stale-height replay requeueing for AI text autosize. Verified by user manual testing plus automated Canvas test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
