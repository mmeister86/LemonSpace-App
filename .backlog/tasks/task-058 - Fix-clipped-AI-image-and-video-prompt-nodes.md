---
id: TASK-058
title: Fix clipped AI image and video prompt nodes
status: In Progress
assignee: []
created_date: '2026-05-15 06:52'
updated_date: '2026-05-15 07:11'
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
<!-- SECTION:NOTES:END -->
