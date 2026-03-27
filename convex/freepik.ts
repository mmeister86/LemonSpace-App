"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const FREEPIK_BASE = "https://api.freepik.com";

type AssetType = "photo" | "vector" | "icon";

interface FreepikResult {
  id: number;
  title: string;
  assetType: AssetType;
  previewUrl: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  sourceUrl: string;
  license: "freemium" | "premium";
  authorName: string;
  orientation?: string;
}

interface FreepikSearchResponse {
  results: FreepikResult[];
  totalPages: number;
  currentPage: number;
  total: number;
}

function parseSize(size?: string): { width?: number; height?: number } {
  if (!size) return {};
  const match = size.match(/^(\d+)x(\d+)$/i);
  if (!match) return {};
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {};
  }
  return { width, height };
}

export const search = action({
  args: {
    term: v.string(),
    assetType: v.union(v.literal("photo"), v.literal("vector"), v.literal("icon")),
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<FreepikSearchResponse> => {
    const apiKey = process.env.FREEPIK_API_KEY;
    if (!apiKey) {
      throw new Error("FREEPIK_API_KEY not set");
    }

    const page = args.page ?? 1;
    const limit = args.limit ?? 20;

    const params = new URLSearchParams({
      term: args.term,
      page: String(page),
      order: "relevance",
      "filters[license][freemium]": "1",
    });

    let endpoint = `${FREEPIK_BASE}/v1/resources`;
    if (args.assetType === "icon") {
      endpoint = `${FREEPIK_BASE}/v1/icons`;
      params.set("per_page", String(limit));
    } else {
      params.set("limit", String(limit));
      params.set(`filters[content_type][${args.assetType}]`, "1");
    }

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: {
        "x-freepik-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Freepik API error: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        id?: number;
        title?: string;
        url?: string;
        image?: {
          orientation?: string;
          source?: {
            url?: string;
            size?: string;
          };
        };
        licenses?: Array<{ type?: string }>;
        author?: { name?: string };
      }>;
      meta?: {
        total?: number;
        current_page?: number;
        last_page?: number;
        total_pages?: number;
        pagination?: {
          total?: number;
          current_page?: number;
          last_page?: number;
          total_pages?: number;
        };
      };
    };

    const data = json.data ?? [];
    const pagination = json.meta?.pagination;

    const results = data
      .map((item): FreepikResult | null => {
        if (!item.id || !item.image?.source?.url || !item.url) {
          return null;
        }

        const license = item.licenses?.some((entry) => entry.type === "freemium")
          ? "freemium"
          : "premium";
        const parsedSize = parseSize(item.image?.source?.size);

        return {
          id: item.id,
          title: item.title ?? "Untitled",
          assetType: args.assetType,
          previewUrl: item.image.source.url,
          intrinsicWidth: parsedSize.width,
          intrinsicHeight: parsedSize.height,
          sourceUrl: item.url,
          license,
          authorName: item.author?.name ?? "Freepik",
          orientation: item.image.orientation,
        };
      })
      .filter((entry): entry is FreepikResult => entry !== null);

    const totalPagesRaw =
      pagination?.last_page ??
      pagination?.total_pages ??
      json.meta?.last_page ??
      json.meta?.total_pages ??
      1;
    const currentPageRaw = pagination?.current_page ?? json.meta?.current_page ?? page;
    const totalRaw = pagination?.total ?? json.meta?.total ?? results.length;

    const totalPages =
      Number.isFinite(totalPagesRaw) && totalPagesRaw > 0
        ? Math.floor(totalPagesRaw)
        : 1;
    const currentPage =
      Number.isFinite(currentPageRaw) && currentPageRaw > 0
        ? Math.min(Math.floor(currentPageRaw), totalPages)
        : page;
    const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? Math.floor(totalRaw) : results.length;

    return {
      results,
      totalPages,
      currentPage,
      total,
    };
  },
});
