# 🍋 LemonSpace — Canvas Implementation Guide

**Schritte 1–3: Basis-Canvas mit Convex-Sync**

---

## Voraussetzungen

Das Convex-Backend ist deployed und folgende Funktionen existieren bereits:

- `api.nodes.list` (Query, benötigt `canvasId`)
- `api.nodes.create` (Mutation)
- `api.nodes.move` (Mutation, benötigt `nodeId` + `position`)
- `api.nodes.resize` (Mutation)
- `api.nodes.batchMove` (Mutation)
- `api.nodes.updateData` (Mutation)
- `api.nodes.updateStatus` (Mutation)
- `api.nodes.remove` (Mutation)
- `api.edges.list` (Query, benötigt `canvasId`)
- `api.edges.create` (Mutation)
- `api.edges.remove` (Mutation)
- `api.canvases.list`, `api.canvases.get`, `api.canvases.create`

Auth via Better Auth + `@convex-dev/better-auth` ist funktionsfähig.

---

## Schritt 0 — Package-Installation

```bash
pnpm add @xyflow/react
```

> **dnd-kit** wird erst in einem späteren Schritt benötigt (Sidebar → Canvas Drag). Für Schritt 1–3 reicht @xyflow/react allein — das bringt Drag & Drop von bestehenden Nodes bereits mit.

---

## Schritt 1 — Dateistruktur anlegen

```
components/
  canvas/
    canvas.tsx                 ← Haupt-Canvas (ReactFlow + Convex-Sync)
    canvas-toolbar.tsx         ← Toolbar oben (Node hinzufügen, Zoom)
    node-types.ts              ← nodeTypes-Map (AUSSERHALB jeder Komponente!)
    nodes/
      image-node.tsx           ← Bild-Node (Upload/URL)
      text-node.tsx            ← Freitext (Markdown)
      prompt-node.tsx          ← Prompt für KI-Nodes
      ai-image-node.tsx        ← KI-Bild-Output
      group-node.tsx           ← Container/Gruppe
      frame-node.tsx           ← Artboard/Export-Boundary
      note-node.tsx            ← Annotation
      compare-node.tsx         ← Slider-Vergleich
      base-node-wrapper.tsx    ← Shared Wrapper (Border, Selection-Ring, Status)

app/
  (app)/
    canvas/
      [canvasId]/
        page.tsx               ← Canvas-Page (Server Component, Auth-Check)

lib/
  canvas-utils.ts              ← Hilfsfunktionen (Convex → RF Mapping)
```

---

## Schritt 2 — Custom Node Components

### 2.1 Base Node Wrapper

Jeder Node teilt sich visuelle Grundeigenschaften: Border, Selection-Ring, Status-Anzeige. Das kapseln wir in einem Wrapper.

```tsx
// components/canvas/nodes/base-node-wrapper.tsx
'use client';

import type { ReactNode } from 'react';

interface BaseNodeWrapperProps {
  selected?: boolean;
  status?: 'idle' | 'executing' | 'done' | 'error';
  children: ReactNode;
  className?: string;
}

export default function BaseNodeWrapper({
  selected,
  status = 'idle',
  children,
  className = '',
}: BaseNodeWrapperProps) {
  const statusStyles = {
    idle: '',
    executing: 'animate-pulse border-yellow-400',
    done: 'border-green-500',
    error: 'border-red-500',
  };

  return (
    <div
      className={`
        rounded-xl border bg-card shadow-sm transition-shadow
        ${selected ? 'ring-2 ring-primary shadow-md' : ''}
        ${statusStyles[status]}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
```

### 2.2 Note Node (einfachster Node — guter Startpunkt)

```tsx
// components/canvas/nodes/note-node.tsx
'use client';

import { type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type NoteNodeData = {
  content?: string;
};

export type NoteNode = Node<NoteNodeData, 'note'>;

export default function NoteNode({ data, selected }: NodeProps<NoteNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-52 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-1">📌 Notiz</div>
      <p className="text-sm whitespace-pre-wrap">
        {data.content || 'Leere Notiz'}
      </p>
    </BaseNodeWrapper>
  );
}
```

### 2.3 Image Node

```tsx
// components/canvas/nodes/image-node.tsx
'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type ImageNodeData = {
  storageId?: string;
  url?: string;
  filename?: string;
};

export type ImageNode = Node<ImageNodeData, 'image'>;

