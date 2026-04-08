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

### `use-ai-generation-status.ts`

Hook für AI-Generation-Status-Tracking. Überwacht Node-Status-Änderungen und zeigt Toasts bei Fehlern.

**Features:**
- Schwellenwert-basiertes Fehler-Tracking
- Auto-Hiding Toasts nach 5 Sekunden
- Fehler-Kategorisierung (Credits, Timeout, Provider, etc.)

**Verwendung:**
```typescript
const { status, statusMessage } = useAiGenerationStatus()
```

---

### `use-adjustment-presets.ts`

Hook für Adjustment-Preset-Management. Bündelt Preset-Queries und bietet helper-Funktionen für Preset-Validierung.

**Verwendung:**
```typescript
const { presets, isLoading } = useAdjustmentPresets(nodeType)
const savePreset = (name, params) => { /* ... */ }
```

---

### `use-canvas-sync-status.ts`

Hook für Canvas-Sync-Status (Online/Offline). Zeigt Banner oder Icons basierend auf der Verbindungsqualität.

**Verwendung:**
```typescript
const { isOnline, pendingOps, syncStatus } = useCanvasSyncStatus()
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

## Konventionen

- Hooks immer mit `use-` Prefix im Dateinamen
- Nur wiederverwendbare Hooks hier — canvas-spezifische Inline-Logik bleibt in `canvas.tsx`
- Kein direkter Convex-Zugriff in Hooks wenn möglich — Queries/Mutations von der aufrufenden Komponente übergeben lassen
- Hooks immer mit `"use client"` am Anfang der Datei markieren
- TypeScript-Typen immer definieren und exportieren
- Hooks dokumentieren mit JSDoc für bessere IDE-Unterstützung

---

## Best Practices

1. **Keine Side Effects außerhalb von useEffect:** Alle Nebeneffekte in useEffect oder custom hooks implementieren
2. **Type Safety:** Hook-Props und Return-Werte immer typisieren
3. **Performance:** useMemo und useCallback für teure Berechnungen nutzen
4. **Error Handling:** Hooks sollten keine Exceptions werfen, sondern Fehler via Callbacks propagieren
5. **Dependencies:** useMemo/useCallback Dependencies immer korrekt angeben
6. **Testing:** Hooks sollen unit-testbar sein (keine React-Abhängigkeiten außer Callbacks)

---

## Examples

### Custom Hook für Node-Resizing

```typescript
// hooks/use-node-resize.ts
export function useNodeResize(nodeId, updateNode) {
  const debouncedUpdate = useDebouncedCallback(
    (newData) => updateNode(nodeId, newData),
    200
  )

  const handleResize = (newDimensions) => {
    debouncedUpdate({
      width: newDimensions.width,
      height: newDimensions.height,
    })
  }

  return { handleResize }
}
```

### Custom Hook für LocalStorage-Backups

```typescript
// hooks/use-local-storage.ts
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      return initialValue
    }
  })

  const setValue = (value: T) => {
    try {
      setStoredValue(value)
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error(error)
    }
  }

  return [storedValue, setValue] as const
}
```
