"use node";

// convex/export.ts
//
// Server-side frame export via jimp (pure JS, no native binaries).
// Loads all image nodes within a frame, composites them onto a canvas,
// stores the result in Convex Storage, and returns a short-lived download URL.
//
// Install: pnpm add jimp

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { Jimp } from "jimp";

export const exportFrame = action({
  args: {
    frameNodeId: v.id("nodes"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // ── 1. Load the frame node ─────────────────────────────────────────────
    const frame = await ctx.runQuery(api.nodes.get, { nodeId: args.frameNodeId });
    if (!frame) throw new Error("Frame node not found");
    if (frame.type !== "frame") throw new Error("Node is not a frame");

    const frameData = frame.data as {
      label?: string;
      width?: number;
      height?: number;
    };

    const exportWidth = frameData.width ?? frame.width ?? 1920;
    const exportHeight = frameData.height ?? frame.height ?? 1080;
    const frameX = frame.positionX;
    const frameY = frame.positionY;

    // ── 2. Load all nodes in this canvas ───────────────────────────────────
    const allNodes = await ctx.runQuery(api.nodes.list, {
      canvasId: frame.canvasId,
    });

    // Find image/ai-image nodes visually within the frame
    const imageNodes = allNodes.filter((node) => {
      if (node.type !== "image" && node.type !== "ai-image") return false;
      const data = node.data as { storageId?: string };
      if (!data.storageId) return false;

      const nodeRight = node.positionX + node.width;
      const nodeBottom = node.positionY + node.height;
      const frameRight = frameX + exportWidth;
      const frameBottom = frameY + exportHeight;

      return (
        node.positionX < frameRight &&
        nodeRight > frameX &&
        node.positionY < frameBottom &&
        nodeBottom > frameY
      );
    });

    if (imageNodes.length === 0) {
      throw new Error("No images found within this frame");
    }

    // ── 3. Create base canvas ──────────────────────────────────────────────
    const base = new Jimp({
      width: exportWidth,
      height: exportHeight,
      color: 0xffffffff, // white background
    });

    // ── 4. Fetch, resize and composite each image ──────────────────────────
    for (const node of imageNodes) {
      const data = node.data as { storageId: string };
      const url = await ctx.storage.getUrl(data.storageId as Id<"_storage">);
      if (!url) continue;

      const response = await fetch(url);
      if (!response.ok) continue;

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const relX = Math.max(0, Math.round(node.positionX - frameX));
      const relY = Math.max(0, Math.round(node.positionY - frameY));
      const nodeW = Math.round(node.width);
      const nodeH = Math.round(node.height);

      const img = await Jimp.fromBuffer(buffer);
      img.resize({ w: nodeW, h: nodeH });
      base.composite(img, relX, relY);
    }

    // ── 5. Encode to PNG buffer ────────────────────────────────────────────
    const outputBuffer = await base.getBuffer("image/png");

    // ── 6. Store in Convex Storage ─────────────────────────────────────────
    const blob = new Blob([new Uint8Array(outputBuffer)], { type: "image/png" });
    const storageId = await ctx.storage.store(blob);

    const downloadUrl = await ctx.storage.getUrl(storageId);
    if (!downloadUrl) throw new Error("Failed to generate download URL");

    return {
      url: downloadUrl,
      storageId,
      filename: `${frameData.label ?? "frame"}-export.png`,
    };
  },
});
