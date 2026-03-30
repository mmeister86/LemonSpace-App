# 🍋 LemonSpace — ADR: Non-destruktiver Adjustment-Stack

**Status:** Accepted
**Datum:** März 2026
**Kontext:** PRD v1.4, Kategorie 4 (Bildbearbeitung), Phase 2

---

## 1. Entscheidung

Adjustment-Nodes arbeiten non-destruktiv über eine **edge-basierte Pipeline**. Die Edge-Kette im Canvas *ist* der Stack — kein separates Datenmodell. Die Bildverarbeitung läuft client-seitig über **eigene GLSL-Shader** mit einem minimalen WebGL-Wrapper. Keine externen Packages.

---

## 2. Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| Expliziter Stack als Datenstruktur | Redundantes Datenmodell neben den Edges; Umsortieren erfordert Array-Manipulation statt Edge-Neuverbindung; widerspricht dem Canvas-Paradigma |
| Canvas 2D API (CPU) | Zu langsam bei großen Bildern; blockiert Main Thread; kein Parallelismus |
| glfx.js | Letztes Update 9+ Jahre alt; kein ESM-Support; müsste geforkt und gepflegt werden |
| PixiJS | 200+ KB Framework-Overhead für einen Use Case (Filter auf Einzelbild); bringt Scene Graph, Sprites, Animation mit die wir nicht brauchen |

---

## 3. Architektur-Überblick

### Edge-basierte Pipeline

Der Adjustment-Stack ergibt sich aus der Edge-Kette im Canvas. Jeder Adjustment-Node hat einen Input-Handle und einen Output-Handle. Die Reihenfolge der Adjustments ist die Reihenfolge der Verbindungen.

```
Bild-Node ──edge──▶ Kurven-Node ──edge──▶ Farbe-Node ──edge──▶ Render-Node
  (Quelle)           (Adjustment)          (Adjustment)          (Materialisierung)
  storageId           params only           params only           → neues Bild
```

**Branching** funktioniert automatisch — ein Quell-Node kann mehrere ausgehende Edges haben:

```
                    ┌──▶ Kurven (warm) ──▶ Licht (hell) ──▶ Render A
Bild-Node ──────────┤
                    └──▶ Kurven (cool) ──▶ Detail (scharf) ──▶ Render B
```

**Umsortieren** = Edge löschen + neu ziehen. Kein Array-Reordering, kein zweites Datenmodell.

### Pipeline-Traversierung

Wenn ein Node seine Live-Preview rendern will, traversiert er die Edge-Kette **rückwärts** bis zum Quell-Bild:

```
1. Node fragt: "Wer ist mein Input?" → folge eingehender Edge
2. Rekursiv weiter bis ein Node mit Bild-Daten erreicht wird (Bild-Node, KI-Bild-Node)
3. Sammle alle Adjustment-Parameter in Reihenfolge ein
4. Wende Shader-Pipeline auf das Quell-Bild an
5. Zeige Ergebnis als Preview
```

```ts
// Pseudocode: Pipeline-Traversierung
function collectPipeline(nodeId: string, edges: Edge[], nodes: Node[]): PipelineStep[] {
  const incomingEdge = edges.find(e => e.target === nodeId);
  if (!incomingEdge) return []; // Kein Input → leere Pipeline

  const sourceNode = nodes.find(n => n.id === incomingEdge.source);
  if (!sourceNode) return [];

  // Rekursion: erst die Pipeline des Vorgängers sammeln
  const upstream = collectPipeline(sourceNode.id, edges, nodes);

  // Ist der Source-Node ein Adjustment? → seine Parameter zur Pipeline hinzufügen
  if (isAdjustmentNode(sourceNode)) {
    return [...upstream, { type: sourceNode.type, params: sourceNode.data }];
  }

  // Ist der Source-Node ein Bild? → Pipeline-Anfang (kein Step, aber Bild-URL wird separat ermittelt)
  return upstream;
}

function getSourceImage(nodeId: string, edges: Edge[], nodes: Node[]): string | null {
  const incomingEdge = edges.find(e => e.target === nodeId);
  if (!incomingEdge) return null;

  const sourceNode = nodes.find(n => n.id === incomingEdge.source);
  if (!sourceNode) return null;

  if (isImageSource(sourceNode)) return sourceNode.data.url;
  return getSourceImage(sourceNode.id, edges, nodes);
}
```

