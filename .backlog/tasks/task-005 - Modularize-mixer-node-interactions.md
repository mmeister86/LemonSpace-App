---
id: TASK-005
title: Modularize mixer node interactions
status: To Do
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-27 14:27'
labels:
  - canvas
  - mixer
  - node
  - refactor
  - tests
dependencies:
  - TASK-022
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract preview sizing, pointer interaction, resize math, diagnostics, and UI pieces from `components/canvas/nodes/mixer-node.tsx`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mixer preview size observation is isolated in a hook.
- [ ] #2 Move/resize/content-framing pointer interaction is isolated in a hook.
- [ ] #3 Mixer diagnostics are in a non-React helper module.
- [ ] #4 Preview, resize handles, and controls are separate UI components.
- [ ] #5 Mixer node tests and mixer preview tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add characterization tests for frame resize, content framing, and diagnostic payload behavior if missing.
2. Create `components/canvas/nodes/use-mixer-preview-size.ts` for `ResizeObserver` and preview dimensions.
3. Create `components/canvas/nodes/use-mixer-interaction.ts` for pointer lifecycle and local data updates.
4. Create `components/canvas/nodes/mixer-diagnostics.ts` for diagnostic formatting and diffing.
5. Create `MixerPreview`, `MixerOverlayResizeHandles`, and `MixerControls` components.
6. Keep `mixer-node.tsx` as the composition wrapper.
7. Run `npm test -- components/canvas/__tests__/mixer-node.test.tsx tests/lib/canvas-mixer-preview.test.ts` and `npm run lint`.
<!-- SECTION:PLAN:END -->
