# Root Config, Public Assets und Generated Files

Diese Seite trennt manuell gepflegte Projektkonfiguration von generierten, installierten oder geheimen Artefakten.

## Root-Konfiguration

| Datei | Verantwortung |
|-------|---------------|
| `package.json` | Projekt-Metadaten, Scripts (`dev`, `build`, `lint`, `test`) und Dependencies: Next 16.2.1, React 19.2.4, Convex, Better Auth, Sentry, Tailwind v4, Vitest. |
| `pnpm-lock.yaml` | Lockfile; automatisch durch pnpm gepflegt. |
| `next.config.ts` | Next Config mit `next-intl`, Sentry Wrapper, Turbopack Root, dev-only StrictMode-Suppression, Remote Image Patterns. |
| `tsconfig.json` | Strict TypeScript, Bundler Module Resolution, `@/*` Alias, `.next/types` Include. |
| `eslint.config.mjs` | Next Core Web Vitals + TypeScript ESLint Flat Config; ignoriert Build-/Generated-Artefakte. |
| `postcss.config.mjs` | Tailwind v4 PostCSS Plugin. |
| `vitest.config.ts` | Vitest Setup, Node Environment, Alias-Konfiguration, Test-Includes. |
| `components.json` | ShadCN-Konfiguration, Aliases und Registries. |
| `routing.ts` | Next-intl Routing; auch in [`app-routing.md`](app-routing.md) dokumentiert. |
| `instrumentation.ts` | Server/Edge Sentry Instrumentation Loader. |
| `instrumentation-client.ts` | Client Sentry Init und Router Transition Capture. |
| `sentry.server.config.ts` | Server Sentry Runtime Config. |
| `sentry.edge.config.ts` | Edge Sentry Runtime Config. |
| `AGENTS.md` | Repositoryweite Agent-/Arbeitsanweisungen inkl. Next.js- und Backlog-Hinweisen. |
| `CLAUDE.md` | Claude/Kilo-Einstieg mit Sub-Dokumentation und Design Context. |
| `README.md` | Produkt-/Setup-README; teilweise älter als aktuelle Polar-/Feature-Implementierung. |
| `LICENSE.md` | Lizenzinformationen. |

## Public Assets

| Datei | Verantwortung |
|-------|---------------|
| `public/logos/lemonspace-logo-v2-black-rgb.svg` | Schwarze Logo-Variante. |
| `public/logos/lemonspace-logo-v2-white-rgb.svg` | Weiße Logo-Variante. |
| `public/logos/lemonspace-logo-v2-primary-rgb.svg` | Primary/Brand Logo-Variante. |
| `public/cursors/scissors-cursor-light-canvas.svg` | Scissors-Cursor für Light Canvas. |
| `public/cursors/scissors-cursor-dark-canvas.svg` | Scissors-Cursor für Dark Canvas. |

## Backlog.md

| Pfad | Verantwortung |
|------|---------------|
| `.backlog/config.yml` | Backlog.md Projektkonfiguration, Status-Spalten und Remote-Operationen. |
| `.backlog/tasks/` | Task-Dateien. Für diese Dokumentation relevant: `task-028 - Document-codebase-files.md`. |
| `.backlog/completed/`, `.backlog/archive/`, `.backlog/drafts/`, `.backlog/decisions/`, `.backlog/docs/`, `.backlog/milestones/` | Backlog.md Projektmanagementbereiche. |

## Generiert, installiert, geheim oder Build-/Cache-bezogen

Diese Pfade sollen nicht manuell dokumentiert oder editiert werden:

| Pfad | Grund |
|------|-------|
| `node_modules/` | Installierte Dependencies. |
| `.next/` | Next.js Build-/Dev-Output. |
| `out/`, `build/` | Build-Outputs, falls vorhanden. |
| `convex/_generated/` | Convex-generierte API/DataModel/Server Dateien. |
| `next-env.d.ts` | Next.js TypeScript-Umgebungsdatei; laut Next-Doku nicht manuell bearbeiten. |
| `tsconfig.tsbuildinfo` | TypeScript Incremental Build Cache. |
| `.env.local` | Lokale Secrets/Environment; niemals dokumentieren oder committen. |
| `.DS_Store` | macOS Metadaten. |
| `.cursor/` | Editor-/Tooling-Kontext, nicht App-Runtime. |
| `.worktrees/` | Lokale Git-Worktrees, ignoriert. |
| `lib/generated/agent-doc-segments.ts` | Generiert durch `scripts/compile-agent-docs.ts`; als Artefakt dokumentiert, nicht manuell editieren. |

## Standard Next.js vs projekt-spezifisch

Nicht jeder `app/` Spezialdateiname ist Boilerplate. `layout.tsx`, `page.tsx`, `error.tsx` und `global-error.tsx` folgen zwar App-Router-Konventionen, enthalten hier aber LemonSpace-spezifische Auth-, i18n-, Analytics-, Sentry- und UI-Logik. Deshalb sind sie in [`app-routing.md`](app-routing.md) dokumentiert.

Echte Standard-/Low-Value-Dateien sind z. B. `app/favicon.ico`, `next-env.d.ts` und generierte `.next/types`.
