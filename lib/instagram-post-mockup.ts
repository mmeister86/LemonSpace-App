/**
 * Onboarding note:
 * Resolves Instagram mockup preview props from Canvas graph bindings. Keep this pure so the canvas node, tests, and future exports share the same behavior.
 */

import {
  editorJsDataToPlainText,
  normalizeTextNodeRichText,
} from "@/lib/canvas-rich-text";
import type {
  CanvasGraphNodeLike,
  CanvasGraphSnapshot,
} from "@/lib/canvas-render-preview";

export const INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE = "visual-in";
export const INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE = "caption-in";
export const INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE = "hashtags-in";
export const INSTAGRAM_POST_MOCKUP_CTA_HANDLE = "cta-in";
export const INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE = "alt-text-in";
export const INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE = "visual-prompt-in";

export const INSTAGRAM_POST_MOCKUP_TARGET_HANDLES = [
  INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
  INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
  INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
  INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
  INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
] as const;

export type InstagramPostMockupTargetHandle =
  (typeof INSTAGRAM_POST_MOCKUP_TARGET_HANDLES)[number];

export type InstagramPostMockupSnapshot = {
  username?: string;
  location?: string;
  profileImageUrl?: string;
  imageUrl?: string;
  likesCount?: number;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  altText?: string;
  visualPrompt?: string;
};

export type ResolvedInstagramPostMockup = {
  post: {
    username: string;
    location?: string;
    profileImageUrl?: string;
    imageUrl?: string;
    imageAlt?: string;
    isLiked: boolean;
    likesCount: number;
    caption: string;
    hashtags: string[];
  };
  fields: {
    caption: string;
    cta: string;
    altText: string;
    visualPrompt: string;
  };
  degradedFields: string[];
  sourceNodeIds: string[];
};

type NodeDataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is NodeDataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringListValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function snapshotFromData(data: unknown): InstagramPostMockupSnapshot {
  if (!isRecord(data)) {
    return {};
  }

  const rawSnapshot = isRecord(data.snapshot) ? data.snapshot : {};
  const legacyPost = isRecord(data.instagramPost) ? data.instagramPost : {};
  const syntheticPreviewFields = stringListValue(data.syntheticPreviewFields);
  const imageUrlIsSynthetic = syntheticPreviewFields.includes("imageUrl");
  const profileImageUrlIsSynthetic = syntheticPreviewFields.includes("profileImageUrl");
  return {
    username: stringValue(rawSnapshot.username) || stringValue(legacyPost.username),
    location: stringValue(rawSnapshot.location) || stringValue(legacyPost.location),
    profileImageUrl: profileImageUrlIsSynthetic
      ? ""
      : stringValue(rawSnapshot.profileImageUrl) || stringValue(legacyPost.profileImageUrl),
    imageUrl: imageUrlIsSynthetic
      ? ""
      : stringValue(rawSnapshot.imageUrl) || stringValue(legacyPost.imageUrl),
    likesCount: numberValue(rawSnapshot.likesCount, numberValue(legacyPost.likesCount, 128)),
    caption: stringValue(rawSnapshot.caption) || stringValue(legacyPost.caption),
    hashtags:
      stringListValue(rawSnapshot.hashtags).length > 0
        ? stringListValue(rawSnapshot.hashtags)
        : stringListValue(legacyPost.hashtags),
    cta: stringValue(rawSnapshot.cta),
    altText: stringValue(rawSnapshot.altText),
    visualPrompt: stringValue(rawSnapshot.visualPrompt),
  };
}

function sourceNodeForHandle(args: {
  graph: CanvasGraphSnapshot;
  nodeId: string;
  handle: InstagramPostMockupTargetHandle;
}): CanvasGraphNodeLike | null {
  const incoming = args.graph.incomingEdgesByTarget.get(args.nodeId) ?? [];
  const edge = incoming.find((candidate) => candidate.targetHandle === args.handle);
  return edge ? args.graph.nodesById.get(edge.source) ?? null : null;
}

function hasIncomingHandle(args: {
  graph: CanvasGraphSnapshot;
  nodeId: string;
  handle: InstagramPostMockupTargetHandle;
}): boolean {
  const incoming = args.graph.incomingEdgesByTarget.get(args.nodeId) ?? [];
  return incoming.some((edge) => edge.targetHandle === args.handle);
}

