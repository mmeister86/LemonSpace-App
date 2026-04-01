"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import { Bold, Heading2, Italic, Link2, List, FilePenLine } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import BaseNodeWrapper from "./base-node-wrapper";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TextNodeData = {
  content?: string;
  _status?: string;
  _statusMessage?: string;
};

export type TextNode = Node<TextNodeData, "text">;

export default function TextNode({ id, data, selected }: NodeProps<TextNode>) {
  const { setNodes } = useReactFlow();
  const { queueNodeDataUpdate } = useCanvasSync();
  const [content, setContent] = useState(data.content ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isRichTextOpen, setIsRichTextOpen] = useState(false);
  const richEditorRef = useRef<HTMLTextAreaElement>(null);

  // Sync von außen (Convex-Update) wenn nicht gerade editiert wird
  useEffect(() => {
    if (!isEditing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent(data.content ?? "");
    }
  }, [data.content, isEditing]);

  // Debounced Save — 500ms nach letztem Tastendruck
  const saveContent = useDebouncedCallback(
    (newContent: string) => {
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: {
          ...data,
          content: newContent,
          _status: undefined,
          _statusMessage: undefined,
        },
      });
    },
    500,
  );

  const updateContent = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  content: newContent,
                },
              }
            : node,
        ),
      );
      saveContent(newContent);
    },
    [id, saveContent, setNodes],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateContent(e.target.value);
    },
    [updateContent],
  );

  const wrapSelection = useCallback(
    (prefix: string, suffix = prefix, placeholder = "Text") => {
      const editor = richEditorRef.current;
      if (!editor) return;

      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const selectedText = content.slice(start, end);
      const injectedText = selectedText || placeholder;
      const nextContent = `${content.slice(0, start)}${prefix}${injectedText}${suffix}${content.slice(end)}`;

      updateContent(nextContent);

      requestAnimationFrame(() => {
        editor.focus();
        const nextStart = start + prefix.length;
        const nextEnd = nextStart + injectedText.length;
        editor.setSelectionRange(nextStart, nextEnd);
      });
    },
    [content, updateContent],
  );

  const prefixSelectedLines = useCallback(
    (prefix: string) => {
      const editor = richEditorRef.current;
      if (!editor) return;

      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const lineEndSearch = content.indexOf("\n", end);
      const lineEnd = lineEndSearch === -1 ? content.length : lineEndSearch;
      const selectedBlock = content.slice(lineStart, lineEnd);
      const nextBlock = selectedBlock
        .split("\n")
        .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
        .join("\n");
      const nextContent = `${content.slice(0, lineStart)}${nextBlock}${content.slice(lineEnd)}`;

      updateContent(nextContent);

      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(lineStart, lineStart + nextBlock.length);
      });
    },
    [content, updateContent],
  );

  return (
    <>
      <BaseNodeWrapper
        nodeType="text"
        selected={selected}
        status={data._status}
        toolbarActions={[
          {
            id: "rich-text",
            label: "RichText",
            icon: <FilePenLine size={14} />,
            onClick: () => setIsRichTextOpen(true),
          },
        ]}
        className="relative"
      >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !bg-primary !border-2 !border-background"
      />

      <div className="w-full p-3">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          📝 Text
        </div>
        {isEditing ? (
          <textarea
            value={content}
            onChange={handleChange}
            onBlur={() => setIsEditing(false)}
            autoFocus
            className="nodrag nowheel w-full resize-none rounded-md border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 min-h-[3rem] overflow-hidden"
            placeholder="Text eingeben…"
            rows={3}
          />
        ) : (
          <div
            onClick={() => {
              if (selected) setIsEditing(true);
            }}
            className="nodrag nowheel min-h-[2rem] cursor-text whitespace-pre-wrap break-words text-sm"
          >
            {content || (
              <span className="text-muted-foreground">
                Auswählen, dann hier klicken
              </span>
            )}
          </div>
        )}
      </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !bg-primary !border-2 !border-background"
        />
      </BaseNodeWrapper>

      <Dialog open={isRichTextOpen} onOpenChange={setIsRichTextOpen}>
        <DialogContent className="h-[80vh] max-w-3xl">
          <DialogHeader>
            <DialogTitle>RichText Editor</DialogTitle>
            <DialogDescription>
              Schnelle Formatierung mit Markdown-Syntax.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => wrapSelection("**")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Fett"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => wrapSelection("*")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Kursiv"
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => wrapSelection("## ", "", "Überschrift")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Überschrift"
              >
                <Heading2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => prefixSelectedLines("- ")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Liste"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => wrapSelection("[", "](https://)", "Linktext")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Link"
              >
                <Link2 className="h-4 w-4" />
              </button>
            </div>

            <textarea
              ref={richEditorRef}
              value={content}
              onChange={handleChange}
              className="nodrag nowheel min-h-0 w-full flex-1 resize-none rounded-md border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Text eingeben…"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
