/**
 * Onboarding note:
 * Image pipeline utility for histogram. Keep CPU/WebGL/worker behavior deterministic so preview and render tests can assert parity.
 */

export type HistogramData = {
  rgb: number[];
  red: number[];
  green: number[];
  blue: number[];
  max: number;
};

export function emptyHistogram(): HistogramData {
  return {
    rgb: Array.from({ length: 256 }, () => 0),
    red: Array.from({ length: 256 }, () => 0),
    green: Array.from({ length: 256 }, () => 0),
    blue: Array.from({ length: 256 }, () => 0),
    max: 0,
  };
}

export function computeHistogram(data: Uint8ClampedArray): HistogramData {
  const histogram = emptyHistogram();

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luminance = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);

    histogram.red[red] += 1;
    histogram.green[green] += 1;
    histogram.blue[blue] += 1;
    histogram.rgb[luminance] += 1;
  }

  histogram.max = Math.max(
    ...histogram.rgb,
    ...histogram.red,
    ...histogram.green,
    ...histogram.blue,
  );

  return histogram;
}
