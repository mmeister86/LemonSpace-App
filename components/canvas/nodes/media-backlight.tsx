"use client";

import type { ReactElement } from "react";

import { Backlight } from "@/components/ui/backlight";
import { cn } from "@/lib/utils";

type MediaBacklightProps = {
  children: ReactElement;
  className?: string;
  blur?: number;
  enabled?: boolean;
};

const CANVAS_MEDIA_BACKLIGHT_BLUR = 23;

export function MediaBacklight({
  children,
  className,
  blur = CANVAS_MEDIA_BACKLIGHT_BLUR,
  enabled = true,
}: MediaBacklightProps) {
  if (!enabled) return children;

  return (
    <div
      data-testid="canvas-media-backlight"
      className={cn(
        "relative isolate h-full w-full overflow-visible rounded-[inherit]",
        className,
      )}
    >
      <Backlight
        blur={blur}
        className="pointer-events-none absolute -inset-24 -z-10 overflow-visible rounded-[inherit] p-24 opacity-70 drop-shadow-[0_0_18px_rgba(20,184,166,0.30)] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude] dark:drop-shadow-[0_0_23px_rgba(94,234,212,0.34)] [-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [&>div]:relative [&>div]:h-full [&>div]:w-full [&>div]:rounded-[inherit]"
      >
        <div
          data-testid="canvas-media-backlight-halo"
          className="absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          {children}
        </div>
      </Backlight>
      <div
        data-testid="canvas-media-backlight-content"
        className="relative z-10 h-full w-full overflow-hidden rounded-[inherit]"
      >
        {children}
      </div>
    </div>
  );
}