### Caching-Strategie

Jeder Adjustment-Node cached sein Preview-Ergebnis als WebGL-Texture. Bei einer Parameteränderung wird nur ab diesem Node neu gerendert — Upstream-Ergebnisse bleiben gecached.

```
Bild → Kurven → Farbe → Detail
               ↑
         User ändert Farbe-Parameter
         → Kurven-Cache bleibt gültig
         → Farbe + Detail werden neu gerendert
```

Invalidierung: Wenn ein Upstream-Node seine Parameter ändert, werden alle Downstream-Caches invalidiert. Die Invalidierung propagiert über die Edge-Kette vorwärts.

---

## 4. WebGL-Wrapper

### Dateien

```
lib/
  image-pipeline/
    gl-wrapper.ts          ← WebGL-Context, Texture-Management, Shader-Kompilierung
    pipeline.ts            ← Pipeline-Traversierung, Cache, Orchestrierung
    shaders/
      curves.frag          ← Tonwert-Kurven (Lookup-Table als 1D-Texture)
      color-adjust.frag    ← HSL, Color Balance, Temperature/Tint, Vibrance
      light.frag           ← Brightness, Contrast, Exposure, Highlights/Shadows, Vignette
      detail.frag          ← Unsharp Mask, Clarity, Denoise, Grain
      passthrough.vert     ← Gemeinsamer Vertex-Shader (Fullscreen-Quad)
```

### gl-wrapper.ts — Verantwortlichkeiten

```ts
class GLWrapper {
  private gl: WebGL2RenderingContext;
  private programs: Map<string, WebGLProgram>;   // Kompilierte Shader-Programme
  private textures: Map<string, WebGLTexture>;   // Gecachte Zwischenergebnisse

  // Canvas erstellen (offscreen, nicht sichtbar im DOM)
  constructor(width: number, height: number);

  // Bild von URL in Texture laden
  loadTexture(url: string): Promise<WebGLTexture>;

  // Shader-Programm kompilieren und cachen
  getProgram(shaderType: AdjustmentType): WebGLProgram;

  // Einen Adjustment-Schritt ausführen: Input-Texture → Output-Texture
  applyShader(
    program: WebGLProgram,
    inputTexture: WebGLTexture,
    uniforms: Record<string, number | number[]>,
    outputTexture?: WebGLTexture   // Optional: in existierende Texture rendern
  ): WebGLTexture;

  // Ergebnis als ImageData / Blob extrahieren (für Preview oder Render-Node)
  readPixels(): ImageData;
  toBlob(format: "png" | "jpeg" | "webp", quality?: number): Promise<Blob>;

  // Aufräumen
  dispose(): void;
}
```

### passthrough.vert — Gemeinsamer Vertex-Shader

Alle Adjustment-Shader verwenden denselben Vertex-Shader. Er rendert ein bildschirmfüllendes Quad und reicht UV-Koordinaten an den Fragment-Shader durch:

```glsl
#version 300 es
in vec2 a_position;    // [-1, 1] Fullscreen-Quad
in vec2 a_texCoord;    // [0, 1] UV-Koordinaten
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

### Shader-Architektur (Fragment-Shader)

Jeder Adjustment-Typ ist ein eigener Fragment-Shader. Uniforms steuern die Parameter.

**Curves (curves.frag):**

Kontrollpunkte werden in eine 256-Entry Lookup-Table (LUT) interpoliert und als 1D-Texture übergeben. Der Shader samplet die LUT pro Kanal.

```glsl
#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_lutRGB;      // 256×1 Lookup-Table (alle Kanäle)
uniform sampler2D u_lutRed;      // 256×1 Lookup-Table (Rot-Kanal, optional)
uniform sampler2D u_lutGreen;    // 256×1 Lookup-Table (Grün-Kanal, optional)
uniform sampler2D u_lutBlue;     // 256×1 Lookup-Table (Blau-Kanal, optional)
uniform bool u_hasPerChannel;    // Einzelkanal-Kurven aktiv?

