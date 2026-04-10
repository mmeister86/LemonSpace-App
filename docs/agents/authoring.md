# Agent Authoring Guide

This guide describes how to add or evolve agents after the runtime redesign.

## Acceptance Checklist (Task Gate)

Before shipping agent doc or definition changes, confirm all points are documented in the PR notes:

- Runtime definition location and ownership.
- How markdown prompt segments affect prompts through compile-time extraction.
- What a new agent must define in TypeScript.
- Expected structured output shape (`artifactType`, `sections`, `metadata`, `qualityChecks`, `previewText`, `body`).
- Tests added for definitions, prompt compilation, prompting, and contracts.

## Dual Model: Source of Truth Rules

The agent runtime uses two complementary sources of truth:

1. Structural/runtime contract in TypeScript.
   - `lib/agent-definitions.ts`: registry (`AGENT_DEFINITIONS`), metadata, rules, blueprints, docs path.
   - `lib/agent-run-contract.ts`: normalization and safety for plans, clarifications, and structured outputs.
   - `lib/agent-templates.ts`: UI projection derived from definitions.
2. Curated prompt influence in markdown.
   - `components/agents/<agent-id>.md` contains authored narrative plus marked prompt segments.
   - `scripts/compile-agent-docs.ts` extracts only marked blocks.
   - `lib/generated/agent-doc-segments.ts` is generated and consumed at runtime.

No free-form markdown parsing happens in `convex/agents.ts`.

## Add a New Agent

1. Add a definition in `lib/agent-definitions.ts`.
   - Add a new `AgentDefinitionId` union member.
   - Add a new item in `AGENT_DEFINITIONS` with metadata, rules, accepted source types, and `defaultOutputBlueprints`.
   - Set `docs.markdownPath` to the companion markdown file.
2. Add companion markdown in `components/agents/<agent-id>.md`.
3. Compile prompt segments into `lib/generated/agent-doc-segments.ts`.
4. Add i18n entries for template and output labels in `messages/de.json` and `messages/en.json` when needed.
5. Add or update tests (see test matrix below).

## Marker Rules (Required)

Every agent markdown file must include exactly one start marker and one end marker for each required key:

- `role`
- `style-rules`
- `decision-framework`
- `channel-notes`

Marker format:

```md
<!-- AGENT_PROMPT_SEGMENT:role:start -->
Your segment text.
<!-- AGENT_PROMPT_SEGMENT:role:end -->
```

Constraints:

- Marker names must match exactly.
- Missing, duplicate, or empty segments fail compilation.
- Segment order in output is deterministic and follows `AGENT_PROMPT_SEGMENT_KEYS`.
- Unmarked prose is ignored by the runtime prompt payload.

## Compile Flow

Run the compiler after changing any `components/agents/*.md` marker content or any `docs.markdownPath` entry:

```bash
npx tsx scripts/compile-agent-docs.ts
```

Then verify generated output changed as expected:

- `lib/generated/agent-doc-segments.ts`

## Structured Output Expectations

Execution payloads are normalized via `normalizeAgentStructuredOutput(...)` in `lib/agent-run-contract.ts`.

The runtime expects:

- `title`
- `channel`
- `artifactType`
- `previewText`
- `sections[]` (`id`, `label`, `content`)
- `metadata` (`Record<string, string | string[]>`)
- `qualityChecks[]`

Compatibility behavior:

- `body` stays as a legacy fallback string for old render paths.
- Missing/invalid entries are normalized defensively.

## Test Matrix for Agent Changes

For a new agent or blueprint change, add or update tests in these areas:

- Definition registry and projection
  - `tests/lib/agent-definitions.test.ts`
  - `tests/lib/agent-templates.test.ts`
- Markdown marker extraction and generated segment coverage
  - `tests/lib/agent-doc-segments.test.ts`
- Prompt assembly behavior
  - `tests/lib/agent-prompting.test.ts`
- Runtime contracts (execution plan + structured output normalization)
  - `tests/lib/agent-run-contract.test.ts`
  - `tests/lib/agent-structured-output.test.ts`
- Convex orchestration behavior when contract semantics change
  - `tests/convex/agent-orchestration-contract.test.ts`

## When `convex/agents.ts` Stays Unchanged

Do not modify `convex/agents.ts` when you only:

- add a new definition entry in `lib/agent-definitions.ts`
- add/update markdown prompt segments and recompile
- add or adjust output blueprints using existing contract fields
- tune analysis/execution rules in definitions
- update UI copy or i18n labels

Modify `convex/agents.ts` only when orchestration semantics change, for example:

- new runtime stage/state transitions
- credit/scheduler behavior changes
- schema shape changes for analyze or execute payloads
- persistence shape changes beyond current normalized contracts
