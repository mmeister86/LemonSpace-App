---
id: TASK-001.01
title: Refine Change Camera node visual preview
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-26 20:00'
updated_date: '2026-04-27 09:22'
labels:
  - canvas
  - freepik
  - node
  - ui
dependencies: []
parent_task_id: TASK-001
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refresh the existing Freepik Change Camera canvas node so it visually communicates horizontal camera rotation, vertical tilt, and zoom in a compact LemonSpace-native diagram. This is a follow-up to TASK-001 and should not change backend behavior, Freepik API calls, connection policy, or persisted operation schema.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Change Camera node visually communicates horizontal rotation, vertical tilt, and zoom.
- [x] #2 The connected source image is used in the preview when available.
- [x] #3 Preview reacts live to horizontal angle, vertical angle, and zoom control changes.
- [x] #4 Node remains roughly the current size and stays usable on the canvas.
- [x] #5 Existing transform execution behavior is unchanged.
- [x] #6 Focused tests cover the refreshed preview and controls.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a focused failing test in `tests/change-camera-node.test.ts` that expects the refreshed Change Camera stage to render a source image preview, camera diagram affordances, and live control values.
2. Run the targeted Change Camera node test and confirm the new assertion fails before production changes.
3. Implement a compact `change-camera` visual block inside `components/canvas/nodes/image-transform-node.tsx`, keeping behavior local to `operation.type === "change-camera"` and preserving existing operation data, run behavior, output format, and seed controls.
4. Use the connected source image in the stage when available and show the existing empty input message when absent.
5. Make horizontal angle, vertical angle, and zoom values drive stage transforms/positions and visible values live as the existing `saveOperation` flow updates state.
6. Re-run the targeted node test, then related focused tests, then lint; update Backlog acceptance criteria and notes with verification results.

7. Refine the Change Camera stage geometry after manual review: introduce a single normalized SVG coordinate model for orbit/focus/camera marker, bind the camera marker directly to the blue orbit ellipse, add a sightline to the image plane, add a purple vertical tilt marker on its arc, and keep zoom tied to camera distance/scale without touching transform execution or persisted data.
8. Extend the Change Camera node test first so it expects stable stage datasets and marker data attributes for coupled horizontal/vertical/zoom geometry, verify the test fails on the current independent-marker implementation, then implement the geometry and rerun focused/full checks.

9. Fix axis direction after manual review: horizontal 180 degrees must place the camera behind the image on the back/top side of the orbit, and negative vertical angles must place the tilt marker below the image/focus. Add a failing coordinate regression before changing the geometry math.

Refine depth layering so the blue horizontal marker is rendered behind the source image plane when the camera is behind the image, e.g. at 180 degrees.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-04-26: Implemented compact LemonSpace-native Change Camera stage in `components/canvas/nodes/image-transform-node.tsx`. The stage uses the connected source image when present, shows horizontal orbit/vertical arc/camera marker, and updates live from horizontal angle, vertical angle, and zoom controls. Preserved output format, seed, and transform execution behavior. Verification: `npm test -- tests/change-camera-node.test.ts` passed 2 tests; `npm test -- tests/change-camera-node.test.ts components/canvas/__tests__/canvas-helpers.test.ts tests/canvas-connection-policy.test.ts tests/use-pipeline-preview.test.ts` passed 4 files / 75 tests; `npm run lint` exited 0 with 6 existing warnings in unrelated files.

2026-04-26: Full verification completed after focused checks. `npm test` passed 106 files / 601 tests. Existing dev server for this worktree is available at http://localhost:3000 and responded with HTTP 200. Task remains In Progress pending user manual confirmation per project workflow.

2026-04-27: Manual review found the first stage visually unclear: the camera marker appears independent from the blue orbit and purple tilt line. Reopening AC #1, #3, and #6 for a geometry-coupling refinement while keeping the same task and scope.

2026-04-27: Refined the Change Camera stage after manual visual review. The preview now uses a shared SVG coordinate model: blue orbit ellipse, horizontal camera marker bound to the ellipse, sightline from camera to image plane, purple tilt marker bound to the vertical arc, and zoom-driven orbit distance/image scale. Added regression coverage for coupled marker geometry and live Horizontal/Vertical/Zoom updates. Verification: `npm test -- tests/change-camera-node.test.ts` passed 3 tests; focused canvas/transform command passed 4 files / 76 tests; `npm test` passed 106 files / 602 tests; `npm run lint` exited 0 with the same 6 unrelated warnings.

2026-04-27: Manual review found the coupled geometry still has incorrect axis direction: horizontal 180 degrees renders in front/below instead of behind the image, and negative vertical angles render above instead of below. Reopening AC #1, #3, and #6 for axis mapping correction.

2026-04-27: Fixed axis direction after manual review. Horizontal mapping now places 180 degrees on the back/top side of the orbit behind the image, and vertical mapping now places negative tilt values below the image/focus. Added a regression test for horizontal 180 and vertical -18 coordinate placement. Verification: `npm test -- tests/change-camera-node.test.ts` passed 4 tests; focused canvas/transform command passed 4 files / 77 tests; `npm test` passed 106 files / 604 tests; `npm run lint` exited 0 with the same 6 unrelated warnings.

User feedback: at 180 degrees the blue horizontal marker currently overlaps the source image. Need a depth-aware layer so back-side marker/label sits behind the image plane while front-side positions remain visible.

2026-04-27: Applied final depth-layer refinement for manual feedback. The Change Camera stage now has explicit back/image/front layers; when horizontal angle places the camera behind the image, the blue horizontal marker and value label render in the back layer under the source image plane instead of overlaying it. Added regression coverage for the 180 degree back marker layer. Verification: `npm test -- tests/change-camera-node.test.ts` passed 5 tests; focused canvas/transform command passed 4 files / 78 tests; `npm test` passed 106 files / 605 tests; `npm run lint` exited 0 with the same 6 unrelated warnings. Dev server at http://localhost:3000 responded HTTP 200.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refined the Change Camera node into a compact LemonSpace-native camera diagram that uses the connected source image and live Horizontal, Vertikal, and Zoom controls. Follow-up refinements coupled the camera marker to the blue orbit, corrected horizontal/vertical axis direction, and added depth-aware layering so the 180 degree marker sits behind the image plane instead of overlapping it. Existing Freepik transform execution, persisted parameters, format, and seed behavior remain unchanged. Verification completed with targeted Change Camera tests, focused canvas/transform tests, full test suite, and lint; lint has only existing unrelated warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
