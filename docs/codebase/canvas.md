# Canvas-Engine

`components/canvas/` ist das Herz der App: eine React-Flow-basierte, bidirektional mit Convex synchronisierte visuelle Arbeitsfläche für Medien, KI-Generierung, Agenten, Transformationen und Layout.

**Arbeitskontext:** [`components/canvas/CLAUDE.md`](../../components/canvas/CLAUDE.md). Die lokale Doku ist detailliert, aber einzelne neuere Split-Module sind dort nicht vollständig gelistet.

## Architekturfluss

```text
app/(app)/canvas/[canvasId]/page.tsx
  -> components/canvas/canvas-shell.tsx
    -> components/canvas/canvas.tsx
      -> React Flow + Canvas Providers
      -> Convex canvasGraph.get via use-canvas-data.ts
      -> optimistic/local sync via lib/canvas-op-queue.ts
      -> nodeTypes from components/canvas/node-types.ts
```

## Orchestrierung, Shell und Panels

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/canvas.tsx` | Zentrale Orchestrierung: React Flow, Convex-Daten, Provider, Mutations, Event Wiring, Panels. |
| `components/canvas/canvas-shell.tsx` | Client-Layout für Sidebar/Main, Resizing, Auto-Collapse und Rail Mode. |
| `components/canvas/canvas-sidebar.tsx` | Node-Palette und Sidebar-UI. |
| `components/canvas/canvas-toolbar.tsx` | Toolbar für Select/Pan/Zoom, Canvas-Name und Credit-Anzeige. |
| `components/canvas/canvas-app-menu.tsx` | App-Menü für Rename, Delete, Theme und Canvas-Aktionen. |
| `components/canvas/canvas-user-menu.tsx` | User-/Account-Menü im Canvas-Kontext. |
| `components/canvas/canvas-command-palette.tsx` | Cmd+K Palette für Node-/Canvas-Aktionen. |
| `components/canvas/canvas-selection-toolbar.tsx` | Kontexttoolbar für selektierte Nodes. |
| `components/canvas/canvas-node-template-picker.tsx` | UI zum Einfügen vordefinierter Node-Templates. |
| `components/canvas/credit-display.tsx` | Credit-Balance-Anzeige im Canvas. |
| `components/canvas/asset-browser-panel.tsx` | Freepik-/Asset-Browser Panel. |
| `components/canvas/video-browser-panel.tsx` | Video-Browser Panel, u. a. Pexels-Videos. |
| `components/canvas/connection-banner.tsx` | Offline-/Connection-Loss-Hinweis. |

## Connections, Handles und Edges

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/canvas-handle.tsx` | Gemeinsamer Wrapper um React-Flow Handles mit LemonSpace-Datenattributen, Glow und Magnet-Zuständen. |
| `components/canvas/custom-connection-line.tsx` | Custom Connection Line während Connect-/Reconnect-Drags. |
| `components/canvas/canvas-connection-drop-menu.tsx` | Kontextmenü beim Loslassen einer Verbindung ohne Ziel. |
| `components/canvas/canvas-connection-drop-menu-actions.ts` | Pure Actions für Drop-Menü-Entscheidungen. |
| `components/canvas/canvas-connection-validation.ts` | Clientseitige Connection-Policy-Helfer. |
| `components/canvas/canvas-connection-magnetism.ts` | Pure Resolver für Handle-Proximity, Snap und Glow. |
| `components/canvas/canvas-connection-magnetism-context.tsx` | Transienter Client-State für aktives Magnet-Target. |
| `components/canvas/canvas-connection-drop-target.ts` | Ermittelt Drop Targets für Connections. |
| `components/canvas/canvas-connection-auto-split.ts` | Automatisches Splitten/Einfügen bei Connection-Drops. |
| `components/canvas/canvas-edge-intersection-split.ts` | Edge-Splitting anhand geometrischer Schnittpunkte. |
| `components/canvas/canvas-reconnect.ts` | Edge-Reconnect Lifecycle. |
| `components/canvas/use-canvas-connections.ts` | Hook für Verbindungserstellung, Validierung und Reconnect-Fallbacks. |
| `components/canvas/use-canvas-edge-types.tsx` | Edge-Type-Konfiguration für React Flow. |
| `components/canvas/use-canvas-edge-insertions.ts` | Automatische Edge-Insertions bei Node-Erstellung. |
| `components/canvas/edges/default-edge.tsx` | Default Edge Renderer mit Glow-/Akzentverhalten. |

