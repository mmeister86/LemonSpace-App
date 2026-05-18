---
id: TASK-059
title: Add bypass toggle to canvas node toolbars
status: Done
assignee:
  - Codex
created_date: '2026-05-18 19:28'
updated_date: '2026-05-18 20:29'
labels: []
dependencies: []
modified_files:
  - components/canvas/nodes/base-node-wrapper.tsx
  - lib/canvas-render-preview.ts
  - lib/canvas-node-favorite.ts
  - components/canvas/canvas-helpers.ts
  - lib/canvas-mixer-preview.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add an Ausblenden/Einblenden toggle to every canvas node toolbar so users can quickly bypass nodes during image workflow experimentation. The state is persisted as node data, visually dims bypassed nodes, and changes graph preview/render resolution without rewriting edges.

Essential decisions: store data.isBypassed only when true; absence means active. The toggle applies to all node toolbars. Pipeline nodes are skipped when bypassed; source/output nodes contribute no source; mixer/control/multi-input nodes produce no output when bypassed rather than guessing a pass-through.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every node toolbar exposes an Ausblenden/Einblenden toggle that persists as data.isBypassed and remains reversible.
- [x] #2 Bypassed nodes render dimmed/desaturated while selection and toolbar controls remain legible and interactive.
- [x] #3 Node metadata helpers preserve both isFavorite and isBypassed through crop/render/adjustment/media data updates.
- [x] #4 Render preview graph resolution skips bypassed crop/adjustment pipeline nodes, ignores bypassed sources/outputs, and treats bypassed mixer/control nodes as absent output.
- [x] #5 Compare and mixer preview helpers treat bypassed upstream render/source nodes as absent.
- [x] #6 Focused tests, full Vitest suite, and lint are run before handoff; task remains In Progress until user confirms Done.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create/switch to a codex feature branch before code changes.
2. Add failing tests for node metadata helpers, toolbar bypass toggle, visual dimming, graph preview bypass semantics, and compare/mixer helper behavior.
3. Implement shared node metadata helpers for favorite + bypass preservation.
4. Add the toolbar Eye/EyeOff toggle in BaseNodeWrapper and apply dimmed node chrome styling without dimming toolbar controls.
5. Update render preview graph traversal/source/mixer resolution to honor bypassed nodes.
6. Update compare and mixer helper resolution to treat bypassed upstream nodes as absent.
7. Update crop/render/adjustment normalization/write paths to preserve isBypassed.
8. Run focused tests, then npm test and npm run lint.
9. Check acceptance criteria and append implementation notes; do not mark Done without user confirmation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the node bypass feature behind data.isBypassed, including toolbar toggle, dimmed node chrome, metadata preservation, render graph bypass semantics, compare endpoint handling, and mixer source handling.

Verification run:
- Focused Vitest files for BaseNodeWrapper, canvas helpers, and node interaction helpers passed: 3 files, 55 tests.
- Full npm test passed: 147 files, 874 tests.
- npm run lint exited 0 with three pre-existing warnings in unrelated files.

Manual browser canvas-chain check was not performed because no authenticated canvas route/canvas id was available in this session; the image -> bypassed adjustment -> render behavior is covered by the render graph tests.

The task remains In Progress until explicit user confirmation to mark it Done.

Final verification after the last accessibility tweak:
- npm test passed: 147 files, 875 tests.
- npm run lint exited 0 with the same three pre-existing warnings in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the canvas node bypass toolbar toggle, persisted reversible data.isBypassed metadata, kept bypassed nodes visually dimmed while controls stay usable, preserved favorite/bypass metadata through node data writes, and updated render/compare/mixer preview resolution to honor bypassed nodes. Changes were committed, merged into master, and pushed as 7e934c6.
<!-- SECTION:FINAL_SUMMARY:END -->
