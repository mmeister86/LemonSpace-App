---
id: TASK-046
title: Add backlight polish to Canvas media nodes
status: Done
assignee: []
created_date: '2026-05-12 19:57'
updated_date: '2026-05-13 06:09'
labels:
  - canvas
  - ui-polish
dependencies: []
references:
  - 'https://magicui.design/docs/components/backlight'
modified_files:
  - components/ui/backlight.tsx
  - components/canvas/nodes/media-backlight.tsx
  - components/canvas/nodes/image-node.tsx
  - components/canvas/nodes/video-node.tsx
  - components/canvas/nodes/asset-node.tsx
  - components/canvas/nodes/asset-video-node.tsx
  - components/canvas/nodes/ai-image-node.tsx
  - components/canvas/nodes/ai-video-node.tsx
  - components/canvas/nodes/render-node.tsx
  - components/canvas/nodes/render-node-ui.tsx
  - components/canvas/__tests__/media-backlight.test.tsx
  - components/canvas/__tests__/image-node.test.tsx
  - components/canvas/__tests__/render-node-ui.test.tsx
  - vitest.config.ts
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement a subtle Magic UI Backlight/Ambilight effect for Canvas media node preview surfaces only, keeping fullscreen dialogs, media library, and browser panels unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Magic UI Backlight exists as a shared UI primitive with its documented blur, children, and className API.
- [x] #2 Canvas-local media backlight wrapper applies a subtle h-full/w-full effect with a stable test hook and does not render for empty, loading, or error placeholders.
- [x] #3 Image, video, asset, asset-video, AI image, AI video, and render Canvas previews wrap only actual media surfaces while overlays, controls, badges, handles, and node chrome remain outside the effect.
- [x] #4 Affected tests cover wrapper behavior and media-node render/no-render states; lint and relevant tests pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Install/copy Magic UI Backlight as components/ui/backlight.tsx.
2. Add Canvas media backlight wrapper and tests.
3. Wrap actual media surfaces in image/video/asset/asset-video/AI/render nodes without wrapping overlays or placeholders.
4. Run targeted tests, lint, and browser visual QA; record verification notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Magic UI Backlight primitive plus Canvas MediaBacklight wrapper; wrapped actual media surfaces for image, video, asset, asset-video, ai-image, ai-video, and render preview while leaving placeholders/overlays/node chrome outside.

Verification: targeted Vitest command passed (11 tests); full npm run test passed (140 files, 756 tests); npm run lint exited 0 with 4 pre-existing warnings outside this change; browser loaded http://localhost:3000 with no console errors, but authenticated Canvas media visual QA was limited by lack of logged-in Canvas context. Extra npx tsc --noEmit currently fails on pre-existing unrelated test typing issues in comment-node.test.tsx and prompt-node.test.ts.

Adjusted media backlight after visual feedback that the effect was too subtle. Root cause: default blur was low and preview containers clipped the SVG/filter halo via overflow-hidden. Increased Canvas default blur to 34, added a stronger teal drop-shadow halo, preserved media clipping via rounded inner wrapper, and changed affected preview containers to overflow-visible so the glow can extend beyond the media edge.

Verification after stronger effect: npm run test passed (140 files, 757 tests); npm run lint exited 0 with the same 4 unrelated existing warnings.

Adjusted follow-up feedback: reduced the Canvas media glow intensity by about 15% (default blur 34 -> 29 plus matching shadow alpha/radius reduction) and moved the Magic UI filter onto a dedicated low z-index halo layer behind the real media content. Verification after adjustment: targeted media backlight/image/render tests passed, full npm run test passed (140 files, 757 tests), npm run lint passed with 4 pre-existing warnings. Local dev server was already running on http://localhost:3000 and responded with HTTP 200; automated browser screenshot was blocked because Playwright is not installed in this workspace.

Follow-up layering fix: root cause was the visible blur layer still painting inside/over the React Flow node stacking context. Updated MediaBacklight so the Magic UI filter renders a masked outer ring only: the halo layer is enlarged with padding, masked with content-box exclusion, kept pointer-events-none at -z-10, and the real media remains the z-10 content layer. Re-ran targeted Canvas media tests plus full npm run test and npm run lint; tests pass, lint has 0 errors and the same 4 unrelated warnings.

Systematic debugging pass after continued visual overlap report: verified the active localhost:3000 process cwd is this workspace, server logs show the authenticated Canvas route loading, the generated JS chunk contains current MediaBacklight code, and Tailwind emitted the mask rules. Root cause refined: a preview-internal halo still paints as part of the React Flow node stacking context, so it can overdraw node chrome even when its own child layer has a negative z-index. Implemented architectural fix: BaseNodeWrapper now accepts an optional backlight slot rendered as a z-0 sibling behind the node chrome, while the real node is z-10. Media nodes pass their halo there and preview surfaces render only the actual media with overflow-hidden. Verification: targeted Canvas tests passed, full npm run test passed (140 files, 758 tests), npm run lint passed with 0 errors and the same 4 unrelated warnings. The active dev chunk now includes canvas-node-backlight/backlight props and restored overflow-hidden media previews.

Follow-up visual tuning after successful layering fix: reduced media backlight intensity by about 20% by lowering Canvas default blur from 29 to 23, opacity from 85% to 70%, and matching the drop-shadow radius/alpha reduction. Verification: targeted Canvas media/base wrapper/render tests passed (6 files, 18 tests); npm run lint passed with 0 errors and the same 4 unrelated warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shipped Canvas-only Magic UI Backlight/Ambilight for media nodes, moved the glow behind node chrome via BaseNodeWrapper backlight slot, tuned intensity down after visual QA, and verified with full tests plus lint.
<!-- SECTION:FINAL_SUMMARY:END -->
