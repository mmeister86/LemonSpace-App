import type { CSSProperties } from "react";

export const TRANSPARENCY_CHECKERBOARD_STYLE: CSSProperties = {
  backgroundColor: "hsl(var(--muted))",
  backgroundImage: [
    "linear-gradient(45deg, rgba(255,255,255,0.16) 25%, transparent 25%)",
    "linear-gradient(-45deg, rgba(255,255,255,0.16) 25%, transparent 25%)",
    "linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.16) 75%)",
    "linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.16) 75%)",
  ].join(", "),
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundSize: "16px 16px",
};
