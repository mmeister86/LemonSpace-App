# LemonSpace Codebase Documentation

Diese Dokumentation erklärt die Dateien, die die LemonSpace-Webapp ausmachen. Sie ist als **hybride Bereichsdokumentation** aufgebaut: kritische Subsysteme sind detailliert dokumentiert, einfache UI-/Test-/Config-Bereiche kompakter.

**Backlog:** TASK-028 — Document codebase files  
**Stand:** 2026-04-28

## Navigationsindex

| Bereich | Dokumentation | Tiefe |
|---------|---------------|-------|
| Next.js Routing, i18n, Auth/API-Routes | [`app-routing.md`](app-routing.md) | Mittel |
| Canvas-Engine | [`canvas.md`](canvas.md) | Hoch |
| Convex Backend | [`convex.md`](convex.md) | Hoch |
| Shared TypeScript / Runtime Libraries | [`lib.md`](lib.md) | Hoch |
| Non-Canvas Components, UI, Agents, Media | [`components.md`](components.md) | Mittel/kompakt |
| Hooks, `src/`, Scripts | [`hooks-src-scripts.md`](hooks-src-scripts.md) | Mittel |
| Tests | [`tests.md`](tests.md) | Kompakt |
| Root Config, Public Assets, Generated Files | [`config-and-generated.md`](config-and-generated.md) | Kompakt |

## Was dokumentiert wird

Dokumentiert werden projekt-spezifische Dateien und lokal gepflegte Integrationsdateien, insbesondere:

- `app/` Routen, Layouts, Auth-Flows, API-Routes und globale Styles
- `components/` UI- und Canvas-Komponenten
- `convex/` Backend-Funktionen, Actions, Mutations, Queries und Schema
- `lib/` pure TypeScript-Utilities, Runtime-Verträge, Modell-Registries und Image-Pipeline
- `hooks/`, `src/`, `scripts/`, `messages/`, `i18n/`, `public/`
- `tests/` als Test-Landkarte
- Root-Konfiguration und Tooling

## Ausgeschlossen oder nur markiert

Diese Dateien/Ordner sind generiert, installiert, geheim oder build-/cache-bezogen und werden nicht file-by-file erklärt:

- `.next/`
- `node_modules/`
- `out/`, `build/`, falls vorhanden
- `convex/_generated/`
- `next-env.d.ts`
- `tsconfig.tsbuildinfo`
- `.env.local`
- `.DS_Store`
- `app/favicon.ico` wird nur als Standard-Asset erwähnt
- `lib/generated/agent-doc-segments.ts` wird als generiertes Artefakt dokumentiert, aber nicht als manuell gepflegte Quelle behandelt

## Source-of-truth-Dokumente

Vor Codeänderungen gelten weiterhin die lokalen Agent-/Bereichsanweisungen als Arbeitskontext:

- [`../AGENTS.md`](../../AGENTS.md)
- [`../CLAUDE.md`](../../CLAUDE.md)
- [`app/CLAUDE.md`](../../app/CLAUDE.md)
- [`components/canvas/CLAUDE.md`](../../components/canvas/CLAUDE.md)
- [`convex/CLAUDE.md`](../../convex/CLAUDE.md)
- [`lib/CLAUDE.md`](../../lib/CLAUDE.md)
- [`hooks/CLAUDE.md`](../../hooks/CLAUDE.md)
- [`components/ui/CLAUDE.md`](../../components/ui/CLAUDE.md)
- [`components/dashboard/CLAUDE.md`](../../components/dashboard/CLAUDE.md)
- [`components/billing/CLAUDE.md`](../../components/billing/CLAUDE.md)
- [`components/agents/CLAUDE.md`](../../components/agents/CLAUDE.md)

Hinweis: Einige dieser Bereichsdokumente sind leicht veraltet. Diese Codebase-Dokumentation nennt die wichtigsten Abweichungen in den jeweiligen Bereichsseiten.

## Wichtige Querschnittsregeln

- **Next.js 16:** Vor Änderungen an Routing, Layouts, Metadata, Error Boundaries oder API-Routes relevante Guides in `node_modules/next/dist/docs/` lesen.
- **Convex generated files:** Nichts unter `convex/_generated/` manuell ändern.
- **Agent Prompt-Segmente:** Raw-Markdown in `components/agents/*.md` wird per `scripts/compile-agent-docs.ts` nach `lib/generated/agent-doc-segments.ts` kompiliert.
- **Canvas-Typen:** `lib/canvas-node-types.ts`, `convex/node_type_validator.ts`, Canvas-Komponenten und Connection Policy müssen synchron bleiben.
- **Modell-Registries:** Client-Registries in `lib/ai-models.ts` und `lib/ai-video-models.ts` müssen zu Backend-/Provider-Implementierungen passen.
