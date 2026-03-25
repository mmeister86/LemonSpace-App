import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth/minimal";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

// Component Client — stellt Adapter, Helper und Auth-Methoden bereit
export const authComponent = createClient<DataModel>(components.betterAuth);

// Auth Factory — wird pro Request aufgerufen (Convex ist request-scoped)
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Später auf true → useSend Integration
    },
    plugins: [
      convex({ authConfig }),
    ],
  });
};

// Helper Query: Aktuellen User abrufen (nutzbar in Frontend via useQuery)
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
