# lib/ — Utilities & Shared Logic

Geteilte Hilfsfunktionen, Typ-Definitionen und Konfiguration. Keine React-Komponenten — nur reines TypeScript.

---

## Dateien im Überblick

| Datei | Zweck |
|-------|-------|
| `canvas-utils.ts` | Convex↔React Flow Adapter, Edge-Glow, Node-Defaults, Bridge-Edges |
| `canvas-node-catalog.ts` | Vollständige Node-Taxonomie (alle Phasen, Kategorien, Phase-Flags) |
| `canvas-node-templates.ts` | Default-Daten für neue Nodes (beim Einfügen aus Palette) |
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
- `convexNodeDocWithMergedStorageUrl` — URL-Injection für Storage-Bilder
- `NODE_DEFAULTS` — Default-Größen und Daten per Node-Typ
- `NODE_HANDLE_MAP` — Handle-IDs pro Node-Typ
- `computeBridgeCreatesForDeletedNodes` — Kanten-Reconnect nach Node-Löschung
- `computeMediaNodeSize` — Dynamische Node-Größe basierend auf Bild-Dimensionen

---

## `canvas-node-catalog.ts` — Node-Taxonomie

Einzige Wahrheitsquelle für alle Node-Typen auf Client-Seite.

```typescript
NODE_CATALOG          // Alle Nodes aller Phasen
NODE_CATEGORY_META    // Label + Sortierung pro Kategorie
isNodePaletteEnabled  // true wenn: implementiert + kein systemOutput + Template vorhanden
catalogEntriesByCategory() // Gruppiert für Sidebar-Rendering
```

**Kategorien:** `source`, `ai-output`, `transform`, `image-edit`, `control`, `layout`

Phase-2/3-Nodes haben `implemented: false` und `disabledHint`. Nie `implemented: true` setzen ohne zugehörige React-Flow-Komponente in `components/canvas/nodes/`.

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
