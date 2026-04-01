# components/canvas/ — Canvas-Engine

Der Canvas ist das Herzstück von LemonSpace. Er basiert auf `@xyflow/react` (React Flow) und synchronisiert seinen Zustand bidirektional mit Convex.

---

## Architektur

```
app/(app)/canvas/[canvasId]/page.tsx
  └── <CanvasShell canvasId={...} />       ← components/canvas/canvas-shell.tsx
        ├── Resizable Sidebar/Main Layout  ← shadcn `resizable`
        ├── <CanvasSidebar railMode={...}> ← collapsible Rail/Fulllayout
        └── <Canvas canvasId={...} />      ← components/canvas/canvas.tsx
              ├── <ReactFlowProvider>
              │     └── <CanvasInner>      ← Haupt-Komponente (~1800 Zeilen)
              │           ├── Convex useQuery     ← Realtime-Sync
              │           ├── nodeTypes Map       ← node-types.ts
              │           ├── localStorage Cache  ← canvas-local-persistence.ts
              │           ├── Interaction-Hooks   ← canvas-*.ts Helper
              │           └── Panel-Komponenten
              └── Context Providers
```

**`canvas.tsx`** ist weiterhin die zentrale Orchestrierungsdatei. Viel Low-Level-Logik wurde in dedizierte Module ausgelagert, aber Mutations-Flow, Event-Wiring und Render-Composition liegen weiterhin hier.

### Interne Module von `canvas.tsx`

| Datei | Zweck |
|------|-------|
| `canvas-helpers.ts` | Shared Utility-Layer (Optimistic IDs, Node-Merge, Compare-Resolution, Edge/Hit-Helpers, Konstante Defaults) |
| `canvas-node-change-helpers.ts` | Dimensions-/Resize-Transformationen für `asset` und `ai-image` Nodes |
| `canvas-generation-failures.ts` | Hook für AI-Generation-Error-Tracking mit Schwellenwert-Toast |
| `canvas-scissors.ts` | Hook für Scherenmodus (K/Esc Toggle, Click-Cut, Stroke-Cut) |
| `canvas-delete-handlers.ts` | Hook für `onBeforeDelete`, `onNodesDelete`, `onEdgesDelete` inkl. Bridge-Edges |
| `canvas-reconnect.ts` | Hook für Edge-Reconnect (`onReconnectStart`, `onReconnect`, `onReconnectEnd`) |
| `canvas-media-utils.ts` | Media-Helfer wie `getImageDimensions(file)` |

---

## Convex ↔ React Flow Mapping

Convex und React Flow verwenden unterschiedliche Datenmodelle. Das Mapping liegt in `lib/canvas-utils.ts`:

| Richtung | Funktion |
|----------|----------|
| Convex Node → RF Node | `convexNodeToRF(doc)` |
| Convex Edge → RF Edge | `convexEdgeToRF(doc)` |
| Edge + Glow | `convexEdgeToRFWithSourceGlow(edge, sourceType, colorMode)` |
| StorageId → URL merge | `convexNodeDocWithMergedStorageUrl(node, urlMap, prevMap)` |

**Wichtig:** Convex speichert `positionX` / `positionY` als separate Felder. React Flow erwartet `position: { x, y }`. Niemals RF-Node-Objekte direkt in Convex schreiben.

**Status-Injection:** `convexNodeToRF` schreibt `_status`, `_statusMessage` und `retryCount` in `data`, damit Node-Komponenten darauf zugreifen können ohne das Node-Dokument direkt zu kennen.

**URL-Caching:** Images mit `storageId` werden über einen batch-Storage-URL-Query aufgelöst (`urlByStorage`-Map). Die vorherige URL wird in `previousDataByNodeId` gecacht, um Flackern beim Reload zu vermeiden.

---

## Node-Typen (Phase 1)

Alle registrierten Node-Typen in `node-types.ts`:

| Typ | Komponente | Kategorie | Handles |
|-----|-----------|-----------|---------|
| `image` | `ImageNode` | Quelle | source (default), target (default) |
| `text` | `TextNode` | Quelle | source (default), target (default) |
| `prompt` | `PromptNode` | KI-Ausgabe | source: `prompt-out`, target: `image-in` |
| `ai-image` | `AiImageNode` | KI-Ausgabe | source: `image-out`, target: `prompt-in` |
| `group` | `GroupNode` | Layout | source (default), target (default) |
| `frame` | `FrameNode` | Layout | source: `frame-out`, target: `frame-in` |
| `note` | `NoteNode` | Layout | source (default), target (default) |
| `compare` | `CompareNode` | Layout | source: `compare-out`, targets: `left`, `right` |
| `asset` | `AssetNode` | Quelle | source (default), target (default) |
| `video` | `VideoNode` | Quelle | source (default), target (default) |

> `nodeTypes`-Map **muss** außerhalb jeder React-Komponente definiert sein (sonst re-rendert React Flow bei jedem Render alle Nodes).

### Default-Größen (`lib/canvas-utils.ts → NODE_DEFAULTS`)

```
image:    280 × 200    prompt:   288 × 220
text:     256 × 120    ai-image: 320 × 408
group:    400 × 300    frame:    400 × 300
note:     208 × 100    compare:  500 × 380
```

---

## Node-Status-Modell

```
idle → analyzing → clarifying → executing (retry N/2) → done
                                                       → error
```

