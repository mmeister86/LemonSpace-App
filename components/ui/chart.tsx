"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-legend-item_text]:fill-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
          .map(([key, item]) => item.color ? `[data-chart=${id}] { --color-${key}: ${item.color}; }` : "")
          .join("\n"),
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipContentProps = {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
  className?: string;
  hideLabel?: boolean;
  formatter?: (value: number, name: string) => React.ReactNode;
};

function ChartTooltipContent({
  active,
  payload,
  className,
  hideLabel = false,
  formatter,
}: TooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className={cn("grid min-w-[8rem] gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey);
        const conf = config[key];
        const value = Number(item.value ?? 0);

        return (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{hideLabel ? key : conf?.label ?? key}</span>
            <span className="font-medium tabular-nums">
              {formatter ? formatter(value, key) : value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

type LegendContentProps = {
  className?: string;
  payload?: Array<{ dataKey?: string | number; color?: string }>;
};

function ChartLegendContent({
  className,
  payload,
}: LegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className={cn("mt-2 flex flex-wrap items-center gap-4 text-xs", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey);
        const conf = config[key];

        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
            />
            <span className="text-muted-foreground">{conf?.label ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}

export {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
};
