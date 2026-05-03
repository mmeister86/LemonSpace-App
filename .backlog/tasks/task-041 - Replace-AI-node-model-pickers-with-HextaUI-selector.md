---
id: TASK-041
title: Replace AI node model pickers with HextaUI selector
status: Done
assignee:
  - Codex
created_date: '2026-05-03 14:15'
updated_date: '2026-05-03 19:18'
labels: []
dependencies: []
references:
  - 'https://www.hextaui.com/blocks/ai-model-selector'
  - 'https://www.hextaui.com/r/ai-model-selector.json'
  - 'https://www.hextaui.com/r/command-menu.json'
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the current model picker UI in the image prompt, video prompt, AI text, and agent canvas nodes with a local HextaUI-derived AI model selector. Preserve all existing model registries, tier filtering, credit metadata, persistence fields, generate controls, and Canvas keyboard shortcuts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Image prompt node uses the new selector and continues to persist the selected model to data.model.
- [x] #2 Video prompt node uses the new selector and continues to persist the selected model to data.modelId without changing duration behavior.
- [x] #3 AI text node uses the new selector and continues to persist the selected model to data.modelId with existing tier filtering.
- [x] #4 Agent node uses the new selector and continues to persist the selected model to data.modelId with existing tier filtering.
- [x] #5 The selector supports search, selected state, provider grouping for LemonSpace model providers, and an empty state.
- [x] #6 Opening model selectors does not steal Cmd/Ctrl+K from the Canvas command palette.
- [x] #7 Focused tests cover model mapping, selector interaction, and node persistence behavior, and lint/test verification is run.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing focused tests for the selector model mapping and shared selector behavior.
2. Add the local HextaUI-derived selector and missing primitives, adapted to components/ui imports and without global Cmd/Ctrl+K handling.
3. Add a Canvas model-selector adapter that maps image, video, AI text, and agent registries to selector items with LemonSpace provider groups and credit descriptions.
4. Replace the model Select controls in prompt-node, video-prompt-node, ai-text-node, and agent-node while preserving existing persistence fields and helper copy.
5. Update/add focused node tests for model selection persistence where practical, then run targeted tests, lint, and full test verification.
6. Check off acceptance criteria that are verified, but leave the task In Progress until the user confirms manual testing.

Follow-up localization: add next-intl message keys for the shared AI model selector, pass localized labels from the Canvas adapter/nodes, update selector tests to assert German/English strings are injectable, and rerun focused tests plus lint/test verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented local HextaUI-derived AI model selector, Canvas model adapter, model picker replacements for prompt/video-prompt/ai-text/agent nodes, and focused tests. Verification run: pnpm test passed 131 files / 719 tests; pnpm lint exited 0 with four pre-existing warnings in unrelated files. TypeScript noEmit was also attempted and is blocked by an existing unrelated type error in components/canvas/__tests__/comment-node.test.tsx around Partial<CommentNodeData>.

User requested follow-up localization of the picker content in German and English. Using the existing TASK-041 because this is a direct continuation of the picker feature.

Localized the shared AI model selector content through next-intl in German and English. Added aiModelSelector message keys for dialog title/description, search placeholder/aria, loading, empty/no-result states, selected state, New/Preview badges, and feature tooltip labels. Verification: JSON parse check passed, pnpm lint exited 0 with the same four unrelated warnings, and pnpm test passed 131 files / 721 tests.

Fixed localized ICU interpolation in the AI model selector. The Canvas adapter now provides formatter callbacks for no-results descriptions and selected-model aria labels so next-intl receives query/model values at call time. Added a regression test mock that throws when ICU variables are requested without values. Verification: focused selector/node tests passed, pnpm lint exited 0 with the same four unrelated warnings, and pnpm test passed 131 files / 721 tests.

Fixed remaining English model picker content in localized Canvas by translating model descriptions through aiModelSelector.modelDescriptions.* for image, video, AI text, and agent model IDs. The adapter now resolves localized descriptions at Canvas render time and falls back to registry descriptions when no message is present. Added a regression test that verifies a German model description replaces the English registry string. Verification: JSON parse check passed; focused selector/node tests passed 20 tests; pnpm lint exited 0 with the same four unrelated warnings; pnpm test passed 131 files / 722 tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the AI model pickers in image prompt, video prompt, AI text, and agent nodes with the HextaUI-derived selector; preserved model persistence fields and Canvas shortcuts; localized picker labels and model descriptions in German/English; fixed next-intl ICU interpolation for dynamic selected/no-results strings. Verification: JSON parse check passed, focused selector/node tests passed, pnpm lint exited 0 with four unrelated existing warnings, and pnpm test passed 131 files / 722 tests.
<!-- SECTION:FINAL_SUMMARY:END -->
