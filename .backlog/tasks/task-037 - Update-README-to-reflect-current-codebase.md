---
id: TASK-037
title: Update README to reflect current codebase
status: Done
assignee:
  - Codex
created_date: '2026-04-28 20:09'
updated_date: '2026-04-28 20:17'
labels:
  - documentation
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refresh the project README so it accurately describes the current webapp structure, setup, workflows, and notable implementation areas after recent codebase changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README reflects the current app architecture and major project areas documented in the repository
- [x] #2 README setup and development commands match the package scripts and project configuration
- [x] #3 README includes accurate guidance for contributors without duplicating lower-level folder documentation
- [x] #4 Relevant changes are verified against the repository state before editing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect repository status and changed files to identify the current codebase changes that should be reflected in README.
2. Read README plus top-level project configuration and relevant folder documentation (CLAUDE.md files) to ground setup, architecture, and contributor guidance.
3. Update README with accurate current project overview, setup/development commands, architecture map, and links to subsystem documentation without duplicating deep docs.
4. Verify README against package scripts/configuration and run a lightweight documentation sanity check (diff review and, if available, markdown lint/format check).
5. Update TASK-037 acceptance criteria and notes with what was verified; leave task open until you confirm it should be marked Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated README.md to describe the current Next.js/Convex/Canvas/AI/Billing/Dashboard architecture, active package scripts, environment variables discovered in code, documentation map, contributor workflow, and testing guidance.

Verified README against package.json, next.config.ts, root/file structure, folder CLAUDE.md files, docs/codebase/README.md, Canvas/Convex/lib docs, and environment variable usages found with rg.

Ran pnpm lint: exit code 0 with 4 pre-existing warnings outside README.md in lib/canvas-node-favorite.ts, lib/image-pipeline/backend/webgl/webgl-backend.ts, and tests/image-pipeline/parity/fixtures.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated README.md to reflect the current LemonSpace webapp rather than the older MVP/self-hosting description. The README now documents the active Next.js 16/React 19 stack, Convex backend responsibilities, Canvas engine scope, AI video/agent/media flows, Polar billing, dashboard snapshot caching, environment variables discovered from code, repository structure, documentation map, contributor workflow, and testing commands.

Verification: reviewed the README diff and cross-checked the content against package.json, next.config.ts, root structure, environment variable usages, docs/codebase/README.md, and relevant CLAUDE.md subsystem docs. Ran pnpm lint successfully with exit code 0; existing warnings remain outside README.md in lib/canvas-node-favorite.ts, lib/image-pipeline/backend/webgl/webgl-backend.ts, and tests/image-pipeline/parity/fixtures.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
