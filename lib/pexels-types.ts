export interface PexelsVideoFile {
  id: number;
  /** Pexels liefert u. a. `hls` mit `.m3u8` — nicht für `<video src>`. */
  quality: "hd" | "sd" | "uhd" | "hls";
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: PexelsVideoFile[];
}

export interface VideoNodeData {
  canvasId?: string;
  pexelsId?: number;
  mp4Url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  attribution?: {
    userName: string;
    userUrl: string;
    videoUrl: string;
  };
}

function isProgressiveMp4Candidate(f: PexelsVideoFile): boolean {
  if (f.quality === "hls") return false;
  const url = f.link.toLowerCase();
  if (url.includes(".m3u8")) return false;
  return url.includes(".mp4");
}

/**
 * Progressive MP4 für HTML5-`<video>` — niemals HLS/m3u8 (API setzt dort teils fälschlich `video/mp4`).
 */
export function pickVideoFile(files: PexelsVideoFile[]): PexelsVideoFile {
  const playable = files.filter(isProgressiveMp4Candidate);
  if (playable.length === 0) {
    throw new Error("Kein MP4-Download von Pexels verfügbar (nur HLS?).");
  }
  return (
    playable.find((f) => f.quality === "hd") ??
    playable.find((f) => f.quality === "uhd") ??
    playable.find((f) => f.quality === "sd") ??
    playable[0]
  );
}

/**
 * Kleinste sinnvolle MP4 für Raster-Vorschau (bevorzugt SD, sonst kleinste Auflösung).
 */
export function pickPreviewVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const playable = files.filter(isProgressiveMp4Candidate);
  if (playable.length === 0) return null;
  const sd = playable.filter((f) => f.quality === "sd");
  const pool = sd.length > 0 ? sd : playable;
  return pool.reduce((best, f) => {
    const a = (f.width || 0) * (f.height || 0);
    const b = (best.width || 0) * (best.height || 0);
    if (a === 0 && b === 0) return f;
    if (a === 0) return best;
    if (b === 0) return f;
    return a < b ? f : best;
  });
}
