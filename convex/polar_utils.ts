type IdempotencyScope =
  | "topup_paid"
  | "subscription_activated_cycle"
  | "subscription_revoked";

type RegisterWebhookEventArgs = {
  provider: "polar";
  scope: IdempotencyScope;
  idempotencyKey: string;
  userId: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
};

type ExistingEventLookup = {
  provider: "polar";
  idempotencyKey: string;
};

type ExistingEventRecord = {
  _id: string;
};

export type WebhookEventRepo = {
  findByProviderAndKey: (
    lookup: ExistingEventLookup,
  ) => Promise<ExistingEventRecord | null>;
  insert: (args: RegisterWebhookEventArgs & { createdAt: number }) => Promise<void>;
};

export function buildSubscriptionCycleIdempotencyKey(args: {
  polarSubscriptionId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
}): string {
  return `polar:subscription_cycle:${args.polarSubscriptionId}:${args.currentPeriodStart}:${args.currentPeriodEnd}`;
}

export function buildSubscriptionRevokedIdempotencyKey(args: {
  userId: string;
  polarSubscriptionId?: string;
}): string {
  return args.polarSubscriptionId
    ? `polar:subscription_revoked:${args.polarSubscriptionId}`
    : `polar:subscription_revoked:user:${args.userId}`;
}

export function buildTopUpPaidIdempotencyKey(polarOrderId: string): string {
  return `polar:order_paid:${polarOrderId}`;
}

export async function registerWebhookEventOnce(
  repo: WebhookEventRepo,
  args: RegisterWebhookEventArgs,
  now: () => number = Date.now,
): Promise<boolean> {
  const existing = await repo.findByProviderAndKey({
    provider: args.provider,
    idempotencyKey: args.idempotencyKey,
  });

  if (existing) {
    return false;
  }

  await repo.insert({
    ...args,
    createdAt: now(),
  });
  return true;
}
