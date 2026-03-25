# Bild-Upload via Convex Storage — Einbau-Anleitung

## Konzept

Der Upload-Flow nutzt Convex File Storage in 3 Schritten:
1. **generateUploadUrl** → kurzlebige Upload-URL vom Backend
2. **fetch(POST)** → Datei direkt an Convex Storage senden
3. **updateData** → `storageId` im Node speichern

Die **URL wird serverseitig** in der `nodes.list` Query aufgelöst — nicht
am Client. Das heißt: der Node speichert nur die `storageId`, und bei
jedem Query-Aufruf wird `ctx.storage.getUrl(storageId)` aufgerufen und
als `data.url` zurückgegeben.

## Dateien

```
upload-files/
  convex/
    storage.ts                           → convex/storage.ts           (NEU)
    nodes-list-patch.ts                  → PATCH für convex/nodes.ts   (NUR die list Query ersetzen)
  components/canvas/nodes/
    image-node.tsx                       → ERSETZT alte Version

Gesamt: 3 Dateien (1 neu, 1 Patch, 1 Ersatz)
```

## Einbau-Schritte

### 1. `convex/storage.ts` anlegen
Kopiere die Datei direkt. Sie enthält eine einzige Mutation: `generateUploadUrl`.

### 2. `convex/nodes.ts` — `list` Query patchen
Ersetze **nur die `list` Query** in deiner bestehenden `convex/nodes.ts`
mit der Version aus `nodes-list-patch.ts`. Der Rest der Datei
(create, move, resize, etc.) bleibt unverändert.

Die Änderung: Nach dem `collect()` wird über alle Nodes iteriert.
Wenn ein Node `data.storageId` hat, wird `ctx.storage.getUrl()` aufgerufen
und das Ergebnis als `data.url` eingefügt.

**Wichtig:** Du brauchst den `Id` Import oben in der Datei:
```ts
import type { Doc, Id } from "./_generated/dataModel";
```
(Du hast `Doc` wahrscheinlich schon importiert — füge `Id` hinzu falls nötig.)

### 3. `image-node.tsx` ersetzen
Die neue Version hat:
- **Click-to-Upload**: Klick auf den leeren Node öffnet File-Picker
- **Drag & Drop**: Bilder direkt auf den Node ziehen (Files vom OS)
- **Ersetzen-Button**: Wenn bereits ein Bild vorhanden, oben rechts "Ersetzen"
- **Upload-Spinner**: Während des Uploads dreht sich ein Spinner
- **Dateiname**: Wird unter dem Bild angezeigt

## Upload-Flow im Detail

```
User zieht Bild auf Image-Node
  │
  ├─ handleDrop() → uploadFile(file)
  │
  ├─ 1. generateUploadUrl()        → Convex Mutation
  │     ← postUrl (kurzlebig)
  │
  ├─ 2. fetch(postUrl, { body: file })
  │     ← { storageId: "kg..." }
  │
  ├─ 3. updateData({ nodeId, data: { storageId, filename, mimeType } })
  │     → Convex speichert storageId im Node
  │
  └─ 4. nodes.list Query feuert automatisch neu (Realtime)
        → ctx.storage.getUrl(storageId) → data.url
        → Image-Node rendert das Bild
```

## Testing

### Test 1: Click-to-Upload
- Erstelle einen Image-Node (Sidebar oder Toolbar)
- Klicke auf "Klicken oder hierhin ziehen"
- ✅ File-Picker öffnet sich
- Wähle ein Bild (PNG/JPG/WebP)
- ✅ Spinner erscheint kurz, dann wird das Bild angezeigt
- ✅ Convex Dashboard: `data.storageId` ist gesetzt

### Test 2: Drag & Drop (File vom OS)
- Ziehe ein Bild aus dem Finder/Explorer direkt auf den Image-Node
- ✅ Drop-Zone wird blau hervorgehoben
- ✅ Bild wird hochgeladen und angezeigt

### Test 3: Bild ersetzen
- Klicke "Ersetzen" oben rechts am Image-Node
- Wähle ein neues Bild
- ✅ Altes Bild wird ersetzt, neue storageId in Convex

### Test 4: URL wird serverseitig aufgelöst
- Lade die Seite neu
- ✅ Bild wird weiterhin angezeigt (URL wird bei jedem Query neu aufgelöst)

### Test 5: Nicht-Bild-Dateien werden ignoriert
- Versuche eine .txt oder .pdf auf den Node zu ziehen
- ✅ Nichts passiert (nur image/* wird akzeptiert)
