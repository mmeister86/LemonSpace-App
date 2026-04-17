# hooks/ — Custom React Hooks

Geteilte React-Hooks. Nur client-side (`"use client"`).

---

## Hooks im Überblick

### `use-auth-query.ts`

```typescript
useAuthQuery(query, ...args)
```

Wrapper um Convex `useQuery`, der automatisch `"skip"` setzt wenn der Auth-Token noch nicht bereit ist. Verhindert `Unauthenticated`-Fehler bei Queries mit `requireAuth` im Backend.

**Warum nicht direkt `useQuery`?** Ohne `initialToken` würde Convex kurz eine unauthentifizierte Query feuern und eine Error-Toast anzeigen. Mit `useAuthQuery` wird gewartet bis `isAuthenticated === true`.

**Wann nutzen:** Immer wenn eine Convex-Query `requireAuth` aufruft. Für öffentliche Queries ist normales `useQuery` in Ordnung.

---

### `use-centered-flow-node-position.ts`

Berechnet die Canvas-Position für einen neuen Node, sodass er im aktuellen Viewport-Zentrum erscheint. Wird beim Einfügen eines Nodes aus der Palette oder Command Palette genutzt.

**Verwendung:**
```typescript
const centeredPosition = useCenteredFlowNodePosition(viewport)
const onNodeDragStop = (node) => {
  // Node wird im Viewport-Zentrum erstellt
}
```

---

### `use-debounced-callback.ts`

Standard-Debounce-Hook. Wird für teure Operationen wie Canvas-Snapshots und Convex-Mutations beim Resizen/Bewegen von Nodes verwendet.

**Verwendung:**
```typescript
const debouncedUpdate = useDebouncedCallback(() => {
  // Nur alle 300ms ausgeführt
  updateCanvasSnapshot()
}, 300)
```

---

### `use-dashboard-snapshot.ts`

Hook für gebündeltes Dashboard-Datenladen mit localStorage-Cache. Ersetzt separate Queries für Balance, Subscription, UsageStats, Transactions und Canvases.

**Features:**
- Gebündelte Convex-Query (`api.dashboard.getSnapshot`) in einem Call
- Automatisches Caching im localStorage (12h TTL)
- Sofortige Anzeige aus Cache während Live-Query lädt
- Cache-Invalidierung bei Logout (via sessionStorage Tracking)
- Source-Tracking: `{ snapshot, source: "live" | "cache" | "none" }`

**Verwendung:**
```typescript
const { snapshot, source } = useDashboardSnapshot(userId)
// source="cache" → sofortige Anzeige aus Cache
// source="live" → aktuelle Daten vom Server
// source="none" → weder Cache noch Query vorhanden
```

**Typen:**
- `DashboardSnapshot` — Vollständiger Rückgabewert von `api.dashboard.getSnapshot`

---

### `use-pipeline-preview.ts`

Hook für die clientseitige Pipeline-Preview-Generierung. Nutzt `canvas-render-preview.ts` um den Pipeline-Graph zu traversieren und WebGL-basierte Previews zu erzeugen.

**Features:**
- Automatische Pipeline-Erkennung aus Canvas-Graph
- WebGL-basierte Echtzeit-Preview
- Fast-Path-Optimierung für einfache Pipelines
- Debounced Re-Rendering bei Parameter-Änderungen

**Verwendung:**
```typescript
const { previewUrl, isProcessing } = usePipelinePreview(nodeId)
```

---

## Konventionen

- Hooks immer mit `use-` Prefix im Dateinamen
- Nur wiederverwendbare Hooks hier — canvas-spezifische Inline-Logik bleibt in `canvas.tsx`
- Kein direkter Convex-Zugriff in Hooks wenn möglich — Queries/Mutations von der aufrufenden Komponente übergeben lassen
- Hooks immer mit `"use client"` am Anfang der Datei markieren
- TypeScript-Typen immer definieren und exportieren
- Hooks dokumentieren mit JSDoc für bessere IDE-Unterstützung

---

## Best Practices

1. **Debounce statt Throttle:** Teure Operationen (Canvas-Snapshots, Convex-Mutations) immer mit `useDebouncedCallback` entkoppeln — nicht bei jedem Event feuern
2. **Auth-first Queries:** Convex-Queries mit `requireAuth` immer über `useAuthQuery` laufen lassen, nie direkt `useQuery`
3. **Cache-Strategie:** Daten die selten ändern (Dashboard, Snapshots) im localStorage cachen mit TTL — sofortige Anzeige, dann Live-Daten
4. **Kein direkter State in Hooks:** Hooks sollen keine React-Abhängigkeiten einführen außer `useState`/`useEffect`/`useCallback`/`useMemo` — externe Libraries bleiben in Komponenten
5. **Return-Typen explizit:** Hook-Return-Werte immer als benannten Typ exportieren, nicht inline
