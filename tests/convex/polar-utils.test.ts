import { describe, expect, it } from "vitest";
import {
  buildSubscriptionCycleIdempotencyKey,
  buildSubscriptionRevokedIdempotencyKey,
  buildTopUpPaidIdempotencyKey,
  registerWebhookEventOnce,
  type WebhookEventRepo,
} from "@/convex/polar-utils";

describe("polar idempotency helpers", () => {
  it("builds stable idempotency keys", () => {
    expect(
      buildSubscriptionCycleIdempotencyKey({
        polarSubscriptionId: "sub_123",
        currentPeriodStart: 100,
        currentPeriodEnd: 200,
      }),
    ).toBe("polar:subscription_cycle:sub_123:100:200");

    expect(
      buildSubscriptionRevokedIdempotencyKey({
        userId: "user_1",
        polarSubscriptionId: "sub_123",
      }),
    ).toBe("polar:subscription_revoked:sub_123");

    expect(
      buildSubscriptionRevokedIdempotencyKey({
        userId: "user_1",
      }),
    ).toBe("polar:subscription_revoked:user:user_1");

    expect(buildTopUpPaidIdempotencyKey("order_77")).toBe("polar:order_paid:order_77");
  });

  it("dedupes repeated webhook events by provider/key", async () => {
    const seen = new Set<string>();
    let inserted = 0;
    const repo: WebhookEventRepo = {
      findByProviderAndKey: async ({ provider, idempotencyKey }) => {
        const key = `${provider}:${idempotencyKey}`;
        return seen.has(key) ? { _id: "evt_1" } : null;
      },
      insert: async ({ provider, idempotencyKey }) => {
        seen.add(`${provider}:${idempotencyKey}`);
        inserted += 1;
      },
    };

    const args = {
      provider: "polar" as const,
      scope: "topup_paid" as const,
      idempotencyKey: "polar:order_paid:order_1",
      userId: "user_1",
      polarOrderId: "order_1",
    };

    await expect(registerWebhookEventOnce(repo, args, () => 123)).resolves.toBe(true);
    await expect(registerWebhookEventOnce(repo, args, () => 123)).resolves.toBe(false);
    expect(inserted).toBe(1);
  });
});
