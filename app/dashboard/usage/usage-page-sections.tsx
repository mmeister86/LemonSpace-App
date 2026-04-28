import { ChevronLeft, ChevronRight, Filter, ListFilter } from "lucide-react";
import type { useFormatter } from "next-intl";

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
import type {
  CreditActivityDateRange,
  CreditActivitySortValue,
  CreditActivitySummary,
} from "@/lib/credit-activity-filtering";
import { getCreditActivityModelLabel } from "@/lib/credit-activity-filtering";
import { formatCredits } from "@/lib/credits-activity";
import { cn } from "@/lib/utils";

type ActivityTableItem = {
  _id: string;
  _creationTime: number;
  amount: number;
  type: "subscription" | "topup" | "usage" | "reservation" | "refund";
  status: "committed" | "reserved" | "released" | "failed";
  description: string;
  model?: string;
  videoMeta?: { model?: string };
};

type Formatter = Pick<ReturnType<typeof useFormatter>, "number" | "dateTime">;

function statusBadge(status: ActivityTableItem["status"]) {
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

function typeLabel(type: ActivityTableItem["type"]) {
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

export function UsageSummaryCards({
  hasActivity,
  locale,
  summary,
}: {
  hasActivity: boolean;
  locale: string;
  summary: CreditActivitySummary;
}) {
  return (
    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
        <p className="text-sm text-muted-foreground">Netto-Credits</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {hasActivity ? formatCredits(summary.netCredits, locale) : "…"}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
        <p className="text-sm text-muted-foreground">Verbrauch</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {hasActivity ? formatCredits(summary.usageCredits, locale) : "…"}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
        <p className="text-sm text-muted-foreground">Einträge</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
          {hasActivity ? new Intl.NumberFormat(locale).format(summary.entryCount) : "…"}
        </p>
      </div>
    </section>
  );
}

export function UsageFilters({
  allModelsValue,
  dateRange,
  endDate,
  model,
  modelOptions,
  onDateRangeChange,
  onEndDateChange,
  onModelChange,
  onSortValueChange,
  onStartDateChange,
  sortValue,
  startDate,
}: {
  allModelsValue: string;
  dateRange: CreditActivityDateRange;
  endDate: string;
  model: string;
  modelOptions: string[];
  onDateRangeChange: (value: CreditActivityDateRange) => void;
  onEndDateChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSortValueChange: (value: CreditActivitySortValue) => void;
  onStartDateChange: (value: string) => void;
  sortValue: CreditActivitySortValue;
  startDate: string;
}) {
  return (
    <section className="mb-6 rounded-xl border bg-card p-4 shadow-sm shadow-foreground/3">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium">
        <Filter className="size-3.5 text-muted-foreground" />
        Filter
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Zeitraum</Label>
          <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as CreditActivityDateRange)}>
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
          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allModelsValue}>Alle Modelle</SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sortierung</Label>
          <Select value={sortValue} onValueChange={(value) => onSortValueChange(value as CreditActivitySortValue)}>
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
              onChange={(event) => onStartDateChange(event.target.value)}
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
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function UsageActivityTable({
  currentPage,
  formatter,
  hasActiveFilters,
  hasActivity,
  isLoading,
  items,
  locale,
  onNextPage,
  onPreviousPage,
  requestedPage,
  totalCount,
  totalPages,
}: {
  currentPage: number;
  formatter: Formatter;
  hasActiveFilters: boolean;
  hasActivity: boolean;
  isLoading: boolean;
  items: ActivityTableItem[];
  locale: string;
  onNextPage: () => void;
  onPreviousPage: () => void;
  requestedPage: number;
  totalCount: number;
  totalPages: number;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm shadow-foreground/3">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListFilter className="size-3.5 text-muted-foreground" />
          Aktivitäten
        </div>
        <span className="text-xs text-muted-foreground">
          {hasActivity ? `${formatter.number(totalCount)} Treffer` : "Wird geladen"}
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
          {isLoading ? (
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
              const modelLabel = getCreditActivityModelLabel(item);

              return (
                <TableRow key={item._id}>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell className="min-w-64 max-w-[24rem]">
                    <p className="truncate font-medium" title={item.description}>
                      {item.description}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <span className="block truncate text-muted-foreground" title={modelLabel}>
                      {modelLabel}
                    </span>
                  </TableCell>
                  <TableCell>{typeLabel(item.type)}</TableCell>
                  <TableCell>
                    {formatter.dateTime(item._creationTime, {
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
          Seite {hasActivity ? currentPage : requestedPage} von {Math.max(totalPages, 1)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={currentPage <= 1 || isLoading}
            onClick={onPreviousPage}
          >
            <ChevronLeft className="size-4" />
            Zurück
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isLoading || totalPages === 0 || currentPage >= totalPages}
            onClick={onNextPage}
          >
            Weiter
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
