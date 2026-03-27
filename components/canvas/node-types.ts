import ImageNode from "./nodes/image-node";
import TextNode from "./nodes/text-node";
import PromptNode from "./nodes/prompt-node";
import AiImageNode from "./nodes/ai-image-node";
import GroupNode from "./nodes/group-node";
import FrameNode from "./nodes/frame-node";
import NoteNode from "./nodes/note-node";
import CompareNode from "./nodes/compare-node";
import AssetNode from "./nodes/asset-node";

/**
 * Node-Type-Map für React Flow.
 *
 * WICHTIG: Diese Map MUSS außerhalb jeder React-Komponente definiert sein.
 * Sonst erstellt React bei jedem Render ein neues Objekt und React Flow
 * re-rendert alle Nodes.
 */
export const nodeTypes = {
  image: ImageNode,
  text: TextNode,
  prompt: PromptNode,
  "ai-image": AiImageNode,
  group: GroupNode,
  frame: FrameNode,
  note: NoteNode,
  compare: CompareNode,
  asset: AssetNode,
} as const;
