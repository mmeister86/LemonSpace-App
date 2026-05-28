---
id: TASK-071
title: Implementiere BG Entfernen Node V2
status: In Progress
assignee: []
created_date: '2026-05-28 10:00'
updated_date: '2026-05-28 12:07'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BG Entfernen bekommt eine eigene Output-Node, pipelinefaehige Input-Preview, Bypass/Masken-Semantik und kann in Adjustment-Ketten genutzt werden.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 BG Entfernen erzeugt eine dedizierte bg-remove-output Node statt einer normalen Bild-Node.
- [x] #2 BG Entfernen zeigt eine Preview des verbundenen Inputs inklusive upstream Crop/Adjustment-Schritten.
- [x] #3 Ein ausgeschalteter BG Entfernen Node gibt downstream das originale Upstream-Bild weiter; eingeschaltet nutzt downstream das freigestellte Alpha-Ergebnis.
- [x] #4 BG Entfernen Output kann in Reihe mit Adjustment-, Render- und Transform-Nodes verbunden und verarbeitet werden.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing tests for bg-remove-output typing, connection policy, preview/bypass graph resolution, and runner output creation.
2. Add bg-remove-output taxonomy/defaults/node component/labels and connection support.
3. Add pipeline-aware BG remove preview and materialized input handoff for Freepik transforms.
4. Add bypass-aware downstream resolution for bg-remove-output and backend transform source resolution.
5. Run targeted tests, full test suite, lint, and browser verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented dedicated bg-remove-output taxonomy/component, graph preview resolution, backend source resolution, runner output type selection, and BG input materialization path. Targeted tests are passing; full suite had a change-camera mock gap that is now fixed and needs rerun.

Verification complete: npm test passed (153 files, 928 tests), npm run lint passed with 3 existing unrelated warnings, and npm run build passed after rerunning outside sandbox for Turbopack port binding. In-app browser smoke reached the app but redirected to /auth/sign-in, so authenticated canvas interaction still needs user-side manual confirmation before closing the task.

Deploy blocker follow-up: production contains a persisted mask node from codex-mask-node-v1. Added mask to the shared node union/Convex validator path, React Flow nodeTypes, catalog/templates/defaults/handles, adjustment mask handle, and connection policy so the existing document validates and renders instead of falling back. Verified focused tests, lint, and build.

UI follow-up: fixed bg-remove input preview stretching by object-containing the rendered canvas in a flexible preview area, raised bg-remove initial/default/min height to avoid controls overflowing before auto-grow, and added fullscreen toolbar/dialog support to bg-remove-output. Verified targeted tests, lint, build, and diff check.

Alpha follow-up gestartet: BG-Ausgabe soll ihren transparenten Alphakanal durch nachfolgende Adjustment- und Render-Previews tragen. Fokus: Graph-Metadaten, Preview-Checkerboard und Pipeline-Alpha-Regressionsschutz.

Alpha follow-up umgesetzt: bg-remove-output wird in der Preview-Auflösung als alpha-bearing markiert; Adjustment- und Render-Previews nutzen eine gemeinsame Checkerboard-Fläche; lokale Adjustment-Pipeline-Tests sichern unveränderte Alpha-Werte. Verifikation: npm test grün (156 Dateien, 944 Tests); gezielter ESLint für geänderte Dateien grün; npm run build grün nach Turbopack-Sandbox-Rerun außerhalb der Sandbox. Global npm run lint bleibt durch bestehenden Fehler in components/node-search.tsx blockiert.
<!-- SECTION:NOTES:END -->
