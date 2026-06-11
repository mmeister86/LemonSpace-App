---
id: TASK-085
title: Fix crop and Instagram mockup preview quality
status: Done
assignee: []
created_date: '2026-06-11 12:57'
updated_date: '2026-06-11 13:12'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix a Canvas preview-quality regression where crop nodes and crop-backed Instagram post mockup previews render from lower-quality preview sources or narrow preview rasters even when high-resolution input is available. Reuse the existing zoom-aware preview-quality architecture from TASK-075 and keep final render/export/upload paths unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Crop node preview resolution and source URL selection follow zoom-aware preview quality buckets
- [x] #2 Crop-backed Instagram post mockup uses the live crop preview instead of synthetic low-resolution image fallbacks
- [x] #3 Focused regression tests cover high/full and medium/preview quality paths
- [x] #4 Targeted tests and lint for changed Canvas preview files pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add crop-node regression tests for zoom-aware sourceQuality and previewQuality propagation
2. Add Instagram mockup regression coverage for live crop preview quality and synthetic-image avoidance
3. Implement zoom-aware crop node preview source and pipeline quality
4. Tighten crop-backed Instagram mockup preview quality behavior if tests reveal a gap
5. Run targeted tests and lint, then record verification notes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented zoom-aware crop preview quality for crop nodes and crop-backed Instagram mockup previews. Crop quality buckets now use custom output dimensions when available (for example 1080x1350), pass sourceQuality into graph input resolution, and pass previewQuality into the pipeline renderer. Browser smoke on localhost canvas found crop/mockup DOM present, 5 nonzero preview canvases, largest preview canvas 720x964, and no browser console errors.

Verification: npm run test -- tests/crop-node.test.ts tests/instagram-post-mockup-node.test.ts tests/use-pipeline-preview.test.ts tests/lib/canvas-preview-quality.test.ts passed (4 files, 41 tests). npm run lint -- components/canvas/nodes/crop-node.tsx components/canvas/nodes/instagram-post-mockup-node.tsx passed.

Follow-up report: crop-node edits no longer influence the live Instagram mock post preview. Starting systematic debugging before further fixes.

Follow-up root cause found with systematic debugging: the live graph had a valid data edge from crop to instagram-post-mockup, but the mockup image area rendered a static snapshot <img> because InstagramPostMockupNode only enabled crop/render imageSlot when resolved.post.imageUrl was empty. When the agent stored a real snapshot image URL, the static image won and crop edits could no longer affect the mockup preview. Fix: crop/render visual inputs now always render the live preview slot; InstagramPost still receives post data but imageSlot takes precedence. Added regression coverage for stored snapshot image URLs and local crop preview override propagation.

Verification follow-up: npm run test -- tests/crop-node.test.ts tests/instagram-post-mockup-node.test.ts tests/use-pipeline-preview.test.ts tests/lib/canvas-preview-quality.test.ts tests/lib/instagram-post-mockup.test.ts passed (5 files, 51 tests). npm run lint -- components/canvas/nodes/crop-node.tsx components/canvas/nodes/instagram-post-mockup-node.tsx passed. Browser smoke after reload: mockup image area has live render-preview-frame/canvas, no static img, largest mockup canvas 720x900, no console errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored sharp, live crop-backed Instagram mockup previews. Crop nodes now use zoom-aware source/preview quality based on custom output dimensions, and Instagram mockups always render live crop/render slots when those visual inputs are connected, even if a stored snapshot imageUrl exists. Added regression tests for high/full vs medium/preview quality paths, stored snapshot image fallback suppression, and crop local-preview override propagation. Verification: focused Vitest suite, component lint, git diff --check, and browser smoke all passed.
<!-- SECTION:FINAL_SUMMARY:END -->
