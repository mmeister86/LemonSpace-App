# Dynamic Canvas Node Autosize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI text and agent nodes grow to fit dynamic generated UI without horizontal growth loops.

**Architecture:** Keep measurement centralized in `BaseNodeWrapper`. Node types opt into width/height autosize through `canvas-node-size-helpers.ts`, and dynamic node bodies expose intrinsic content height by removing internal height clamps that hide overflow from the wrapper measurement.

**Tech Stack:** React, @xyflow/react, Vitest, ESLint.

---

### Task 1: Autosize Policy Coverage

**Files:**
- Modify: `components/canvas/canvas-node-size-helpers.ts`
- Test: `components/canvas/__tests__/canvas-node-interaction-helpers.test.ts`

- [ ] Add tests proving `ai-text`, `ai-text-output`, `agent`, and `agent-output` can grow vertically while keeping width stable.
- [ ] Run `npm test -- components/canvas/__tests__/canvas-node-interaction-helpers.test.ts` and verify the new tests fail before implementation.
- [ ] Add per-node `autoGrowWidth: false` policies for those dynamic text-heavy nodes.
- [ ] Run the focused helper test again and verify it passes.

### Task 2: Wrapper Queue Behavior

**Files:**
- Modify: `components/canvas/__tests__/base-node-wrapper.test.tsx`
- Use existing implementation in `components/canvas/nodes/base-node-wrapper.tsx`

- [ ] Add wrapper-level regression tests proving dynamic nodes queue height-only growth from content overflow and do not queue width-only growth.
- [ ] Run `npm test -- components/canvas/__tests__/base-node-wrapper.test.tsx` and verify the tests fail if policy is missing.
- [ ] Reuse the centralized helper implementation; avoid node-local resize effects.
- [ ] Run the focused wrapper test again and verify it passes.

### Task 3: Dynamic Content Containers

**Files:**
- Modify: `components/canvas/nodes/ai-text-output-node.tsx`
- Modify: `components/canvas/nodes/agent-output-node.tsx`

- [ ] Remove outer output-body height clamps that hide generated content from the wrapper measurement.
- [ ] Keep wrapping behavior via `whitespace-pre-wrap break-words`.
- [ ] Leave interactive scroll behavior only on small nested detail blocks where needed.
- [ ] Run focused tests and lint.

### Task 4: Verification

**Files:**
- All files above

- [ ] Run `npm run lint -- components/canvas/canvas-node-size-helpers.ts components/canvas/nodes/base-node-wrapper.tsx components/canvas/nodes/ai-text-output-node.tsx components/canvas/nodes/agent-output-node.tsx components/canvas/__tests__/base-node-wrapper.test.tsx components/canvas/__tests__/canvas-node-interaction-helpers.test.ts`
- [ ] Run `npm test -- components/canvas/__tests__`
- [ ] Run `git diff --check`
