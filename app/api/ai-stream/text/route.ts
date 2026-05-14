import { generateText, streamText, type ModelMessage } from "ai";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getOpenRouterModel } from "@/lib/ai-stream/openrouter-provider";
import { parseTextStreamRequest } from "@/lib/ai-stream/stream-protocol";
import { buildAiTextStreamMessages } from "@/lib/ai-stream/text-messages";
import { DEFAULT_AI_TEXT_MODEL_ID, getAiTextModel } from "@/lib/ai-text-models";
import { fetchAuthAction, getAuthUser } from "@/lib/auth-server";
import {
  RATE_LIMIT_POLICIES,
  applyRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 60;

async function getRateLimitUserId(): Promise<string | undefined> {
  try {
    return (await getAuthUser())?.id;
  } catch {
    return undefined;
  }
}

async function buildMessagesForPreparedTextRun(prepared: {
  modelId: string;
  instruction?: string;
  inputText?: string;
  visualMode?: "context" | "describe";
  visualReferences?: Array<{
    sourceNodeId: string;
    sourceType: "image" | "asset" | "ai-image" | "render";
    label: string;
    imageUrl: string;
  }>;
  modelSupportsVision?: boolean;
}): Promise<ModelMessage[]> {
  const visualReferences = prepared.visualReferences ?? [];
  if (visualReferences.length === 0 || prepared.modelSupportsVision !== false) {
    return buildAiTextStreamMessages({
      instruction: prepared.instruction,
      inputText: prepared.inputText,
      visualMode: prepared.visualMode,
      visualReferences,
    });
  }

  const fallbackModel = getAiTextModel(DEFAULT_AI_TEXT_MODEL_ID);
  if (!fallbackModel?.supportsVision) {
    throw new Error("The selected model cannot read images and no vision fallback model is available");
  }

  const caption = await generateText({
    model: getOpenRouterModel(fallbackModel.id),
    messages: buildAiTextStreamMessages({
      instruction: "Translate the attached visual material into concise source notes for a later text generation step.",
      visualMode: "describe",
      visualReferences,
    }),
  });
  const captionText = caption.text.trim();
  if (!captionText) {
    throw new Error("Vision fallback returned an empty image description");
  }

  return buildAiTextStreamMessages({
    instruction: prepared.instruction,
    inputText: [
      prepared.inputText?.trim(),
      `Image descriptions:\n${captionText}`,
    ].filter(Boolean).join("\n\n"),
  });
}

export async function POST(request: Request): Promise<Response> {
  const decision = await applyRateLimit({
    policy: RATE_LIMIT_POLICIES["ai-stream:text"],
    request,
    userId: await getRateLimitUserId(),
  });
  if (!decision.allowed) {
    return rateLimitResponse(decision);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const parsed = parseTextStreamRequest(json);
  if (!parsed.ok) {
    return new NextResponse(parsed.message, { status: parsed.status });
  }

  const prepared = await fetchAuthAction(api.ai.prepareTextStream, {
    canvasId: parsed.value.canvasId as Id<"canvases">,
    sourceNodeId: parsed.value.sourceNodeId as Id<"nodes">,
    outputNodeId: parsed.value.outputNodeId as Id<"nodes">,
    modelId: parsed.value.modelId,
    instruction: parsed.value.instruction,
    inputText: parsed.value.inputText,
    visualMode: parsed.value.visualMode,
    visualReferences: parsed.value.visualReferences,
  });

  let finalized = false;
  async function finalizeFailure(statusMessage: string): Promise<void> {
    if (finalized) return;
    finalized = true;
    await fetchAuthAction(api.ai.finalizeTextStreamFailure, {
      outputNodeId: prepared.outputNodeId,
      statusMessage,
      reservationId: prepared.reservationId,
      shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
      userId: prepared.userId,
    });
  }

  try {
    const result = streamText({
      model: getOpenRouterModel(prepared.modelId),
      messages: await buildMessagesForPreparedTextRun(prepared),
      onFinish: async ({ text }) => {
        finalized = true;
        await fetchAuthAction(api.ai.finalizeTextStreamSuccess, {
          outputNodeId: prepared.outputNodeId,
          modelId: prepared.modelId,
          instruction: prepared.instruction,
          inputText: prepared.inputText,
          outputText: text,
          reservationId: prepared.reservationId,
          shouldDecrementConcurrency: prepared.shouldDecrementConcurrency,
          userId: prepared.userId,
        });
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI text stream failed";
    await finalizeFailure(message);
    return new NextResponse(message, { status: 500 });
  }
}
