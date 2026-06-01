---
id: TASK-075
title: Add zoom-aware media previews
status: Done
assignee: []
created_date: '2026-06-01 07:17'
updated_date: '2026-06-01 08:07'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement client-side contextual media preview quality for Canvas nodes using existing preview URLs/storage IDs and zoom-bucketed pipeline render sizes while preserving full-quality render/export paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canvas data resolves previewStorageId URLs and preserves original storage URLs separately
- [x] #2 Shared preview quality helpers bucket zoomed media size into low, medium, and high qualities
- [x] #3 In-canvas media and pipeline previews prefer preview URLs only at low and medium quality and keep full URLs for high quality/fullscreen/export
- [x] #4 Render/download/upload and AI render materialization use full-quality sources
- [x] #5 Focused unit and component tests cover bucket thresholds, URL choice, preview storage resolution, and pipeline width behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for zoom quality bucket helpers and URL preference
2. Implement shared preview quality helper module
3. Add failing tests for previewStorageId URL resolution in Canvas data
4. Resolve and inject preview URLs separately from full URLs
5. Add failing graph-resolution tests for preview vs full source quality
6. Thread sourceQuality through render-preview graph resolution without affecting export/materialization
7. Add failing hook/component tests for bucketed pipeline widths and media node URL choice
8. Apply zoom-aware preview URLs and preview widths to canvas media/pipeline nodes
9. Run targeted tests, focused lint, and visual/dev verification
10. Record verification notes in TASK-075
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented zoom-aware media preview V1. Added shared preview quality buckets and URL chooser; resolved previewStorageId into data.previewUrl while preserving data.url; threaded sourceQuality through render/adjustment/compare/mixer/image-transform display preview graph resolution while keeping render/fullscreen/materialization full-quality; updated image-like and video-like nodes for bucketed display URLs/loading; added focused tests.

Verification: focused media/pipeline suite passed (13 files, 130 tests). ESLint on changed TS/TSX files passed. git diff --check passed. Browser smoke on localhost canvas j577mech12c6e1yhyybcv3bgph87knhf loaded the canvas, zoomed from scale 0.166667 to 0.716636 and back with media visible and no browser console errors. Full pnpm test currently has 4 pre-existing/non-touched failures in connection drop target/menu and canvas flow reconciliation helper tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped V1 zoom-aware media previews. Canvas data now resolves previewStorageId into previewUrl while preserving full data.url; shared low/medium/high preview buckets choose preview/full sources and pipeline widths; media, adjustment, render, compare, image-transform, and mixer display paths use bucketed preview quality while render/export/materialization paths stay full-quality. Verified focused media/pipeline tests, eslint on changed TS/TSX files, git diff --check, and browser smoke on the target canvas. Full pnpm test still has 4 unrelated pre-existing failures in connection/reconciliation suites.
<!-- SECTION:FINAL_SUMMARY:END -->
