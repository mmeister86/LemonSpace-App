# LemonSpace

**Source-available creative workspace for AI-assisted campaign production.**

LemonSpace is a visual canvas where creative and marketing teams turn input
assets into campaign-ready image and video variants. The app combines a
node-based workflow, AI generation, asset browsing, credit accounting, and
low-latency UX around a Convex realtime backend.

## Current State

This repository contains the active Next.js webapp. The codebase has moved well
beyond the original MVP README:

- Next.js 16 App Router with authenticated app routes, dashboard routes, Better
  Auth flows, Sentry instrumentation, Rybbit analytics, and next-intl routing.
- Convex as the backend for database, realtime subscriptions, storage,
  background jobs, auth integration, credits, media archive, agents, and
  webhooks.
- A React Flow canvas with offline-aware sync, local snapshot recovery,
  connection validation, magnetic handles, grouped/frame nodes, media nodes,
  image/video generation nodes, transform nodes, adjustment nodes, mixer,
  compare, render, and agent nodes.
- Polar.sh billing and top-ups with credit reservation/commit flows. Lemon
  Squeezy fields still exist in the schema for compatibility but are no longer
  the active payment path.
- Freepik-backed AI video generation, OpenRouter-backed image/text/agent
  generation, Pexels/Freepik asset browsing, and a persistent media library.
- Dashboard snapshot caching and a detailed credit activity page with local
  filtering, sorting, and pagination.
- Backlog.md task tracking and folder-level documentation for contributors and
  agents.

For file-by-file documentation, start at
[`docs/codebase/README.md`](docs/codebase/README.md).

## Tech Stack

| Area | Technology |
|------|------------|
| App | Next.js 16.2.1, React 19.2, TypeScript 5 |
| Styling | Tailwind CSS v4, ShadCN-style local UI primitives, lucide-react |
| Canvas | `@xyflow/react`, `@dnd-kit`, local sync/reconciliation helpers |
| Backend | Convex queries, mutations, actions, storage, scheduler, HTTP routes |
| Auth | Better Auth with Convex integration |
| AI | OpenRouter, Freepik video APIs, local image-pipeline utilities |
| Billing | Polar.sh, internal credit ledger, Redis-backed rate limiting |
| Observability | Sentry for Next.js, Rybbit analytics |
| Tests | Vitest with focused component, lib, Convex, and pipeline tests |
| i18n | `next-intl`, `messages/de.json`, `messages/en.json` |

## Getting Started

### Requirements

- Node.js 20+
- pnpm
- A Convex deployment or local Convex development setup
- Optional local services depending on the feature you test: Redis, provider API
  keys, Polar webhook configuration

### Install and Run

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts Next.js with `NEXT_DEV_SUPPRESS_HYDRATION=1`, which disables
React Strict Mode in development to reduce double-mount noise. Use the strict
variant when debugging hydration or lifecycle issues:

```bash
pnpm dev:strict
```

Common scripts:

```bash
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm test:watch
```

Agent prompt documentation is compiled separately:

```bash
npx tsx scripts/compile-agent-docs.ts
```

## Environment

There is currently no tracked `.env.example` in this repository. Create your
local environment from the feature areas you need to run. Important variables
used by the codebase include:

| Variable | Used by |
|----------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex React client |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Server-side Convex auth token helper |
| `CONVEX_SITE_URL` | Convex auth issuer config |
| `SITE_URL`, `APP_URL` | Better Auth / trusted app origins |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth server config |
| `OPENROUTER_API_KEY` | Image, text, and agent generation |
| `FREEPIK_API_KEY` | Video generation and Freepik asset/search APIs |
| `PEXELS_API_KEY` | Pexels video proxy/search |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` | Billing and webhook handling |
| `RESEND_API_KEY` | Auth email delivery |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` | Rate limiting |
| `INTERNAL_CREDITS_ENABLED` | Credit reservation/commit flow |
| `ALLOW_TEST_CREDIT_GRANT`, `NEXT_PUBLIC_ALLOW_TEST_CREDIT_GRANT` | Dev-only credit grants |
| `NEXT_PUBLIC_MIXER_DIAGNOSTICS` | Mixer diagnostics in development/test |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `CI` | Sentry source map upload behavior |

Keep secrets out of source control. `.env.local` is local-only.

## Project Structure

```text
webapp/
├── app/                    # Next.js App Router, layouts, auth, dashboard, API routes
├── components/
│   ├── canvas/             # React Flow canvas engine and node components
│   ├── dashboard/          # Dashboard cards, charts, transactions
│   ├── billing/            # Pricing, subscription, top-up UI
│   ├── media/              # Media library dialog and preview helpers
│   ├── agents/             # Human-readable agent specs and prompt segments
│   └── ui/                 # Local ShadCN-style primitives
├── convex/                 # Backend schema, queries, mutations, actions, webhooks
├── docs/codebase/          # Maintained codebase documentation
├── hooks/                  # Shared client hooks
├── i18n/                   # next-intl request/routing helpers
├── lib/                    # Shared TypeScript logic and registries
├── messages/               # German and English translations
├── public/                 # Static assets, cursors, logos
├── scripts/                # Build/compile support scripts
├── src/                    # Compatibility/re-export surface for selected modules
└── tests/                  # Vitest tests for lib, Convex, canvas, pipeline, UI helpers
```

