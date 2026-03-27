"use client";

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { ArrowUpRight, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface CanvasCardProps {
  canvas: { _id: Id<"canvases">; name: string };
  onNavigate: (id: Id<"canvases">) => void;
}

export default function CanvasCard({ canvas, onNavigate }: CanvasCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(canvas.name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressCardNavigationRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const updateCanvas = useMutation(api.canvases.update);

  const handleStartEdit = useCallback(() => {
    suppressCardNavigationRef.current = true;
    setEditName(canvas.name);
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.select();
      setTimeout(() => {
        suppressCardNavigationRef.current = false;
      }, 0);
    }, 0);
  }, [canvas.name]);

  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    if (trimmedName === canvas.name) {
      setIsEditing(false);
      return;
    }

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await updateCanvas({ canvasId: canvas._id, name: trimmedName });
      toast.success("Arbeitsbereich umbenannt");
      setIsEditing(false);
    } catch {
      toast.error("Fehler beim Umbenennen");
    } finally {
      setIsSaving(false);
      saveInFlightRef.current = false;
    }
  }, [editName, canvas.name, canvas._id, updateCanvas]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false);
        setEditName(canvas.name);
      }
    },
    [handleSave, canvas.name]
  );

  // Prevent duplicate toast: only save on blur if still in editing mode
  const handleBlur = useCallback(() => {
    if (!isEditing) return;
    handleSave();
  }, [isEditing, handleSave]);

  const handleCardClick = useCallback(() => {
    if (suppressCardNavigationRef.current) return;
    if (!isEditing) {
      onNavigate(canvas._id);
    }
  }, [isEditing, onNavigate, canvas._id]);

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm shadow-foreground/3 transition-all",
        "hover:bg-muted/60 hover:shadow-md hover:shadow-foreground/4",
        isEditing && "ring-2 ring-primary/50"
      )}
      onClick={handleCardClick}
    >
      {/* Avatar */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-sm font-semibold text-primary">
        {canvas.name.slice(0, 1).toUpperCase()}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={isSaving}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            className="h-auto py-0.5 text-sm font-medium bg-transparent border px-1.5 focus-visible:ring-1"
          />
        ) : (
          <p className="truncate text-sm font-medium">{canvas.name}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">Canvas</p>
      </div>

      {/* Actions - positioned to not overlap with content */}
      {!isEditing && (
        <div className="flex shrink-0 items-center gap-2 ml-2">
          <ArrowUpRight className="size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Optionen</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleStartEdit}>
                <Pencil className="size-4" />
                Umbenennen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
