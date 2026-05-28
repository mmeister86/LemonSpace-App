---
id: TASK-072
title: Integriere Dagre Auto-Layout in den Canvas
status: Done
assignee: []
created_date: '2026-05-28 12:34'
updated_date: '2026-05-28 12:46'
labels: []
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Füge dem Lemonspace Canvas einen manuellen Dagre-basierten Auto-Layout-Befehl hinzu. Wenn Nodes ausgewählt sind, wird die Auswahl neu angeordnet; sonst werden Root-Level-Nodes layouted. Unterstützt werden Layout nach rechts und Layout nach unten. Die Integration bleibt additiv und verändert keine Edge-, Node-Type-, Convex-Schema- oder Node-Datenmodelle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Toolbar bietet Auto-Layout-Aktionen für nach rechts und nach unten.
- [x] #2 Layout verwendet Dagre, echte Node-Maße und sichere Fallbacks für Node-Größen.
- [x] #3 Auswahl hat Vorrang vor globalem Root-Level-Layout; gemischte Parent-Kontexte und optimistische Nodes werden ohne Positionsänderung mit Nutzerfeedback abgelehnt.
- [x] #4 Layout-Änderungen werden optimistisch angezeigt, in der bestehenden Move-Sync-Queue persistiert und durch Canvas-History rückgängig gemacht.
- [x] #5 Unit- und Toolbar-Tests decken Layout-Richtungen, Kandidatenauswahl, Fehlerfälle und UI-Aktionen ab.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add failing Dagre layout utility tests
2. Implement pure layout utility and dependency
3. Add failing toolbar interaction tests
4. Wire toolbar controls
5. Wire Canvas auto-layout handler with history, sync queue, fitView, and toasts
6. Run focused tests and lint
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Dagre auto-layout with @dagrejs/dagre, pure layout utility, toolbar dropdown actions, Canvas history/sync/fitView wiring, and focused tests. Verification: focused Vitest suite passed; changed-file ESLint passed. Full pnpm lint is blocked by existing components/node-search.tsx react-hooks/preserve-manual-memoization error. Full tsc is blocked by existing test type errors outside this change.

Follow-up from manual Canvas screenshot: vertical TB auto-layout spacing was too tall. Added a regression test for compact top-to-bottom rank spacing and changed only TB rank separation from the horizontal 120px value to 48px; LR remains unchanged. Verification: focused Dagre+toolbar Vitest suite passed; ESLint passed for changed Dagre files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dagre Auto-Layout wurde als manueller Canvas-Befehl umgesetzt: Toolbar-Aktionen für rechts/unten, reine Dagre-Layout-Utility mit echten Node-Maßen, Auswahl-vor-Root-Kandidatenlogik, No-op-Feedback für ungültige Kandidaten, Canvas-History/Move-Sync/fitView-Verdrahtung und kompaktere vertikale Abstände. Verifiziert mit fokussierten Vitest- und ESLint-Läufen; globale Lint/Typecheck-Probleme liegen in bestehenden Fremddateien.
<!-- SECTION:FINAL_SUMMARY:END -->
