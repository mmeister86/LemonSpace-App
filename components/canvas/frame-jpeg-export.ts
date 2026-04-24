import { toCanvas } from "html-to-image";
import type { FitBounds, SetViewport, Viewport } from "@xyflow/react";

const JPEG_QUALITY = 0.92;
const MAX_PIXEL_RATIO = 2;
const FALLBACK_BACKGROUND_COLOR = "#ffffff";
const DARK_EDGE_EXPORT_STROKE = "rgba(216, 205, 255, 0.95)";
const LIGHT_EDGE_EXPORT_STROKE = "rgba(44, 62, 80, 0.72)";
const DARK_EDGE_EXPORT_GLOW = "rgb(139, 92, 246)";
const LIGHT_EDGE_EXPORT_GLOW = "rgb(99, 102, 241)";

type FrameJpegExportArgs = {
  frameId: string;
  frameLabel?: string;
  frameBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  getViewport: () => Viewport;
  setViewport: SetViewport;
  fitBounds: FitBounds;
};

function waitForNextPaints(count = 2): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      globalThis.setTimeout(resolve, 0);
      return;
    }

    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  });
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function findFrameElement(frameId: string): HTMLElement {
  const escapedId = cssEscape(frameId);
  const frameElement = document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${escapedId}"]`,
  );

  if (!frameElement) {
    throw new Error("Frame element not found");
  }

  return frameElement;
}

function shouldIncludeExportNode(node: HTMLElement | SVGElement): boolean {
  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    return true;
  }

  return !node.matches(
    [
      "[data-frame-export-ignore='true']",
      "[data-no-frame-export='true']",
      ".react-flow__controls",
      ".react-flow__minimap",
      ".react-flow__panel",
      ".react-flow__attribution",
      ".react-flow__resize-control",
      ".react-flow__handle",
      ".react-flow__edgeupdater",
      ".react-flow__selection",
      ".react-flow__nodesselection-rect",
    ].join(","),
  );
}

function resolveExportBackgroundColor(element: HTMLElement): string {
  const backgroundColor = window.getComputedStyle(element).backgroundColor;
  if (
    backgroundColor &&
    backgroundColor !== "transparent" &&
    backgroundColor !== "rgba(0, 0, 0, 0)"
  ) {
    return backgroundColor;
  }

  return FALLBACK_BACKGROUND_COLOR;
}

function isDarkBackground(color: string): boolean {
  const match = color.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!match) {
    return false;
  }

  const [, r, g, b] = match;
  const luminance =
    0.2126 * Number(r) +
    0.7152 * Number(g) +
    0.0722 * Number(b);

  return luminance < 128;
}

function prepareEdgeExportStyles(flowRoot: HTMLElement, backgroundColor: string): () => void {
  const isDark = isDarkBackground(backgroundColor);
  const stroke = isDark ? DARK_EDGE_EXPORT_STROKE : LIGHT_EDGE_EXPORT_STROKE;
  const glow = isDark ? DARK_EDGE_EXPORT_GLOW : LIGHT_EDGE_EXPORT_GLOW;

  const edgePaths = Array.from(
    flowRoot.querySelectorAll<SVGPathElement>(".react-flow__edge-path"),
  );
  const edgeSvgs = Array.from(new Set(
    edgePaths
      .map((path) => path.ownerSVGElement)
      .filter((svg): svg is SVGSVGElement => Boolean(svg)),
  ));
  const filterRecords = edgeSvgs.map((svg, index) =>
    createEdgeGlowFilter(svg, glow, `frame-export-edge-glow-${index}`),
  );

  const previousPaths = edgePaths.map((path) => ({
    path,
    stroke: path.getAttribute("stroke"),
    strokeWidth: path.getAttribute("stroke-width"),
    strokeOpacity: path.getAttribute("stroke-opacity"),
    fill: path.getAttribute("fill"),
    filter: path.getAttribute("filter"),
    style: path.getAttribute("style"),
  }));
  const previousSvgs = edgeSvgs.map((svg) => ({
    svg,
    overflow: svg.style.overflow,
  }));

  for (const svg of edgeSvgs) {
    svg.style.overflow = "visible";
  }

  for (const path of edgePaths) {
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", "2.75");
    path.setAttribute("stroke-opacity", "1");
    path.setAttribute("fill", "none");
    const filterId = filterRecords.find(({ svg }) => svg === path.ownerSVGElement)?.id;
    if (filterId) {
      path.setAttribute("filter", `url(#${filterId})`);
    }
    path.style.stroke = stroke;
    path.style.strokeWidth = "2.75px";
    path.style.strokeOpacity = "1";
    path.style.fill = "none";
    path.style.filter = "";
  }

  return () => {
    for (const previous of previousPaths) {
      const {
        path,
        stroke: previousStroke,
        strokeWidth,
        strokeOpacity,
        fill,
        filter,
        style,
      } = previous;

      if (previousStroke === null) path.removeAttribute("stroke");
      else path.setAttribute("stroke", previousStroke);

      if (strokeWidth === null) path.removeAttribute("stroke-width");
      else path.setAttribute("stroke-width", strokeWidth);

      if (strokeOpacity === null) path.removeAttribute("stroke-opacity");
      else path.setAttribute("stroke-opacity", strokeOpacity);

      if (fill === null) path.removeAttribute("fill");
      else path.setAttribute("fill", fill);

      if (filter === null) path.removeAttribute("filter");
      else path.setAttribute("filter", filter);

      if (style === null) path.removeAttribute("style");
      else path.setAttribute("style", style);
    }

    for (const { svg, overflow } of previousSvgs) {
      svg.style.overflow = overflow;
    }

    for (const { element } of filterRecords) {
      element.remove();
    }
  };
}

