// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toCanvas: vi.fn(),
}));

vi.mock("html-to-image", () => ({
  toCanvas: mocks.toCanvas,
}));

import { exportFrameAsJpeg } from "@/components/canvas/frame-jpeg-export";

describe("exportFrameAsJpeg", () => {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const click = vi.fn();
  const createObjectURL = vi.fn(() => "blob:frame-export");
  const revokeObjectURL = vi.fn();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.toCanvas.mockReset();
    drawImage.mockClear();
    fillRect.mockClear();
    click.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    requestAnimationFrame.mockClear();
    document.body.innerHTML = "";

    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function handleClick(this: HTMLAnchorElement) {
      click(this.download);
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      fillRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(callback, type) {
      callback(new Blob(["jpeg"], { type: type ?? "image/jpeg" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fits the frame, crops the captured flow root, downloads a JPEG, and restores the viewport", async () => {
    const flowRoot = document.createElement("div");
    flowRoot.className = "react-flow";
    flowRoot.style.backgroundColor = "rgb(18, 18, 18)";
    Object.defineProperty(flowRoot, "getBoundingClientRect", {
      value: () => ({
        left: 100,
        top: 50,
        width: 600,
        height: 400,
        right: 700,
        bottom: 450,
        x: 100,
        y: 50,
        toJSON: () => undefined,
      }),
    });

    const frameElement = document.createElement("div");
    frameElement.className = "react-flow__node";
    frameElement.dataset.id = "frame-1";
    Object.defineProperty(frameElement, "getBoundingClientRect", {
      value: () => ({
        left: 160,
        top: 90,
        width: 300,
        height: 200,
        right: 460,
        bottom: 290,
        x: 160,
        y: 90,
        toJSON: () => undefined,
      }),
    });

    flowRoot.appendChild(frameElement);
    const edgesSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const edgePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const originalStyle = "stroke: rgb(1, 2, 3); filter: drop-shadow(0 0 2px red);";
    edgesSvg.classList.add("react-flow__edges");
    edgePath.classList.add("react-flow__edge-path");
    edgePath.setAttribute("style", originalStyle);
    edgesSvg.appendChild(edgePath);
    flowRoot.appendChild(edgesSvg);
    document.body.appendChild(flowRoot);

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1200;
    sourceCanvas.height = 800;
    mocks.toCanvas.mockImplementation(async () => {
      expect(edgePath.getAttribute("stroke")).toBe("rgba(216, 205, 255, 0.95)");
      expect(edgePath.getAttribute("stroke-width")).toBe("2.75");
      expect(edgePath.getAttribute("filter")).toBe("url(#frame-export-edge-glow-0)");
      expect(edgesSvg.querySelector("filter#frame-export-edge-glow-0")).not.toBeNull();
      return sourceCanvas;
    });

    const previousViewport = { x: 12, y: 24, zoom: 1.5 };
    const getViewport = vi.fn(() => previousViewport);
    const fitBounds = vi.fn(async () => true);
    const setViewport = vi.fn(async () => true);

    await exportFrameAsJpeg({
      frameId: "frame-1",
      frameLabel: "Hero Frame",
      frameBounds: { x: 10, y: 20, width: 300, height: 200 },
      getViewport,
      fitBounds,
      setViewport,
    });

    expect(fitBounds).toHaveBeenCalledWith(
      { x: 10, y: 20, width: 300, height: 200 },
      { padding: 0, duration: 0 },
    );
    expect(mocks.toCanvas).toHaveBeenCalledWith(
      flowRoot,
      expect.objectContaining({
        backgroundColor: "rgb(18, 18, 18)",
        cacheBust: true,
        pixelRatio: expect.any(Number),
        skipFonts: true,
      }),
    );
    const toCanvasOptions = mocks.toCanvas.mock.calls[0]?.[1];
    const background = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    background.classList.add("react-flow__background");
    expect(toCanvasOptions?.filter?.(background)).toBe(true);
    expect(edgePath.getAttribute("style")).toBe(originalStyle);
    expect(edgePath.getAttribute("stroke")).toBeNull();
    expect(edgePath.getAttribute("filter")).toBeNull();
    expect(edgesSvg.querySelector("filter#frame-export-edge-glow-0")).toBeNull();
    expect(fillRect).toHaveBeenCalledWith(0, 0, 600, 400);
    expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 120, 80, 600, 400, 0, 0, 600, 400);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledWith("Hero Frame.jpeg");
    expect(setViewport).toHaveBeenCalledWith(previousViewport, { duration: 0 });

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:frame-export");
  });
});
