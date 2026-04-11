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
| `canvas-presets-context.tsx` | Shared Preset-Provider für Adjustment-Nodes; bündelt `presets.list` zu einer einzigen Query |
| `canvas-node-change-helpers.ts` | Dimensions-/Resize-Transformationen für `asset` und `ai-image` Nodes |
| `canvas-generation-failures.ts` | Hook für AI-Generation-Error-Tracking mit Schwellenwert-Toast (unterstützt `ai-image` und `ai-video`) |
| `canvas-scissors.ts` | Hook für Scherenmodus (K/Esc Toggle, Click-Cut, Stroke-Cut) |
| `canvas-delete-handlers.ts` | Hook für `onBeforeDelete`, `onNodesDelete`, `onEdgesDelete` inkl. Bridge-Edges |
| `canvas-reconnect.ts` | Hook für Edge-Reconnect (`onReconnectStart`, `onReconnect`, `onReconnectEnd`) |
| `canvas-media-utils.ts` | Media-Helfer wie `getImageDimensions(file)` |
| `use-canvas-data.ts` | Hook: Bündelt Canvas-Graph-Query, Storage-URL-Auflösung und Auth-State in einer einzigen Abstraktion |
| `canvas-graph-query-cache.ts` | Optimistic Store Helper für `canvasGraph.get` (getNodes, getEdges, setNodes, setEdges) |

---

## Node-Taxonomie (Phase 1)

Alle verfügbaren Node-Typen sind in `lib/canvas-node-catalog.ts` definiert:

### Kategorien

| Kategorie | Nodes | Beschreibung |
|-----------|-------|-------------|
| **source** (Quelle) | `image`, `text`, `video`, `asset`, `color`, `ai-video` | Input-Quellen für den Workflow |
| **ai-output** (KI-Ausgabe) | `prompt`, `video-prompt`, `ai-text` | KI-generierte Inhalte |
| **agents** (Agents) | `agent`, `agent-output` | Agent-Orchestrierung und Agent-Outputs |
| **transform** (Transformation) | `crop`, `bg-remove`, `upscale` | Bildbearbeitung-Transformationen |
| **image-edit** (Bildbearbeitung) | `curves`, `color-adjust`, `light-adjust`, `detail-adjust` | Preset-basierte Adjustments |
| **control** (Steuerung & Flow) | `condition`, `loop`, `parallel`, `switch`, `mixer` | Kontrollfluss-Elemente |
| **layout** (Canvas & Layout) | `group`, `frame`, `note`, `compare` | Layout-Elemente |

### Node-Typen im Detail

| Typ | Phase | Implementiert | Kategorie | Handles |
|-----|-------|---------------|-----------|---------|
| `image` | 1 | ✅ | source | source (default), target (default) |
| `text` | 1 | ✅ | source | source (default), target (default) |
| `video` | 1 | ✅ | source | source (default), target (default) |
| `asset` | 1 | ✅ | source | source (default), target (default) |
| `prompt` | 1 | ✅ | ai-output | source: `prompt-out`, target: `image-in` |
| `video-prompt` | 2 | ✅ | ai-output | source: `video-prompt-out`, target: `video-prompt-in` |
| `ai-text` | 2 | 🔲 | ai-output | source: `text-out`, target: `text-in` |
| `ai-video` | 2 | ✅ (systemOutput) | source | source: `video-out`, target: `video-in` |
| `agent` | 2 | ✅ | agents | target: `agent-in`, source (default) |
| `agent-output` | 2 | ✅ (systemOutput) | agents | target: `agent-output-in` |
| `crop` | 2 | 🔲 | transform | 🔲 |
| `bg-remove` | 2 | 🔲 | transform | 🔲 |
| `upscale` | 2 | 🔲 | transform | 🔲 |
| `curves` | 1 | ✅ | image-edit | Preset-basiert (nicht standalone) |
| `color-adjust` | 1 | ✅ | image-edit | Preset-basiert |
| `light-adjust` | 1 | ✅ | image-edit | Preset-basiert |
| `detail-adjust` | 1 | ✅ | image-edit | Preset-basiert |
| `group` | 1 | ✅ | layout | source (default), target (default) |
| `frame` | 1 | ✅ | layout | source: `frame-out`, target: `frame-in` |
| `note` | 1 | ✅ | layout | source (default), target (default) |
| `compare` | 1 | ✅ | layout | source: `compare-out`, targets: `left`, `right` |
| `mixer` | 1 | ✅ | control | source: `mixer-out`, targets: `base`, `overlay` |

