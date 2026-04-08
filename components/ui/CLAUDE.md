# components/ui/ — Design System

ShadCN-Komponenten mit LemonSpace-spezifischen Anpassungen. Neue UI-Primitive immer hier ablegen.

---

## Stack

- **ShadCN UI** — Komponentenbibliothek (copy-paste, nicht installiertes Paket)
- **Tailwind CSS v4** — Utility-first, config in `globals.css` (kein `tailwind.config.ts` in v4)
- **Manrope** — Primäre Schrift (`--font-sans`), geladen via `next/font/google`

---

## Design-Token-Konventionen

Tokens folgen dem Manifest: **Teal-Primary, warme Neutraltöne (Sand/Beige), Zitronengelb als Akzent**.

```css
/* Primärfarbe */
--primary: teal          /* Hauptaktionen, Links, aktive States */

/* Neutraltöne — immer warm tönen */
--background: warm-white  /* Nie kaltes #fff oder gray-50 */
--muted: sand/beige       /* Sekundäre Hintergründe */
--border: warm-gray       /* Niemals kaltes gray-200 */

/* Akzentfarbe */
--accent: lemon-yellow    /* Sparsam einsetzen — Highlights, Badges */
```

**Anti-Pattern:** Kalte Grautöne (`gray-100`, `slate-200`) ohne Wärme-Anpassung. Immer Richtung Sand/Beige tönen.

---

## Animationen

Übergänge mit **exponentiellem Easing** (`ease-out` / `cubic-bezier`). Keine linearen Transitions.

```css
transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1); /* expo-out */
```

---

## Neue Komponenten

1. ShadCN-Komponente mit `npx shadcn@latest add <name>` hinzufügen
2. In `components/ui/` ablegen (automatisch durch ShadCN-CLI)
3. Anpassungen direkt in der Komponente — keine separaten Override-Dateien
4. Token-Konventionen aus `globals.css` verwenden, keine Hardcoded-Farben

---

## Layout-Komponenten

| Komponente | Pfad | Verwendung |
|------------|------|------------|
| `resizable` | `components/ui/resizable.tsx` | Sidebar-Resizing in Canvas |
| `dialog` | `components/ui/dialog.tsx` | Confirmations, Popovers |
| `popover` | `components/ui/popover.tsx` | Dropdowns, Kontext-Menüs |
| `badge` | `components/ui/badge.tsx` | Status-Tags, Badges |
| `tooltip` | `components/ui/tooltip.tsx` | Explainer-Texte |
| `separator` | `components/ui/separator.tsx` | Trennungen |
| `chart` | `components/ui/chart.tsx` | ShadCN Chart-Wrapper für Recharts (ChartContainer, ChartTooltip, ChartLegend) |

---

## ShadCN Integration

ShadCN-Komponenten werden nicht als npm-Paket installiert, sondern als Copy-Paste in das Projekt kopiert. Dies ermöglicht volle Kontrolle über die Implementierung und Anpassung an die LemonSpace-Design-Systeme.

**Standard-Prozess:**
```bash
npx shadcn@latest add button
npx shadcn@latest add input
# ... andere Komponenten
```

Komponenten werden direkt in `components/ui/` abgelegt. Lokale Anpassungen erfolgen durch Überladen von Props oder direkt in der Komponentendatei.

---

## Chart-Komponente (`chart.tsx`)

ShadCN-Wrapper für Recharts v3.8. Bietet konsistentes Styling für Chart-Elemente:

- `ChartContainer` — Root-Wrapper mit CSS-Variablen-basierten Farben
- `ChartTooltip` / `ChartTooltipContent` — Tooltip mit Design-Token-Support
- `ChartLegend` / `ChartLegendContent` — Legende mit konsistentem Styling
- `ChartConfig` — Typ für Chart-Farbkonfiguration

**Verwendung:** Dashboard Credits Activity Chart. Farben über CSS-Variablen (`hsl(var(--primary))` etc.).

**Abhängigkeit:** `recharts` v3.8.0 (in `package.json`).
