---
id: TASK-081
title: Fix Instagram agent render references and AI SDK system instructions
status: In Progress
assignee: []
created_date: '2026-06-09 16:00'
updated_date: '2026-06-09 16:04'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ensure Instagram-agent-created visual prompt nodes preserve the selected render/image input as an actual AI image reference, so subsequent image generation can use the render as visual input. Also migrate AI SDK stream calls away from system messages in messages arrays to the top-level instructions option.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the Instagram package selects a render/image/asset/ai-image visual, the generated visual prompt node receives an incoming compatible visual edge.
- [x] #2 Generating from that visual prompt can collect render references through the existing prompt-node referenceImages path.
- [x] #3 The mockup still receives the selected visual via visual-in.
- [x] #4 AI SDK stream routes pass server-side system instructions through instructions instead of system messages in messages.
- [x] #5 Focused tests cover package bindings and AI stream message splitting.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing Instagram harness artifact test for selected visual binding into the generated visual prompt node
2. Add failing AI stream helper/route tests showing system messages split into instructions and non-system messages
3. Extend Instagram package artifacts/mutation to create selected visual -> visualPrompt prompt edge while preserving visual -> mockup edge
4. Add small AI SDK message utility and migrate text/agent stream routes to top-level instructions
5. Run focused tests, lint/build as needed, and update Backlog notes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented TDD fix. Added visualPromptReferenceBinding so selected render/image/asset/ai-image inputs are also connected into the generated visual prompt node via image-in, while the mockup still receives visual-in. Added AI SDK v7 system-instructions splitter and migrated text/agent stream routes to pass trusted system prompts through top-level instructions. Verification: focused suite passed (39 tests), npm run lint passed with 0 errors and 3 existing warnings, npx tsc --noEmit still fails on existing repo-wide test type errors outside this change, npm run build passed outside sandbox.
<!-- SECTION:NOTES:END -->