// Levels
uniform float u_blackPoint;      // 0.0–1.0 (default 0.0)
uniform float u_whitePoint;      // 0.0–1.0 (default 1.0)
uniform float u_gamma;           // 0.1–10.0 (default 1.0)

void main() {
  vec4 color = texture(u_image, v_texCoord);

  // Levels: Remap + Gamma
  color.rgb = clamp((color.rgb - u_blackPoint) / (u_whitePoint - u_blackPoint), 0.0, 1.0);
  color.rgb = pow(color.rgb, vec3(1.0 / u_gamma));

  // RGB-Kurve anwenden
  color.r = texture(u_lutRGB, vec2(color.r, 0.5)).r;
  color.g = texture(u_lutRGB, vec2(color.g, 0.5)).r;
  color.b = texture(u_lutRGB, vec2(color.b, 0.5)).r;

  // Per-Channel Kurven (optional)
  if (u_hasPerChannel) {
    color.r = texture(u_lutRed,   vec2(color.r, 0.5)).r;
    color.g = texture(u_lutGreen, vec2(color.g, 0.5)).r;
    color.b = texture(u_lutBlue,  vec2(color.b, 0.5)).r;
  }

  fragColor = color;
}
```

**Color Adjust (color-adjust.frag):**

HSL-Konvertierung, Color Balance (3-Wege), Temperature/Tint, Vibrance.

```glsl
// Kern-Uniforms:
uniform float u_hue;            // -180 bis +180
uniform float u_saturation;     // -100 bis +100
uniform float u_luminance;      // -100 bis +100
uniform float u_temperature;    // -100 bis +100 (Cool ↔ Warm)
uniform float u_tint;           // -100 bis +100 (Green ↔ Magenta)
uniform float u_vibrance;       // -100 bis +100
uniform vec3 u_shadowBalance;   // Color Balance: Shadows (CMY offsets)
uniform vec3 u_midtoneBalance;  // Color Balance: Midtones
uniform vec3 u_highlightBalance;// Color Balance: Highlights
```

**Light (light.frag):**

Exposure, Highlights/Shadows Recovery, HDR Tone Mapping (Local Contrast), Vignette.

```glsl
// Kern-Uniforms:
uniform float u_brightness;     // -100 bis +100
uniform float u_contrast;       // -100 bis +100
uniform float u_exposure;       // -5.0 bis +5.0 (EV)
uniform float u_highlights;     // -100 bis +100
uniform float u_shadows;        // -100 bis +100
uniform float u_whites;         // -100 bis +100
uniform float u_blacks;         // -100 bis +100
uniform float u_vignetteAmount; // 0.0 bis 1.0
uniform float u_vignetteSize;   // 0.0 bis 1.0
uniform vec2  u_resolution;     // Bildgröße (für Vignette-Berechnung)
```

**Detail (detail.frag):**

Unsharp Mask benötigt zwei Passes (Blur → Differenz). Clarity arbeitet auf Midtones.

```glsl
// Kern-Uniforms:
uniform float u_sharpenAmount;     // 0.0 bis 5.0
uniform float u_sharpenRadius;     // 0.5 bis 5.0
uniform float u_sharpenThreshold;  // 0.0 bis 1.0
uniform float u_clarity;           // -100 bis +100 (Midtone Contrast)
uniform float u_denoiseStrength;   // 0.0 bis 1.0
uniform float u_grainAmount;       // 0.0 bis 1.0
uniform float u_grainSize;         // 0.5 bis 3.0
uniform float u_time;              // Für Grain-Noise-Seed
```

> **Hinweis:** Unsharp Mask und Denoise benötigen Multi-Pass-Rendering (erst Blur, dann Differenz/Blend). Der GLWrapper unterstützt dies über Framebuffer-Ping-Pong zwischen zwei Textures.

---

## 5. Datenmodell (Convex)

Adjustment-Nodes speichern **nur Parameter** im `data`-Feld. Keine Pixel, kein `storageId`, kein Zwischen-Ergebnis.

### Node-Typen und `data`-Felder

```ts
// type: "curves"
data: {
  channelMode: "rgb" | "red" | "green" | "blue",
  points: {
    rgb:   Array<{ x: number; y: number }>,  // Kontrollpunkte [0–255]
    red:   Array<{ x: number; y: number }>,
    green: Array<{ x: number; y: number }>,
    blue:  Array<{ x: number; y: number }>,
  },
  levels: {
    blackPoint: number,   // 0–255, default 0
    whitePoint: number,   // 0–255, default 255
    gamma: number,        // 0.1–10.0, default 1.0
  },
  preset: string | null,  // "contrast" | "brighten" | "darken" | "film" | "cross-process" | null
}

