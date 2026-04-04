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
  // Contract-parity coverage in jsdom with a mocked WebGL context.
  // This suite intentionally does not attempt driver-level GPU conformance.
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
    expect(metrics.spatialRmse).toBeLessThanOrEqual(parityTolerances.curvesOnly.spatialRmse);
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
    expect(metrics.spatialRmse).toBeLessThanOrEqual(parityTolerances.colorAdjustOnly.spatialRmse);
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
    expect(metrics.spatialRmse).toBeLessThanOrEqual(
      parityTolerances.curvesPlusColorAdjust.spatialRmse,
    );
  });

  it("keeps light-adjust-only pipeline within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.lightAdjustOnly);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(parityTolerances.lightAdjustOnly.maxChannelDelta);
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.lightAdjustOnly.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(parityTolerances.lightAdjustOnly.spatialRmse);
  });

  it("keeps detail-adjust-only pipeline within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.detailAdjustOnly);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(parityTolerances.detailAdjustOnly.maxChannelDelta);
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.detailAdjustOnly.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(parityTolerances.detailAdjustOnly.spatialRmse);
  });

  it("keeps curves + color-adjust + light-adjust + detail-adjust chain within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.curvesColorLightDetailChain);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.curvesColorLightDetailChain.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.curvesColorLightDetailChain.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(parityTolerances.curvesColorLightDetailChain.spatialRmse);
  });

  it("keeps channel-specific curves pressure case within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.curvesChannelPressure);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.curvesChannelPressure.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.curvesChannelPressure.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(
      parityTolerances.curvesChannelPressure.spatialRmse,
    );
  });

  it("keeps strong color-adjust pressure case within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.colorAdjustPressure);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.colorAdjustPressure.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.colorAdjustPressure.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(
      parityTolerances.colorAdjustPressure.spatialRmse,
    );
  });

  it("keeps curves + color-adjust pressure chain within parity tolerance", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const metrics = evaluateCpuWebglParity(pipelines.curvesColorPressureChain);

    expect(metrics.maxChannelDelta).toBeLessThanOrEqual(
      parityTolerances.curvesColorPressureChain.maxChannelDelta,
    );
    expect(metrics.histogramSimilarity).toBeGreaterThanOrEqual(
      parityTolerances.curvesColorPressureChain.histogramSimilarity,
    );
    expect(metrics.spatialRmse).toBeLessThanOrEqual(
      parityTolerances.curvesColorPressureChain.spatialRmse,
    );
  });

  it("is deterministic across repeated parity evaluations", () => {
    const pipelines = createParityPipelines();
    installParityWebglContextMock();

    const first = evaluateCpuWebglParity(pipelines.curvesColorPressureChain);
    const second = evaluateCpuWebglParity(pipelines.curvesColorPressureChain);

    expect(second).toEqual(first);
  });
});
