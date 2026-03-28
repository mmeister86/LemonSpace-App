"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

/** Canonical API base (legacy /videos/ ohne /v1/ ist deprecated laut Pexels-Doku). */
const PEXELS_VIDEO_API = "https://api.pexels.com/v1/videos";

interface PexelsVideoFile {
  id: number;
  quality: "hd" | "sd" | "uhd" | "hls";
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: { id: number; name: string; url: string };
  video_files: PexelsVideoFile[];
}

function pickPlayableVideoFile(files: PexelsVideoFile[]): PexelsVideoFile {
  const playable = files.filter((f) => {
    if (f.quality === "hls") return false;
    const url = f.link.toLowerCase();
    if (url.includes(".m3u8")) return false;
    return url.includes(".mp4");
  });
  if (playable.length === 0) {
    throw new Error("No progressive MP4 in Pexels video_files");
  }
  return (
    playable.find((f) => f.quality === "hd") ??
    playable.find((f) => f.quality === "uhd") ??
    playable.find((f) => f.quality === "sd") ??
    playable[0]
  );
}

/** Frische MP4-URL (Signing kann ablaufen) — gleiche Auswahl wie beim ersten Pick. */
export const getVideoByPexelsId = action({
  args: { pexelsId: v.number() },
  handler: async (_ctx, { pexelsId }) => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      throw new Error("PEXELS_API_KEY not set");
    }

    const res = await fetch(`${PEXELS_VIDEO_API}/${pexelsId}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
    }

    const video = (await res.json()) as PexelsVideo;
    const file = pickPlayableVideoFile(video.video_files);
    return {
      mp4Url: file.link,
      width: video.width,
      height: video.height,
      duration: video.duration,
    };
  },
});

export const searchVideos = action({
  args: {
    query: v.string(),
    orientation: v.optional(
      v.union(
        v.literal("landscape"),
        v.literal("portrait"),
        v.literal("square"),
      ),
    ),
    minDuration: v.optional(v.number()),
    maxDuration: v.optional(v.number()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      throw new Error("PEXELS_API_KEY not set");
    }

    const params = new URLSearchParams({
      query: args.query,
      per_page: String(args.perPage ?? 20),
      page: String(args.page ?? 1),
      ...(args.orientation && { orientation: args.orientation }),
      ...(args.minDuration != null && {
        min_duration: String(args.minDuration),
      }),
      ...(args.maxDuration != null && {
        max_duration: String(args.maxDuration),
      }),
    });

    const res = await fetch(`${PEXELS_VIDEO_API}/search?${params}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      videos: PexelsVideo[];
      total_results: number;
      next_page?: string;
      page?: number;
      per_page?: number;
    };

    return data;
  },
});

export const popularVideos = action({
  args: {
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      throw new Error("PEXELS_API_KEY not set");
    }

    const params = new URLSearchParams({
      per_page: String(args.perPage ?? 20),
      page: String(args.page ?? 1),
    });

    const res = await fetch(`${PEXELS_VIDEO_API}/popular?${params}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      videos: PexelsVideo[];
      total_results?: number;
      next_page?: string;
      page?: number;
      per_page?: number;
    };

    return data;
  },
});
