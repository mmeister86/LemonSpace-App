import { streamText } from "ai";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getOpenRouterModel } from "@/lib/ai-stream/openrouter-provider";
import { parseTextStreamRequest } from "@/lib/ai-stream/stream-protocol";
import { buildAiTextStreamMessages } from "@/lib/ai-stream/text-messages";
import { fetchAuthAction } from "@/lib/auth-server";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
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
      messages: buildAiTextStreamMessages({
        instruction: prepared.instruction,
        inputText: prepared.inputText,
      }),
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
