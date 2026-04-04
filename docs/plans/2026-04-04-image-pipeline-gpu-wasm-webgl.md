# Image Pipeline GPU/WASM/WebGL Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Incrementally migrate preview/full image processing from CPU-only loops to a backend-routed pipeline with WebGL acceleration, WASM fallback kernels, and CPU safety fallback.

**Architecture:** Keep `renderPreviewWithWorkerFallback` and `renderFullWithWorkerFallback` as stable entry points while introducing a backend router inside `lib/image-pipeline`. The router selects `webgl -> wasm -> cpu` by capability and feature flags, and always preserves current abort behavior and worker/main-thread fallback. Rollout is phased: CPU-compatible foundation, preview PoC, guarded production rollout, then full-render adoption.

**Tech Stack:** Next.js 16, TypeScript, Web Workers, OffscreenCanvas/WebGL2, WebAssembly SIMD, Vitest

---

### Task 1: Establish backend router contract (CPU-only behavior)

**Files:**
- Create: `lib/image-pipeline/backend/backend-types.ts`
- Create: `lib/image-pipeline/backend/backend-router.ts`
- Modify: `lib/image-pipeline/preview-renderer.ts`
- Modify: `lib/image-pipeline/bridge.ts`
- Create: `tests/image-pipeline/backend-router.test.ts`

**Step 1: Write the failing test**

Add tests proving router behavior with only CPU backend registered:
- preview path returns identical pixels to current `render-core` behavior
- full render path still produces valid blob output
- unknown/unsupported backend hint falls back to CPU

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/backend-router.test.ts`
Expected: FAIL because backend router modules do not exist.

**Step 3: Write minimal implementation**

Implement `backend-types.ts` and `backend-router.ts`, then route `preview-renderer.ts` and `bridge.ts` through router with CPU backend only.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/image-pipeline/backend-router.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/backend-types.ts lib/image-pipeline/backend/backend-router.ts lib/image-pipeline/preview-renderer.ts lib/image-pipeline/bridge.ts tests/image-pipeline/backend-router.test.ts`
- `git commit -m "refactor(image-pipeline): add backend router seam"`

### Task 2: Add capability detection and structured fallback reasons

**Files:**
- Create: `lib/image-pipeline/backend/capabilities.ts`
- Modify: `lib/image-pipeline/backend/backend-router.ts`
- Modify: `lib/image-pipeline/worker-client.ts`
- Create: `tests/image-pipeline/backend-capabilities.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- capability detection reports `webgl`, `wasmSimd`, `offscreenCanvas` independently
- router emits fallback reason codes (`unsupported_api`, `flag_disabled`, `runtime_error`)
- `worker-client` can surface backend diagnostics metadata without breaking existing return types

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/backend-capabilities.test.ts tests/image-pipeline/backend-router.test.ts`
Expected: FAIL because capabilities and reason propagation are not implemented.

**Step 3: Write minimal implementation**

Implement capability probes and fallback reason plumbing in router and worker client diagnostics.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/image-pipeline/backend-capabilities.test.ts tests/image-pipeline/backend-router.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/capabilities.ts lib/image-pipeline/backend/backend-router.ts lib/image-pipeline/worker-client.ts tests/image-pipeline/backend-capabilities.test.ts tests/image-pipeline/backend-router.test.ts`
- `git commit -m "feat(image-pipeline): add backend capability and fallback diagnostics"`

### Task 3: Introduce feature flags and CPU force-kill switch

**Files:**
- Create: `lib/image-pipeline/backend/feature-flags.ts`
- Modify: `lib/image-pipeline/backend/backend-router.ts`
- Create: `tests/image-pipeline/backend-feature-flags.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- `forceCpu` overrides all other backend choices
- `webgl` and `wasm` can be independently enabled/disabled
- defaults preserve current CPU behavior when no explicit flags are set

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/backend-feature-flags.test.ts`
Expected: FAIL because feature flag module and router integration are missing.

**Step 3: Write minimal implementation**

Add typed flag readers and router wiring to honor force-cpu and backend enablement toggles.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/image-pipeline/backend-feature-flags.test.ts tests/image-pipeline/backend-router.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/feature-flags.ts lib/image-pipeline/backend/backend-router.ts tests/image-pipeline/backend-feature-flags.test.ts tests/image-pipeline/backend-router.test.ts`
- `git commit -m "feat(image-pipeline): add backend rollout flags"`

