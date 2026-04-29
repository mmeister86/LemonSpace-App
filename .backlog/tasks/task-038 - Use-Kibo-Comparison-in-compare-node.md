---
id: TASK-038
title: Use Kibo Comparison in compare node
status: Done
assignee:
  - Codex
created_date: '2026-04-29 08:16'
updated_date: '2026-04-29 08:26'
labels: []
dependencies: []
documentation:
  - 'https://www.kibo-ui.com/components/comparison'
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the compare node's custom slider interaction with Kibo UI's registry-based comparison component while preserving existing LemonSpace canvas behavior, previews, mixer support, labels, handles, and accessibility.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Kibo UI comparison registry component is added locally with its required runtime dependency
- [x] #2 Compare node uses Kibo Comparison composition for drag-based overlay comparison
- [x] #3 Existing compare behavior is preserved for empty state labels handles Render Preview toggle live render previews mixer previews and measured surface sizing
- [x] #4 Keyboard accessibility for the comparison slider remains available through arrow Home and End controls
- [x] #5 Compare node tests cover Kibo composition and existing preview mixer handle behaviors
- [x] #6 Targeted compare-node tests and project lint pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add compare-node tests first for the new Kibo comparison structure and keyboard accessibility while preserving existing mocked CompareSurface assertions.
2. Install the Kibo UI comparison registry component with `npx shadcn@latest add @kibo-ui/comparison`, accepting the `motion` runtime dependency.
3. Update `components/canvas/nodes/compare-node.tsx` to compose existing CompareSurface layers inside Kibo `Comparison`, `ComparisonItem`, and `ComparisonHandle` while keeping CanvasHandle ports, labels, empty state, Render/Preview toggle, and measured surface size logic.
4. Remove the old manual clip prop from `CompareSurface` only if Kibo fully owns clipping, leaving render preview and mixer rendering behavior unchanged.
5. Run `npm test -- components/canvas/__tests__/compare-node.test.tsx` and `npm run lint`; check off acceptance criteria as each is verified.
6. Leave TASK-038 In Progress for user manual confirmation rather than marking it Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added failing compare-node tests for Kibo comparison composition and empty-state preservation. Verified red with `npm test -- components/canvas/__tests__/compare-node.test.tsx`; failure is expected because CompareNode still renders the old custom slider.

Installed Kibo comparison registry component, moved it to `components/kibo-ui/comparison/index.tsx`, and integrated it into the compare node. Targeted tests pass: `npm test -- components/canvas/__tests__/compare-node.test.tsx` (9 passed). Lint exits successfully with 4 pre-existing warnings in unrelated files: `lib/canvas-node-favorite.ts`, `lib/image-pipeline/backend/webgl/webgl-backend.ts`, and `tests/image-pipeline/parity/fixtures.ts`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the compare node's custom slider with Kibo UI's registry-based Comparison component while preserving LemonSpace-specific canvas behavior: left/right handles, labels, empty state, Render/Preview mode, live render previews, mixer previews, measured surface sizing, and keyboard controls. Added the local Kibo comparison primitive plus the `motion` runtime dependency, removed CompareSurface's manual clipping responsibility, and covered the integration with focused compare-node tests.

Verification: `npm test -- components/canvas/__tests__/compare-node.test.tsx` passed with 9 tests. `npm run lint` completed successfully with 4 pre-existing unrelated warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
