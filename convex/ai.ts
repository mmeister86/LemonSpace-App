/**
 * Onboarding note:
 * Orchestrates asynchronous AI image and video jobs. Status mutations, credit reservations, storage writes, and provider retries must stay ordered so failed jobs release credits safely.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "./_generated/server";
import { buildNodeExecutingPatch } from "./node_status_helpers";
import {
  defineFinalizeImageFailure,
  defineFinalizeImageSuccess,
  defineGenerateAndStoreImage,
  defineGenerateImage,
  defineMarkNodeRetry,
  defineProcessImageGeneration,
} from "./ai_image_pipeline";
import {
  defineFinalizeTextFailure,
  defineFinalizeTextStreamFailure,
  defineFinalizeTextStreamSuccess,
  defineFinalizeTextSuccess,
  defineGenerateText,
  definePrepareTextStream,
  defineProcessTextGeneration,
} from "./ai_text_pipeline";
import {
  defineFinalizeVideoFailure,
  defineFinalizeVideoSuccess,
  defineGenerateVideo,
  defineMarkVideoPollingRetry,
  definePollVideoTask,
  defineProcessVideoGeneration,
  defineSetVideoTaskInfo,
} from "./ai_video_pipeline";

export const markNodeExecuting = internalMutation({
  args: {
    nodeId: v.id("nodes"),
  },
  handler: async (ctx, { nodeId }) => {
    await ctx.db.patch(nodeId, buildNodeExecutingPatch());
  },
});

export const markNodeRetry = defineMarkNodeRetry(internalMutation);
export const finalizeImageSuccess = defineFinalizeImageSuccess(internalMutation);
export const finalizeImageFailure = defineFinalizeImageFailure(internalMutation);
export const generateAndStoreImage = defineGenerateAndStoreImage(internalAction);
export const processImageGeneration = defineProcessImageGeneration(internalAction);
export const generateImage = defineGenerateImage(action);

export const finalizeTextSuccess = defineFinalizeTextSuccess(internalMutation);
export const finalizeTextFailure = defineFinalizeTextFailure(internalMutation);
export const processTextGeneration = defineProcessTextGeneration(internalAction);
export const generateText = defineGenerateText(action);
export const prepareTextStream = definePrepareTextStream(action);
export const finalizeTextStreamSuccess = defineFinalizeTextStreamSuccess(action);
export const finalizeTextStreamFailure = defineFinalizeTextStreamFailure(action);

export const setVideoTaskInfo = defineSetVideoTaskInfo(internalMutation);
export const markVideoPollingRetry = defineMarkVideoPollingRetry(internalMutation);
export const finalizeVideoSuccess = defineFinalizeVideoSuccess(internalMutation);
export const finalizeVideoFailure = defineFinalizeVideoFailure(internalMutation);
export const processVideoGeneration = defineProcessVideoGeneration(internalAction);
export const pollVideoTask = definePollVideoTask(internalAction);
export const generateVideo = defineGenerateVideo(action);
