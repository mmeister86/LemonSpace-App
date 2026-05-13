---
id: TASK-048
title: Apply favorite backlight to Canvas nodes
status: Done
assignee: []
created_date: '2026-05-13 17:00'
updated_date: '2026-05-13 17:45'
labels: []
dependencies: []
modified_files:
  - app/globals.css
  - components/canvas/nodes/base-node-wrapper.tsx
  - components/canvas/__tests__/base-node-wrapper.test.tsx
  - components/canvas/__tests__/image-node.test.tsx
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the old favorite-only gold node glow with the Canvas backlight system. Favorited media nodes should reuse the color-aware backlight behind the node, while favorited non-media nodes should receive a simple theme-aware glow that works in dark and light mode without affecting node chrome or controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Favorited media nodes render a backlight behind the node instead of the existing gold glow
- [x] #2 Favorited non-media nodes render a simple theme-aware glow that fits dark and light mode
- [x] #3 Node chrome, handles, toolbars, labels, controls, and overlays remain above the glow
- [x] #4 Component tests cover favorite backlight behavior for media and non-media nodes
- [x] #5 Relevant tests and lint pass before handoff
- [x] #6 Non-favorited nodes render no backlight at all, including media nodes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move Canvas media Backlight usage from always-on media preview wrappers to favorite-only BaseNodeWrapper backlight slots.
2. Add a non-media favorite glow component/class that renders behind the node and adapts through existing light/dark CSS tokens.
3. Remove the old gold chrome glow so favorite indication comes from backlight plus the existing toolbar star state.
4. Update component tests first to prove media favorites, non-media favorites, and non-favorite nodes behave correctly.
5. Run focused Canvas node tests, then full test/lint if the focused checks are green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified on 2026-05-13: Backlight must be active only when a node is marked as favorite. Otherwise it is disabled in all nodes, including media nodes.

Focused verification passed: npm run test -- components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/image-node.test.tsx components/canvas/__tests__/media-backlight.test.tsx components/canvas/__tests__/render-node-ui.test.tsx. BaseNodeWrapper now gates all node-level backlight rendering behind isFavorite; media nodes keep providing their media halo candidate, but it only renders for favorites.

Full verification passed: npm run test (141 files, 763 tests) and npm run lint (0 errors, 12 warnings; warnings are pre-existing unused-disable/unused-var warnings, including duplicated warnings under .workspaces/canvas-polish).

Local app smoke: an existing Next dev server for this workspace was already running on http://localhost:3000 and responded HTTP 200. A Playwright screenshot pass could not be run because Playwright is not installed in this workspace.

Bugfix after manual QA: favoriting a render node remounted its preview canvas because BaseNodeWrapper switched from returning nodeChrome directly to returning a wrapper with a backlight sibling. Render previews are painted imperatively into canvas, so the remount left the preview blank/black until another preview render. Fixed by making BaseNodeWrapper always return a stable wrapper and adding/removing the backlight as an optional absolute sibling after the stable node content layer. Added a regression test that the preview canvas DOM node is preserved when favorite state adds backlight. Verification: focused render/node tests passed; npm run test passed (141 files, 764 tests); npm run lint fails only because unrelated .workspaces/canvas-polish/.next generated files are being scanned, while npm run lint -- --ignore-pattern .workspaces/** passes with 0 errors and the 4 known main-tree warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented favorite-only Canvas backlight for all node types. Media nodes now provide their Magic UI media halo as a candidate, but BaseNodeWrapper renders it only when the node is favorited; non-media favorites get a simple theme-aware glow behind the node. Removed the old gold favorite chrome glow and added regression tests for favorite-only rendering, non-favorite media staying unlit, and render-node preview canvas stability when favorite state changes. Verification: focused Canvas node/render tests passed; full npm run test passed with 141 files and 764 tests; lint is clean for the main tree with npm run lint -- --ignore-pattern .workspaces/**, while plain npm run lint is blocked by unrelated generated files under .workspaces/canvas-polish/.next.
<!-- SECTION:FINAL_SUMMARY:END -->