// type: "color-adjust"
data: {
  hsl: {
    hue: number,         // -180 bis +180, default 0
    saturation: number,  // -100 bis +100, default 0
    luminance: number,   // -100 bis +100, default 0
  },
  colorBalance: {
    shadows:    { cyan_red: number, magenta_green: number, yellow_blue: number },
    midtones:   { cyan_red: number, magenta_green: number, yellow_blue: number },
    highlights: { cyan_red: number, magenta_green: number, yellow_blue: number },
  },
  temperature: number,   // -100 bis +100, default 0
  tint: number,          // -100 bis +100, default 0
  vibrance: number,      // -100 bis +100, default 0
  preset: string | null, // "warm" | "cool" | "vintage" | "desaturate" | null
}

// type: "light"
data: {
  brightness: number,    // -100 bis +100, default 0
  contrast: number,      // -100 bis +100, default 0
  exposure: number,      // -5.0 bis +5.0, default 0
  highlights: number,    // -100 bis +100, default 0
  shadows: number,       // -100 bis +100, default 0
  whites: number,        // -100 bis +100, default 0
  blacks: number,        // -100 bis +100, default 0
  vignette: {
    amount: number,      // 0.0 bis 1.0, default 0
    size: number,        // 0.0 bis 1.0, default 0.5
    roundness: number,   // 0.0 bis 1.0, default 1.0
  },
  preset: string | null, // "hdr" | "lowkey" | "highkey" | "flat" | null
}

// type: "detail"
data: {
  sharpen: {
    amount: number,      // 0–500, default 0 (Prozent)
    radius: number,      // 0.5–5.0, default 1.0
    threshold: number,   // 0–255, default 0
  },
  clarity: number,       // -100 bis +100, default 0
  denoise: {
    luminance: number,   // 0–100, default 0
    color: number,       // 0–100, default 0
  },
  grain: {
    amount: number,      // 0–100, default 0
    size: number,        // 0.5–3.0, default 1.0
  },
  preset: string | null, // "web" | "print" | "soft-glow" | "film-grain" | null
}