### Task 4: WebGL PoC backend for preview (`curves`, `color-adjust`)

**Files:**
- Create: `lib/image-pipeline/backend/webgl/webgl-backend.ts`
- Create: `lib/image-pipeline/backend/webgl/shaders/curves.frag.glsl`
- Create: `lib/image-pipeline/backend/webgl/shaders/color-adjust.frag.glsl`
- Modify: `lib/image-pipeline/backend/backend-router.ts`
- Modify: `lib/image-pipeline/preview-renderer.ts`
- Create: `tests/image-pipeline/webgl-backend-poc.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- when WebGL is available and flagged on, preview router selects WebGL for supported steps
- unsupported steps in same pipeline force safe fallback to CPU for that request
- compile/link failure downgrades with `runtime_error` reason

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/webgl-backend-poc.test.ts`
Expected: FAIL because WebGL backend modules are not implemented.

**Step 3: Write minimal implementation**

Implement WebGL PoC backend for `curves` and `color-adjust`, register it in router, and ensure preview renderer receives `ImageData` output unchanged.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/image-pipeline/webgl-backend-poc.test.ts tests/image-pipeline/backend-router.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/webgl/webgl-backend.ts lib/image-pipeline/backend/webgl/shaders/curves.frag.glsl lib/image-pipeline/backend/webgl/shaders/color-adjust.frag.glsl lib/image-pipeline/backend/backend-router.ts lib/image-pipeline/preview-renderer.ts tests/image-pipeline/webgl-backend-poc.test.ts`
- `git commit -m "feat(image-pipeline): add webgl preview backend poc"`

### Task 5: Add pixel parity regression harness for CPU vs WebGL

**Files:**
- Create: `tests/image-pipeline/parity/fixtures.ts`
- Create: `tests/image-pipeline/parity/cpu-webgl-parity.test.ts`
- Modify: `tests/image-pipeline/webgl-backend-poc.test.ts`

**Step 1: Write the failing test**

Add parity tests that validate max per-channel delta and histogram similarity for representative pipelines:
- only curves
- only color-adjust
- curves + color-adjust chain

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/parity/cpu-webgl-parity.test.ts`
Expected: FAIL because parity fixtures/tolerances are not implemented.

**Step 3: Write minimal implementation**

Create shared fixtures and numeric tolerance helpers; update PoC tests to enforce parity gates before backend selection assertions.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/image-pipeline/parity/cpu-webgl-parity.test.ts tests/image-pipeline/webgl-backend-poc.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add tests/image-pipeline/parity/fixtures.ts tests/image-pipeline/parity/cpu-webgl-parity.test.ts tests/image-pipeline/webgl-backend-poc.test.ts`
- `git commit -m "test(image-pipeline): add cpu webgl parity coverage"`

### Task 6: Expand WebGL backend to `light-adjust` and `detail-adjust`

**Files:**
- Create: `lib/image-pipeline/backend/webgl/shaders/light-adjust.frag.glsl`
- Create: `lib/image-pipeline/backend/webgl/shaders/detail-adjust.frag.glsl`
- Modify: `lib/image-pipeline/backend/webgl/webgl-backend.ts`
- Modify: `tests/image-pipeline/parity/cpu-webgl-parity.test.ts`

**Step 1: Write the failing test**

Add parity cases for:
- `light-adjust`
- `detail-adjust`
- mixed 4-step pipeline (`curves`, `color-adjust`, `light-adjust`, `detail-adjust`)

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/parity/cpu-webgl-parity.test.ts`
Expected: FAIL because new shaders are not implemented.

**Step 3: Write minimal implementation**

