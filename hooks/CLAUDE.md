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

---

### `use-debounced-callback.ts`

Standard-Debounce-Hook. Wird für teure Operationen wie Canvas-Snapshots und Convex-Mutations beim Resizen/Bewegen von Nodes verwendet.

---

## Konventionen

- Hooks immer mit `use-` Prefix im Dateinamen
- Nur wiederverwendbare Hooks hier — canvas-spezifische Inline-Logik bleibt in `canvas.tsx`
- Kein direkter Convex-Zugriff in Hooks wenn möglich — Queries/Mutations von der aufrufenden Komponente übergeben lassen