// type: "render"
data: {
  outputResolution: "original" | "2x" | "custom",
  customWidth?: number,
  customHeight?: number,
  format: "png" | "jpeg" | "webp",
  jpegQuality: number,  // 1–100, default 90 (nur bei jpeg)
  storageId?: string,    // Erst nach Render befüllt
  url?: string,          // Von Convex Query aufgelöst (wie bei Bild-Node)
  lastRenderedAt?: number,
}
```

### Schema-Ergänzung (convex/schema.ts)

Die `nodes`-Tabelle braucht keine Schema-Änderung — das polymorphe `data`-Feld (`v.any()`) trägt die Parameter bereits. Neue `type`-Werte (`curves`, `color-adjust`, `light`, `detail`, `render`) werden in die bestehende Union aufgenommen.

---

## 6. Render-Node

Der Render-Node ist der einzige Node in der Bildbearbeitungs-Kategorie, der serverseitig arbeitet.

### Flow

```
1. User klickt "Render" am Render-Node
2. Client: collectPipeline() → vollständiger Adjustment-Stack
3. Client: Führt Pipeline client-seitig aus (WebGL)
4. Client: glWrapper.toBlob() → Ergebnis als Blob
5. Client: Upload Blob → Convex Storage (wie Bild-Upload)
6. Client: updateData({ storageId, lastRenderedAt }) → Convex Mutation
7. Convex Query: storageId → url auflösen (wie bei Bild-/KI-Bild-Node)
8. Render-Node zeigt finales Bild
```

**Warum client-seitig rendern statt server-seitig?**

- WebGL-Pipeline existiert bereits im Client (Preview)
- Kein Server-Roundtrip für die Bildverarbeitung nötig
- Server müsste die gleiche Pipeline in jimp/sharp nachbauen (Aufwand, Parität-Risiko)
- Nur der Upload des fertigen Blobs geht über Convex Storage

**Render-Status am Node:**

```
idle → rendering → uploading → done | error
```

- `rendering`: Client führt Pipeline aus (schnell, < 1s)
- `uploading`: Blob wird zu Convex Storage hochgeladen
- `done`: storageId gesetzt, Bild sichtbar
- `error`: Pipeline oder Upload fehlgeschlagen

### Re-Render

Wenn Upstream-Adjustments geändert werden, zeigt der Render-Node einen visuellen Hinweis: "Out of date — Re-render". Der Render-Node tracked einen `pipelineHash` (Hash über alle Upstream-Parameter) und vergleicht ihn mit dem Hash zum Zeitpunkt des letzten Renders.

---

## 7. Live-Preview in Adjustment-Nodes

Jeder Adjustment-Node zeigt eine Live-Preview des Bildes mit allen bisherigen Adjustments (inklusive seiner eigenen).

### Implementierung

```
components/canvas/nodes/
  adjustment-preview.tsx    ← Shared Preview-Komponente für alle Adjustment-Nodes
  curves-node.tsx           ← Kurven-UI (Kurven-Editor + Preview)
  color-adjust-node.tsx     ← Farbe-UI (HSL-Slider, Color Balance Wheels + Preview)
  light-node.tsx            ← Licht-UI (Slider-Batterie + Preview)
  detail-node.tsx           ← Detail-UI (Slider + Preview)
  render-node.tsx           ← Render-Button + finales Bild
```

### adjustment-preview.tsx

```tsx
// Pseudocode
function AdjustmentPreview({ nodeId }: { nodeId: string }) {
  const nodes = useNodes();
  const edges = useEdges();

  // Pipeline rückwärts traversieren
  const sourceUrl = getSourceImage(nodeId, edges, nodes);
  const pipeline = collectPipeline(nodeId, edges, nodes);

  // WebGL-Pipeline ausführen (gecached)
  const previewUrl = usePipelinePreview(sourceUrl, pipeline);

  return <img src={previewUrl} className="w-full h-auto rounded" />;
}
```

### Performance-Budget

- Preview-Auflösung: **Dynamisch** — proportional zur Node-Breite auf dem Canvas. Berechnung: `previewWidth = Math.min(nodeWidth * devicePixelRatio, 1024)`. Kleine Nodes bekommen kleine Previews, vergrößerte Nodes bekommen schärfere. Obergrenze 1024px verhindert GPU-Überlastung bei extrem großen Nodes.
- Mindestbreite Adjustment-Nodes: **240px** — darunter werden Slider und Kurven-Editor unbedienbar. React Flow `minWidth` im NODE_DEFAULTS setzen.
- Debounce auf Slider-Änderungen: 16ms (requestAnimationFrame-aligned)
- Volle Auflösung nur beim Render-Node

---

## 8. Preset-System

Presets sind vordefinierte Parameter-Konfigurationen. Es gibt zwei Arten: Built-in-Presets (hardcoded, sofort verfügbar) und User-Presets (in Convex gespeichert, nutzerspezifisch).

### Built-in-Presets

```ts
// lib/image-pipeline/presets.ts

export const CURVE_PRESETS: Record<string, CurvesData> = {
  contrast: {
    channelMode: "rgb",
    points: { rgb: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 192, y: 220 }, { x: 255, y: 255 }], ... },
    levels: { blackPoint: 0, whitePoint: 255, gamma: 1.0 },
    preset: "contrast",
  },
  film: { ... },
  "cross-process": { ... },
};

