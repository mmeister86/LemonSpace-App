# Codebase Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maintainable `docs/codebase/` documentation set for LemonSpace's project-specific webapp files while excluding generated and standard build artifacts.

**Architecture:** Use one index plus focused area pages. Critical subsystems (`convex/`, `components/canvas/`, `lib/`) get detailed file inventories and flow notes; simpler UI/config/test areas get compact inventories with explicit generated-file exclusions.

**Tech Stack:** Markdown documentation, Next.js 16 App Router, Convex, React/TypeScript, Vitest, Backlog.md.

---

### Task 1: Process documents and Backlog reference

**Files:**
- Create: `docs/superpowers/specs/2026-04-28-codebase-documentation-design.md`
- Create: `docs/superpowers/plans/2026-04-28-codebase-documentation.md`
- Modify: `.backlog/tasks/task-028 - Document-codebase-files.md`

- [ ] **Step 1: Record the approved design**

Write the design spec with goal, scope, output structure, documentation rules, and acceptance criteria mapping.

- [ ] **Step 2: Record the implementation plan**

Write this plan with exact files, verification commands, and Backlog references.

- [ ] **Step 3: Keep Backlog in sync**

Update TASK-028 with links to the spec, plan, and final documentation entry point.

### Task 2: Create the codebase documentation set

**Files:**
- Create: `docs/codebase/README.md`
- Create: `docs/codebase/app-routing.md`
- Create: `docs/codebase/canvas.md`
- Create: `docs/codebase/convex.md`
- Create: `docs/codebase/lib.md`
- Create: `docs/codebase/components.md`
- Create: `docs/codebase/hooks-src-scripts.md`
- Create: `docs/codebase/tests.md`
- Create: `docs/codebase/config-and-generated.md`

- [ ] **Step 1: Write the index**

Create `docs/codebase/README.md` with scope, navigation table, depth model, source-of-truth notes, and exclusion rules.

- [ ] **Step 2: Write area docs**

Create one page per area. Each page includes purpose, important flows, file inventory, generated/boilerplate notes, and maintenance caveats.

- [ ] **Step 3: Cross-reference related areas**

Ensure Canvas references `lib/` and Convex, agents reference `scripts/compile-agent-docs.ts` and generated prompt segments, and config docs reference generated/build exclusions.

### Task 3: Verify and finalize

**Files:**
- Read/verify: `docs/codebase/*.md`
- Read/verify: `.backlog/tasks/task-028 - Document-codebase-files.md`

- [ ] **Step 1: Check local Markdown links**

Run a local Markdown link checker for `docs/codebase/*.md`.

Expected: all local links resolve.

- [ ] **Step 2: Run tests**

Run: `pnpm test`

Expected: all Vitest tests pass. Baseline before docs work was `124 passed`, `685 passed`.

- [ ] **Step 3: Inspect changed files**

Run: `git status --short` and `git diff -- docs/codebase docs/superpowers .backlog`.

Expected: only documentation/process files changed; no source code changes.

- [ ] **Step 4: Final Backlog update**

Set TASK-028 to `Done` and add final summary/notes with spec, plan, docs entry point, and verification evidence.
