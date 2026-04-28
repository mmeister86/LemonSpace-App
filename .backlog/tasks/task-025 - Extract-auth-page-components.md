---
id: TASK-025
title: Extract auth page components
status: Done
assignee:
  - Kilo
created_date: '2026-04-27 14:27'
updated_date: '2026-04-28 09:50'
labels:
  - app
  - auth
  - ui
  - refactor
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extract shared auth card, field, social provider placeholder, message, and German error-copy helpers from `app/auth/sign-in/page.tsx` and `app/auth/sign-up/page.tsx`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sign-in and sign-up pages share auth layout/card primitives.
- [x] #2 Social provider placeholder list is defined once.
- [x] #3 German auth error mapping is shared where messages match.
- [x] #4 Existing visible behavior and copy are preserved.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add smoke tests for sign-in/sign-up visible labels and error copy if missing.
2. Create shared auth UI components under `components/auth/`.
3. Create shared auth copy/error helper.
4. Replace duplicated markup in sign-in and sign-up pages.
5. Run focused auth page tests if present and `npm run lint`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Read `AGENTS.md`, `app/CLAUDE.md`, `components/ui/CLAUDE.md`, and the Next.js 16 App Router docs in `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`, `03-layouts-and-pages.md`, and `05-server-and-client-components.md` before changing route files.
- Added `components/auth/auth-page.tsx` with shared auth shell/card/header/field/message/social-provider/footer primitives.
- Added `components/auth/auth-page-content.ts` with the shared social provider placeholder list, German sign-in/sign-up auth error mappers, and social placeholder message helper.
- Refactored `app/auth/sign-in/page.tsx` and `app/auth/sign-up/page.tsx` to keep their route default exports while using the shared auth primitives/helpers.
- Added `tests/auth-page-content.test.ts` characterization coverage for the shared provider list, German error copy, and social placeholder copy.
- Verification: `npm run test -- tests/auth-page-content.test.ts` -> passed, 1 test file, 4 tests.
- Verification: `npm run lint -- app/auth/sign-in/page.tsx app/auth/sign-up/page.tsx components/auth/auth-page.tsx components/auth/auth-page-content.ts tests/auth-page-content.test.ts` -> passed with no output after the command header.
- Verification: `npm run lint` -> completed with 0 errors and 6 existing warnings in unrelated files: `components/canvas/nodes/mixer-node.tsx`, `lib/canvas-node-favorite.ts`, `lib/image-pipeline/backend/webgl/webgl-backend.ts`, and `tests/image-pipeline/parity/fixtures.ts`.
- Verification: `npx tsc --noEmit` -> failed on existing unrelated type errors in canvas/tests/source modules, including `UseCanvasDeleteHandlersParams` test fixtures, `MixerBlendMode` export, `parameter-slider` ref type, `CanvasPresetsProviderProps` test props, credit activity test shape, splitter comparison, and compare surface test props.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:SUMMARY:BEGIN -->
Extracted shared auth UI primitives and copy helpers for sign-in/sign-up while preserving the visible German copy, social placeholders, messages, links, form fields, and route default exports. Focused auth tests and lint passed; project-wide TypeScript verification remains blocked by unrelated pre-existing errors outside this task.
<!-- SECTION:SUMMARY:END -->
