import { QueryCtx, MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";

type SafeAuthUser = NonNullable<
  Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>
>;

/** Better-Auth-User mit für die App garantierter userId (Convex-_id als Fallback). */
export type AuthUser = Omit<SafeAuthUser, "userId"> & { userId: string };

/**
 * Erfordert einen authentifizierten User und gibt dessen userId zurück.
 * Wirft einen Error wenn nicht eingeloggt — für Mutations und geschützte Queries.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx
): Promise<AuthUser> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    const identity = await ctx.auth.getUserIdentity();
    console.error("[requireAuth] safeGetAuthUser returned null", {
      hasIdentity: Boolean(identity),
      identityIssuer: identity?.issuer ?? null,
      identitySubject: identity?.subject ?? null,
    });
    throw new Error("Unauthenticated");
  }
  const userId = user.userId ?? String(user._id);
  if (!userId) {
    console.error("[requireAuth] safeGetAuthUser returned user without userId", {
      userRecordId: String(user._id),
    });
    throw new Error("Unauthenticated");
  }
  return { ...user, userId };
}

/**
 * Gibt den User zurück oder null — für optionale Auth-Checks (z.B. public Queries).
 */
export async function optionalAuth(ctx: QueryCtx | MutationCtx) {
  return await authComponent.safeGetAuthUser(ctx);
}
