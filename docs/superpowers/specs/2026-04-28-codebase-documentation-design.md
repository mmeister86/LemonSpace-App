# Codebase Documentation Design

**Backlog:** TASK-028 — Document codebase files  
**Status:** Approved for implementation on 2026-04-28  
**Owner intent:** Document the files that make up the LemonSpace webapp, excluding standard/generated Next.js/build files.

## Goal

Create a durable, navigable codebase documentation set that explains what each project-specific file or file group does, where the important flows live, and which generated or boilerplate files should not be edited manually.

## Scope

The documentation covers the LemonSpace webapp repository, with a hybrid depth model:

- **Detailed:** `convex/`, `components/canvas/`, `lib/`
- **Medium:** `app/`, `components/auth/`, `components/dashboard/`, `components/billing/`, `components/media/`, `components/agents/`, `hooks/`, `src/`, `scripts/`
- **Compact:** `components/ui/`, `tests/`, root config, Sentry/Next integration, static assets, generated files

The docs intentionally do not replace local `CLAUDE.md`/`AGENTS.md` operating instructions. Instead, they link to them and call out places where those docs are stale relative to the current file tree.

## Output structure

Create `docs/codebase/` with these pages:

| File | Purpose |
|------|---------|
| `docs/codebase/README.md` | Entry point, scope, navigation, exclusion rules |
| `docs/codebase/app-routing.md` | Next.js App Router, i18n, auth routes, API routes, observability |
| `docs/codebase/canvas.md` | Detailed Canvas engine inventory and major runtime flows |
| `docs/codebase/convex.md` | Detailed Convex backend inventory and backend flow map |
| `docs/codebase/lib.md` | Detailed shared TypeScript, image pipeline, agent runtime, registries |
| `docs/codebase/components.md` | Non-canvas components, ShadCN primitives, agents, media UI |
| `docs/codebase/hooks-src-scripts.md` | Hooks, `src/` Tool UI, script workflow |
| `docs/codebase/tests.md` | Compact test inventory and test-area map |
| `docs/codebase/config-and-generated.md` | Root config, public assets, generated/build exclusions |

## Documentation rules

1. Use German prose because the request and existing project docs are mostly German.
2. Use backticked paths for all file references so unusual App Router paths such as `app/(app)/...` remain readable.
3. Prefer concise responsibility descriptions over line-by-line code summaries.
4. Mark generated files explicitly as generated or excluded, especially `convex/_generated/`, `.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`, and `lib/generated/agent-doc-segments.ts`.
5. Call out synchronization contracts, such as `lib/canvas-node-types.ts` with `convex/node_type_validator.ts`, or model registries with provider/backend configs.
6. Keep links limited to stable local docs and source directories to reduce broken-link risk.

## Acceptance criteria mapping

- **Project-specific files inventoried:** covered across `app-routing.md`, `canvas.md`, `convex.md`, `lib.md`, `components.md`, `hooks-src-scripts.md`, `tests.md`, and `config-and-generated.md`.
- **Standard/generated exclusions called out:** covered in `README.md` and `config-and-generated.md`, with local notes in `convex.md` and `lib.md`.
- **Existing area docs respected:** linked from `README.md` and referenced in each area page where relevant.

## Known documentation caveats captured

- `app/CLAUDE.md` is partly stale about provider placement; current provider/auth/Sentry work is split into `app/dashboard/layout.tsx` and `app/(app)/layout.tsx`.
- `convex/CLAUDE.md` is useful but predates several split modules in the AI, provider polling, Freepik, node helper, and authz areas.
- `lib/CLAUDE.md` still describes `canvas-utils.ts` as a main implementation file, while it is now primarily a barrel export after modularization.
- `components/dashboard/CLAUDE.md` and `components/billing/CLAUDE.md` omit or overstate some current files/behaviors.

## Verification

After writing docs:

1. Run a Markdown/link sanity script that checks local Markdown links in `docs/codebase/`.
2. Run `pnpm test` to ensure the isolated worktree baseline remains healthy after documentation changes.
3. Inspect `git diff -- docs/codebase docs/superpowers .backlog` for accidental source-code changes.