Implement and register light/detail shaders and uniforms in WebGL backend with same parameter normalization as CPU path.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/image-pipeline/parity/cpu-webgl-parity.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/webgl/shaders/light-adjust.frag.glsl lib/image-pipeline/backend/webgl/shaders/detail-adjust.frag.glsl lib/image-pipeline/backend/webgl/webgl-backend.ts tests/image-pipeline/parity/cpu-webgl-parity.test.ts`
- `git commit -m "feat(image-pipeline): expand webgl backend step coverage"`

### Task 7: Add WASM SIMD fallback backend scaffold (single-threaded)

**Files:**
- Create: `lib/image-pipeline/backend/wasm/wasm-backend.ts`
- Create: `lib/image-pipeline/backend/wasm/wasm-loader.ts`
- Modify: `lib/image-pipeline/backend/capabilities.ts`
- Modify: `lib/image-pipeline/backend/backend-router.ts`
- Create: `tests/image-pipeline/wasm-backend.test.ts`

**Step 1: Write the failing test**

Add tests proving:
- when WebGL is unavailable and WASM SIMD is available + enabled, router selects WASM
- WASM init failure downgrades to CPU with `runtime_error`
- no SharedArrayBuffer/thread requirement is introduced

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/image-pipeline/wasm-backend.test.ts`
Expected: FAIL because WASM backend and loader do not exist.

**Step 3: Write minimal implementation**

Implement WASM backend scaffold and loader with capability probe, then wire into router between WebGL and CPU.

**Step 4: Run tests to verify they pass**

Run: `pnpm test tests/image-pipeline/wasm-backend.test.ts tests/image-pipeline/backend-router.test.ts`
Expected: PASS

**Step 5: Commit**

Run:
- `git add lib/image-pipeline/backend/wasm/wasm-backend.ts lib/image-pipeline/backend/wasm/wasm-loader.ts lib/image-pipeline/backend/capabilities.ts lib/image-pipeline/backend/backend-router.ts tests/image-pipeline/wasm-backend.test.ts`
- `git commit -m "feat(image-pipeline): add wasm simd fallback backend scaffold"`

### Task 8: Verification, rollout guardrails, and documentation

**Files:**
- Modify: `docs/plans/2026-04-04-image-pipeline-gpu-wasm-webgl-design.md`
- Modify: `docs/plans/2026-04-04-image-pipeline-gpu-wasm-webgl.md`
- Verify only: `tests/image-pipeline/*.test.ts`, `tests/image-pipeline/parity/*.test.ts`, `tests/worker-client.test.ts`, `tests/use-pipeline-preview.test.ts`

**Step 1: Run targeted backend and parity tests**

Run: `pnpm test tests/image-pipeline/backend-router.test.ts tests/image-pipeline/backend-capabilities.test.ts tests/image-pipeline/backend-feature-flags.test.ts tests/image-pipeline/webgl-backend-poc.test.ts tests/image-pipeline/parity/cpu-webgl-parity.test.ts tests/image-pipeline/wasm-backend.test.ts`
Expected: PASS

**Step 2: Run integration tests around worker + preview hooks**

Run: `pnpm test tests/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 3: Run lint for touched pipeline files**

Run: `pnpm lint lib/image-pipeline/backend/backend-types.ts lib/image-pipeline/backend/backend-router.ts lib/image-pipeline/backend/capabilities.ts lib/image-pipeline/backend/feature-flags.ts lib/image-pipeline/backend/webgl/webgl-backend.ts lib/image-pipeline/backend/wasm/wasm-backend.ts lib/image-pipeline/backend/wasm/wasm-loader.ts lib/image-pipeline/preview-renderer.ts lib/image-pipeline/bridge.ts lib/image-pipeline/worker-client.ts tests/image-pipeline/backend-router.test.ts tests/image-pipeline/backend-capabilities.test.ts tests/image-pipeline/backend-feature-flags.test.ts tests/image-pipeline/webgl-backend-poc.test.ts tests/image-pipeline/parity/cpu-webgl-parity.test.ts tests/image-pipeline/wasm-backend.test.ts tests/worker-client.test.ts tests/use-pipeline-preview.test.ts`
Expected: PASS

**Step 4: Commit plan updates and verification notes**

Run:
- `git add docs/plans/2026-04-04-image-pipeline-gpu-wasm-webgl-design.md docs/plans/2026-04-04-image-pipeline-gpu-wasm-webgl.md`
- `git commit -m "docs(plans): finalize image pipeline gpu wasm webgl rollout plan"`

**Task 8 verification notes (2026-04-04):**

- Backend/parity tests: PASS (`6` files, `39` tests).
- Worker/preview integration tests: PASS (`2` files, `16` tests).
- Lint: FAIL on first run (`7` errors: `@next/next/no-assign-module-variable`, `@typescript-eslint/no-explicit-any`), PASS after minimal in-scope fixes.
- Rollout guardrail status: `GREEN` for backend routing, parity, integration, and lint gates after rerun.
