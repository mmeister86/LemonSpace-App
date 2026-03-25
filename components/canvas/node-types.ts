import type { NodeTypes } from "@xyflow/react";

import AiImageNode from "./nodes/ai-image-node";
import CompareNode from "./nodes/compare-node";
import FrameNode from "./nodes/frame-node";
import GroupNode from "./nodes/group-node";
import ImageNode from "./nodes/image-node";
import NoteNode from "./nodes/note-node";
import PromptNode from "./nodes/prompt-node";
import TextNode from "./nodes/text-node";

export const nodeTypes: NodeTypes = {
  image: ImageNode,
  text: TextNode,
  prompt: PromptNode,
  "ai-image": AiImageNode,
  group: GroupNode,
  frame: FrameNode,
  note: NoteNode,
  compare: CompareNode,
};
