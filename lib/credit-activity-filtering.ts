/**
 * Onboarding note:
 * Shared TypeScript utility for credit activity filtering. Keep it framework-light and reusable from both frontend and Convex-adjacent code where applicable.
 */

export type CreditActivityDateRange = "all" | "7d" | "30d" | "month" | "custom";
export type CreditActivitySortValue = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "model-asc";

export type CreditActivityItemLike = {
  _creationTime: number;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  model?: string;
  videoMeta?: { model?: string };
};

export type CreditActivitySummary = {
  netCredits: number;
  usageCredits: number;
  entryCount: number;
};

export type CreditActivityViewModel<TItem extends CreditActivityItemLike> = {
  items: TItem[];
  modelOptions: string[];
  page: number;
  summary: CreditActivitySummary;
  totalCount: number;
  totalPages: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_MODEL_LABEL = "Ohne Modell";

const SORT_CONFIG: Record<
  CreditActivitySortValue,
  { sortBy: "date" | "amount" | "model"; sortDirection: "asc" | "desc" }
> = {
  "date-desc": { sortBy: "date", sortDirection: "desc" },
  "date-asc": { sortBy: "date", sortDirection: "asc" },
  "amount-desc": { sortBy: "amount", sortDirection: "desc" },
  "amount-asc": { sortBy: "amount", sortDirection: "asc" },
  "model-asc": { sortBy: "model", sortDirection: "asc" },
};

export function parseCreditActivityDateInput(value: string | undefined, endOfDay: boolean): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getCreditActivityDateBounds({
  dateRange,
  startDate,
  endDate,
  nowMs = Date.now(),
}: {
  dateRange: CreditActivityDateRange;
  startDate?: string;
  endDate?: string;
  nowMs?: number;
}) {
  if (dateRange === "all") {
    return { startMs: null, endMs: null };
  }

  if (dateRange === "7d") {
    return { startMs: nowMs - 7 * DAY_MS, endMs: null };
  }

  if (dateRange === "30d") {
    return { startMs: nowMs - 30 * DAY_MS, endMs: null };
  }

  if (dateRange === "month") {
    const now = new Date(nowMs);
    return {
      startMs: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      endMs: null,
    };
  }

  return {
    startMs: parseCreditActivityDateInput(startDate, false),
    endMs: parseCreditActivityDateInput(endDate, true),
  };
}

export function getCreditActivityModelLabel(item: CreditActivityItemLike) {
  return item.model?.trim() || item.videoMeta?.model?.trim() || NO_MODEL_LABEL;
}

function itemMatchesDateRange(
  item: CreditActivityItemLike,
  bounds: { startMs: number | null; endMs: number | null },
) {
  if (bounds.startMs !== null && item._creationTime < bounds.startMs) {
    return false;
  }

  if (bounds.endMs !== null && item._creationTime > bounds.endMs) {
    return false;
  }

  return true;
}

function compareCreditActivityItems<TItem extends CreditActivityItemLike>(
  left: TItem,
  right: TItem,
  sortValue: CreditActivitySortValue,
  locale: string,
) {
  const sortConfig = SORT_CONFIG[sortValue];
  const direction = sortConfig.sortDirection === "asc" ? 1 : -1;

  if (sortConfig.sortBy === "amount") {
    const amountOrder = Math.abs(left.amount) - Math.abs(right.amount);
    if (amountOrder !== 0) {
      return amountOrder * direction;
    }
  } else if (sortConfig.sortBy === "model") {
    const modelOrder = getCreditActivityModelLabel(left).localeCompare(getCreditActivityModelLabel(right), locale);
    if (modelOrder !== 0) {
      return modelOrder * direction;
    }
  }

  return (left._creationTime - right._creationTime) * direction;
}

export function buildCreditActivityViewModel<TItem extends CreditActivityItemLike>({
  items,
  dateRange,
  startDate,
  endDate,
  selectedModel,
  sortValue,
  page,
  pageSize,
  nowMs,
  locale,
}: {
  items: readonly TItem[];
  dateRange: CreditActivityDateRange;
  startDate?: string;
  endDate?: string;
  selectedModel?: string;
  sortValue: CreditActivitySortValue;
  page: number;
  pageSize: number;
  nowMs?: number;
  locale: string;
}): CreditActivityViewModel<TItem> {
  const dateBounds = getCreditActivityDateBounds({ dateRange, startDate, endDate, nowMs });
  const dateFilteredItems = items.filter((item) => itemMatchesDateRange(item, dateBounds));
  const modelOptions = Array.from(
    new Set(dateFilteredItems.map(getCreditActivityModelLabel).filter((label) => label !== NO_MODEL_LABEL)),
  ).sort((left, right) => left.localeCompare(right, locale));
  const filteredItems = selectedModel
    ? dateFilteredItems.filter((item) => getCreditActivityModelLabel(item) === selectedModel)
    : dateFilteredItems;
  const sortedItems = [...filteredItems].sort((left, right) =>
    compareCreditActivityItems(left, right, sortValue, locale),
  );
  const summary = filteredItems.reduce(
    (acc, item) => {
      acc.netCredits += item.amount;
      if (item.type === "usage" && item.status === "committed") {
        acc.usageCredits += Math.abs(item.amount);
      }
      acc.entryCount += 1;
      return acc;
    },
    {
      netCredits: 0,
      usageCredits: 0,
      entryCount: 0,
    },
  );
  const totalCount = sortedItems.length;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const safePage = totalPages > 0 ? Math.min(Math.max(1, page), totalPages) : 1;
  const offset = (safePage - 1) * pageSize;

  return {
    items: sortedItems.slice(offset, offset + pageSize),
    modelOptions,
    page: safePage,
    summary,
    totalCount,
    totalPages,
  };
}