## Daten, Graph, Sync und Persistenz

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/use-canvas-data.ts` | Bündelt Canvas-Graph-Query, Storage-URL-Auflösung und Auth-State. |
| `components/canvas/canvas-graph-query-cache.ts` | Typed Optimistic-Store-Helfer für `canvasGraph.get`. |
| `components/canvas/canvas-graph-context.tsx` | React Context für Graph-Zugriff auf Nodes/Edges. |
| `components/canvas/use-canvas-sync-engine.ts` | Verarbeitet Sync Queue, Online-/Retry-Zustände und Replay. |
| `components/canvas/canvas-sync-context.tsx` | Context für Sync Engine und Queue-Zustand. |
| `components/canvas/canvas-sync-queue-flusher.ts` | Flush-Helfer für queued Ops. |
| `components/canvas/canvas-sync-pending-controller.ts` | Verwaltung pending Operationen. |
| `components/canvas/canvas-sync-node-create-actions.ts` | Sync-Actions für Node-Erstellung inkl. ID-Handover. |
| `components/canvas/canvas-sync-optimistic-updates.ts` | Optimistische Updates für Graph/Flow-Zustand. |
| `components/canvas/use-canvas-local-snapshot-persistence.ts` | Local Snapshot Autosave/Recovery. |
| `components/canvas/use-canvas-flow-reconciliation.ts` | Hook für Reconciliation zwischen Convex-Graph und React-Flow-State. |
| `components/canvas/canvas-flow-reconciliation-helpers.ts` | Pure Reconciliation-Helfer. |

## Interaktionen, Layout und Hilfslogik

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/use-canvas-drop.ts` | Drag-and-drop von Dateien, Palette-Items und Templates; registriert Medien/Nodes. |
| `components/canvas/use-canvas-node-interactions.ts` | Drag, Resize, Select, Move und Parent-Interaktionen. |
| `components/canvas/use-canvas-history.ts` | Undo-/History-nahe Canvas-Interaktionsunterstützung. |
| `components/canvas/canvas-delete-handlers.ts` | Delete-Flow inkl. Bridge-Edges nach Node-Löschung. |
| `components/canvas/canvas-scissors.ts` | Scherenmodus für Edge-Cut per Tastatur/Pointer. |
| `components/canvas/canvas-node-change-helpers.ts` | Transformation von Node-Dimensionen und lokalen Änderungen. |
| `components/canvas/canvas-node-resize-persistence.ts` | Persistiert Node-Resize-Ergebnisse. |
| `components/canvas/canvas-node-parent-changes.ts` | Parent-Change-Aufbereitung für Gruppen/Frames. |
| `components/canvas/canvas-node-group-drop-target.ts` | Drop Target Detection für Gruppen/Frames. |
| `components/canvas/use-canvas-grouping-mutations.ts` | Gruppierungs-/Ungrouping-Mutations. |
| `components/canvas/canvas-grouping-helpers.ts` | Pure Helfer für Parent-/Group-Logik. |
| `components/canvas/canvas-toolbar-placement.ts` | Toolbar-Positionierung. |
| `components/canvas/canvas-placement-context.tsx` | Kontext für Drag-/Drop-Platzierung. |
| `components/canvas/canvas-presets-context.tsx` | Shared Preset Provider; verhindert mehrfaches `presets.list` in Adjustment Nodes. |
| `components/canvas/canvas-favorites-visibility.ts` | Persistenz/Sichtbarkeit von Node-Favoriten. |
| `components/canvas/canvas-generation-failures.ts` | Error Tracking und Toast-Schwellen für AI-Generierungen. |
| `components/canvas/canvas-media-utils.ts` | Media-Helfer wie Dimensionsermittlung. |
| `components/canvas/frame-jpeg-export.ts` | Clientseitiger Frame-JPEG-Export via DOM Screenshot. |
| `components/canvas/canvas-helpers.ts` | Breite Utility-Schicht: Optimistic IDs, Node Merge, Compare Resolution, Edge/Hit Helpers. |
| `components/canvas/node-types.ts` | React-Flow Node-Type Registry. |