export default function ImageNode({ data, selected }: NodeProps<ImageNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="p-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">🖼️ Bild</div>
      {data.url ? (
        <img
          src={data.url}
          alt={data.filename ?? 'Bild'}
          className="rounded-lg object-cover max-w-[280px]"
          draggable={false}
        />
      ) : (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          Bild hochladen oder URL einfügen
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary !border-2 !border-background" />
    </BaseNodeWrapper>
  );
}
```

### 2.4 Text Node

```tsx
// components/canvas/nodes/text-node.tsx
'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type TextNodeData = {
  content?: string;
};

export type TextNode = Node<TextNodeData, 'text'>;

export default function TextNode({ data, selected }: NodeProps<TextNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-64 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-1">📝 Text</div>
      <p className="text-sm whitespace-pre-wrap min-h-[2rem]">
        {data.content || 'Text eingeben…'}
      </p>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary !border-2 !border-background" />
    </BaseNodeWrapper>
  );
}
```

### 2.5 Prompt Node

```tsx
// components/canvas/nodes/prompt-node.tsx
'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type PromptNodeData = {
  prompt?: string;
  model?: string;
};

export type PromptNode = Node<PromptNodeData, 'prompt'>;

export default function PromptNode({ data, selected }: NodeProps<PromptNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-72 p-3 border-purple-500/30">
      <div className="text-xs font-medium text-purple-500 mb-1">✨ Prompt</div>
      <p className="text-sm whitespace-pre-wrap min-h-[2rem]">
        {data.prompt || 'Prompt eingeben…'}
      </p>
      {data.model && (
        <div className="mt-2 text-xs text-muted-foreground">
          Modell: {data.model}
        </div>
      )}
      {/* Nur Source — verbindet sich ausschließlich mit KI-Nodes */}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-purple-500 !border-2 !border-background" />
    </BaseNodeWrapper>
  );
}
```

### 2.6 AI Image Node

```tsx
// components/canvas/nodes/ai-image-node.tsx
'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type AiImageNodeData = {
  url?: string;
  prompt?: string;
  model?: string;
  status?: 'idle' | 'executing' | 'done' | 'error';
  error?: string;
};

export type AiImageNode = Node<AiImageNodeData, 'ai-image'>;

