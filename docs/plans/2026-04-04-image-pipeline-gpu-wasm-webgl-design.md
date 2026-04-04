# Image Pipeline GPU/WASM/WebGL Design

## Goal

Migrate the current CPU pixel-loop image pipeline to an incremental hybrid backend (WebGL first, optional WASM kernels, guarded WebGPU experiments) without breaking the existing worker fallback and cancellation semantics.

## Current Branch Context

- This branch already reduced duplicate preview work (shared in-flight preview requests, preview coalescing, opt-in histogram behavior).
- `lib/image-pipeline/worker-client.ts` is already the stable orchestration seam for worker-first execution with main-thread fallback.
- `lib/image-pipeline/preview-renderer.ts` and `lib/image-pipeline/bridge.ts` currently depend on CPU `ImageData` mutation, so backend switching must preserve existing return contracts (`ImageData` for preview, encoded `Blob` for full render).

## Codebase Mapping Findings

### `lib/image-pipeline/render-core.ts`

- Contains all effect kernels as CPU loops over `Uint8ClampedArray` (`curves`, `color-adjust`, `light-adjust`, `detail-adjust`).
- `applyPipelineStep` is a strong integration seam: per-step dispatch already exists and can route by backend capability.
- Abort checks are periodic and lightweight; migration must preserve `AbortError` behavior.

### `lib/image-pipeline/preview-renderer.ts`

- Flow today: decode source bitmap -> draw 2D canvas -> `getImageData` -> apply step loops -> optional histogram.
- This file owns preview sizing and output shape; it should remain the public API while delegating kernel execution to a backend adapter.
- The yield loop (`requestAnimationFrame`/`setTimeout`) is CPU-friendly but should become backend-aware (GPU path should avoid unnecessary per-step yielding).

### `lib/image-pipeline/worker-client.ts`

- Central execution coordinator with worker transport, request dedupe, cancel fan-out, and main-thread fallback.
- Best place to inject backend telemetry and backend selection hints (for rollout and safety).
- Existing fallback logic (worker unavailable -> main thread) maps directly to backend fallback ladder and kill-switch controls.

## Architecture Choice

Adopt a **Backend Adapter + Capability Router** architecture:

1. Keep existing preview/full public APIs and message formats stable.
2. Introduce an internal backend interface for step execution and pixel transport.
3. Select backend at runtime by capability + feature flag + step support matrix.
4. Preserve CPU backend as correctness source and terminal fallback.

### Integration Seam

- New seam: `executePipelineSteps()` in a backend-router module called by both `preview-renderer.ts` and `bridge.ts`.
- `render-core.ts` becomes the CPU backend implementation instead of the global default path.
- Worker protocol receives optional diagnostics metadata (selected backend, fallback reason), not required for correctness.

### Fallback Ladder (authoritative order)

1. **WebGL2 worker backend** (preferred for preview/full when supported and flag-enabled)
2. **WASM SIMD kernel backend** (for unsupported GPU steps or devices with poor GPU availability)
3. **CPU worker backend** (`render-core.ts` current path)
4. **CPU main-thread fallback** (existing `worker-client.ts` behavior)

Each downgrade records a structured reason (`unsupported_api`, `shader_compile_failed`, `capability_mismatch`, `flag_disabled`, `runtime_error`) so rollout decisions are data-driven.

## Context7 Guidance Buckets

### Safe now

- **WebGL2 shader pipeline** for color/curve/light/detail kernels with runtime feature detection.
- **OffscreenCanvas in worker** where available, with same-origin + secure-context guardrails.
- **WASM SIMD (single-threaded)** behind feature detection (`WebAssembly.validate` on SIMD module or runtime probe).
- **Worker-first execution with transferable buffers** (already used in worker client).

### Experimental

- **WebGPU compute path** (`navigator.gpu` / `WorkerNavigator.gpu`): gate behind an explicit experiment flag and per-browser allowlist.
- **Step fusion and mixed GPU+WASM scheduling**: only after baseline correctness/perf metrics are stable.
- **Advanced WebGL packing optimizations** (multi-pass fusion, half-float intermediates) after parity suite exists.

### Not now

- **WASM threads + SharedArrayBuffer requirement**: requires cross-origin isolation (COOP/COEP) and can impact app embedding/3rd-party integrations.
- **WebGPU-first default backend**: browser/feature variability still too high for this repository's reliability target.
- **Full rewrite of decode/encode stack around custom codecs**: exceeds scope; current `drawImage` + canvas/blob path remains.

## Phased Rollout

### Phase 0: Foundation + Instrumentation (no behavior change)

- Add backend router with CPU-only implementation.
- Add telemetry points for preview/full latency, fallback reason, and error class.
- Add golden-image parity harness for all 4 current step types.

### Phase 1: WebGL PoC (preview only)

- Implement WebGL2 backend for `curves` and `color-adjust` first.
- Enable by dev flag on preview pipeline only.
- Validate output parity against CPU baseline under tolerance thresholds.

### Phase 2: WebGL expansion + guarded production rollout

- Add `light-adjust` and `detail-adjust` kernels.
- Enable progressive rollout (1% -> 10% -> 25% -> 50% -> 100%) with kill switch.
- Keep full render on CPU backend until preview parity and crash rate are stable.

### Phase 3: WASM SIMD fallback kernels

- Add WASM SIMD implementation for hot CPU kernels as middle rung between WebGL and CPU.
- Use when WebGL unavailable or disabled, still inside worker.

### Phase 4: Full-render backend adoption

- Route full render through same backend router.
- Keep output encode path unchanged.
- Roll out in smaller increments than preview due to export-critical path.

### Phase 5: WebGPU experiment track

- Optional experiment branch with strict allowlist and observability.
- No default enablement in this plan.

## Risk Controls

- Feature flags:
  - `imagePipeline.backend.webgl.enabled`
  - `imagePipeline.backend.wasm.enabled`
  - `imagePipeline.backend.webgpu.experiment`
  - `imagePipeline.backend.forceCpu`
- Auto-disable circuit breaker when fallback/error thresholds exceed SLO windows.
- Golden-image regression suite enforced in CI before any rollout increase.
- Keep worker protocol backward compatible until migration fully lands.

## Metrics and Success Criteria

- Preview latency (`p50`, `p95`) for representative step stacks and image sizes.
- Full render latency (`p50`, `p95`) for default export sizes.
- Main-thread long task count during rapid slider edits.
- Backend selection distribution (% webgl/wasm/cpu/main-thread).
- Fallback and runtime error rate per backend.
- Pixel parity drift (max absolute channel delta and histogram similarity).

Success target for initial migration:

- >=30% preview `p95` improvement on supported devices.
- No increase in user-visible render failures.
- <=1% forced downgrade due to runtime backend errors after rollout stabilization.

## Out of Scope

- New visual adjustment features.
- Server-side/offline rendering architecture changes.
- COOP/COEP rollout for SAB-threaded WASM.
