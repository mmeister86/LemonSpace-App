"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { ChartNoAxesCombined } from "lucide-react";

import {
  buildCreditsActivitySeries,
  calculateUsageActivityDomain,
  formatCredits,
  prioritizeRecentCreditTransactions,
} from "@/lib/credits-activity";
import type { DashboardSnapshot } from "@/hooks/use-dashboard-snapshot";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  usage: {
    label: "Verbrauch",
    color: "hsl(var(--primary))",
  },
  activity: {
    label: "Aktivität",
    color: "hsl(var(--accent-foreground))",
  },
  available: {
    label: "Verfügbar",
    color: "hsl(var(--muted-foreground))",
  },
} satisfies ChartConfig;

type CreditsActivityChartProps = {
  balance?: DashboardSnapshot["balance"];
  recentTransactions?: DashboardSnapshot["recentTransactions"];
};

export function CreditsActivityChart({ balance, recentTransactions }: CreditsActivityChartProps) {
  const locale = useLocale();

  const chartData = useMemo(() => {
    if (balance === undefined || recentTransactions === undefined) {
      return [];
    }

    const prioritized = prioritizeRecentCreditTransactions(recentTransactions, 40);

    return buildCreditsActivitySeries(prioritized, balance.available, locale, 7);
  }, [balance, recentTransactions, locale]);

  const usageDomain = useMemo(
    () => calculateUsageActivityDomain(chartData),
    [chartData],
  );

  if (balance === undefined || recentTransactions === undefined) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
        <div className="h-[240px] animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-sm shadow-foreground/3">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ChartNoAxesCombined className="size-3.5 text-muted-foreground" />
          Credits Verlauf
        </div>
        <p className="text-sm text-muted-foreground">Noch keine verbrauchsrelevante Aktivität vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm shadow-foreground/3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ChartNoAxesCombined className="size-3.5 text-muted-foreground" />
          Credits Verlauf
        </div>
        <span className="text-xs text-muted-foreground">
          Verfügbar: {formatCredits(balance.available, locale)}
        </span>
      </div>

      <ChartContainer
        config={chartConfig}
        className="h-[240px] w-full min-w-0 aspect-auto"
      >
        <AreaChart accessibilityLayer data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            yAxisId="usage"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={44}
            allowDecimals={false}
            domain={usageDomain}
          />
          <YAxis yAxisId="available" hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatCredits(Number(value), locale)}
              />
            }
          />
          <Area
            dataKey="activity"
            yAxisId="usage"
            type="monotone"
            fill="var(--color-activity)"
            fillOpacity={0.15}
            stroke="var(--color-activity)"
            strokeWidth={2}
          />
          <Area
            dataKey="usage"
            yAxisId="usage"
            type="monotone"
            fill="var(--color-usage)"
            fillOpacity={0.25}
            stroke="var(--color-usage)"
            strokeWidth={2}
          />
          <Line
            dataKey="available"
            yAxisId="available"
            type="monotone"
            dot={false}
            stroke="var(--color-available)"
            strokeWidth={2}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
