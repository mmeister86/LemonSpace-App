"use client";

import { type Node, type NodeProps } from "@xyflow/react";

import BaseNodeWrapper from "./base-node-wrapper";

export type NoteNodeData = {
  content?: string;
};

export type NoteNode = Node<NoteNodeData, "note">;

export default function NoteNode({ data, selected }: NodeProps<NoteNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-52 p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">Notiz</div>
      <p className="whitespace-pre-wrap text-sm">{data.content || "Leere Notiz"}</p>
    </BaseNodeWrapper>
  );
}