## Node-Komponenten

### Shared Node-Infrastruktur

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/base-node-wrapper.tsx` | Gemeinsame Node-Chrome, Status, Handles und Aktionen. |
| `components/canvas/nodes/node-error-boundary.tsx` | Node-level Error Boundary. |
| `components/canvas/nodes/use-node-local-data.ts` | Lokaler optimistischer Node-Data-State. |

### Source- und Media-Nodes

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/image-node.tsx` | Bildquelle/Upload-/Storage-Anzeige. |
| `components/canvas/nodes/text-node.tsx` | Text-Node. |
| `components/canvas/nodes/text-node-richtext.ts` | Rich-Text-Normalisierung für Text Nodes. |
| `components/canvas/nodes/rich-text-card.tsx` | Rich-Text-Kartenoberfläche. |
| `components/canvas/nodes/editor-js-text-editor.tsx` | Editor.js-basierter Texteditor. |
| `components/canvas/nodes/video-node.tsx` | Video-Source-Node. |
| `components/canvas/nodes/asset-node.tsx` | Externe/Freepik Asset-Quelle. |
| `components/canvas/nodes/asset-video-node.tsx` | Asset-Video-Variante. |
| `components/canvas/nodes/note-node.tsx` | Notiz-/Annotation-Node. |

### KI- und Agent-Nodes

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/prompt-node.tsx` | Prompt-Steuernode für AI Image Generation. |
| `components/canvas/nodes/ai-image-node.tsx` | System-Output-Node für generierte Bilder. |
| `components/canvas/nodes/video-prompt-node.tsx` | Prompt-/Model-/Duration-Steuerung für AI Video Generation. |
| `components/canvas/nodes/ai-video-node.tsx` | System-Output-Node für Freepik/AI Videos. |
| `components/canvas/nodes/ai-text-node.tsx` | AI Text Steuer-/Output-UI. |
| `components/canvas/nodes/ai-text-output-node.tsx` | Strukturierte AI-Text-Ausgabe. |
| `components/canvas/nodes/agent-node.tsx` | Agent-Orchestrierungsnode. |
| `components/canvas/nodes/agent-output-node.tsx` | Persistierte strukturierte Agent-Outputs. |

### Layout, Compare und Control

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/group-node.tsx` | Gruppen-/Container-Node. |
| `components/canvas/nodes/frame-node.tsx` | Frame/Artboard Node mit Exportdimensionen. |
| `components/canvas/nodes/compare-node.tsx` | Vergleichsnode mit Slider/Handles. |
| `components/canvas/nodes/compare-surface.tsx` | Vergleichsoberfläche und Preview-Rendering. |
| `components/canvas/nodes/mixer-node.tsx` | 2-Layer Mixer Node. |
| `components/canvas/nodes/mixer-types.ts` | Mixer-spezifische Typen. |
| `components/canvas/nodes/mixer-preview.tsx` | DOM/CSS Mixer Preview. |
| `components/canvas/nodes/mixer-controls.tsx` | Mixer Controls. |
| `components/canvas/nodes/mixer-overlay-resize-handles.tsx` | Resize Handles für Overlay Frame. |
| `components/canvas/nodes/mixer-diagnostics.ts` | Diagnostics für Mixer-Zustände. |
| `components/canvas/nodes/use-mixer-preview-size.ts` | Preview-Size-Hook. |
| `components/canvas/nodes/use-mixer-interaction.ts` | Mixer Pointer-/Resize-/Framing-Interaktion. |