> `implemented: false` (🔲) bedeutet Phase-2/3 Node, der noch nicht implementiert ist. **Hinweis:** Phase-2/3 Nodes müssen im Schema (`convex/node_type_validator.ts`) vordeklariert werden, damit das System nicht bei jeder Phasenübergang neu migriert werden muss. Die UI filtert Nodes nach Phase.

**SystemOutput Nodes** (`ai-video`, `ai-text`, `agent-output`): Wird typischerweise vom KI-System erzeugt — nicht aus Palette/DnD anlegbar. `ai-video` wird automatisch durch `createNodeConnectedFromSource` beim Klick auf "Video generieren" erzeugt.

---

## KI-Video-Node-Flow

Zweistufiger Node-Flow analog `prompt → ai-image`:

1. **`video-prompt`** (Steuernode, Palette-sichtbar): Prompt-Textarea, Modell-Selector, Dauer-Selector (5s/10s), Credit-Kosten-Anzeige, "Video generieren"-Button
2. **`ai-video`** (Output-Node, systemOutput): Wird automatisch rechts vom video-prompt erzeugt. Zeigt Status (executing/done/error), fertiges Video als `<video>`-Player, Metadaten und Retry-Button.

**Frontend-Flow:**
1. User fügt `video-prompt` aus Sidebar/Command Palette ein
2. User gibt Prompt ein, wählt Modell + Dauer
3. Klick auf "Video generieren" → `createNodeConnectedFromSource` erzeugt `ai-video`-Node
4. `useAction(api.ai.generateVideo)` startet Backend-Job
5. Node zeigt `executing`-Status mit Shimmer
6. Bei `done`: Video aus Convex Storage wird abgespielt
7. Bei `error`: Retry-Button → findet verbundenen `video-prompt`-Source → `generateVideo` erneut

**Node-Komponenten:**
- `components/canvas/nodes/video-prompt-node.tsx` — Steuernode mit Generate-Button
- `components/canvas/nodes/ai-video-node.tsx` — Output-Node mit Player, Metadaten, Retry

---

## Default-Größen (`lib/canvas-utils.ts → NODE_DEFAULTS`)

```
image:       280 × 200    prompt:       288 × 220
text:        256 × 120    ai-image:     320 × 408
video-prompt: 288 × 220   ai-video:     360 × 280
agent:       360 × 320
group:       400 × 300    frame:        400 × 300
note:        208 × 100    compare:      500 × 380
render:      300 × 420    mixer:        360 × 320
```

---

## Mixer V1 (Merge Node)

`mixer` ist in V1 ein bewusst enger 2-Layer-Blend-Node.

- **Handles:** genau zwei Inputs links (`base`, `overlay`) und ein Output rechts (`mixer-out`).
- **Erlaubte Inputs:** `image`, `asset`, `ai-image`, `render`.
- **Connection-Limits:** maximal 2 eingehende Kanten insgesamt, davon pro Handle genau 1.
- **Node-Data (V1):** `blendMode` (`normal|multiply|screen|overlay`), `opacity` (0..100), `overlayX`, `overlayY`, `overlayWidth`, `overlayHeight` (normierte 0..1-Rect-Werte).
- **Output-Semantik:** pseudo-image (clientseitig aus Graph + Controls aufgeloest), kein persistiertes Asset, kein Storage-Write.
- **UI/Interaction:** Overlay ist im Preview direkt per Drag verschiebbar und ueber Corner-Handles frei resizable; numerische Inline-Controls bleiben als Feineinstellung erhalten.

### Compare-Integration (V1)

- `compare` versteht `mixer`-Outputs ueber `lib/canvas-mixer-preview.ts`.
- Die Vorschau wird als DOM/CSS-Layering im Client gerendert (inkl. Blend/Opacity/Overlay-Rect).
- Scope bleibt eng: keine pauschale pseudo-image-Unterstuetzung fuer alle Consumer in V1.

### Render-Bake-Pfad (V1)

- Offizieller Bake-Flow: `mixer -> render`.
- `render` konsumiert die Mixer-Komposition (`sourceComposition.kind = "mixer"`) und nutzt sie fuer Preview + finalen Render/Upload.
- `mixer -> adjustments -> render` ist bewusst verschoben (deferred) und aktuell nicht offizieller Scope.

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
- `video-prompt`, `ai-video` → Violett (124, 58, 237)
- `image`, `text`, `note` → Teal (13, 148, 136)
- `frame` → Orange (249, 115, 22)
- `group`, `compare` → Grau (100, 116, 139)
- `curves`, `color-adjust`, `light-adjust`, `detail-adjust` → Pink (236, 72, 153)

