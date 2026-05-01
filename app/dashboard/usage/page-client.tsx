"use client";

/**
 * Onboarding note:
 * Next.js App Router module for page client. Keep SSR auth, redirects, and client/server component boundaries explicit.
 */

import Link from "next/link";
import { useFormatter, useLocale } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuthQuery } from "@/hooks/use-auth-query";
import { authClient } from "@/lib/auth-client";
import {
  type CreditActivityDateRange,
  type CreditActivitySortValue,
  buildCreditActivityViewModel,
} from "@/lib/credit-activity-filtering";
import {
  readCreditActivityCache,
  writeCreditActivityCache,
} from "@/lib/credit-activity-cache";

import {
  UsageActivityTable,
  UsageFilters,
  UsageSummaryCards,
} from "./usage-page-sections";

type ActivityResult = FunctionReturnType<typeof api.credits.listActivity>;

const PAGE_SIZE = 25;
const ALL_MODELS_VALUE = "__all__";

export function UsagePageClient() {
  const locale = useLocale();
  const format = useFormatter();
  const { data: session } = authClient.useSession();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<CreditActivityDateRange>("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [model, setModel] = useState(ALL_MODELS_VALUE);
  const [sortValue, setSortValue] = useState<CreditActivitySortValue>("date-desc");
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
    return buildCreditActivityViewModel({
      items: activity?.items ?? [],
      dateRange,
      startDate,
      endDate,
      selectedModel,
      sortValue,
      page,
      pageSize: PAGE_SIZE,
      locale,
    });
  }, [activity?.items, dateRange, endDate, locale, page, selectedModel, sortValue, startDate]);
  const totalPages = localActivity.totalPages;
  const hasActivity = Boolean(activity);
  const isLoading = activity === undefined;

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

        <UsageSummaryCards
          hasActivity={hasActivity}
          locale={locale}
          summary={localActivity.summary}
        />

        <UsageFilters
          allModelsValue={ALL_MODELS_VALUE}
          dateRange={dateRange}
          endDate={endDate}
          model={model}
          modelOptions={localActivity.modelOptions}
          onDateRangeChange={(value) => {
            setDateRange(value);
            resetPage();
          }}
          onEndDateChange={(value) => {
            setEndDate(value);
            resetPage();
          }}
          onModelChange={(value) => {
            setModel(value);
            resetPage();
          }}
          onSortValueChange={(value) => {
            setSortValue(value);
            resetPage();
          }}
          onStartDateChange={(value) => {
            setStartDate(value);
            resetPage();
          }}
          sortValue={sortValue}
          startDate={startDate}
        />

        <UsageActivityTable
          currentPage={localActivity.page}
          formatter={format}
          hasActiveFilters={hasActiveFilters}
          hasActivity={hasActivity}
          isLoading={isLoading}
          items={localActivity.items}
          locale={locale}
          onNextPage={() => setPage(localActivity.page + 1)}
          onPreviousPage={() => setPage(Math.max(1, localActivity.page - 1))}
          requestedPage={page}
          totalCount={localActivity.totalCount}
          totalPages={totalPages}
        />
      </main>
    </div>
  );
}