function textFromNode(node: CanvasGraphNodeLike | null): string {
  if (!node || !isRecord(node.data)) {
    return "";
  }

  if (node.type === "ai-text-output") {
    return stringValue(node.data.outputText) || stringValue(node.data.content);
  }

  if (node.type === "prompt") {
    return stringValue(node.data.prompt) || stringValue(node.data.content);
  }

  return editorJsDataToPlainText(normalizeTextNodeRichText(node.data));
}

function textForHandle(args: {
  graph: CanvasGraphSnapshot;
  nodeId: string;
  handle: InstagramPostMockupTargetHandle;
  fallback?: string;
}): string {
  if (!hasIncomingHandle(args)) {
    return args.fallback ?? "";
  }

  return textFromNode(sourceNodeForHandle(args));
}

function imageUrlFromNode(node: CanvasGraphNodeLike | null): string {
  if (!node || !isRecord(node.data)) {
    return "";
  }

  return (
    stringValue(node.data.url) ||
    stringValue(node.data.imageUrl) ||
    stringValue(node.data.previewUrl) ||
    stringValue(node.data.lastUploadUrl)
  );
}

export function normalizeInstagramHashtags(value: unknown): string[] {
  const rawTokens = Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? entry.split(/[\s,]+/) : []))
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawToken of rawTokens) {
    const token = rawToken.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!token) {
      continue;
    }

    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(`#${token}`);
  }

  return normalized;
}

function composeCaption(caption: string, cta: string): string {
  if (!caption) {
    return cta;
  }
  if (!cta || caption.includes(cta)) {
    return caption;
  }
  return `${caption}\n\n${cta}`;
}

function degradedFieldsFor(args: {
  graph: CanvasGraphSnapshot;
  nodeId: string;
}): string[] {
  const required: Array<[InstagramPostMockupTargetHandle, string]> = [
    [INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE, "visual"],
    [INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE, "caption"],
    [INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE, "hashtags"],
  ];

  return required
    .filter(([handle]) => !hasIncomingHandle({ ...args, handle }))
    .map(([, field]) => field);
}

export function resolveInstagramPostMockup(args: {
  nodeId: string;
  graph: CanvasGraphSnapshot;
  data?: unknown;
}): ResolvedInstagramPostMockup {
  const node = args.graph.nodesById.get(args.nodeId);
  const snapshot = snapshotFromData(args.data ?? node?.data);
  const visualNode = sourceNodeForHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  });
  const caption = textForHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_CAPTION_HANDLE,
    fallback: snapshot.caption,
  });
  const cta = textForHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_CTA_HANDLE,
    fallback: snapshot.cta,
  });
  const altText = textForHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_ALT_TEXT_HANDLE,
    fallback: snapshot.altText,
  });
  const visualPrompt = textForHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_VISUAL_PROMPT_HANDLE,
    fallback: snapshot.visualPrompt,
  });
  const hashtagsConnected = hasIncomingHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
  });
  const resolvedHashtags = hashtagsConnected
    ? normalizeInstagramHashtags(
        textForHandle({
          graph: args.graph,
          nodeId: args.nodeId,
          handle: INSTAGRAM_POST_MOCKUP_HASHTAGS_HANDLE,
        }),
      )
    : normalizeInstagramHashtags(snapshot.hashtags ?? []);
  const visualConnected = hasIncomingHandle({
    graph: args.graph,
    nodeId: args.nodeId,
    handle: INSTAGRAM_POST_MOCKUP_VISUAL_HANDLE,
  });
  const liveImageUrl = visualConnected ? imageUrlFromNode(visualNode) : "";
  const imageUrl = liveImageUrl || snapshot.imageUrl;
  const degradedFields = degradedFieldsFor({ graph: args.graph, nodeId: args.nodeId });
  if (
    visualConnected &&
    visualNode?.type !== "render" &&
    visualNode?.type !== "crop" &&
    !liveImageUrl &&
    !imageUrl &&
    !degradedFields.includes("visual")
  ) {
    degradedFields.push("visual");
  }

  return {
    post: {
      username: snapshot.username || "lemonspace",
      ...(snapshot.location ? { location: snapshot.location } : {}),
      ...(snapshot.profileImageUrl ? { profileImageUrl: snapshot.profileImageUrl } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(altText ? { imageAlt: altText } : {}),
      isLiked: true,
      likesCount: numberValue(snapshot.likesCount, 128),
      caption: composeCaption(caption, cta),
      hashtags: resolvedHashtags,
    },
    fields: {
      caption,
      cta,
      altText,
      visualPrompt,
    },
    degradedFields,
    sourceNodeIds: visualNode ? [visualNode.id] : [],
  };
}
