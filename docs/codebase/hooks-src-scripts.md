# Hooks, `src/` und Scripts

Diese Seite dokumentiert kleinere, aber wiederverwendbare Bereiche außerhalb der Hauptordner.

## Hooks

**Arbeitskontext:** [`hooks/CLAUDE.md`](../../hooks/CLAUDE.md). Alle Hooks sind clientseitig und folgen dem `use-` Dateinamenpräfix.

| Datei | Verantwortung |
|-------|---------------|
| `hooks/use-auth-query.ts` | Wrapper um Convex `useQuery`, der auth-required Queries bis zur Auth-Bereitschaft skippt. |
| `hooks/use-centered-flow-node-position.ts` | Berechnet neue React-Flow-Node-Positionen im Viewport-Zentrum. |
| `hooks/use-debounced-callback.ts` | Debounce Hook für teure Canvas-/Mutation-/Snapshot-Operationen. |
| `hooks/use-dashboard-snapshot.ts` | Gebündelte Dashboard Snapshot Query mit localStorage Cache und Source Tracking. |
| `hooks/use-dashboard-media-preview-urls.ts` | URL-/Preview-Helfer für Dashboard Media Previews. |
| `hooks/use-pipeline-preview.ts` | Clientseitige WebGL/Render-Pipeline Preview-Erzeugung aus Canvas-Graphen. |

## `src/` Tool UI Surface

`src/` ist klein und enthält eine isolierte Tool-UI-Oberfläche plus i18n-Brücke.

| Datei | Verantwortung |
|-------|---------------|
| `src/i18n/index.ts` | Re-exportiert root `routing` für importkompatible i18n-Nutzung. |
| `src/components/tool-ui/shared/schema.ts` | Gemeinsame Zod-/Schema-Basis für Tool UI. |
| `src/components/tool-ui/shared/contract.ts` | Serialisierbarer Contract für Tool UI-Komponenten. |
| `src/components/tool-ui/shared/parse.ts` | Parse-/Validation-Helfer für Tool UI-Daten. |
| `src/components/tool-ui/shared/actions-config.ts` | Konfiguration von Tool UI Actions. |
| `src/components/tool-ui/shared/action-buttons.tsx` | Action Button UI. |
| `src/components/tool-ui/shared/use-action-buttons.tsx` | Hook/Adapter für Action Button Verhalten. |
| `src/components/tool-ui/shared/embedded-actions.ts` | Embedded Action-Konfiguration. |
| `src/components/tool-ui/shared/_adapter.tsx` | Shared Adapter-Schicht für Tool UI-Einbettung. |
| `src/components/tool-ui/shared/use-controllable-state.ts` | Controllable/uncontrolled State-Hook. |
| `src/components/tool-ui/shared/use-signature-reset.ts` | Reset-Hook anhand Signaturänderungen. |
| `src/components/tool-ui/parameter-slider/README.md` | Lokale Dokumentation für Parameter Slider. |
| `src/components/tool-ui/parameter-slider/index.tsx` | Public Entry für Parameter Slider. |
| `src/components/tool-ui/parameter-slider/parameter-slider.tsx` | Parameter Slider UI. |
| `src/components/tool-ui/parameter-slider/schema.ts` | Slider-spezifisches serialisierbares Schema. |
| `src/components/tool-ui/parameter-slider/math.ts` | Mathematische Hilfsfunktionen für Slider-Werte. |
| `src/components/tool-ui/parameter-slider/_adapter.tsx` | Adapter für Parameter Slider. |

## Scripts

| Datei | Verantwortung |
|-------|---------------|
| `scripts/compile-agent-docs.ts` | Liest Agent Definitions, extrahiert genau markierte Prompt-Segmente aus `components/agents/*.md` und schreibt `lib/generated/agent-doc-segments.ts`. |

## Bestehende Produkt-/Plan-Dokumente

Diese Markdown-Dateien sind nicht Runtime-Code, aber wichtige Produkt-/Architekturkontexte:

| Datei | Verantwortung |
|-------|---------------|
| `.docs/LemonSpace_PRD.md` | Produktanforderungen/PRD. |
| `.docs/LemonSpace_Manifest.md` | Produkt-/Design-Manifest. |
| `.docs/LemonSpace_ADR_AdjustmentStack.md` | ADR zur Adjustment Stack Architektur. |
| `docs/agents/authoring.md` | Fokusguide für Agent-Autorenschaft und Prompt-Segment-Workflow. |
| `docs/plans/*.md` | Historische Design-/Implementierungspläne, insbesondere Canvas Modularisierung, Render Pipeline, WebGL/WASM, Mixer/Crop und Graph Query. |

## Wartungshinweise

- Neue wiederverwendbare Client-Hooks gehören nach `hooks/`; canvas-spezifische Hooks bleiben in `components/canvas/`.
- Agent-Markdown-Änderungen benötigen danach `scripts/compile-agent-docs.ts` und die Agent-/Generated-Segment-Tests.
- `src/components/tool-ui/parameter-slider/README.md` kann auf begleitende Presets/Docs verweisen, die nicht zwingend im aktuellen Tree vorhanden sind; vor Änderungen Bestand prüfen.
