---
id: TASK-076
title: Add canvas zoom slider and node search controls
status: Done
assignee: []
created_date: '2026-06-01 08:42'
updated_date: '2026-06-01 09:04'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement canvas quality-of-life controls: replace the default bottom-left React Flow controls with a hover-reveal zoom slider, add node search from the draggable canvas toolbar, and make the zoom toolbar and right-side MiniMap semi-transparent until hover or focus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bottom-left zoom controls are compact by default and reveal a horizontal slider between minus and plus on hover or keyboard focus.
- [x] #2 The draggable canvas toolbar includes a search icon that opens node search and selecting a result selects/fits the matching node.
- [x] #3 Node search matches LemonSpace node labels, template labels, file/name fields, prompt/content snippets, and node ids as fallback.
- [x] #4 The bottom-left zoom toolbar and right-side MiniMap are semi-transparent by default and fully opaque on hover/focus without changing MiniMap placement.
- [x] #5 Focused Vitest coverage and lint verification are run before handoff.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for canvas node search matching and toolbar search button presence.
2. Add failing tests for custom zoom controls and hover/focus transparency classes.
3. Implement canvas-specific node search helper and toolbar button wrapper.
4. Implement bottom-left hover-reveal zoom controls and replace default React Flow Controls.
5. Apply MiniMap transparency without moving it.
6. Run targeted tests and lint, then record progress notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and verified by focused tests:
- npm run test -- components/canvas/__tests__/canvas-node-search.test.tsx components/canvas/__tests__/canvas-zoom-controls.test.tsx components/canvas/__tests__/canvas-toolbar.test.tsx => 3 files, 23 tests passed.
- npm run lint => exit 0, with 3 pre-existing warnings outside TASK-076 files.
- npx tsc --noEmit --pretty false currently fails on pre-existing unrelated errors in base-node-wrapper/comment-node/image-node/rate-limit/prompt-node tests; no TASK-076 files are listed.
- Browser verification via fresh localhost request redirects to /auth/sign-in without session; macOS accessibility/screenshot permissions prevented using the existing authenticated Zen window.

Authenticated in-app browser verification completed on http://localhost:3000/canvas/j577mech12c6e1yhyybcv3bgph87knhf:
- Canvas loaded with search button present, custom bottom-left zoom controls present, and MiniMap present bottom-right.
- Search dialog opens without runtime error, input placeholder is Knoten suchen..., and query Business shows matching Prompt result.
- Bottom-left zoom controls reveal slider on keyboard focus; opacity changes from 0.55 to 1 and reveal width expands to 144px.
- MiniMap remains bottom-right with default opacity 0.55.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped canvas QoL controls: bottom-left hover-reveal zoom slider, toolbar node search, semi-transparent zoom controls and MiniMap, with focused tests, lint, and authenticated browser verification.
<!-- SECTION:FINAL_SUMMARY:END -->
