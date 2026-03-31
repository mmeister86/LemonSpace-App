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
