"use client";

/**
 * Onboarding note:
 * Dashboard UI module for canvas card. It should consume the bundled dashboard snapshot rather than issuing separate Convex queries for the same data.
 */

import { useState, useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const t = useTranslations('toasts');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(canvas.name);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressCardNavigationRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const updateCanvas = useMutation(api.canvases.update);
  const removeCanvas = useMutation(api.canvases.remove);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      toast.error(t('dashboard.renameEmptyTitle'), t('dashboard.renameEmptyDesc'));
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
      toast.success(t('dashboard.renameSuccess'));
      setIsEditing(false);
    } catch {
      toast.error(t('dashboard.renameFailed'));
    } finally {
      setIsSaving(false);
      saveInFlightRef.current = false;
    }
  }, [t, editName, canvas.name, canvas._id, updateCanvas]);

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

  const handleDelete = useCallback(async () => {
    setDeleteBusy(true);
    try {
      await removeCanvas({ canvasId: canvas._id });
      toast.success(t('dashboard.deleteSuccess'));
      setDeleteOpen(false);
    } catch {
      toast.error(t('dashboard.deleteFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }, [t, canvas._id, removeCanvas]);

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm shadow-foreground/3 transition-all",
          "hover:bg-muted/60 hover:shadow-md hover:shadow-foreground/4",
          "focus-within:ring-2 focus-within:ring-primary/50",
          isEditing && "ring-2 ring-primary/50"
        )}
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-sm font-semibold text-primary">
              {canvas.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <Input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                disabled={isSaving}
                autoFocus
                className="h-auto border bg-transparent px-1.5 py-0.5 text-sm font-medium focus-visible:ring-1"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">Canvas</p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCardClick}
            className="flex min-w-0 flex-1 items-center gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label={`Canvas ${canvas.name} oeffnen`}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-sm font-semibold text-primary">
              {canvas.name.slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{canvas.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Canvas</p>
            </div>
          </button>
        )}

        {/* Actions - positioned to not overlap with content */}
        {!isEditing && (
          <div className="ml-2 flex shrink-0 items-center gap-2">
            <ArrowUpRight className="size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Arbeitsbereich löschen?</DialogTitle>
            <DialogDescription>
              &ldquo;{canvas.name}&rdquo; und alle Knoten werden dauerhaft gelöscht. Das
              lässt sich nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteBusy}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
