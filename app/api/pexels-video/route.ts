import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "videos.pexels.com",
  "player.vimeo.com",
  "vod-progressive.pexels.com",
]);

/**
 * Proxies Pexels/Vimeo MP4 streams so playback works when the browser’s
 * Referer (e.g. localhost) would be rejected by the CDN.
 * Forwards Range for seeking; whitelists known video hosts from the Pexels API.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) {
    return new NextResponse("Missing u", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid URL", { status: 400 });
  }

  if (target.protocol !== "https:") {
    return new NextResponse("HTTPS only", { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const upstreamHeaders: HeadersInit = {
    Referer: "https://www.pexels.com/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
  };
  const range = request.headers.get("range");
  if (range) upstreamHeaders.Range = range;
  const ifRange = request.headers.get("if-range");
  if (ifRange) upstreamHeaders["If-Range"] = ifRange;

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }

  const out = new Headers();
  const copy = [
    "content-type",
    "content-length",
    "accept-ranges",
    "content-range",
    "etag",
    "last-modified",
    "cache-control",
  ] as const;
  for (const name of copy) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }

  if (!upstream.body) {
    return new NextResponse(null, { status: upstream.status, headers: out });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}
