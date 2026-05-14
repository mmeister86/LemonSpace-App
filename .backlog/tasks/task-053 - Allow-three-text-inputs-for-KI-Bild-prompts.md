---
id: TASK-053
title: Allow three text inputs for KI-Bild prompts
status: Done
assignee: []
created_date: '2026-05-14 09:46'
updated_date: '2026-05-14 11:30'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the visible KI-Bild prompt node so users can connect up to three text or AI-text-output nodes. Connected text sources replace the local prompt and are combined deterministically in canvas order into one generation prompt, while visual references remain unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Prompt/KI-Bild nodes accept up to three text or ai-text-output inputs and reject a fourth with an updated user-facing message.
- [x] #2 Prompt repeating input handles continue offering free slots until six visual references and three text inputs are connected.
- [x] #3 When multiple text sources are connected, the prompt node UI shows them compactly and generateImage receives one combined prompt with Text 1/Text 2/Text 3 sections.
- [x] #4 Existing visual reference behavior remains capped at six references and is preserved when text sources are connected.
- [x] #5 Relevant connection-policy, repeating-handle, prompt-node, and drop-target tests cover the new behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update tests first for prompt text input limits, repeating handles, prompt UI/generation composition, and drop-target behavior.
2. Verify the new tests fail for the current one-text-input implementation.
3. Increase the prompt text input limit from 1 to 3 in shared connection policy and repeating input helpers, including the user-facing validation message.
4. Update PromptNode to collect up to 3 text/AI-text-output sources in canvas order, render them as a compact connected-text list, and pass a combined Text 1/Text 2/Text 3 prompt to generateImage.
5. Run the targeted validation command from the plan, then check off acceptance criteria that are verified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented with TDD. RED run showed expected failures in connection policy, repeating handles, prompt generation, and drop-target behavior. GREEN verification passed: npm test -- tests/canvas-connection-policy.test.ts tests/canvas-repeating-input-handles.test.ts tests/prompt-node.test.ts components/canvas/__tests__/canvas-connection-drop-target.test.tsx (4 files, 92 tests). Task remains In Progress pending user confirmation before Done.

Additional verification passed: npm run lint -- components/canvas/nodes/prompt-node.tsx lib/canvas-connection-policy.ts lib/canvas-repeating-input-handles.ts tests/canvas-connection-policy.test.ts tests/canvas-repeating-input-handles.test.ts tests/prompt-node.test.ts components/canvas/__tests__/canvas-connection-drop-target.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented support for up to three connected text or AI-text-output sources on the KI-Bild prompt node. The connection policy and repeating input handles now allow six visual references plus three text inputs, while rejecting a fourth text input with an updated message. PromptNode now displays connected text sources as Text 1/Text 2/Text 3 and sends a deterministic combined prompt to generateImage while preserving visual references.

Verified by manual user testing, targeted Vitest run (4 files, 92 tests), and ESLint over the changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
