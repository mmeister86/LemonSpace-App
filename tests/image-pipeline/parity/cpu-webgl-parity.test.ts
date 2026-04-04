// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  createParityPipelines,
  evaluateCpuWebglParity,
  installParityWebglContextMock,
  parityTolerances,
  restoreParityWebglContextMock,
} from "@/tests/image-pipeline/parity/fixtures";

describe("cpu vs webgl parity", () => {
  afterEach(() => {
    restoreParityWebglContextMock();
  });

  it("keeps curves-only pipeline within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.curvesOnly);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(parityTolerances.curvesOnly.maxChannelDelta);
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.curvesOnly.histogramSimilarity,
    );
  });

  it("keeps color-adjust-only pipeline within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.colorAdjustOnly);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.colorAdjustOnly.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.colorAdjustOnly.histogramSimilarity,
    );
  });

  it("keeps curves + color-adjust chain within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.curvesPlusColorAdjust);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.curvesPlusColorAdjust.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.curvesPlusColorAdjust.histogramSimilarity,
    );
  });
});
