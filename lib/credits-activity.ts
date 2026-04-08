type CreditTransactionType =
  | "subscription"
  | "topup"
  | "usage"
  | "reservation"
  | "refund";

type CreditTransactionStatus = "committed" | "reserved" | "released" | "failed";

export type CreditTransactionLike = {
  _creationTime: number;
  type: CreditTransactionType;
  status: CreditTransactionStatus;
  amount: number;
};

export type CreditActivityPoint = {
  day: string;
  usage: number;
  activity: number;
  available: number;
};

const MIN_USAGE_DOMAIN_MAX = 8;
const EMPTY_USAGE_DOMAIN_MAX = 10;
const USAGE_HEADROOM_RATIO = 0.2;
const MIN_USAGE_HEADROOM = 2;

const TX_PRIORITY: Record<CreditTransactionType, number> = {
  usage: 0,
  reservation: 1,
  refund: 2,
  topup: 3,
  subscription: 4,
};

const STATUS_PRIORITY: Record<CreditTransactionStatus, number> = {
  committed: 0,
  reserved: 1,
  released: 2,
  failed: 3,
};

export function formatCredits(value: number, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} Cr`;
}

export function prioritizeRecentCreditTransactions<T extends CreditTransactionLike>(
  transactions: readonly T[],
  limit: number,
) {
  return [...transactions]
    .sort((a, b) => {
      const primary = TX_PRIORITY[a.type] - TX_PRIORITY[b.type];
      if (primary !== 0) {
        return primary;
      }

      const statusOrder = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (statusOrder !== 0) {
        return statusOrder;
      }

      return b._creationTime - a._creationTime;
    })
    .slice(0, Math.max(0, limit));
}

export function buildCreditsActivitySeries<T extends CreditTransactionLike>(
  transactions: readonly T[],
  availableCredits: number,
  locale: string,
  maxPoints = 7,
): CreditActivityPoint[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  });

  const byDay = new Map<
    string,
    {
      date: Date;
      usage: number;
      activity: number;
    }
  >();

  for (const tx of transactions) {
    const date = new Date(tx._creationTime);
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    const current = byDay.get(key) ?? { date, usage: 0, activity: 0 };
    const absAmount = Math.abs(tx.amount);

    if (tx.type === "usage" && tx.status === "committed") {
      current.usage += absAmount;
      current.activity += absAmount;
    } else if (
      tx.type === "reservation" &&
      (tx.status === "reserved" || tx.status === "released")
    ) {
      current.activity += absAmount;
    }

    byDay.set(key, current);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[1].date.getTime() - b[1].date.getTime())
    .slice(-Math.max(1, maxPoints))
    .map(([, point]) => ({
      day: formatter.format(point.date).replace(/\.$/, ""),
      usage: point.usage,
      activity: point.activity,
      available: availableCredits,
    }));
}

export function calculateUsageActivityDomain(
  points: readonly Pick<CreditActivityPoint, "usage" | "activity">[],
): [number, number] {
  const maxUsageOrActivity = points.reduce((maxValue, point) => {
    return Math.max(maxValue, point.usage, point.activity);
  }, 0);

  if (maxUsageOrActivity <= 0) {
    return [0, EMPTY_USAGE_DOMAIN_MAX];
  }

  const headroom = Math.max(
    MIN_USAGE_HEADROOM,
    Math.ceil(maxUsageOrActivity * USAGE_HEADROOM_RATIO),
  );

  return [0, Math.max(MIN_USAGE_DOMAIN_MAX, maxUsageOrActivity + headroom)];
}
