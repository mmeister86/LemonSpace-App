/**
 * Onboarding note:
 * Image pipeline utility for histogram plot. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

import type { HistogramData } from "@/lib/image-pipeline/histogram";

type HistogramChannels = Pick<HistogramData, "red" | "green" | "blue" | "rgb">;

type HistogramPlotOptions = {
  points?: number;
  width: number;
  height: number;
};

export type HistogramPlot = {
  series: {
    red: number[];
    green: number[];
    blue: number[];
    rgb: number[];
    max: number;
  };
  polylines: {
    red: string;
    green: string;
    blue: string;
    rgb: string;
  };
};

function compactHistogram(values: readonly number[], points: number): number[] {
  if (points <= 0) {
    return [];
  }

  if (values.length === 0) {
    return Array.from({ length: points }, () => 0);
  }

  const bucket = values.length / points;
  const compacted: number[] = [];
  for (let pointIndex = 0; pointIndex < points; pointIndex += 1) {
    let sum = 0;
    const start = Math.floor(pointIndex * bucket);
    const end = Math.min(values.length, Math.floor((pointIndex + 1) * bucket) || start + 1);
    for (let index = start; index < end; index += 1) {
      sum += values[index] ?? 0;
    }
    compacted.push(sum);
  }
  return compacted;
}

function histogramPolyline(
  values: readonly number[],
  maxValue: number,
  width: number,
  height: number,
): string {
  if (values.length === 0) {
    return "";
  }

  const divisor = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = (index / divisor) * width;
      const normalized = maxValue > 0 ? value / maxValue : 0;
      const y = height - normalized * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function buildHistogramPlot(
  histogram: HistogramChannels,
  options: HistogramPlotOptions,
): HistogramPlot {
  const points = options.points ?? 64;
  const red = compactHistogram(histogram.red, points);
  const green = compactHistogram(histogram.green, points);
  const blue = compactHistogram(histogram.blue, points);
  const rgb = compactHistogram(histogram.rgb, points);
  const max = Math.max(1, ...red, ...green, ...blue, ...rgb);

  return {
    series: {
      red,
      green,
      blue,
      rgb,
      max,
    },
    polylines: {
      red: histogramPolyline(red, max, options.width, options.height),
      green: histogramPolyline(green, max, options.width, options.height),
      blue: histogramPolyline(blue, max, options.width, options.height),
      rgb: histogramPolyline(rgb, max, options.width, options.height),
    },
  };
}
