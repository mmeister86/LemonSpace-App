"use client";

/**
 * Onboarding note:
 * Renders and manages the Canvas comment node node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import type { Node, NodeProps } from "@xyflow/react";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useCanvasSync } from "@/components/canvas/canvas-sync-context";
import BaseNodeWrapper from "./base-node-wrapper";
import {
  commentContentToPlainText,
  createCommentContentFromText,
  normalizeCommentNodeData,
  stripCommentRuntimeFields,
  type CommentNodeData,
  type CommentReplyData,
} from "./comment-node-data";

export type CommentNode = Node<CommentNodeData, "comment">;

function CommentText({ text, empty }: { text: string; empty: string }) {
  if (text.trim().length === 0) {
    return <span className="text-muted-foreground">{empty}</span>;
  }

  return <span>{text}</span>;
}

export default function CommentNode({ id, data, selected }: NodeProps<CommentNode>) {
  const { queueNodeDataUpdate } = useCanvasSync();
  const normalized = useMemo(() => normalizeCommentNodeData(data), [data]);
  const [draft, setDraft] = useState(() => commentContentToPlainText(normalized.content));
  const [editing, setEditing] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyEditDraft, setReplyEditDraft] = useState("");

  const persist = useCallback(
    (nextData: CommentNodeData) => {
      void queueNodeDataUpdate({
        nodeId: id as Id<"nodes">,
        data: stripCommentRuntimeFields({
          ...data,
          ...nextData,
          _status: undefined,
          _statusMessage: undefined,
        }),
      });
    },
    [data, id, queueNodeDataUpdate],
  );

  const saveDraft = useDebouncedCallback((nextDraft: string) => {
    persist({
      ...normalized,
      content: createCommentContentFromText(nextDraft),
    });
  }, 500);

  const saveReplyEdit = useDebouncedCallback((replyId: string, nextDraft: string) => {
    const updatedAt = Date.now();
    persist({
      ...normalized,
      replies: normalized.replies.map((reply) =>
        reply.id === replyId
          ? {
              ...reply,
              content: createCommentContentFromText(nextDraft),
              updatedAt,
            }
          : reply,
      ),
    });
  }, 500);

  const toggleResolved = () => {
    persist({ ...normalized, resolved: !normalized.resolved });
  };

  const clearContent = () => {
    setDraft("");
    persist({ ...normalized, content: createCommentContentFromText("") });
  };

  const addReply = () => {
    const trimmed = replyDraft.trim();
    if (!trimmed) return;

    const now = Date.now();
    const reply: CommentReplyData = {
      id: crypto.randomUUID(),
      content: createCommentContentFromText(trimmed),
      createdAt: now,
      updatedAt: now,
    };

    setReplyDraft("");
    persist({ ...normalized, replies: [...normalized.replies, reply] });
  };

  const beginReplyEdit = (reply: CommentReplyData) => {
    setEditingReplyId(reply.id);
    setReplyEditDraft(commentContentToPlainText(reply.content));
  };

  const deleteReply = (replyId: string) => {
    if (editingReplyId === replyId) {
      setEditingReplyId(null);
      setReplyEditDraft("");
    }
    persist({
      ...normalized,
      replies: normalized.replies.filter((reply) => reply.id !== replyId),
    });
  };

  const bodyText = commentContentToPlainText(normalized.content);
  const beginBodyEdit = () => {
    setDraft(bodyText);
    setEditing(true);
  };
  const handleBodyInput = (nextValue: string) => {
    setDraft(nextValue);
    saveDraft(nextValue);
  };
  const handleReplyEditInput = (replyId: string, nextValue: string) => {
    setReplyEditDraft(nextValue);
    saveReplyEdit(replyId, nextValue);
  };

  return (
    <BaseNodeWrapper
      nodeType="comment"
      selected={selected}
      className={`overflow-hidden p-3 ${normalized.resolved ? "opacity-80" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4 shrink-0 text-primary" />
          <span className="truncate">Kommentar</span>
        </div>
        <button
          type="button"
          onClick={toggleResolved}
          aria-label={
            normalized.resolved
              ? "Kommentar wieder öffnen"
              : "Kommentar als erledigt markieren"
          }
          className={`nodrag inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
            normalized.resolved
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700"
          }`}
        >
          <CheckCircle2 className="size-3" />
          {normalized.resolved ? "Erledigt" : "Offen"}
        </button>
      </div>

      <div className="mt-3 rounded-md border bg-background/60 p-2">
        {editing ? (
          <textarea
            value={draft}
            onChange={(event) => handleBodyInput(event.currentTarget.value)}
            onInput={(event) => handleBodyInput(event.currentTarget.value)}
            onBlur={() => setEditing(false)}
            autoFocus
            rows={3}
            aria-label="Kommentartext"
            className="nodrag nowheel min-h-16 w-full resize-none bg-transparent text-sm leading-5 outline-none"
            placeholder="Kommentar schreiben..."
          />
        ) : (
          <button
            type="button"
          onDoubleClick={beginBodyEdit}
          onClick={() => {
              if (selected) beginBodyEdit();
          }}
            className="nodrag block min-h-16 w-full whitespace-pre-wrap break-words text-left text-sm leading-5"
          >
            <CommentText text={bodyText} empty="Kommentar schreiben..." />
          </button>
        )}
        <div className="mt-2 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={beginBodyEdit}
            aria-label="Kommentar bearbeiten"
            className="nodrag rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={clearContent}
            aria-label="Kommentartext löschen"
            className="nodrag rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {normalized.replies.map((reply) => {
          const replyText = commentContentToPlainText(reply.content);
          const isEditingReply = editingReplyId === reply.id;

          return (
            <div key={reply.id} className="rounded-md bg-muted/50 p-2">
              {isEditingReply ? (
                <textarea
                  value={replyEditDraft}
                  onChange={(event) => handleReplyEditInput(reply.id, event.currentTarget.value)}
                  onInput={(event) => handleReplyEditInput(reply.id, event.currentTarget.value)}
                  onBlur={() => setEditingReplyId(null)}
                  autoFocus
                  rows={2}
                  aria-label="Antworttext"
                  className="nodrag nowheel min-h-10 w-full resize-none bg-transparent text-xs leading-5 outline-none"
                />
              ) : (
                <div className="whitespace-pre-wrap break-words text-xs leading-5">
                  <CommentText text={replyText} empty="Leere Antwort" />
                </div>
              )}
              <div className="mt-1 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => beginReplyEdit(reply)}
                  aria-label="Antwort bearbeiten"
                  className="nodrag rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteReply(reply.id)}
                  aria-label="Antwort löschen"
                  className="nodrag rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          value={replyDraft}
          onChange={(event) => setReplyDraft(event.currentTarget.value)}
          onInput={(event) => setReplyDraft(event.currentTarget.value)}
          rows={1}
          aria-label="Antwort hinzufügen"
          className="nodrag nowheel min-h-9 flex-1 resize-none rounded-md border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
          placeholder="Antwort..."
        />
        <button
          type="button"
          onClick={addReply}
          aria-label="Antwort speichern"
          className="nodrag flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </BaseNodeWrapper>
  );
}