export default function AiImageNode({ data, selected }: NodeProps<AiImageNode>) {
  const status = data.status ?? 'idle';

  return (
    <BaseNodeWrapper selected={selected} status={status} className="p-2">
      <div className="text-xs font-medium text-emerald-500 mb-1">🤖 KI-Bild</div>

      {status === 'executing' && (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {status === 'done' && data.url && (
        <img
          src={data.url}
          alt={data.prompt ?? 'KI-generiertes Bild'}
          className="rounded-lg object-cover max-w-[280px]"
          draggable={false}
        />
      )}

      {status === 'error' && (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/20 text-sm text-red-600">
          {data.error ?? 'Fehler bei der Generierung'}
        </div>
      )}

      {status === 'idle' && (
        <div className="flex h-36 w-56 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          Prompt verbinden
        </div>
      )}

      {data.prompt && status === 'done' && (
        <p className="mt-1 text-xs text-muted-foreground truncate max-w-[280px]">
          {data.prompt}
        </p>
      )}

      {/* Target: Empfängt Input von Prompt/Bild */}
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-emerald-500 !border-2 !border-background" />
      {/* Source: Output weitergeben (an Compare, Frame, etc.) */}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-primary !border-2 !border-background" />
    </BaseNodeWrapper>
  );
}
```

### 2.7 Platzhalter für Group, Frame, Compare

Diese sind komplexer (Group braucht `expandParent`, Frame braucht Resize, Compare braucht Slider). Für Schritt 1–3 reichen einfache Platzhalter:

```tsx
// components/canvas/nodes/group-node.tsx
'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type GroupNode = Node<{ label?: string }, 'group'>;

export default function GroupNode({ data, selected }: NodeProps<GroupNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="min-w-[200px] min-h-[150px] p-3 border-dashed">
      <div className="text-xs font-medium text-muted-foreground">📁 {data.label || 'Gruppe'}</div>
    </BaseNodeWrapper>
  );
}
```

```tsx
// components/canvas/nodes/frame-node.tsx
'use client';
import { type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type FrameNode = Node<{ label?: string; resolution?: string }, 'frame'>;

export default function FrameNode({ data, selected }: NodeProps<FrameNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="min-w-[300px] min-h-[200px] p-3 border-blue-500/30">
      <div className="text-xs font-medium text-blue-500">
        🖥️ {data.label || 'Frame'} {data.resolution && `(${data.resolution})`}
      </div>
    </BaseNodeWrapper>
  );
}
```

```tsx
// components/canvas/nodes/compare-node.tsx
'use client';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import BaseNodeWrapper from './base-node-wrapper';

export type CompareNode = Node<{ leftUrl?: string; rightUrl?: string }, 'compare'>;

export default function CompareNode({ data, selected }: NodeProps<CompareNode>) {
  return (
    <BaseNodeWrapper selected={selected} className="w-[500px] p-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">🔀 Vergleich</div>
      <div className="flex gap-2 h-40">
        <div className="flex-1 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
          {data.leftUrl ? <img src={data.leftUrl} className="rounded object-cover h-full w-full" /> : 'Bild A'}
        </div>
        <div className="flex-1 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
          {data.rightUrl ? <img src={data.rightUrl} className="rounded object-cover h-full w-full" /> : 'Bild B'}
        </div>
      </div>
      <Handle type="target" position={Position.Left} id="left" className="!h-3 !w-3 !bg-primary !border-2 !border-background" style={{ top: '40%' }} />
      <Handle type="target" position={Position.Left} id="right" className="!h-3 !w-3 !bg-primary !border-2 !border-background" style={{ top: '60%' }} />
    </BaseNodeWrapper>
  );
}
```

---

## Schritt 3 — nodeTypes registrieren

**Kritisch:** Diese Map muss AUSSERHALB jeder React-Komponente definiert werden. Wenn sie innerhalb einer Komponente liegt, erstellt React bei jedem Render ein neues Objekt → React Flow re-rendert alle Nodes.

```tsx
// components/canvas/node-types.ts
import ImageNode from './nodes/image-node';
import TextNode from './nodes/text-node';
import PromptNode from './nodes/prompt-node';
import AiImageNode from './nodes/ai-image-node';
import GroupNode from './nodes/group-node';
import FrameNode from './nodes/frame-node';
import NoteNode from './nodes/note-node';
import CompareNode from './nodes/compare-node';

export const nodeTypes = {
  image: ImageNode,
  text: TextNode,
  prompt: PromptNode,
  'ai-image': AiImageNode,
  group: GroupNode,
  frame: FrameNode,
  note: NoteNode,
  compare: CompareNode,
} as const;
```

---

## Schritt 4 — Convex ↔ React Flow Mapping

Das Herzstück: Convex-Daten in React Flow-Format transformieren und Änderungen zurückschreiben.

```tsx
// lib/canvas-utils.ts
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { Doc } from '@/convex/_generated/dataModel';

/**
 * Transformiert einen Convex-Node in das React Flow-Format.
 */
export function convexNodeToRF(node: Doc<'nodes'>): RFNode {
  return {
    id: node._id,
    type: node.type,
    position: node.position,
    data: node.data ?? {},
    // parentId: node.parentNodeId ?? undefined,  // ← für Group-Nodes, aktivieren wenn nötig
    style: node.size
      ? { width: node.size.width, height: node.size.height }
      : undefined,
  };
}

/**
 * Transformiert einen Convex-Edge in das React Flow-Format.
 */
export function convexEdgeToRF(edge: Doc<'edges'>): RFEdge {
  return {
    id: edge._id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    // sourceHandle und targetHandle können später ergänzt werden
  };
}
```

---

## Schritt 5 — Haupt-Canvas-Komponente

Die zentrale Architekturentscheidung: **Lokaler State für flüssiges Interagieren, Convex als Sync-Layer.**

React Flow braucht `onNodesChange` für jede Interaktion (Drag, Select, Remove). Wenn wir jede Drag-Bewegung direkt an Convex senden würden, wäre das zu viel Traffic und der Canvas würde laggen. Stattdessen:

1. Convex-Daten kommen rein → werden in lokalen State geschrieben
2. Lokaler State wird von React Flow gesteuert (Drag, Select, etc.)
3. Bei `onNodeDragStop` wird die finale Position an Convex committed
4. Convex-Subscription aktualisiert den lokalen State bei Remote-Änderungen

```tsx
// components/canvas/canvas.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import { nodeTypes } from './node-types';
import { convexNodeToRF, convexEdgeToRF } from '@/lib/canvas-utils';

interface CanvasProps {
  canvasId: Id<'canvases'>;
}

export default function Canvas({ canvasId }: CanvasProps) {
  // ─── Convex Realtime Queries ───
  const convexNodes = useQuery(api.nodes.list, { canvasId });
  const convexEdges = useQuery(api.edges.list, { canvasId });

  // ─── Convex Mutations ───
  const moveNode = useMutation(api.nodes.move);
  const createNode = useMutation(api.nodes.create);
  const removeNode = useMutation(api.nodes.remove);
  const createEdge = useMutation(api.edges.create);
  const removeEdge = useMutation(api.edges.remove);

  // ─── Lokaler State (für flüssiges Dragging) ───
  const [nodes, setNodes] = useState<RFNode[]>([]);
  const [edges, setEdges] = useState<RFEdge[]>([]);

  // Track ob gerade gedraggt wird — dann kein Convex-Override
  const isDragging = useRef(false);

  // React Flow Instance Ref (für screenToFlowPosition, etc.)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // ─── Convex → Lokaler State Sync ───
  useEffect(() => {
    if (!convexNodes) return;
    // Nur aktualisieren wenn NICHT gerade gedraggt wird
    if (!isDragging.current) {
      setNodes(convexNodes.map(convexNodeToRF));
    }
  }, [convexNodes]);

  useEffect(() => {
    if (!convexEdges) return;
    setEdges(convexEdges.map(convexEdgeToRF));
  }, [convexEdges]);

  // ─── Node Changes (Drag, Select, Remove) ───
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // ─── Drag Start → Lock Convex-Sync ───
  const onNodeDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  // ─── Drag Stop → Commit zu Convex ───
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: RFNode) => {
      isDragging.current = false;
      moveNode({
        nodeId: node.id as Id<'nodes'>,
        position: { x: node.position.x, y: node.position.y },
      });
    },
    [moveNode]
  );

  // ─── Neue Verbindung → Convex Edge ───
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        createEdge({
          canvasId,
          sourceNodeId: connection.source as Id<'nodes'>,
          targetNodeId: connection.target as Id<'nodes'>,
        });
      }
    },
    [createEdge, canvasId]
  );

  // ─── Node löschen → Convex ───
  const onNodesDelete = useCallback(
    (deletedNodes: RFNode[]) => {
      for (const node of deletedNodes) {
        removeNode({ nodeId: node.id as Id<'nodes'> });
      }
    },
    [removeNode]
  );

  // ─── Edge löschen → Convex ───
  const onEdgesDelete = useCallback(
    (deletedEdges: RFEdge[]) => {
      for (const edge of deletedEdges) {
        removeEdge({ edgeId: edge.id as Id<'edges'> });
      }
    },
    [removeEdge]
  );

  // ─── Loading State ───
  if (convexNodes === undefined || convexEdges === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Canvas lädt…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onInit={setRfInstance}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls className="!bg-card !border !shadow-sm !rounded-lg" />
        <MiniMap
          className="!bg-card !border !shadow-sm !rounded-lg"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
```

---

## Schritt 6 — Canvas Toolbar

Eine einfache Toolbar zum Anlegen neuer Nodes. In Phase 1 ist das der einfachste Weg, Nodes zu erstellen (Sidebar + Drag kommt danach).

```tsx
// components/canvas/canvas-toolbar.tsx
'use client';

import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const nodeTemplates = [
  { type: 'image', label: '🖼️ Bild', defaultData: {} },
  { type: 'text', label: '📝 Text', defaultData: { content: '' } },
  { type: 'prompt', label: '✨ Prompt', defaultData: { prompt: '' } },
  { type: 'note', label: '📌 Notiz', defaultData: { content: '' } },
  { type: 'frame', label: '🖥️ Frame', defaultData: { label: 'Untitled', resolution: '1080x1080' } },
] as const;

interface CanvasToolbarProps {
  canvasId: Id<'canvases'>;
}

export default function CanvasToolbar({ canvasId }: CanvasToolbarProps) {
  const createNode = useMutation(api.nodes.create);

  const handleAddNode = async (type: string, data: Record<string, any>) => {
    // Platziere neue Nodes leicht versetzt, damit sie nicht übereinander liegen
    const offset = Math.random() * 200;
    await createNode({
      canvasId,
      type,
      position: { x: 100 + offset, y: 100 + offset },
      data,
    });
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-xl border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
      {nodeTemplates.map((t) => (
        <button
          key={t.type}
          onClick={() => handleAddNode(t.type, t.defaultData)}
          className="rounded-lg px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          title={`${t.label} hinzufügen`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

---

## Schritt 7 — Canvas Page (Next.js App Router)

```tsx
// app/(app)/canvas/[canvasId]/page.tsx
import Canvas from '@/components/canvas/canvas';
import CanvasToolbar from '@/components/canvas/canvas-toolbar';
import type { Id } from '@/convex/_generated/dataModel';

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const typedCanvasId = canvasId as Id<'canvases'>;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <CanvasToolbar canvasId={typedCanvasId} />
      <Canvas canvasId={typedCanvasId} />
    </div>
  );
}
```

---

## Schritt 8 — CSS Import nicht vergessen!

@xyflow/react braucht sein eigenes CSS. Importiere es entweder in der Canvas-Komponente (wie oben) oder global in `app/globals.css`:

```css
/* app/globals.css — NACH den Tailwind-Imports */
@import '@xyflow/react/dist/style.css';
```

> **Tailwind v4 Hinweis:** Falls die React Flow Styles von Tailwinds Reset überschrieben werden, importiere sie NACH dem Tailwind-Import.

---

## Testing-Reihenfolge

Nachdem du alle Dateien erstellt hast, teste in dieser Reihenfolge:

### Test 1: Canvas rendert
- Navigiere zu `/canvas/<eine-canvas-id>` (du brauchst eine existierende Canvas-ID aus Convex)
- Erwartung: Leerer Canvas mit Dot-Background, Controls unten links, MiniMap unten rechts
- Falls 404: Prüfe ob die Route `app/(app)/canvas/[canvasId]/page.tsx` korrekt liegt

### Test 2: Node hinzufügen
- Klicke auf "📌 Notiz" in der Toolbar
- Erwartung: Note-Node erscheint auf dem Canvas
- Prüfe im Convex Dashboard: neuer Eintrag in der `nodes`-Tabelle

### Test 3: Node verschieben
- Ziehe den Node an eine neue Position, lasse los
- Erwartung: Node bleibt an der neuen Position
- Prüfe im Convex Dashboard: `position.x` und `position.y` haben sich aktualisiert

### Test 4: Verbindung erstellen
- Erstelle einen Prompt-Node und einen (leeren) AI-Image-Node
- Ziehe vom Source-Handle (rechts am Prompt) zum Target-Handle (links am AI-Image)
- Erwartung: Edge erscheint als Linie zwischen den Nodes
- Prüfe im Convex Dashboard: neuer Eintrag in der `edges`-Tabelle

### Test 5: Node löschen
- Selektiere einen Node (Klick), drücke `Delete` oder `Backspace`
- Erwartung: Node verschwindet, zugehörige Edges werden ebenfalls entfernt
- Prüfe im Convex Dashboard: Node und Edges sind gelöscht

---

## Bekannte Fallstricke

### 1. `nodeTypes` innerhalb der Komponente definiert
→ React Flow re-rendert ALLE Nodes bei jedem State-Update. Die Map MUSS in einer eigenen Datei liegen.

### 2. React Flow CSS fehlt
→ Nodes sind unsichtbar oder falsch positioniert. Import von `@xyflow/react/dist/style.css` ist Pflicht.

### 3. Convex-Sync während Drag
→ Wenn Convex einen neuen Wert pusht während der User draggt, springt der Node zur alten Position zurück. Die `isDragging`-Ref verhindert das.

### 4. Handle-Styling
→ Die Standard-Handles von React Flow sind winzig und dunkel. Die `!`-Klassen in Tailwind erzwingen Custom-Styling über die React Flow Defaults.

### 5. Batch-Drag (mehrere Nodes selektiert)
→ `onNodeDragStop` feuert nur für den primär gedraggten Node. Für Batch-Moves nutze `onSelectionDragStop` oder `batchMove` Mutation.

---

## Nächste Schritte (nach Schritt 1–3)

- **Schritt 4:** Sidebar mit Node-Palette + dnd-kit (Drag von Sidebar auf Canvas)
- **Schritt 5:** Inline-Editing (Text direkt im Node bearbeiten → `updateData` Mutation)
- **Schritt 6:** Bild-Upload (Convex File Storage + Image-Node)
- **Schritt 7:** OpenRouter-Integration (Prompt → KI-Bild-Generierung)
- **Schritt 8:** Node-Status-Modell visuell ausbauen (Shimmer, Progress, Error)
