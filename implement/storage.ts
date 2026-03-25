import { mutation } from "./_generated/server";
import { requireAuth } from "./helpers";

/**
 * Generiert eine kurzlebige Upload-URL für Convex File Storage.
 * Der Client POSTet die Datei direkt an diese URL.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