export const LIGHT_PRESETS: Record<string, LightData> = {
  hdr:     { brightness: 0, contrast: 30, exposure: 0.5, highlights: -40, shadows: 60, ... },
  lowkey:  { brightness: -20, contrast: 40, exposure: -0.5, ... },
  highkey: { brightness: 30, contrast: -10, exposure: 1.0, ... },
  flat:    { brightness: 0, contrast: -50, exposure: 0, ... },
};
```

### User-Presets (Convex-persistiert)

User-Presets werden in einer eigenen Convex-Tabelle gespeichert — keine Browser-Abhängigkeit, kein Datenverlust bei Cache-Clear, verfügbar auf allen Geräten.

**Neues Schema:**

```ts
// convex/schema.ts — neue Tabelle

adjustmentPresets: defineTable({
  userId: v.id("users"),
  name: v.string(),                              // "Mein Film-Look"
  nodeType: v.union(                              // Für welchen Adjustment-Typ
    v.literal("curves"),
    v.literal("color-adjust"),
    v.literal("light"),
    v.literal("detail"),
  ),
  params: v.any(),                                // Die gespeicherten Parameter
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_nodeType", ["userId", "nodeType"]),
```

**CRUD:**

```ts
// convex/presets.ts

export const list = query({
  args: { nodeType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    if (args.nodeType) {
      return ctx.db.query("adjustmentPresets")
        .withIndex("by_userId_nodeType", q => q.eq("userId", user._id).eq("nodeType", args.nodeType))
        .collect();
    }
    return ctx.db.query("adjustmentPresets")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();
  },
});

export const save = mutation({
  args: { name: v.string(), nodeType: v.string(), params: v.any() },
  handler: async (ctx, args) => { ... },
});

export const remove = mutation({
  args: { presetId: v.id("adjustmentPresets") },
  handler: async (ctx, args) => { ... },
});
```

**UI-Flow:**

Am Adjustment-Node: Preset-Dropdown zeigt erst Built-in-Presets, dann eine Trennlinie, dann User-Presets. Daneben ein "Save"-Button der die aktuellen Parameter als User-Preset speichert (Name-Input via Inline-TextField). Auswahl eines Presets überschreibt alle Parameter. Danach können Parameter manuell angepasst werden — `preset` wird auf `null` gesetzt (Custom).

---

## 9. Sidebar-Integration

Neue Sidebar-Kategorie **"Bildbearbeitung"** mit fünf Einträgen:

| Sidebar-Eintrag | Node-Type | Icon |
|---|---|---|
| Kurven | `curves` | `TrendingUp` (lucide) |
| Farbe | `color-adjust` | `Palette` (lucide) |
| Licht | `light` | `Sun` (lucide) |
| Detail | `detail` | `Focus` (lucide) |
| Render | `render` | `ImageDown` (lucide) |

Drag-Data: `application/lemonspace-node-type` mit dem jeweiligen `type`-String (konsistent mit bestehenden Nodes).

---

## 10. Edge-Validierung

Nicht jeder Node darf mit jedem verbunden werden. Für Adjustment-Nodes gelten Regeln:

| Verbindung | Erlaubt? |
|---|---|
| Bild-Node → Adjustment-Node | ✅ |
| KI-Bild-Node → Adjustment-Node | ✅ |
| Adjustment-Node → Adjustment-Node | ✅ (Kette) |
| Adjustment-Node → Render-Node | ✅ |
| Bild-Node → Render-Node | ✅ (direkter Render ohne Adjustments) |
| Adjustment-Node → KI-Bild-Node | ❌ |
| Adjustment-Node → Prompt-Node | ❌ |
| Adjustment-Node → Compare-Node | ✅ (Preview als Bild-Quelle) |
| Text-Node → Adjustment-Node | ❌ |
| Adjustment-Node hat > 1 eingehende Edge | ❌ (genau 1 Input) |

Die Validierung läuft in `canvas.tsx` bei `onConnect` — ungültige Verbindungen werden abgelehnt mit Toast-Feedback.

---

## 11. Dateistruktur (Phase 2 — Bildbearbeitung)

```
lib/
  image-pipeline/
    gl-wrapper.ts                ← WebGL-Context, Texture, Shader-Kompilierung
    pipeline.ts                  ← Pipeline-Traversierung, Cache, Orchestrierung
    presets.ts                   ← Built-in Presets für alle Adjustment-Typen
    curve-interpolation.ts       ← Monotone kubische Interpolation → LUT
    shaders/
      passthrough.vert           ← Gemeinsamer Vertex-Shader
      curves.frag                ← Tonwert-Kurven + Levels
      color-adjust.frag          ← HSL, Color Balance, Temperature, Vibrance
      light.frag                 ← Brightness, Contrast, Exposure, H/S, Vignette
      detail.frag                ← Sharpen, Clarity, Denoise, Grain
      blur.frag                  ← Hilfshader für Unsharp Mask + Denoise

components/canvas/nodes/
  adjustment-preview.tsx         ← Shared Preview für alle Adjustment-Nodes
  curves-node.tsx                ← Kurven-Editor (interaktive Bézier-Kurve)
  color-adjust-node.tsx          ← HSL-Slider, Color Balance, Temperature
  light-node.tsx                 ← Slider-Batterie für Licht-Parameter
  detail-node.tsx                ← Sharpen/Clarity/Denoise/Grain Slider
  render-node.tsx                ← Render-Button, Format-Auswahl, finales Bild

hooks/
  use-pipeline-preview.ts        ← Hook: Pipeline ausführen → Preview-URL
```

---

## 12. Offene Entscheidungen

| Thema | Status | Notizen |
|---|---|---|
| User-Presets persistieren | ✅ | Convex-Tabelle `adjustmentPresets` mit userId-Index. Kein Local Storage — Presets überleben Cache-Clear und sind geräteübergreifend verfügbar. |
| Histogram-UI im Kurven-Node | ✅ | Histogram wird aus dem Pipeline-Output berechnet — zeigt die Tonwertverteilung *nach* allen vorhergehenden Adjustments. `gl.readPixels()` auf den aktuellen Framebuffer, dann Häufigkeitsverteilung über R/G/B/Luminanz in JS berechnen. Downsampled auf Preview-Auflösung (nicht Originalbild), damit der Readback schnell bleibt. |
| Preview-Auflösung dynamisch | ✅ | Proportional zur Node-Breite × `devicePixelRatio`, gecapped bei 1024px. Adjustment-Nodes haben eine Mindestbreite von 240px. |
| Adjustment-Node Resize | ✅ | Resizeable (wie alle Nodes via base-node-wrapper), mit `minWidth: 240`. Preview skaliert mit, Slider-Layout bleibt stabil. |
| Render-Node: Client- vs. Server-seitig | ✅ | Client-seitig (WebGL → Blob → Upload). Server müsste Pipeline duplizieren. |
| WebGL-Fallback | ⏳ | Canvas 2D als Fallback? Praktisch alle modernen Browser haben WebGL2. Aufwand vs. Nutzen. |
| Detail-Node: Multi-Pass-Architektur | ⏳ | Framebuffer-Ping-Pong für Unsharp Mask + Denoise. Exakte Implementierung TBD. |

---

## 13. Credits & Performance

| Aspekt | Wert |
|---|---|
| Credit-Kosten Adjustments | 0 Cr (client-seitig) |
| Credit-Kosten Render | 0 Cr (kein KI-API-Call, nur Convex Storage) |
| Preview-Latenz (Ziel) | < 16ms (60fps bei Slider-Drag) |
| Preview-Auflösung | Dynamisch: nodeWidth × devicePixelRatio, max 1024px |
| Mindestbreite Adjustment-Nodes | 240px |
| Max. Bild-Auflösung Render | Original-Auflösung |
| WebGL-Version | WebGL2 (ES 3.0 Shaders) |

---

*LemonSpace ADR — Adjustment-Stack — März 2026*