### Image Transform und Adjustments

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/image-transform-node.tsx` | Gemeinsame Shell für transformierende Bild-Nodes. |
| `components/canvas/nodes/image-transform-node-types.ts` | Typen für Image-Transform Nodes. |
| `components/canvas/nodes/image-transform-operation-config.ts` | Operation-Konfiguration für Transform-Nodes. |
| `components/canvas/nodes/image-transform-operation-controls.tsx` | Operation Controls. |
| `components/canvas/nodes/image-transform-preview-utils.ts` | Preview-Helfer für Transform-Nodes. |
| `components/canvas/nodes/use-image-transform-runner.ts` | Startet/überwacht Transform-Jobs. |
| `components/canvas/nodes/bg-remove-node.tsx` | Background Removal Node. |
| `components/canvas/nodes/upscale-node.tsx` | Upscale Node. |
| `components/canvas/nodes/style-transfer-node.tsx` | Style Transfer Node. |
| `components/canvas/nodes/face-restore-node.tsx` | Face Restore Node. |
| `components/canvas/nodes/change-camera-node.tsx` | Change Camera Node. |
| `components/canvas/nodes/change-camera-stage.tsx` | Stage/Preview für Change Camera. |
| `components/canvas/nodes/crop-node.tsx` | Crop Node und Crop Preview. |
| `components/canvas/nodes/adjustment-node-shell.tsx` | Gemeinsame Shell für Adjustment Nodes. |
| `components/canvas/nodes/adjustment-controls.tsx` | Shared Adjustment Controls. |
| `components/canvas/nodes/adjustment-preview.tsx` | Shared Adjustment Preview. |
| `components/canvas/nodes/curves-node.tsx` | Curves Adjustment Node. |
| `components/canvas/nodes/color-adjust-node.tsx` | Color Adjustment Node. |
| `components/canvas/nodes/light-adjust-node.tsx` | Light Adjustment Node. |
| `components/canvas/nodes/detail-adjust-node.tsx` | Detail Adjustment Node. |

### Render Node

| Datei | Verantwortung |
|-------|---------------|
| `components/canvas/nodes/render-node.tsx` | Render-/Bake-Node für Pipelines und Mixer-Kompositionen. |
| `components/canvas/nodes/render-node-ui.tsx` | Präsentationsschicht des Render Nodes. |
| `components/canvas/nodes/render-node-state.ts` | Pure Render-Node-State-Transformationen. |
| `components/canvas/nodes/use-render-node-preview.ts` | Preview-Hook für Render Node. |
| `components/canvas/nodes/use-render-node-rendering.ts` | Render-/Upload-Laufzeitlogik. |

## Canvas Tests

`components/canvas/__tests__/` enthält komponentennahe Tests für Sidebar, Toolbar, Handles, Connection Drop Menus, Reconciliation, Grouping, Mixer, Nodes und Hook-Verhalten. Die ausführliche Testlandkarte steht in [`tests.md`](tests.md).

## Wartungshinweise

- `canvas.tsx` ist weiterhin die zentrale Orchestrierungsdatei; neue Logik nach Möglichkeit in fokussierte Helper/Hooks extrahieren.
- `CanvasPresetsProvider` ist die zentrale Quelle für Adjustment Presets; Adjustment Nodes dürfen keine eigenen `presets.list` Queries feuern.
- Connection-Verhalten muss mit `lib/canvas-connection-policy.ts` und Convex `edges.ts` synchron bleiben.
- Optimistic IDs und Queue-Replay müssen über `lib/canvas-op-queue.ts` und die Canvas-Sync-Module konsistent bleiben.
