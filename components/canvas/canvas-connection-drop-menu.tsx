"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { CanvasNodeTemplatePicker } from "@/components/canvas/canvas-node-template-picker";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { CanvasNodeTemplate } from "@/lib/canvas-node-templates";
import type { Id } from "@/convex/_generated/dataModel";

export type ConnectionDropMenuState = {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
  fromNodeId: Id<"nodes">;
  fromHandleId: string | undefined;
  fromHandleType: "source" | "target";
};

type CanvasConnectionDropMenuProps = {
  state: ConnectionDropMenuState | null;
  onClose: () => void;
  onPick: (template: CanvasNodeTemplate) => void;
};

const PANEL_MAX_W = 360;
const PANEL_MAX_H = 420;

export function CanvasConnectionDropMenu({
  state,
  onClose,
  onPick,
}: CanvasConnectionDropMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);

    const onPointerDownCapture = (e: PointerEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  const vw =
    typeof window !== "undefined" ? window.innerWidth : PANEL_MAX_W + 16;
  const vh =
    typeof window !== "undefined" ? window.innerHeight : PANEL_MAX_H + 16;
  const left = Math.max(
    8,
    Math.min(state.screenX, vw - PANEL_MAX_W - 8),
  );
  const top = Math.max(
    8,
    Math.min(state.screenY, vh - PANEL_MAX_H - 8),
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Knoten wählen zur Verbindung"
      className={cn(
        "fixed z-100 flex max-h-(--panel-max-h) w-[min(100vw-1rem,360px)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 shadow-lg",
      )}
      style={
        {
          left,
          top,
          "--panel-max-h": `${PANEL_MAX_H}px`,
        } as CSSProperties
      }
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Command className="rounded-xl! bg-popover">
        <CommandInput placeholder="Knoten suchen …" autoFocus />
        <CommandList className="max-h-72">
          <CommandEmpty>Keine Treffer.</CommandEmpty>
          <CanvasNodeTemplatePicker
            onPick={(template) => {
              onPick(template);
              onClose();
            }}
            groupHeading="Knoten"
          />
        </CommandList>
      </Command>
    </div>
  );
}
