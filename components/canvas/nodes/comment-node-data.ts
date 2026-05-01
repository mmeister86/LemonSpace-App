/**
 * Onboarding note:
 * Renders and manages the Canvas comment node data node. Keep node-local UI state separate from persisted node data and use shared wrappers/handles for policy parity.
 */

export type CommentTextToken = {
  kind: "text";
  text: string;
};

export type CommentMentionToken = {
  kind: "mention";
  label: string;
  userId?: string;
};

export type CommentContentToken = CommentTextToken | CommentMentionToken;

export type CommentContentBlock = {
  id: string;
  type: "paragraph";
  tokens: CommentContentToken[];
};

export type CommentContentData = {
  version: 1;
  blocks: CommentContentBlock[];
};

export type CommentReplyData = {
  id: string;
  content: CommentContentData;
  createdAt: number;
  updatedAt: number;
  authorId?: string;
  authorName?: string;
};

export type CommentNodeData = {
  resolved: boolean;
  content: CommentContentData;
  replies: CommentReplyData[];
  _status?: string;
  _statusMessage?: string;
  [key: string]: unknown;
};

const ROOT_BLOCK_ID = "comment-root";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeToken(value: unknown): CommentContentToken | null {
  if (!isRecord(value)) return null;

  if (value.kind === "text") {
    return { kind: "text", text: typeof value.text === "string" ? value.text : "" };
  }

  if (value.kind === "mention" && typeof value.label === "string" && value.label.length > 0) {
    return {
      kind: "mention",
      label: value.label,
      ...(typeof value.userId === "string" && value.userId.length > 0
        ? { userId: value.userId }
        : {}),
    };
  }

  return null;
}

export function createCommentContentFromText(text: string): CommentContentData {
  return {
    version: 1,
    blocks: [
      {
        id: ROOT_BLOCK_ID,
        type: "paragraph",
        tokens: text.length > 0 ? [{ kind: "text", text }] : [],
      },
    ],
  };
}

export function createEmptyCommentNodeData(): CommentNodeData {
  return {
    resolved: false,
    content: createCommentContentFromText(""),
    replies: [],
  };
}

export function commentContentToPlainText(content: CommentContentData): string {
  return content.blocks
    .map((block) =>
      block.tokens
        .map((token) => (token.kind === "mention" ? `@${token.label}` : token.text))
        .join(""),
    )
    .join("\n");
}

export function normalizeCommentContent(value: unknown): CommentContentData {
  if (typeof value === "string") {
    return createCommentContentFromText(value);
  }

  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.blocks)) {
    return createCommentContentFromText("");
  }

  const blocks = value.blocks
    .map((block): CommentContentBlock | null => {
      if (!isRecord(block) || block.type !== "paragraph" || !Array.isArray(block.tokens)) {
        return null;
      }

      return {
        id: typeof block.id === "string" && block.id.length > 0 ? block.id : ROOT_BLOCK_ID,
        type: "paragraph",
        tokens: block.tokens.map(normalizeToken).filter((token): token is CommentContentToken => token !== null),
      };
    })
    .filter((block): block is CommentContentBlock => block !== null);

  return {
    version: 1,
    blocks: blocks.length > 0 ? blocks : createCommentContentFromText("").blocks,
  };
}

function normalizeReply(value: unknown): CommentReplyData | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) {
    return null;
  }

  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
    ? value.createdAt
    : Date.now();
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
    ? value.updatedAt
    : createdAt;

  return {
    id: value.id,
    content: normalizeCommentContent(value.content),
    createdAt,
    updatedAt,
    ...(typeof value.authorId === "string" && value.authorId.length > 0
      ? { authorId: value.authorId }
      : {}),
    ...(typeof value.authorName === "string" && value.authorName.length > 0
      ? { authorName: value.authorName }
      : {}),
  };
}

export function normalizeCommentNodeData(value: unknown): CommentNodeData {
  if (!isRecord(value)) {
    return createEmptyCommentNodeData();
  }

  return {
    resolved: value.resolved === true,
    content: normalizeCommentContent(value.content),
    replies: Array.isArray(value.replies)
      ? value.replies.map(normalizeReply).filter((reply): reply is CommentReplyData => reply !== null)
      : [],
  };
}

export function stripCommentRuntimeFields<TData extends Record<string, unknown>>(
  data: TData,
): Omit<TData, "_status" | "_statusMessage"> {
  const { _status, _statusMessage, ...persisted } = data;
  void _status;
  void _statusMessage;
  return persisted;
}
