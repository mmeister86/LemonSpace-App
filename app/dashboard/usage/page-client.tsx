"use client";

import Link from "next/link";
import { useFormatter, useLocale } from "next-intl";
import { ArrowLeft, ChevronLeft, ChevronRight, Filter, ListFilter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { authClient } from "@/lib/auth-client";
import {
  readCreditActivityCache,
  writeCreditActivityCache,
} from "@/lib/credit-activity-cache";
import { formatCredits } from "@/lib/credits-activity";
import { cn } from "@/lib/utils";

type ActivityResult = FunctionReturnType<typeof api.credits.listActivity>;
type ActivityItem = ActivityResult["items"][number];
type DateRange = "all" | "7d" | "30d" | "month" | "custom";
type SortValue = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "model-asc";

const PAGE_SIZE = 25;
const ALL_MODELS_VALUE = "__all__";

const SORT_CONFIG: Record<SortValue, { sortBy: "date" | "amount" | "model"; sortDirection: "asc" | "desc" }> = {
  "date-desc": { sortBy: "date", sortDirection: "desc" },
  "date-asc": { sortBy: "date", sortDirection: "asc" },
  "amount-desc": { sortBy: "amount", sortDirection: "desc" },
  "amount-asc": { sortBy: "amount", sortDirection: "asc" },
  "model-asc": { sortBy: "model", sortDirection: "asc" },
};

function parseDateInput(value: string, endOfDay: boolean): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDateBounds(dateRange: DateRange, startDate: string, endDate: string) {
  const nowMs = Date.now();

  if (dateRange === "all") {
    return { startMs: null, endMs: null };
  }

  if (dateRange === "7d") {
    return { startMs: nowMs - 7 * 24 * 60 * 60 * 1000, endMs: null };
  }

  if (dateRange === "30d") {
    return { startMs: nowMs - 30 * 24 * 60 * 60 * 1000, endMs: null };
  }

  if (dateRange === "month") {
    const now = new Date(nowMs);
    return {
      startMs: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      endMs: null,
    };
  }

  return {
    startMs: parseDateInput(startDate, false),
    endMs: parseDateInput(endDate, true),
  };
}

function itemMatchesDateRange(
  item: ActivityItem,
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

function compareItems(left: ActivityItem, right: ActivityItem, sortValue: SortValue) {
  const sortConfig = SORT_CONFIG[sortValue];
  const direction = sortConfig.sortDirection === "asc" ? 1 : -1;

  if (sortConfig.sortBy === "amount") {
    const amountOrder = Math.abs(left.amount) - Math.abs(right.amount);
    if (amountOrder !== 0) {
      return amountOrder * direction;
    }
  } else if (sortConfig.sortBy === "model") {
    const modelOrder = getModelLabel(left).localeCompare(getModelLabel(right), "de");
    if (modelOrder !== 0) {
      return modelOrder * direction;
    }
  }

  return (left._creationTime - right._creationTime) * direction;
}

function statusBadge(status: ActivityItem["status"]) {
  switch (status) {
    case "committed":
      return <Badge variant="secondary" className="text-xs font-normal">Abgeschlossen</Badge>;
    case "reserved":
      return (
        <Badge variant="outline" className="border-amber-300 text-xs font-normal text-amber-700 dark:border-amber-700 dark:text-amber-400">
          Reserviert
        </Badge>
      );
    case "released":
      return (
        <Badge variant="secondary" className="px-3 text-xs font-normal text-emerald-600 dark:text-emerald-400">
          Rückerstattet
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive" className="text-xs font-normal">Fehlgeschlagen</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs font-normal">Unbekannt</Badge>;
  }
}

function typeLabel(type: ActivityItem["type"]) {
  switch (type) {
    case "subscription":
      return "Abo";
    case "topup":
      return "Top-up";
    case "usage":
      return "Verbrauch";
    case "reservation":
      return "Reservierung";
    case "refund":
      return "Rückerstattung";
    default:
      return type;
  }
}

function getModelLabel(item: ActivityItem) {
  return item.model?.trim() || item.videoMeta?.model?.trim() || "Ohne Modell";
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell><div className="h-5 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-4 w-56 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-4 w-40 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function UsagePageClient() {
  const locale = useLocale();
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [model, setModel] = useState(ALL_MODELS_VALUE);
  const [sortValue, setSortValue] = useState<SortValue>("date-desc");
  const selectedModel = model === ALL_MODELS_VALUE ? undefined : model;
  const userId = session?.user.id;

  const liveActivity = useAuthQuery(api.credits.listActivity, {
    page: 1,
    pageSize: 1000,
    dateRange: "all",
    sortBy: "date",
    sortDirection: "desc",
  });
  const cachedActivity = useMemo(() => {
    return userId ? readCreditActivityCache<ActivityResult>(userId)?.activity ?? null : null;
  }, [userId]);
  const activity = liveActivity ?? cachedActivity;

  useEffect(() => {
    if (!userId || !liveActivity) {
      return;
    }

    writeCreditActivityCache(userId, liveActivity);
  }, [liveActivity, userId]);

  const hasActiveFilters = useMemo(() => {
    return dateRange !== "all" || Boolean(selectedModel);
  }, [dateRange, selectedModel]);

  const resetPage = () => setPage(1);
  const localActivity = useMemo(() => {
    const allItems = activity?.items ?? [];
    const dateBounds = getDateBounds(dateRange, startDate, endDate);
    const dateFilteredItems = allItems.filter((item) => itemMatchesDateRange(item, dateBounds));
    const modelOptions = Array.from(
      new Set(dateFilteredItems.map(getModelLabel).filter((label) => label !== "Ohne Modell")),
    ).sort((left, right) => left.localeCompare(right, "de"));
    const filteredItems = selectedModel
      ? dateFilteredItems.filter((item) => getModelLabel(item) === selectedModel)
      : dateFilteredItems;
    const sortedItems = [...filteredItems].sort((left, right) =>
      compareItems(left, right, sortValue),
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
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0;
    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    const offset = (safePage - 1) * PAGE_SIZE;

    return {
      items: sortedItems.slice(offset, offset + PAGE_SIZE),
      modelOptions,
      page: safePage,
      summary,
      totalCount,
      totalPages,
    };
  }, [activity?.items, dateRange, endDate, page, selectedModel, sortValue, startDate]);
  const totalPages = localActivity.totalPages;
  const items = localActivity.items;

  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-3 gap-2 text-muted-foreground" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
                Dashboard
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Verbrauch & Aktivitäten</h1>
            <p className="mt-1.5 text-muted-foreground">
              Alle Credit-Bewegungen, filterbar nach Zeitraum und Modell.
            </p>
          </div>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
            <p className="text-sm text-muted-foreground">Netto-Credits</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {activity ? formatCredits(localActivity.summary.netCredits, locale) : "…"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
            <p className="text-sm text-muted-foreground">Verbrauch</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {activity ? formatCredits(localActivity.summary.usageCredits, locale) : "…"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
            <p className="text-sm text-muted-foreground">Einträge</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
              {activity ? new Intl.NumberFormat(locale).format(localActivity.summary.entryCount) : "…"}
            </p>
          </div>
        </section>

        <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Filter className="size-3.5 text-muted-foreground" />
            Filter
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Zeitraum</Label>
              <Select
                value={dateRange}
                onValueChange={(value) => {
                  setDateRange(value as DateRange);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="7d">7 Tage</SelectItem>
                  <SelectItem value="30d">30 Tage</SelectItem>
                  <SelectItem value="month">Dieser Monat</SelectItem>
                  <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Modell</Label>
              <Select
                value={model}
                onValueChange={(value) => {
                  setModel(value);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_MODELS_VALUE}>Alle Modelle</SelectItem>
                  {localActivity.modelOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sortierung</Label>
              <Select
                value={sortValue}
                onValueChange={(value) => {
                  setSortValue(value as SortValue);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Neueste</SelectItem>
                  <SelectItem value="date-asc">Älteste</SelectItem>
                  <SelectItem value="amount-desc">Höchster Verbrauch</SelectItem>
                  <SelectItem value="amount-asc">Niedrigster Verbrauch</SelectItem>
                  <SelectItem value="model-asc">Modell A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {dateRange === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="activity-start-date" className="text-xs text-muted-foreground">
                  Von
                </Label>
                <Input
                  id="activity-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    resetPage();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-end-date" className="text-xs text-muted-foreground">
                  Bis
                </Label>
                <Input
                  id="activity-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    resetPage();
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border bg-card shadow-sm shadow-foreground/3">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListFilter className="size-3.5 text-muted-foreground" />
              Aktivitäten
            </div>
            <span className="text-xs text-muted-foreground">
              {activity
                ? `${format.number(localActivity.totalCount)} Treffer`
                : "Wird geladen"}
            </span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Aktivität</TableHead>
                <TableHead>Modell</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity === undefined ? (
                <SkeletonRows />
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <div className="mx-auto max-w-sm">
                      <p className="text-sm font-medium text-muted-foreground">
                        {hasActiveFilters ? "Keine Treffer für diese Filter" : "Noch keine Aktivität"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {hasActiveFilters
                          ? "Passe Zeitraum oder Modell an, um weitere Einträge zu sehen."
                          : "Sobald Credits bewegt werden, erscheint hier der Audit-Trail."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const isCredit = item.amount > 0;
                  return (
                    <TableRow key={item._id}>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                      <TableCell className="min-w-64 max-w-[24rem]">
                        <p className="truncate font-medium" title={item.description}>
                          {item.description}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-64">
                        <span className="block truncate text-muted-foreground" title={getModelLabel(item)}>
                          {getModelLabel(item)}
                        </span>
                      </TableCell>
                      <TableCell>{typeLabel(item.type)}</TableCell>
                      <TableCell>
                        {format.dateTime(item._creationTime, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                          )}
                        >
                          {isCredit ? "+" : "−"}
                          {formatCredits(Math.abs(item.amount), locale)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Seite {activity ? localActivity.page : page} von {Math.max(totalPages, 1)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={localActivity.page <= 1 || activity === undefined}
                onClick={() => setPage(Math.max(1, localActivity.page - 1))}
              >
                <ChevronLeft className="size-4" />
                Zurück
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={activity === undefined || totalPages === 0 || localActivity.page >= totalPages}
                onClick={() => setPage(localActivity.page + 1)}
              >
                Weiter
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