Compare-Node hat zusätzlich Handle-spezifische Farben (`left` → Blau, `right` → Smaragd).

Im **Light Mode** wird der eigentliche Edge-`stroke` ebenfalls aus dieser Akzentfarbe abgeleitet und mit **50% Transparenz** gerendert (`rgba(..., 0.5)`), damit Linie und Glow farblich konsistent bleiben.

---

## Adjustments (Curves, Color, Light, Detail)

**Wichtig:** Diese Nodes werden **nicht als eigene Node-Typen** in der Palette angezeigt. Stattdessen existieren sie als **Presets**, die direkt in einem vorhandenen Node angewendet werden können.

- Preset-Verwaltung: `presets.list` (Convex-Query)
- Preset-Provider: `CanvasPresetsProvider` (Kontext)
- Hook: `useCanvasAdjustmentPresets()` für Preset-Management

**Regeln:**
- Curves-, Color-, Light-, Detail-Adjustment Nodes dürfen keine eigene `presets.list`-Query feuern.
- Immer `CanvasPresetsProvider` + `useCanvasAdjustmentPresets(...)` verwenden.

---

## Optimistic Updates & Local Persistence

**Optimistic Prefix:** Temporäre Nodes/Edges erhalten IDs mit `optimistic_` / `optimistic_edge_`-Prefix. Sie werden durch echte Convex-IDs ersetzt sobald die Mutation abgeschlossen ist.

**Persistenz-Schichten:**

- `lib/canvas-op-queue.ts` (IndexedDB, mit localStorage-Fallback): robuste Sync-Queue inkl. Retry/TTL.
- `lib/canvas-local-persistence.ts` (localStorage): Snapshot + leichtgewichtiger Op-Mirror für sofortige UI-Pins/Recovery.

- Key-Schema: `lemonspace.canvas:snapshot:v1:<canvasId>` und `lemonspace.canvas:ops:v1:<canvasId>`
- Snapshot = letzter bekannter State (Nodes + Edges) für schnellen initialen Render
- Ops-Queue ist aktiv für: `createNode*` (inkl. `createNodeWithEdgeSplit`), `createEdge`, `splitEdgeAtExistingNode`, `moveNode`, `resizeNode`, `updateData`, `removeEdge`, `batchRemoveNodes`.
- Reconnect synchronisiert als `createEdge + removeEdge` (statt rein lokalem UI-Umbiegen).
- ID-Handover `optimistic_* → realId` remappt Folge-Operationen in Queue + localStorage-Mirror, damit Verbindungen während/ nach Replay stabil bleiben.
- Unsupported offline (weiterhin online-only): Datei-Upload/Storage-Mutations, AI-Generierung.

---

## Panel-Komponenten

| Datei | Zweck |
|-------|-------|
| `canvas-shell.tsx` | Client-Layout-Wrapper für Sidebar/Main inkl. Resizing, Auto-Collapse und Rail-Mode-Umschaltung |
| `canvas-toolbar.tsx` | Werkzeug-Leiste (Select, Pan, Zoom-Controls) inkl. Canvas-Name im rechten Cluster neben Credits/Export |
| `canvas-app-menu.tsx` | App-Menü oben rechts (Umbenennen, Löschen, Theme) |
| `canvas-sidebar.tsx` | Node-Palette links; zeigt im Full-Mode das LemonSpace-Wordmark, im Rail-Mode einen kompakten Header und vor dem User-Menü einen visuellen Bottom-Fade |
| `canvas-command-palette.tsx` | Cmd+K Command Palette |
| `canvas-connection-drop-menu.tsx` | Kontext-Menü beim Loslassen einer Verbindung |
| `canvas-node-template-picker.tsx` | Node aus Template einfügen |
| `canvas-placement-context.tsx` | Context für Drag-and-Drop-Platzierung |
| `asset-browser-panel.tsx` | Freepik/Stock-Asset-Browser |
| `video-browser-panel.tsx` | Video-Asset-Browser |
| `canvas-user-menu.tsx` | User-Avatar und Menü |
| `credit-display.tsx` | Credit-Balance Anzeige in der Toolbar (nur `credits.getBalance`, kein Tier-Badge) |
| `export-button.tsx` | Export-Button mit Format-Auswahl |
| `connection-banner.tsx` | Offline-Banner bei Convex-Verbindungsverlust |
| `custom-connection-line.tsx` | Angepasste temporäre Verbindungslinie |
| `default-edge.tsx` | Standard Edge-Rendering |
| `node-error-boundary.tsx` | Error-Boundary für Node-Fehler |
| `adjustment-preview.tsx` | Vorschau für Adjustment-Presets |
| `adjustment-controls.tsx` | UI-Controls für Adjustments |

