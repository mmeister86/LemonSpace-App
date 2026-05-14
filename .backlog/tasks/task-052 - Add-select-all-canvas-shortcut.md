---
id: TASK-052
title: Add select-all canvas shortcut
status: Done
assignee: []
created_date: '2026-05-13 20:22'
updated_date: '2026-05-14 09:26'
labels: []
dependencies: []
modified_files:
  - components/canvas/canvas.tsx
  - components/canvas/canvas-helpers.ts
  - components/canvas/__tests__/canvas-helpers.test.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Canvas keyboard shortcut so users can select every node with Cmd+A on macOS or Ctrl+A on Windows/Linux while preserving normal text selection inside editable fields.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cmd+A and Ctrl+A select all Canvas nodes when focus is not inside an editable field.
- [x] #2 The shortcut is ignored for input, textarea, select, and contenteditable targets so normal text selection continues to work.
- [x] #3 Running the shortcut deselects any selected Canvas edges and does not create Convex mutations, history entries, or sync queue work.
- [x] #4 Focused unit coverage verifies shortcut detection and selection transformation behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add focused unit tests in components/canvas/__tests__/canvas-helpers.test.ts for select-all hotkey detection and selection transformations.
2. Verify the new tests fail before production code exists.
3. Implement pure helper functions in components/canvas/canvas-helpers.ts for detecting Cmd/Ctrl+A, selecting all nodes, and deselecting edges.
4. Wire the helpers into components/canvas/canvas.tsx with a document keydown handler that skips editable targets and keeps the change UI-only.
5. Run the targeted canvas helper test file and update acceptance criteria/notes with verification results.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented select-all Canvas shortcut helpers and wired Cmd/Ctrl+A in components/canvas/canvas.tsx as UI-only React Flow state updates. Verification: RED run failed on missing helper exports; GREEN run passed `npm test -- components/canvas/__tests__/canvas-helpers.test.ts` with 22/22 tests; `npm run lint` exited 0 with four pre-existing warnings outside the touched files; `git diff --check` exited 0.

Full-suite verification completed: `npm test` passed with 143 test files and 807 tests. Workspace is a normal repo checkout on branch `codex/select-all-canvas-shortcut`; no merge, commit, or PR was created.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the Canvas select-all shortcut so Cmd+A/Ctrl+A selects every canvas node while leaving native text selection alone in editable fields. The change is UI-only React Flow state: nodes are selected locally, selected edges are cleared locally, and no Convex/history/sync work is triggered.

Verification:
- Manual user confirmation: shortcut works.
- `npm test` passed: 143 files, 807 tests.
- `npm run lint` exited 0 with four existing warnings outside touched files.
- `git diff --check` exited 0.
<!-- SECTION:FINAL_SUMMARY:END -->