Status + `statusMessage` werden direkt am Node angezeigt. Kein globales Loading-Banner. Bei `error` zeigt `statusMessage` die Kategorie: `Credits: ...`, `Timeout: ...`, `Provider: ...` etc.

---

## Edge-Glow-System

Jede Edge bekommt einen `drop-shadow`-Filter entsprechend dem Quell-Node-Typ. Farben in `lib/canvas-utils.ts → SOURCE_NODE_GLOW_RGB`:

- `prompt`, `ai-image` → Violett (139, 92, 246)
- `image`, `text`, `note` → Teal (13, 148, 136)
- `frame` → Orange (249, 115, 22)
- `group`, `compare` → Grau (100, 116, 139)

Compare-Node hat zusätzlich Handle-spezifische Farben (`left` → Blau, `right` → Smaragd).

---

## Optimistic Updates & Local Persistence

**Optimistic Prefix:** Temporäre Nodes/Edges erhalten IDs mit `optimistic_` / `optimistic_edge_`-Prefix. Sie werden durch echte Convex-IDs ersetzt sobald die Mutation abgeschlossen ist.

**localStorage-Cache** (`lib/canvas-local-persistence.ts`): Snapshot + Ops-Queue pro Canvas-ID.

- Key-Schema: `lemonspace.canvas:snapshot:v1:<canvasId>` und `lemonspace.canvas:ops:v1:<canvasId>`
- Snapshot = letzter bekannter State (Nodes + Edges) für schnellen initialen Render
- Ops-Queue = ausstehende Mutations (Recovery bei Verbindungsabbruch, Konzept — noch nicht vollständig implementiert)

---

## Panel-Komponenten

| Datei | Zweck |
|-------|-------|
| `canvas-shell.tsx` | Client-Layout-Wrapper für Sidebar/Main inkl. Resizing, Auto-Collapse und Rail-Mode-Umschaltung |
| `canvas-toolbar.tsx` | Werkzeug-Leiste (Select, Pan, Zoom-Controls) |
| `canvas-app-menu.tsx` | App-Menü (Einstellungen, Logout, Canvas-Name) |
| `canvas-sidebar.tsx` | Node-Palette links; unterstützt Full-Mode und Rail-Mode (icon-only) |
| `canvas-command-palette.tsx` | Cmd+K Command Palette |
| `canvas-connection-drop-menu.tsx` | Kontext-Menü beim Loslassen einer Verbindung |
| `canvas-node-template-picker.tsx` | Node aus Template einfügen |
| `canvas-placement-context.tsx` | Context für Drag-and-Drop-Platzierung |
| `asset-browser-panel.tsx` | Freepik/Stock-Asset-Browser |
| `video-browser-panel.tsx` | Video-Asset-Browser |
| `canvas-user-menu.tsx` | User-Avatar und Menü |
| `credit-display.tsx` | Credit-Balance Anzeige in der Toolbar |
| `export-button.tsx` | Export-Button mit Format-Auswahl |
| `connection-banner.tsx` | Offline-Banner bei Convex-Verbindungsverlust |
| `custom-connection-line.tsx` | Angepasste temporäre Verbindungslinie |

---

## Sidebar Resizing & Rail-Mode

- Resizing läuft über `react-resizable-panels` via `components/ui/resizable.tsx` in `canvas-shell.tsx`.
- Wichtige Größen werden als **Strings mit Einheit** gesetzt (z. B. `"18%"`, `"40%"`, `"64px"`). In der verwendeten Library-Version werden numerische Werte als Pixel interpretiert.
- Sidebar ist `collapsible`; bei Unterschreiten von `minSize` wird auf `collapsedSize` reduziert.
- Eingeklappt bedeutet nicht „unsichtbar“: `collapsedSize` ist absichtlich > 0 (`64px`), damit ein sichtbarer Rail bleibt.
- `canvas-shell.tsx` schaltet per `onResize` abhängig von der tatsächlichen Pixelbreite zwischen Full-Mode und Rail-Mode um (`railMode` Prop an `CanvasSidebar`).
- `CanvasUserMenu` unterstützt ebenfalls einen kompakten Rail-Mode über `compact`.
- Scroll-Chaining ist begrenzt (`overscroll-contain` in der Sidebar-Scrollfläche + `overscroll-none` am Shell-Root), um visuelle Artefakte beim Scrollen am Ende zu verhindern.

---

## Wichtige Gotchas

- **`data.url` vs `storageId`:** Node-Komponenten erhalten `data.url` (aufgelöste HTTP-URL), nicht `storageId` direkt. Die URL wird von `convexNodeDocWithMergedStorageUrl` injiziert. Bei neuen Node-Typen mit Bild immer diesen Flow prüfen.
- **Min-Zoom:** `CANVAS_MIN_ZOOM = 0.5 / 3` — dreimal weiter raus als React-Flow-Default.
- **Parent-Nodes:** `parentId` zeigt auf einen Group- oder Frame-Node. React Flow erwartet, dass Parent-Nodes vor Child-Nodes in der `nodes`-Array stehen.
- **Bridge-Edges:** Beim Löschen eines mittleren Nodes werden Kanten automatisch neu verbunden (`computeBridgeCreatesForDeletedNodes` aus `lib/canvas-utils.ts`).
- **`"null"`-Handles:** Convex kann `"null"` als String speichern. `convexEdgeToRF` sanitized Handles: `"null"` → `undefined`.