### Node-Komponenten (`nodes/`)

| Datei | Zweck |
|-------|-------|
| `prompt-node.tsx` | KI-Bild-Steuer-Node mit Modell-Selector und Generate-Button |
| `ai-image-node.tsx` | KI-Bild-Output-Node mit Bildvorschau, Metadaten, Retry |
| `video-prompt-node.tsx` | KI-Video-Steuer-Node mit Modell-/Dauer-Selector, Credit-Anzeige, Generate-Button |
| `ai-video-node.tsx` | KI-Video-Output-Node mit Video-Player, Metadaten, Retry-Button |
| `agent-node.tsx` | Definitionsgetriebener Agent-Node mit Briefing, Constraints, Model-Auswahl, Run/Resume und Clarification-Flow |
| `agent-output-node.tsx` | Agent-Ausgabe-Node fuer Skeletons plus strukturierte Deliverables (`sections`, `metadata`, `qualityChecks`, `previewText`) mit `body`-Fallback |

---

## Agent Runtime Nodes (aktuell)

- `agent-node.tsx` liest Template-Metadaten ueber `getAgentTemplate(...)` (projektiert aus `lib/agent-definitions.ts`).
- Node-Daten enthalten `briefConstraints`, `clarificationQuestions`, `clarificationAnswers`, `executionSteps` und Laufstatus.
- Run startet `api.agents.runAgent`, Clarification-Submit nutzt `api.agents.resumeAgent`.
- `agent-output-node.tsx` rendert strukturierte Outputs bevorzugt (Sections/Metadata/Quality Checks/Preview) und faellt auf JSON oder Plain-Text-`body` zurueck.

---

## Sidebar Resizing & Rail-Mode

- Resizing läuft über `react-resizable-panels` via `components/ui/resizable.tsx` in `canvas-shell.tsx`.
- Wichtige Größen werden als **Strings mit Einheit** gesetzt (z. B. `"18%"`, `"40%"`, `"64px"`). In der verwendeten Library-Version werden numerische Werte als Pixel interpretiert.
- Sidebar ist `collapsible`; bei Unterschreiten von `minSize` wird auf `collapsedSize` reduziert.
- Eingeklappt bedeutet nicht „unsichtbar": `collapsedSize` ist absichtlich > 0 (`64px`), damit ein sichtbarer Rail bleibt.
- `canvas-shell.tsx` schaltet per `onResize` abhängig von der tatsächlichen Pixelbreite zwischen Full-Mode und Rail-Mode um (`railMode` Prop an `CanvasSidebar`).
- Im Full-Mode zeigt die Sidebar **nicht** mehr den Canvas-Namen, sondern das LemonSpace-Wordmark aus `public/logos/`:
  - Light Mode → `lemonspace-logo-v2-black-rgb.svg`
  - Dark Mode → `lemonspace-logo-v2-white-rgb.svg`
- Der Canvas-Name liegt stattdessen in der Toolbar (`canvas-toolbar.tsx`) als kompakter, truncating Label/Chip im rechten Bereich.
- `CanvasUserMenu` unterstützt ebenfalls einen kompakten Rail-Mode über `compact`.
- Scroll-Chaining ist begrenzt (`overscroll-contain` in der Sidebar-Scrollfläche + `overscroll-none` am Shell-Root), um visuelle Artefakte beim Scrollen am Ende zu verhindern.
- Vor dem `CanvasUserMenu` liegt im Sidebar-Body ein `pointer-events-none` Bottom-Fade (schwarz → transparent), der die unteren Palette-Einträge nur visuell ausblendet; Scrollen, Drag-and-Drop und Klicks bleiben unverändert funktionsfähig.

---

## Canvas Graph Query Cache

Performance-Optimierung: Statt separater Queries für Nodes und Edges nutzt der Canvas eine einzige gebündelte Query (`canvasGraph.get`), die über einen Optimistic Store Layer läuft.

**Architektur:**
```
useCanvasData (use-canvas-data.ts)
  ├── canvasGraphQuery (canvasGraph.get) ← Einzelne gebündelte Query
  ├── canvasGraphQueryCache (Optimistic Store Helper)
  │     ├── getCanvasGraphNodesFromQuery()
  │     ├── getCanvasGraphEdgesFromQuery()
  │     ├── setCanvasGraphNodesInQuery()
  │     └── setCanvasGraphEdgesInQuery()
  ├── Storage URL Resolution (batchGetUrlsForCanvas)
  └── Auth State (authClient.useSession + useConvexAuth)
```

