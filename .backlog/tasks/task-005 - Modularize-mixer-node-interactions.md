---
id: TASK-005
title: Modularize mixer node interactions
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:56'
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
- [x] #1 Mixer preview size observation is isolated in a hook.
- [x] #2 Move/resize/content-framing pointer interaction is isolated in a hook.
- [x] #3 Mixer diagnostics are in a non-React helper module.
- [x] #4 Preview, resize handles, and controls are separate UI components.
- [x] #5 Mixer node tests and mixer preview tests pass.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Extracted preview size observation into `use-mixer-preview-size.ts`.
- Extracted pointer lifecycle, resize math, and local mixer data clamping into `use-mixer-interaction.ts`.
- Extracted diagnostic diffing and payload assembly into non-React `mixer-diagnostics.ts`.
- Split UI rendering into `MixerPreview`, `MixerOverlayResizeHandles`, and `MixerControls` while keeping `mixer-node.tsx` as the default-export composition wrapper.
- Added characterization coverage in `mixer-node.test.tsx` for diagnostics and extracted interaction math.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-005 completed. Mixer-specific tests pass, targeted lint for changed mixer files passes, and full project lint was attempted but is blocked by an unrelated `react-hooks/static-components` error in `components/canvas/nodes/image-transform-node.tsx`.
<!-- SECTION:FINAL_SUMMARY:END -->
