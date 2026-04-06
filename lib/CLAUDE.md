# lib/ — Utilities & Shared Logic

Geteilte Hilfsfunktionen, Typ-Definitionen und Konfiguration. Keine React-Komponenten — nur reines TypeScript.

---

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `canvas-utils.ts` | Convex↔React Flow Adapter, Edge-Glow, Node-Defaults, Bridge-Edges |
| `canvas-node-catalog.ts` | Vollständige Node-Taxonomie (alle Phasen, Kategorien, Phase-Flags) |
| `canvas-node-types.ts` | TypeScript-Typen und Union-Typen für Canvas-Nodes |
| `canvas-node-templates.ts` | Default-Daten für neue Nodes (beim Einfügen aus Palette) |
| `canvas-connection-policy.ts` | Validierungsregeln für Edge-Verbindungen zwischen Nodes |
| `ai-models.ts` | Client-seitige Modell-Definitionen (muss mit `convex/openrouter.ts` in sync bleiben) |
| `image-formats.ts` | Aspect-Ratio-Strings, Node-Chrome-Höhen (`AI_IMAGE_NODE_HEADER_PX` etc.) |
| `auth.ts` | Better Auth Server-Instanz |
| `auth-server.ts` | Server-Helper: `getAuthUser()`, `getToken()` |
| `auth-client.ts` | Client-Helper: `authClient` |
| `canvas-local-persistence.ts` | localStorage-Cache für Canvas-Snapshots und Op-Queue |
| `canvas-op-queue.ts` | IndexedDB-basierte Canvas-Sync-Queue (Retry, TTL, Remap/Pruning) |
| `toast.ts` | Toast-Utility-Wrapper |
| `toast-messages.ts` | Typisierte Toast-Message-Definitionen (`msg`, `CanvasNodeDeleteBlockReason`) |
| `ai-errors.ts` | Error-Kategorisierung und User-facing Fehlermeldungen |
| `pexels-types.ts` | TypeScript-Typen für Pexels-API-Responses |
| `polar-products.ts` | Polar.sh Produkt-IDs und Tier-Mapping |
| `rate-limit.ts` | Rate-Limiting-Utilities (Redis-backed) |
| `redis.ts` | Redis-Client-Initialisierung |
| `topup-calculator.ts` | Bonus-Staffel-Berechnung für Credit-Top-Ups |
| `format-time.ts` | Zeitformatierung (relative Zeitangaben) |
| `utils.ts` | `cn()` (clsx + tailwind-merge), allgemeine Utilities |

---

## `canvas-utils.ts` — Wichtigste Datei

Alle Adapter-Funktionen zwischen Convex-Datenmodell und React Flow. Details in `components/canvas/CLAUDE.md`.

**Kritische Exports:**
- `convexNodeToRF`, `convexEdgeToRF`, `convexEdgeToRFWithSourceGlow`
- `convexNodeDocWithMergedStorageUrl` — URL-Injection für Storage-Bilder aus serverseitig aufgelöster URL-Map oder gecachtem Vorgängerzustand
- `NODE_DEFAULTS` — Default-Größen und Daten per Node-Typ
- `NODE_HANDLE_MAP` — Handle-IDs pro Node-Typ
- `computeBridgeCreatesForDeletedNodes` — Kanten-Reconnect nach Node-Löschung
- `computeMediaNodeSize` — Dynamische Node-Größe basierend auf Bild-Dimensionen

**Wichtig:** `canvas-utils.ts` erzeugt keine Storage-Fallback-URLs mehr selbst. Die URL-Auflösung kommt aus dem Canvas-Layer (`storage.batchGetUrlsForCanvas`) und wird hier nur noch gemerged/cached.

---

## `canvas-node-types.ts` — TypeScript-Typen

Einzige Quelle für Node-Typ-Union-Typen und Schema-Validatoren.

```typescript
PHASE1_CANVAS_NODE_TYPES    // Phase 1 Nodes (aktiv)
CANVAS_NODE_TYPES           // Phase 1 + Phase 2 + Phase 3 (alle)
ADJUSTMENT_NODE_TYPES       // Adjustment-Preset-Nodes (curves, color-adjust, etc.)
ADJUSTMENT_PRESET_NODE_TYPES // Spezifische Adjustment-Presets
```

**Wichtig:** Dieser Datei und `convex/node_type_validator.ts` müssen immer synchron gehalten werden. Neue Nodes → Validator anpassen.

---

## `canvas-node-catalog.ts` — Node-Taxonomie

Einzige Wahrheitsquelle für alle Node-Typen auf Client-Seite.

```typescript
NODE_CATALOG          // Alle Nodes aller Phasen
NODE_CATEGORY_META    // Label + Sortierung pro Kategorie
NODE_CATEGORIES_ORDERED // Sortierte Kategorien-Liste
catalogEntriesByCategory() // Gruppiert für Sidebar-Rendering
isNodePaletteEnabled  // true wenn: implementiert + kein systemOutput + Template vorhanden
```

**Kategorien:**
- `source` — Quelle (image, text, video, asset, color)
- `ai-output` — KI-Ausgabe (prompt, ai-text, ai-video, agent-output)
- `transform` — Transformation (crop, bg-remove, upscale)
- `image-edit` — Bildbearbeitung (adjustments)
- `control` — Steuerung & Flow
- `layout` — Canvas & Layout (group, frame, note, compare)