**Vorteil:** Optimistic Updates (Node-Erstellung, Edge-Erstellung etc.) aktualisieren den Optimistic Store direkt, ohne auf die Server-Bestätigung warten zu müssen. Die separaten Node/Edge-Queries wurden durch diesen Ansatz abgelöst.

**`use-canvas-data.ts`:**
- Kapselt den gesamten Canvas-Datenfluss: Graph-Query → Storage-URLs → fertige Daten
- `shouldSkipCanvasQueries` verhindert API-Calls vor Auth-Ready
- `storageIdsForCanvas` extrahiert Storage-IDs aus Nodes und löst sie via `batchGetUrlsForCanvas` auf
- Development-Logging für Auth-State-Debugging

**`canvas-graph-query-cache.ts`:**
- Typisierter Zugriff auf den Convex Optimistic Local Store
- `canvasGraphQuery` — Typ-safe Reference auf `api.canvasGraph.get`
- `getCanvasGraphNodesFromQuery/EdgesFromQuery` — Lesen
- `setCanvasGraphNodesInQuery/EdgesInQuery` — Schreiben (für Optimistic Updates)

---

## Wichtige Gotchas

- **`data.url` vs `storageId`:** Node-Komponenten erhalten `data.url` (aufgelöste HTTP-URL), nicht `storageId` direkt. Die URL wird von `convexNodeDocWithMergedStorageUrl` injiziert. Bei neuen Node-Typen mit Bild immer diesen Flow prüfen.
- **Video-Node `data.url`:** Gleiches Prinzip wie bei `ai-image` — Convex Storage URL wird über `batchGetUrlsForCanvas` aufgelöst. Video wird mit `<video src={data.url}>` abgespielt.
- **Adjustment-Presets:** `curves`, `color-adjust`, `light-adjust` und `detail-adjust` dürfen keine eigene `presets.list`-Query feuern. Immer `CanvasPresetsProvider` + `useCanvasAdjustmentPresets(...)` verwenden.
- **Min-Zoom:** `CANVAS_MIN_ZOOM = 0.5 / 3` — dreimal weiter raus als React-Flow-Default.
- **Parent-Nodes:** `parentId` zeigt auf einen Group- oder Frame-Node. React Flow erwartet, dass Parent-Nodes vor Child-Nodes in der `nodes`-Array stehen.
- **Bridge-Edges:** Beim Löschen eines mittleren Nodes werden Kanten automatisch neu verbunden (`computeBridgeCreatesForDeletedNodes` aus `lib/canvas-utils.ts`).
- **`"null"`-Handles:** Convex kann `"null"` als String speichern. `convexEdgeToRF` sanitized Handles: `"null"` → `undefined`.
- **Optimistic IDs:** Temporäre Nodes/Edges erhalten IDs mit `optimistic_` / `optimistic_edge_`-Prefix, werden durch echte Convex-IDs ersetzt, sobald die Mutation abgeschlossen ist.
- **Node-Taxonomie:** Alle Node-Typen sind in `lib/canvas-node-catalog.ts` definiert. Phase-2/3 Nodes haben `implemented: false` und `disabledHint`.
- **Video-Connection-Policy:** `video-prompt` darf **nur** mit `ai-video` verbunden werden (und umgekehrt). `text → video-prompt` ist erlaubt (Prompt-Quelle). `ai-video → compare` ist erlaubt.
- **Mixer-Connection-Policy:** `mixer` akzeptiert nur `image|asset|ai-image|render`; Ziel-Handles sind nur `base` und `overlay`, pro Handle maximal eine eingehende Kante, insgesamt maximal zwei.
- **Mixer-Pseudo-Output:** `mixer` liefert in V1 kein persistiertes Bild. Offizielle Consumer sind `compare` und der direkte Bake-Pfad `mixer -> render`; `mixer -> adjustments -> render` bleibt vorerst deferred.
- **Agent-Flow:** `agent` akzeptiert nur Content-/Kontext-Quellen (z. B. `render`, `compare`, `text`, `image`) als Input; ausgehende Kanten sind fuer `agent -> agent-output` vorgesehen.
- **Convex Generated Types:** `api.ai.generateVideo` wird u. U. nicht in `convex/_generated/api.d.ts` exportiert. Der Code verwendet `api as unknown as {...}` als Workaround. Ein `npx convex dev`-Zyklus würde die Typen korrekt generieren.
- **Canvas Graph Query:** Der Canvas nutzt `canvasGraph.get` (aus `convex/canvasGraph.ts`) statt separater `nodes.list`/`edges.list` Queries. Optimistic Updates laufen über `canvas-graph-query-cache.ts`.
