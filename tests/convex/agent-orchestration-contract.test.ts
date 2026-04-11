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
});
