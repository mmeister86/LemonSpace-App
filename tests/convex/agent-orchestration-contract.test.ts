import { describe, expect, it } from "vitest";

import { __testables } from "@/convex/agents";
import { __testables as openrouterTestables } from "@/convex/openrouter";

describe("agent orchestration contract helpers", () => {
  it("builds skeleton output data with rich execution-plan metadata", () => {
    const data = __testables.buildSkeletonOutputData({
      step: {
        id: "step-linkedin",
        title: "LinkedIn Launch",
        channel: "linkedin",
        outputType: "post",
        artifactType: "social-post",
        goal: "Ship launch copy",
        requiredSections: ["hook", "body", "cta"],
        qualityChecks: ["channel-fit", "clear-cta"],
      },
      stepIndex: 1,
      stepTotal: 3,
      definitionVersion: 4,
    });

    expect(data).toMatchObject({
      isSkeleton: true,
      stepId: "step-linkedin",
      stepIndex: 1,
      stepTotal: 3,
      title: "LinkedIn Launch",
      channel: "linkedin",
      outputType: "post",
      artifactType: "social-post",
      requiredSections: ["hook", "body", "cta"],
      qualityChecks: ["channel-fit", "clear-cta"],
      definitionVersion: 4,
    });
    expect(data.previewText).toBe("Draft pending for LinkedIn Launch.");
  });

  it("builds completed output data and derives deterministic legacy body fallback", () => {
    const data = __testables.buildCompletedOutputData({
      step: {
        id: "step-linkedin",
        title: "LinkedIn Launch",
        channel: "linkedin",
        outputType: "post",
        artifactType: "social-post",
        goal: "Ship launch copy",
        requiredSections: ["hook", "body", "cta"],
        qualityChecks: ["channel-fit", "clear-cta"],
      },
      stepIndex: 0,
      stepTotal: 1,
      output: {
        title: "LinkedIn Launch",
        channel: "linkedin",
        artifactType: "social-post",
        previewText: "",
        sections: [
          { id: "hook", label: "Hook", content: "Lead with proof." },
          { id: "cta", label: "CTA", content: "Invite comments." },
        ],
        metadata: { tonalitaet: "freundlich", audience: "SaaS founders" },
        metadataLabels: { tonalitaet: "tonalität", audience: "audience" },
        qualityChecks: [],
        body: "",
      },
    });

    expect(data.isSkeleton).toBe(false);
    expect(data.body).toBe("Hook:\nLead with proof.\n\nCTA:\nInvite comments.");
    expect(data.previewText).toBe("Lead with proof.");
    expect(data.qualityChecks).toEqual(["channel-fit", "clear-cta"]);
    expect(data.metadataLabels).toEqual({ tonalitaet: "tonalität", audience: "audience" });
  });

  it("requires rich execution-step fields in analyze schema", () => {
    const required = __testables.getAnalyzeExecutionStepRequiredFields();
    expect(required).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "channel",
        "outputType",
        "artifactType",
        "goal",
        "requiredSections",
        "qualityChecks",
      ]),
    );
  });

  it("builds provider-safe execute schema without dynamic metadata maps", () => {
    const schema = __testables.buildExecuteSchema(["step-1"]);
    const diagnostics = openrouterTestables.getStructuredSchemaDiagnostics({
      schema,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    });

    const stepOne = (((schema.properties as Record<string, unknown>).stepOutputs as Record<string, unknown>)
      .properties as Record<string, unknown>)["step-1"] as Record<string, unknown>;

    expect(stepOne.required).toContain("metadataEntries");
    expect(stepOne.required).not.toContain("metadata");
    expect(diagnostics.hasAnyOf).toBe(false);
    expect(diagnostics.hasDynamicAdditionalProperties).toBe(false);
  });

  it("resolves persisted summaries consistently across analyze and execute", () => {
    const promptSummary = __testables.resolveExecutionPlanSummary({
      executionPlanSummary: "",
      analysisSummary: "Audience and channels clarified.",
    });
    expect(promptSummary).toBe("Audience and channels clarified.");

    const finalSummary = __testables.resolveFinalExecutionSummary({
      executionSummary: "",
      modelSummary: "Delivered 3 channel drafts.",
      executionPlanSummary: "Plan for 3 outputs.",
      analysisSummary: "Audience and channels clarified.",
    });
    expect(finalSummary).toBe("Delivered 3 channel drafts.");
  });

  it("creates agent edges for Instagram supporting text and prompt nodes", () => {
    const edge = __testables.buildAgentCreatedNodeEdge({
      canvasId: "canvas-1",
      agentNodeId: "agent-1",
      targetNodeId: "text-1",
      targetHandle: undefined,
    });

    expect(edge).toEqual({
      canvasId: "canvas-1",
      sourceNodeId: "agent-1",
      targetNodeId: "text-1",
      sourceHandle: undefined,
      targetHandle: undefined,
    });
  });

  it("creates provenance agent edges for Instagram package nodes", () => {
    const edge = __testables.buildAgentCreatedNodeEdge({
      canvasId: "canvas-1",
      agentNodeId: "agent-1",
      targetNodeId: "mockup-1",
      kind: "provenance",
    });

    expect(edge).toEqual({
      canvasId: "canvas-1",
      sourceNodeId: "agent-1",
      targetNodeId: "mockup-1",
      sourceHandle: undefined,
      targetHandle: undefined,
      kind: "provenance",
    });
  });

  it("keeps a successful agent finalization when post-success cleanup fails", async () => {
    const completeSuccessfulAgentRun =
      __testables.completeSuccessfulAgentRun as unknown as (args: {
        finalizeSuccess: () => Promise<void>;
        cleanupSteps: Array<{ label: string; run: () => Promise<void> }>;
        onCleanupError: (entry: { label: string; error: unknown }) => void;
      }) => Promise<void>;
    const calls: string[] = [];
    const cleanupErrors: string[] = [];

    expect(completeSuccessfulAgentRun).toBeTypeOf("function");

    await expect(
      completeSuccessfulAgentRun({
        finalizeSuccess: async () => {
          calls.push("finalize");
        },
        cleanupSteps: [
          {
            label: "commit credits",
            run: async () => {
              calls.push("commit");
              throw new Error("commit timeout");
            },
          },
          {
            label: "decrement concurrency",
            run: async () => {
              calls.push("decrement");
              throw new Error("concurrency timeout");
            },
          },
        ],
        onCleanupError: ({ label }) => {
          cleanupErrors.push(label);
        },
      }),
    ).resolves.toBeUndefined();

    expect(calls).toEqual(["finalize", "commit", "decrement"]);
    expect(cleanupErrors).toEqual(["commit credits", "decrement concurrency"]);
  });

  it("propagates finalization failures before post-success cleanup runs", async () => {
    const completeSuccessfulAgentRun =
      __testables.completeSuccessfulAgentRun as unknown as (args: {
        finalizeSuccess: () => Promise<void>;
        cleanupSteps: Array<{ label: string; run: () => Promise<void> }>;
      }) => Promise<void>;
    const calls: string[] = [];

    expect(completeSuccessfulAgentRun).toBeTypeOf("function");

    await expect(
      completeSuccessfulAgentRun({
        finalizeSuccess: async () => {
          calls.push("finalize");
          throw new Error("tool result missing");
        },
        cleanupSteps: [
          {
            label: "commit credits",
            run: async () => {
              calls.push("commit");
            },
          },
        ],
      }),
    ).rejects.toThrow("tool result missing");

    expect(calls).toEqual(["finalize"]);
  });

  it("allows render mockup bindings while requiring URL-backed types to have media data", () => {
    const isMockupVisualSourceReady =
      __testables.isMockupVisualSourceReady as unknown as (node: {
        type?: string;
        data?: unknown;
      } | null) => boolean;

    expect(isMockupVisualSourceReady).toBeTypeOf("function");
    expect(
      isMockupVisualSourceReady({
        type: "render",
        data: { format: "png", outputResolution: "original" },
      }),
    ).toBe(true);
    expect(
      isMockupVisualSourceReady({
        type: "render",
        data: { lastUploadStorageId: "storage-render-1" },
      }),
    ).toBe(true);
    expect(
      isMockupVisualSourceReady({
        type: "image",
        data: {},
      }),
    ).toBe(false);
    expect(
      isMockupVisualSourceReady({
        type: "image",
        data: { storageId: "storage-image-1" },
      }),
    ).toBe(true);
  });
});
