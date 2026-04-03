# Canvas Convex Load Shedding Design

## Goal

Reduce Convex query fanout and hot-path load on the canvas page so node placement and canvas interaction no longer collapse when the local Convex runtime is under pressure.

## Findings

- `nodes:create` itself is fast when the runtime is healthy.
- The canvas page issues multiple concurrent reactive queries: `nodes:list`, `edges:list`, `canvases:get`, `credits:getBalance`, `credits:getSubscription`, `storage:batchGetUrlsForCanvas`, and several `presets:list` variants.
- During failure windows, many unrelated queries time out together, which points to runtime saturation rather than a single broken query.

## Chosen Approach

Use a broad load-shedding refactor on the canvas hot path:

1. Remove debug-only and non-essential queries from the core canvas render path.
2. Eliminate the server-side batch storage URL query by deriving stable fallback URLs client-side from `storageId`.
3. Collapse multiple adjustment preset queries into one shared presets query and distribute the data through React context.
4. Drop the subscription-tier query from the canvas toolbar and keep the toolbar credit widget on the cheaper balance path only.

## Expected Impact

- Fewer unique Convex subscriptions on the canvas page.
- Less full-canvas invalidation work after every node or edge mutation.
- Lower pressure on `auth:safeGetAuthUser` because fewer canvas-adjacent queries depend on it.
- Better resilience when Convex dev runtime is temporarily slow.

## Risks

- Client-side fallback storage URLs must continue to work with the current Convex deployment setup.
- The toolbar will no longer show the subscription tier on the canvas page.
- Shared preset context must preserve current node behavior and save/remove flows.
