import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(rootDir, path), "utf8");
}

describe("AI pipeline module boundaries", () => {
  it("keeps ai.ts as the public export wrapper for separated pipeline modules", () => {
    const aiSource = readProjectFile("convex/ai.ts");
    const imageSource = readProjectFile("convex/ai_image_pipeline.ts");
    const textSource = readProjectFile("convex/ai_text_pipeline.ts");
    const videoSource = readProjectFile("convex/ai_video_pipeline.ts");

    expect(aiSource).toContain("./ai_image_pipeline");
    expect(aiSource).toContain("./ai_text_pipeline");
    expect(aiSource).toContain("./ai_video_pipeline");
    expect(aiSource).not.toContain("./openrouter");
    expect(aiSource).not.toContain("./freepik");
    expect(aiSource).not.toContain("../lib/ai-text-models");
    expect(aiSource).not.toContain("../lib/ai-video-models");

    expect(imageSource).toContain("generateImageViaOpenRouter");
    expect(imageSource).not.toContain("generateStructuredObjectViaOpenRouter");
    expect(imageSource).not.toContain("createVideoTask");

    expect(textSource).toContain("generateStructuredObjectViaOpenRouter");
    expect(textSource).toContain("definePrepareTextStream");
    expect(textSource).toContain("defineFinalizeTextStreamSuccess");
    expect(textSource).toContain("defineFinalizeTextStreamFailure");
    expect(textSource).not.toContain("generateImageViaOpenRouter");
    expect(textSource).not.toContain("createVideoTask");
    expect(aiSource).toContain("prepareTextStream");
    expect(aiSource).toContain("finalizeTextStreamSuccess");
    expect(aiSource).toContain("finalizeTextStreamFailure");

    expect(videoSource).toContain("createVideoTask");
    expect(videoSource).toContain("pollVideoTask");
    expect(videoSource).not.toContain("generateImageViaOpenRouter");
    expect(videoSource).not.toContain("generateStructuredObjectViaOpenRouter");
  });
});
