/**
 * Onboarding note:
 * Shared TypeScript utility for agent harness. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type AgentHarnessMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: AgentHarnessToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
    };

export type AgentHarnessTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AgentHarnessToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export type AgentHarnessModelResponse = {
  content: string;
  toolCalls: AgentHarnessToolCall[];
};

export type AgentHarnessParsedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentHarnessToolResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type AgentHarnessCompletedToolResult = {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type AgentHarnessLoopResult<TFinal> = {
  final: TFinal;
  messages: AgentHarnessMessage[];
  toolResults: AgentHarnessCompletedToolResult[];
};

function parseToolArguments(call: AgentHarnessToolCall): Record<string, unknown> {
  const raw = call.argumentsJson.trim();
  if (raw === "") {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Tool ${call.name} arguments must be a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

function serializeToolResult(result: AgentHarnessToolResult): string {
  return JSON.stringify({
    ok: result.ok,
    ...(result.result !== undefined ? { result: result.result } : {}),
    ...(result.error ? { error: result.error } : {}),
  });
}

export async function runAgentHarnessLoop<TFinal>(args: {
  initialMessages: AgentHarnessMessage[];
  tools: AgentHarnessTool[];
  maxRounds: number;
  callModel: (
    messages: AgentHarnessMessage[],
    tools: AgentHarnessTool[],
  ) => Promise<AgentHarnessModelResponse>;
  executeTool: (call: AgentHarnessParsedToolCall) => Promise<AgentHarnessToolResult>;
  parseFinal: (content: string) => TFinal;
}): Promise<AgentHarnessLoopResult<TFinal>> {
  const allowedToolNames = new Set(args.tools.map((tool) => tool.name));
  const messages = [...args.initialMessages];
  const toolResults: AgentHarnessCompletedToolResult[] = [];

  for (let round = 0; round < args.maxRounds; round += 1) {
    const response = await args.callModel(messages, args.tools);
    const toolCalls = response.toolCalls;

    if (toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: response.content,
      });
      return {
        final: args.parseFinal(response.content),
        messages,
        toolResults,
      };
    }

    messages.push({
      role: "assistant",
      content: response.content,
      toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (!allowedToolNames.has(toolCall.name)) {
        throw new Error(`Tool ${toolCall.name} is not allowed`);
      }

      const parsedCall: AgentHarnessParsedToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        arguments: parseToolArguments(toolCall),
      };
      const result = await args.executeTool(parsedCall);

      toolResults.push({
        toolCallId: parsedCall.id,
        toolName: parsedCall.name,
        arguments: parsedCall.arguments,
        ok: result.ok,
        ...(result.result !== undefined ? { result: result.result } : {}),
        ...(result.error ? { error: result.error } : {}),
      });
      messages.push({
        role: "tool",
        toolCallId: parsedCall.id,
        name: parsedCall.name,
        content: serializeToolResult(result),
      });
    }
  }

  throw new Error("Agent harness exceeded max rounds");
}
