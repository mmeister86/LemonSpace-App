import { streamText } from "ai";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getOpenRouterModel } from "@/lib/ai-stream/openrouter-provider";
import { parseAgentStreamRequest } from "@/lib/ai-stream/stream-protocol";
import { fetchAuthAction, getAuthUser } from "@/lib/auth-server";
import {
  RATE_LIMIT_POLICIES,
  applyRateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

export const maxDuration = 60;

async function getRateLimitUserId(): Promise<string | undefined> {
  try {
    const user = await getAuthUser();
    return user?.userId ?? user?._id;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  const decision = await applyRateLimit({
    policy: RATE_LIMIT_POLICIES["ai-stream:agent"],
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

  const parsed = parseAgentStreamRequest(json);
  if (!parsed.ok) {
    return new NextResponse(parsed.message, { status: parsed.status });
  }

  const prepared = await fetchAuthAction(api.agents.prepareAgentStream, {
    canvasId: parsed.value.canvasId as Id<"canvases">,
    nodeId: parsed.value.nodeId as Id<"nodes">,
    modelId: parsed.value.modelId,
    locale: parsed.value.locale,
  });

  const result = streamText({
    model: getOpenRouterModel(prepared.modelId),
    messages: prepared.messages,
    onFinish: async ({ text }) => {
      await fetchAuthAction(api.agents.finalizeAgentStreamSummary, {
        nodeId: parsed.value.nodeId as Id<"nodes">,
        outputNodeId: prepared.outputNodeId,
        outputText: text,
      });
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "x-lemonspace-output-node-id": prepared.outputNodeId,
    },
  });
}
