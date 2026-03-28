"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useTheme } from "next-themes";
import {
  Monitor,
  Moon,
  Pencil,
  Sun,
  Trash2,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { msg } from "@/lib/toast-messages";
import { useAuthQuery } from "@/hooks/use-auth-query";

type CanvasAppMenuProps = {
  canvasId: Id<"canvases">;
};

export function CanvasAppMenu({ canvasId }: CanvasAppMenuProps) {
  const router = useRouter();
  const canvas = useAuthQuery(api.canvases.get, { canvasId });
  const removeCanvas = useMutation(api.canvases.remove);
  const renameCanvas = useMutation(api.canvases.update);
  const { theme = "system", setTheme } = useTheme();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (renameOpen && canvas?.name !== undefined) {
      setRenameValue(canvas.name);
    }
  }, [renameOpen, canvas?.name]);

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      const { title, desc } = msg.dashboard.renameEmpty;
      toast.error(title, desc);
      return;
    }
    if (trimmed === canvas?.name) {
      setRenameOpen(false);
      return;
    }
    setRenameSaving(true);
    try {
      await renameCanvas({ canvasId, name: trimmed });
      toast.success(msg.dashboard.renameSuccess.title);
      setRenameOpen(false);
    } catch {
      toast.error(msg.dashboard.renameFailed.title);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      await removeCanvas({ canvasId });
      toast.success("Projekt gelöscht");
      setDeleteOpen(false);
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <>
      <div className="absolute top-4 right-4 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-10 rounded-lg border-border/80 bg-card/95 shadow-md backdrop-blur-sm"
              aria-label="Canvas-Menü"
              title="Canvas-Menü"
            >
              <Menu className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onSelect={() => {
                setRenameOpen(true);
              }}
            >
              <Pencil className="size-4" />
              Projekt umbenennen
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Projekt löschen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sun className="size-4" />
                Erscheinungsbild
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => setTheme("light")}>
                  <Sun className="size-4" />
                  Hell
                  {theme === "light" ? " ✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("dark")}>
                  <Moon className="size-4" />
                  Dunkel
                  {theme === "dark" ? " ✓" : ""}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("system")}>
                  <Monitor className="size-4" />
                  System
                  {theme === "system" ? " ✓" : ""}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Projekt umbenennen</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleRename();
            }}
            placeholder="Name"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => void handleRename()}
              disabled={renameSaving}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Projekt löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            „{canvas?.name ?? "dieses Projekt"}“ und alle Knoten werden dauerhaft
            gelöscht. Das lässt sich nicht rückgängig machen.
          </p>
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
