---
id: TASK-074
title: Upgrade merge node to Fabric layers
status: In Progress
assignee: []
created_date: '2026-05-31 11:10'
updated_date: '2026-05-31 13:25'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement Mixer/Merge Node V2 with FabricJS-powered layer editing, up to eight inputs, layer ordering, transforms, rotation, crop, and deterministic render/compare parity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Mixer accepts up to eight image/text-compatible inputs through repeating layer handles
- [ ] #2 Users can order layers and edit transform, resize, rotation, crop, opacity, blend mode, visibility, and lock state inside the node
- [x] #3 Render and compare consumers resolve the same multi-layer composition as the node preview
- [x] #4 Existing two-input mixer data and edges continue to render through lazy V1-to-V2 normalization
- [x] #5 Targeted unit/component tests cover normalization, connection policy, preview resolution, and render composition
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for multi-layer mixer normalization and connection policy
2. Implement normalized V2 layer model and repeating mixer handles
3. Add failing tests for multi-layer preview/render composition
4. Implement graph resolution and deterministic renderer support
5. Add Fabric-powered mixer node editor UI
6. Run targeted tests and update task notes
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented V2 mixer layer model with Fabric editor shell, repeating layer handles, preview/render/source-loader composition paths, and compatibility for legacy base/overlay mixers.
Verification: targeted Vitest run passed 8 files / 167 tests; focused ESLint on changed Mixer/Fabric/repeating-handle files passed. Full tsc still fails on existing unrelated test typing issues in base-node-wrapper/comment/rate-limit/prompt tests; full lint still fails on existing node-search memoization rule.

Follow-up bugfix after browser test: existing Mixer nodes now use the V2 minimum size (360x460), Fabric editor fits its internal canvas to the visible node viewport, Fabric owns its canvas through an imperative host to avoid React removeChild errors, and the upper Fabric canvas no longer inherits an opaque background that covered rendered layers. Verification: targeted Vitest run passed 8 files / 149 tests; focused ESLint on changed Mixer/Fabric/sizing files passed; browser DOM verification confirms fitted Fabric wrapper/classes and no loading state.
<!-- SECTION:NOTES:END -->