## Architecture Notes

### Routing and Providers

`app/layout.tsx` initializes Manrope, server-side auth token lookup, Sentry user
context, Rybbit analytics, and the shared provider tree. Authenticated app
routes live under `app/(app)/`; dashboard routes live under `app/dashboard`;
Better Auth screens live under `app/auth`; and API routes include auth handling
plus a Pexels video proxy.

Before changing Next.js routing, layouts, metadata, error boundaries, or API
routes, read the relevant docs under `node_modules/next/dist/docs/`. This app is
on Next.js 16 and project guidance explicitly treats it as different from older
Next.js conventions.

### Canvas Engine

The canvas is built around `components/canvas/canvas.tsx` and
`@xyflow/react`. It syncs with Convex through a graph query plus local
reconciliation, offline queueing, storage URL resolution, and local snapshot
recovery. Node taxonomy is centralized in `lib/canvas-node-catalog.ts`,
templates in `lib/canvas-node-templates.ts`, node unions in
`lib/canvas-node-types.ts`, and connection rules in
`lib/canvas-connection-policy.ts`.

Implemented node families include source/media nodes, AI image/video/text
nodes, agent output nodes, image transforms, adjustment nodes, mixer, render,
compare, group, frame, note, and text/rich-text nodes. Some Phase 2/3 node types
are deliberately predeclared in schema/catalogs but remain disabled until their
React Flow implementation exists.

### Convex Backend

Convex is the backend boundary: schema, auth integration, graph queries, media
archive, storage URL batching, AI jobs, credit ledger, dashboard snapshots,
Polar webhooks, provider polling, migrations, and rate-limited operations live
there. Do not edit `convex/_generated/` manually.

### AI, Agents, and Media

Image and text generation use OpenRouter. Video generation uses Freepik task
creation plus provider-specific polling. Agent runs follow a dual model:
TypeScript contracts in `lib/agent-definitions.ts` and
`lib/agent-run-contract.ts`, with curated Markdown prompt segments in
`components/agents/*.md` compiled into `lib/generated/agent-doc-segments.ts`.

The media archive stores images, videos, and provider assets with deduplication,
preview data, source metadata, and first-use canvas/node references.

### Dashboard and Billing

The dashboard loads balance, subscription, usage stats, transactions, and
canvases through `api.dashboard.getSnapshot`, then caches that snapshot in
localStorage for fast repeat visits. The usage page loads the credit activity
dataset once and filters/sorts/paginates locally.

Billing is Polar-first. Tiers and credit amounts are defined in
`convex/credits.ts`; UI should read backend values instead of duplicating tier
configuration.

## Documentation Map

Folder-level docs are the source of truth before edits in those areas:

| Area | Documentation |
|------|---------------|
| Project rules and design context | [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) |
| Next.js routing | [`app/CLAUDE.md`](app/CLAUDE.md) |
| Canvas engine | [`components/canvas/CLAUDE.md`](components/canvas/CLAUDE.md) |
| Convex backend | [`convex/CLAUDE.md`](convex/CLAUDE.md) |
| Shared logic | [`lib/CLAUDE.md`](lib/CLAUDE.md) |
| Hooks | [`hooks/CLAUDE.md`](hooks/CLAUDE.md) |
| Design system | [`components/ui/CLAUDE.md`](components/ui/CLAUDE.md) |
| Dashboard | [`components/dashboard/CLAUDE.md`](components/dashboard/CLAUDE.md) |
| Billing | [`components/billing/CLAUDE.md`](components/billing/CLAUDE.md) |
| Agents | [`components/agents/CLAUDE.md`](components/agents/CLAUDE.md) |
| File-by-file codebase docs | [`docs/codebase/README.md`](docs/codebase/README.md) |

## Contributor Workflow

- Use Backlog.md for non-trivial implementation work. Create/search tasks first,
  store plans and notes in Backlog, and only mark tasks `Done` after explicit
  user confirmation.
- Use `rg`/`rg --files` for repository search.
- Keep `lib/canvas-node-types.ts`, `lib/canvas-node-catalog.ts`,
  `lib/canvas-node-templates.ts`, `convex/node_type_validator.ts`, Canvas node
  components, and connection policy in sync when changing node types.
- Keep client model registries (`lib/ai-models.ts`, `lib/ai-video-models.ts`,
  `lib/agent-models.ts`) aligned with backend/provider behavior and credit
  accounting.
- After editing `components/agents/*.md`, run
  `npx tsx scripts/compile-agent-docs.ts` and the relevant agent tests.
- Add tests in the closest existing test area when changing shared logic,
  backend behavior, canvas interactions, billing/credit flows, or AI pipelines.

## Testing

Run the full test suite with:

```bash
pnpm test
```

Run focused tests by passing paths to Vitest, for example:

```bash
pnpm test -- tests/lib/agent-doc-segments.test.ts tests/lib/agent-prompting.test.ts
pnpm test -- tests/convex/freepik-video-client.test.ts
pnpm test -- components/canvas/__tests__/mixer-node.test.tsx
```

Run lint before shipping broad changes:

```bash
pnpm lint
```

## License

LemonSpace is **source available**, not open source.

See [`LICENSE.md`](LICENSE.md) for license terms.
