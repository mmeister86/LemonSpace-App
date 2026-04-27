import { describe, expect, it } from "vitest";

import {
  buildChangeCameraPayload,
  buildUpscalePayload,
  resolveImageSourceNode,
  resolveStyleTransferInputNodes,
  resolveTransformOutputDimensions,
} from "@/convex/image_transforms";

describe("image transform orchestration", () => {
  it("maps LemonSpace upscale controls to Freepik Precision V2 field names", () => {
    expect(
      buildUpscalePayload({
        imageUrl: "https://images.example.com/source.jpg",
        scale: 4,
        outputFormat: "png",
        flavor: "photo",
        sharpen: 7,
        grain: 11,
        ultraDetail: 30,
      }),
    ).toEqual({
      image: "https://images.example.com/source.jpg",
      scale_factor: 4,
      flavor: "photo",
      sharpen: 7,
      smart_grain: 11,
      ultra_detail: 30,
    });
  });

  it("maps LemonSpace change camera controls to Freepik field names", () => {
    expect(
      buildChangeCameraPayload({
        imageUrl: "https://images.example.com/source.jpg",
        horizontalAngle: 45,
        verticalAngle: 15,
        zoom: 7,
        outputFormat: "jpeg",
        seed: 42,
      }),
    ).toEqual({
      image: "https://images.example.com/source.jpg",
      horizontal_angle: 45,
      vertical_angle: 15,
      zoom: 7,
      output_format: "jpeg",
      seed: 42,
    });
  });

  it("keeps change camera output dimensions equal to the source image", () => {
    expect(
      resolveTransformOutputDimensions({
        operation: {
          type: "change-camera",
          horizontalAngle: 90,
          verticalAngle: 0,
          zoom: 5,
          outputFormat: "png",
        },
        sourceWidth: 1200,
        sourceHeight: 800,
      }),
    ).toEqual({ width: 1200, height: 800 });
  });

  it("keeps upscale output dimensions proportional to the source image", () => {
    expect(
      resolveTransformOutputDimensions({
        operation: {
          type: "upscale",
          scale: 4,
          outputFormat: "png",
          flavor: "photo",
          sharpen: 7,
          grain: 7,
          ultraDetail: 30,
        },
        sourceWidth: 1200,
        sourceHeight: 800,
      }),
    ).toEqual({ width: 4800, height: 3200 });
  });

  it("preserves source dimensions for non-upscale transforms", () => {
    expect(
      resolveTransformOutputDimensions({
        operation: { type: "bg-remove" },
        sourceWidth: 1200,
        sourceHeight: 800,
      }),
    ).toEqual({ width: 1200, height: 800 });
  });

  it("resolves style transfer image and reference inputs by handles", async () => {
    const nodes = [
      { _id: "source-node", type: "image", data: {}, canvasId: "canvas-1" },
      { _id: "reference-node", type: "asset", data: {}, canvasId: "canvas-1" },
      { _id: "style-node", type: "style-transfer", data: {}, canvasId: "canvas-1" },
    ] as never;
    const edges = [
      {
        _id: "edge-source",
        sourceNodeId: "source-node",
        targetNodeId: "style-node",
        targetHandle: "image",
      },
      {
        _id: "edge-reference",
        sourceNodeId: "reference-node",
        targetNodeId: "style-node",
        targetHandle: "reference",
      },
    ] as never;

    await expect(
      resolveStyleTransferInputNodes({
        nodes,
        edges,
        transformNodeId: "style-node" as never,
      }),
    ).resolves.toEqual({
      sourceNode: nodes[0],
      referenceNode: nodes[1],
    });
  });

  it("resolves local crop and adjustment chains back to their image source", async () => {
    const nodes = [
      { _id: "source-node", type: "image", data: {}, canvasId: "canvas-1" },
      { _id: "crop-node", type: "crop", data: {}, canvasId: "canvas-1" },
      { _id: "curves-node", type: "curves", data: {}, canvasId: "canvas-1" },
      { _id: "camera-node", type: "change-camera", data: {}, canvasId: "canvas-1" },
    ] as never;
    const edges = [
      {
        _id: "edge-source-crop",
        sourceNodeId: "source-node",
        targetNodeId: "crop-node",
      },
      {
        _id: "edge-crop-curves",
        sourceNodeId: "crop-node",
        targetNodeId: "curves-node",
      },
      {
        _id: "edge-curves-camera",
        sourceNodeId: "curves-node",
        targetNodeId: "camera-node",
      },
    ] as never;

    await expect(
      resolveImageSourceNode({
        nodes,
        edges,
        transformNodeId: "camera-node" as never,
      }),
    ).resolves.toBe(nodes[0]);
  });
});