function createEdgeGlowFilter(
  svg: SVGSVGElement,
  color: string,
  id: string,
): { svg: SVGSVGElement; id: string; element: SVGFilterElement } {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const defs =
    svg.querySelector("defs") ??
    svg.insertBefore(document.createElementNS(svgNamespace, "defs"), svg.firstChild);
  const filter = document.createElementNS(svgNamespace, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-60%");
  filter.setAttribute("y", "-60%");
  filter.setAttribute("width", "220%");
  filter.setAttribute("height", "220%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const outerGlow = document.createElementNS(svgNamespace, "feDropShadow");
  outerGlow.setAttribute("dx", "0");
  outerGlow.setAttribute("dy", "0");
  outerGlow.setAttribute("stdDeviation", "6");
  outerGlow.setAttribute("flood-color", color);
  outerGlow.setAttribute("flood-opacity", "0.5");

  const innerGlow = document.createElementNS(svgNamespace, "feDropShadow");
  innerGlow.setAttribute("dx", "0");
  innerGlow.setAttribute("dy", "0");
  innerGlow.setAttribute("stdDeviation", "2.4");
  innerGlow.setAttribute("flood-color", color);
  innerGlow.setAttribute("flood-opacity", "0.85");

  filter.append(outerGlow, innerGlow);
  defs.appendChild(filter);

  return { svg, id, element: filter };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Frame export failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toSafeExportFilename(label?: string): string {
  const base = label?.trim() || "frame";
  const safe = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${safe || "frame"}.jpeg`;
}

export async function exportFrameAsJpeg({
  frameId,
  frameLabel,
  frameBounds,
  getViewport,
  setViewport,
  fitBounds,
}: FrameJpegExportArgs): Promise<void> {
  const previousViewport = getViewport();

  await fitBounds(frameBounds, { padding: 0, duration: 0 });
  await waitForNextPaints();

  const frameElement = findFrameElement(frameId);
  const flowRoot = frameElement.closest<HTMLElement>(".react-flow");
  if (!flowRoot) {
    throw new Error("Canvas element not found");
  }

  const frameRect = frameElement.getBoundingClientRect();
  const rootRect = flowRoot.getBoundingClientRect();
  if (frameRect.width <= 0 || frameRect.height <= 0 || rootRect.width <= 0 || rootRect.height <= 0) {
    throw new Error("Frame has no exportable size");
  }

  flowRoot.classList.add("canvas-frame-exporting");
  let restoreEdgeExportStyles: (() => void) | undefined;

  try {
    const backgroundColor = resolveExportBackgroundColor(flowRoot);
    restoreEdgeExportStyles = prepareEdgeExportStyles(flowRoot, backgroundColor);
    const pixelRatio = Math.max(
      1,
      Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    );
    const sourceCanvas = await toCanvas(flowRoot, {
      backgroundColor,
      cacheBust: true,
      pixelRatio,
      skipFonts: true,
      filter: shouldIncludeExportNode,
    });

    const scaleX = sourceCanvas.width / rootRect.width;
    const scaleY = sourceCanvas.height / rootRect.height;
    const cropX = Math.max(0, Math.round((frameRect.left - rootRect.left) * scaleX));
    const cropY = Math.max(0, Math.round((frameRect.top - rootRect.top) * scaleY));
    const cropWidth = Math.max(1, Math.min(sourceCanvas.width - cropX, Math.round(frameRect.width * scaleX)));
    const cropHeight = Math.max(1, Math.min(sourceCanvas.height - cropY, Math.round(frameRect.height * scaleY)));

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = cropWidth;
    outputCanvas.height = cropHeight;

    const context = outputCanvas.getContext("2d");
    if (!context) {
      throw new Error("Frame export canvas unavailable");
    }

    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, cropWidth, cropHeight);
    context.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );

    const blob = await canvasToBlob(outputCanvas);
    downloadBlob(blob, toSafeExportFilename(frameLabel));
  } finally {
    restoreEdgeExportStyles?.();
    flowRoot.classList.remove("canvas-frame-exporting");
    await setViewport(previousViewport, { duration: 0 });
  }
}
