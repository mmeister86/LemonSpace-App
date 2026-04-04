# Render Pipeline Performance Design

## Goal

Reduce preview and render CPU cost in the canvas image pipeline so single-node edits no longer trigger repeated full-source decode work, unnecessary histogram work, or duplicated preview renders.

## Findings

- `loadSourceBitmap` bypasses the bitmap cache whenever a request is abortable, which is the common path for previews and full renders.
- Preview rendering always computes a histogram even when the caller does not display one.
- Multiple UI surfaces can request the same preview work concurrently for the same `sourceUrl`, steps, and preview width.
- Live preview updates are intentionally low-resolution already, but the system still decodes the full original image before downscaling.
- Adjustment, compare, and render preview surfaces are all fed by broad graph/context invalidation, so reducing duplicated work inside the preview pipeline gives the best short-term payoff.

## Chosen Approach

Implement a targeted hot-path optimization in four small phases:

1. Repair source image reuse by letting abortable requests share a stable fetch/decode cache instead of bypassing it.
2. Make histogram generation opt-in at the preview API boundary and disable it for compare/fullscreen preview consumers that do not render histogram UI.
3. Deduplicate identical in-flight preview requests so the worker and fallback path only compute one preview per unique pipeline fingerprint.
4. Coalesce live preview updates more aggressively during rapid slider edits so non-urgent preview refreshes do not fan out on every intermediate value.

## Expected Impact

- Repeated edits on the same source image reuse decoded bitmap work instead of re-fetching and re-decoding.
- Compare and fullscreen preview surfaces avoid an unnecessary full-buffer histogram pass.
- Multiple consumers of the same preview request share one render instead of multiplying CPU work.
- Slider interactions remain responsive while preview work collapses toward the latest state.

## Risks

- Shared source caching must not leak aborted request state into later successful requests.
- Preview dedupe keys must include every field that changes visible output to avoid stale previews.
- More aggressive preview coalescing must not break existing expectations around final rendered output or histogram-bearing adjustment previews.
