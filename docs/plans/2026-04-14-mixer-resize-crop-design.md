# Mixer Resize/Crop Design

**Goal:** Make mixer overlay resize behave like proportional image scaling, and make crop behave like classic edge-based trimming without changing displayed image size.

## Approved Interaction Model

- `Resize` changes the displayed overlay size only.
- `Resize` keeps aspect ratio locked.
- `Crop` changes only the visible source region.
- `Crop` does not change the displayed overlay frame size.
- `Crop` uses 8 handles: 4 corners and 4 side-midpoints.
- Dragging inside the crop box repositions the crop region.

## Conceptual Split

### 1. Display Frame

Controls where and how large the overlay appears in the mixer.

- `overlayX`
- `overlayY`
- `overlayWidth`
- `overlayHeight`

These fields represent the displayed overlay frame in mixer preview/output space.

### 2. Source Crop Region

Controls which part of the source image is shown inside that frame.

Recommended crop contract:

- `cropLeft`
- `cropTop`
- `cropRight`
- `cropBottom`

All values are normalized source-image trims from the corresponding edge.

Why this model:

- Left handle changes only `cropLeft`
- Top handle changes only `cropTop`
- Corner handles combine two crop edges
- The mental model exactly matches "take content away from edges"

## Rendering Semantics

Preview, compare, and bake must all use the same mapping:

1. Resolve source image.
2. Apply crop trims to derive the sampled source rect.
3. Draw that sampled rect into the displayed overlay frame.

This removes the ambiguous zoom-like behavior from crop mode.

## UX Rules

### Resize Mode

- Handles are anchored to the display frame.
- Corner drag scales proportionally.
- Side handles are either hidden or mapped to proportional scaling from the nearest axis while preserving aspect ratio.
- Resize never mutates crop fields.

### Crop Mode

- Handles are anchored to the crop box.
- Edge handles trim one side.
- Corner handles trim two sides.
- Drag inside crop box repositions the crop window.
- Crop never mutates display frame size.

## Constraints

- Minimum display size must keep handles usable.
- Minimum crop region must prevent inverted or zero-area crop boxes.
- Crop box stays within source bounds.
- Display frame stays within mixer preview bounds.

## Backward Compatibility

- Existing mixer nodes with `contentX/Y/Width/Height` need a migration/default path.
- If a direct field migration is too risky, normalization can temporarily map legacy content fields into equivalent crop trims.

## Non-Goals

- rotation
- masks
- free distortion
- multi-layer cropping
- standalone crop modal