**Node-Eigenschaften:**
- `type` — Node-Typ (als String)
- `label` — Anzeigetext
- `category` — Kategorisierung
- `phase` — 1, 2 oder 3 (für zukünftige Feature-Phasen)
- `implemented` — true wenn React-Flow-Komponente vorhanden
- `systemOutput` — true wenn KI-System diese Nodes erzeugt (nicht aus Palette nutzbar)
- `disabledHint` — Kurzer Hinweis für deaktivierte Nodes

**Phase-2/3-Nodes:** Haben `implemented: false` und `disabledHint`. UI filtert nach Phase, niemals ohne zugehörige React-Flow-Komponente `implemented: true` setzen.

---

## `canvas-node-templates.ts` — Default-Daten

Default-Initial-Daten für neue Nodes beim Einfügen aus Palette.

- Erstellt durch die Node-Katalog-Einträge
- Enthält default-Werte für `data`-Felder
- Wird von `canvas.tsx` verwendet beim Node-Create

---

## `canvas-connection-policy.ts` — Validierungsregeln

Regeln für erlaubte Verbindungen zwischen Node-Typen.

**Validierungs-Funktionen:**
- `validateCanvasConnectionPolicy()` — Prüft, ob Verbindung erlaubt ist
- `getCanvasConnectionValidationMessage()` — Gibt lesbare Fehlermeldung zurück
- `assertConnectionPolicy()` — Wirft Fehler bei ungültiger Verbindung

**Regeln:**
- Source-Typ muss Output-Ports haben, Target-Typ muss Input-Ports haben
- Keine self-loops (Edge von Node zu sich selbst)
- Quelle: `image`, `text`, `note`, `group`, `compare`, `frame` → Source-Ports
- Ziel: `ai-image`, `compare` → Target-Ports
- Curves- und Adjustment-Node-Presets: Nur Presets nutzen, keine direkten Edges

---

## `ai-models.ts` — Sync-Pflicht

```typescript
// Muss identisch zu convex/openrouter.ts sein!
export const IMAGE_MODELS: AiModel[]
export const DEFAULT_MODEL_ID: string
```

**Achtung:** Diese Datei und `convex/openrouter.ts` müssen immer synchron gehalten werden. Bei neuen Modellen beide Dateien gleichzeitig aktualisieren. `creditCost` muss übereinstimmen — sonst stimmt die angezeigte Kostenvorschau nicht mit dem tatsächlichen Abzug überein.

---

## `canvas-local-persistence.ts` — localStorage-Cache

```typescript
readCanvasSnapshot(canvasId)      // Letzten Snapshot laden
writeCanvasSnapshot(canvasId, {nodes, edges})  // Snapshot speichern
enqueueCanvasOp(canvasId, op)     // Op in Queue schreiben
resolveCanvasOp(canvasId, opId)   // Op aus Queue entfernen
readCanvasOps(canvasId)           // Ausstehende Ops lesen
remapCanvasOpNodeId(canvasId, fromId, toId)     // optimistic→real remap
dropCanvasOpsByNodeIds(canvasId, ids)           // konfliktbedingtes Pruning
dropCanvasOpsByClientRequestIds(canvasId, ids)  // Create-Cancel
dropCanvasOpsByEdgeIds(canvasId, ids)           // Remove-Cancel
```

Key-Schema: `lemonspace.canvas:snapshot:v1:<id>` / `lemonspace.canvas:ops:v1:<id>`. Bei Version-Bumps (`SNAPSHOT_VERSION`, `OPS_VERSION`) werden alte Keys automatisch ignoriert.

## `canvas-op-queue.ts` — Sync-Queue

Zentrale, persistente Queue für Canvas-Mutations mit IndexedDB (Fallback: localStorage), Retry-Backoff und 24h-TTL.

Wichtige APIs:

```typescript
enqueueCanvasSyncOp(...)
listCanvasSyncOps(canvasId)
ackCanvasSyncOp(opId)
markCanvasSyncOpFailed(opId, { nextRetryAt, lastError })
dropExpiredCanvasSyncOps(canvasId, now)
remapCanvasSyncNodeId(canvasId, fromId, toId)
dropCanvasSyncOpsByNodeIds(canvasId, ids)
dropCanvasSyncOpsByClientRequestIds(canvasId, ids)
dropCanvasSyncOpsByEdgeIds(canvasId, ids)
```

---

## Auth-Helpers

```typescript
// Server (lib/auth-server.ts) — nur in Server Components / Route Handlers
getAuthUser()  // → Better Auth User | null
getToken()     // → Convex JWT Token | null (für initialToken im Root Layout)

// Client (lib/auth-client.ts)
authClient     // Better Auth Client-Instanz für signIn, signUp, signOut etc.
```

---

## Konventionen

- Keine React-Imports in `lib/` — reines TypeScript
- `utils.ts` für generische Helpers (`cn`, `clamp`, etc.)
- Typen, die sowohl Frontend als auch Convex betreffen, gehören in `lib/`, nicht in `convex/`
