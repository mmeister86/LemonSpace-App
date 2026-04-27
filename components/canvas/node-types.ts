import ImageNode from "./nodes/image-node";
import TextNode from "./nodes/text-node";
import PromptNode from "./nodes/prompt-node";
import VideoPromptNode from "./nodes/video-prompt-node";
import AiImageNode from "./nodes/ai-image-node";
import AiTextNode from "./nodes/ai-text-node";
import AiTextOutputNode from "./nodes/ai-text-output-node";
import AiVideoNode from "./nodes/ai-video-node";
import GroupNode from "./nodes/group-node";
import FrameNode from "./nodes/frame-node";
import NoteNode from "./nodes/note-node";
import CompareNode from "./nodes/compare-node";
import AssetNode from "./nodes/asset-node";
import AssetVideoNode from "./nodes/asset-video-node";
import VideoNode from "./nodes/video-node";
import CurvesNode from "./nodes/curves-node";
import ColorAdjustNode from "./nodes/color-adjust-node";
import LightAdjustNode from "./nodes/light-adjust-node";
import DetailAdjustNode from "./nodes/detail-adjust-node";
import RenderNode from "./nodes/render-node";
import CropNode from "./nodes/crop-node";
import BgRemoveNode from "./nodes/bg-remove-node";
import UpscaleNode from "./nodes/upscale-node";
import StyleTransferNode from "./nodes/style-transfer-node";
import FaceRestoreNode from "./nodes/face-restore-node";
import ChangeCameraNode from "./nodes/change-camera-node";
import AgentNode from "./nodes/agent-node";
import AgentOutputNode from "./nodes/agent-output-node";
import MixerNode from "./nodes/mixer-node";

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
  "video-prompt": VideoPromptNode,
  "ai-image": AiImageNode,
  "ai-text": AiTextNode,
  "ai-text-output": AiTextOutputNode,
  "ai-video": AiVideoNode,
  group: GroupNode,
  frame: FrameNode,
  note: NoteNode,
  compare: CompareNode,
  asset: AssetNode,
  "asset-video": AssetVideoNode,
  video: VideoNode,
  curves: CurvesNode,
  "color-adjust": ColorAdjustNode,
  "light-adjust": LightAdjustNode,
  "detail-adjust": DetailAdjustNode,
  crop: CropNode,
  "bg-remove": BgRemoveNode,
  upscale: UpscaleNode,
  "style-transfer": StyleTransferNode,
  "face-restore": FaceRestoreNode,
  "change-camera": ChangeCameraNode,
  render: RenderNode,
  agent: AgentNode,
  mixer: MixerNode,
  "agent-output": AgentOutputNode,
} as const;
