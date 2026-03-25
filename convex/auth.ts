import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth/minimal";
import { Resend } from "resend";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;
const appUrl = process.env.APP_URL;

// Component Client — stellt Adapter, Helper und Auth-Methoden bereit
export const authComponent = createClient<DataModel>(components.betterAuth);

// Auth Factory — wird pro Request aufgerufen (Convex ist request-scoped)
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, "http://localhost:3000"],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        const verificationUrl = new URL(url);

        if (appUrl) {
          verificationUrl.searchParams.set("callbackURL", `${appUrl}/dashboard`);
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
          console.error("RESEND_API_KEY is not set — skipping verification email");
          return;
        }

        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
          from: "LemonSpace <noreply@lemonspace.io>",
          to: user.email,
          subject: "Bestätige deine E-Mail-Adresse",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2>Willkommen bei LemonSpace 🍋</h2>
              <p>Hi ${user.name || ""},</p>
              <p>Klicke auf den Button, um deine E-Mail-Adresse zu bestätigen:</p>
              <a href="${verificationUrl.toString()}"
                 style="display: inline-block; background: #facc15; color: #1a1a1a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
                E-Mail bestätigen
              </a>
              <p style="color: #666; font-size: 13px;">
                Falls der Button nicht funktioniert, kopiere diesen Link:<br/>
                <a href="${verificationUrl.toString()}">${verificationUrl.toString()}</a>
              </p>
            </div>
          `,
        });

        if (error) {
          console.error("Failed to send verification email:", error);
        }
      },
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
    return authComponent.getAuthUser(ctx);
  },
});

export const safeGetAuthUser = query({
  args: {},
  handler: async (ctx) => {
    try {
      return await authComponent.getAuthUser(ctx);
    } catch {
      return null;
    }
  },
});
