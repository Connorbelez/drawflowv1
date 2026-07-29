import { AlertTriangle, Check, ChevronDown } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import { cn } from "#/lib/utils.ts";

export interface TimelineCashflowMetric {
  label: string;
  testId: string;
  tone?: "default" | "info" | "interest" | "positive";
  value: string;
}

export interface TimelineCashflowWarning {
  dayLabel: string;
  id: string;
  message: string;
}

interface TimelineCashflowToolbarProps {
  metrics: TimelineCashflowMetric[];
  warnings: TimelineCashflowWarning[];
}

const metricToneClassName: Record<
  NonNullable<TimelineCashflowMetric["tone"]>,
  string
> = {
  default: "text-foreground",
  info: "text-sky-700 dark:text-sky-300",
  interest: "text-violet-700 dark:text-violet-300",
  positive: "text-emerald-700 dark:text-emerald-300",
};

export function TimelineCashflowToolbar({
  metrics,
  warnings,
}: TimelineCashflowToolbarProps) {
  const warningCount = warnings.length;

  return (
    <section
      aria-label="Cash flow metrics"
      className="flex min-w-max shrink-0 items-center"
      data-testid="timeline-cashflow-toolbar"
    >
      <dl className="flex items-center divide-x divide-border/70">
        {metrics.map((metric) => (
          <div
            className="flex shrink-0 items-baseline gap-1.5 px-2.5 first:pl-0"
            key={metric.testId}
          >
            <dt className="whitespace-nowrap font-medium text-[9px] text-muted-foreground uppercase tracking-[0.04em]">
              {metric.label}
            </dt>
            <dd
              className={cn(
                "whitespace-nowrap font-semibold text-xs tabular-nums",
                metricToneClassName[metric.tone ?? "default"]
              )}
              data-testid={metric.testId}
            >
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>

      <div aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />

      {warningCount > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`Cash risk: ${warningCount} ${warningCount === 1 ? "issue" : "issues"}. Show issues`}
                className="shrink-0"
                data-testid="timeline-cashflow-risk-summary"
                size="sm"
                variant="destructive-outline"
              />
            }
          >
            <AlertTriangle />
            Cash risk · {warningCount}
            <ChevronDown className="opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[min(34rem,calc(100vw-2rem))] overflow-hidden p-0"
            data-testid="timeline-cashflow-warning-menu"
            sideOffset={8}
          >
            <div className="border-border border-b px-3 py-2.5">
              <p className="font-semibold text-sm">Cash requirement issues</p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                Additional builder cash is required before these scheduled
                milestone costs.
              </p>
            </div>
            <ul className="max-h-80 overflow-y-auto p-1">
              {warnings.map((warning) => (
                <li
                  className="flex items-start gap-2 rounded-md px-2 py-2 text-xs"
                  data-testid="timeline-cash-shortfall-point"
                  key={warning.id}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-rose-600 dark:text-rose-300" />
                  <span className="shrink-0 font-semibold text-rose-700 dark:text-rose-200">
                    {warning.dayLabel}
                  </span>
                  <span className="min-w-0 text-muted-foreground">
                    {warning.message}
                  </span>
                </li>
              ))}
            </ul>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div
          className="inline-flex h-7 shrink-0 items-center gap-1.5 px-2 text-emerald-700 text-xs dark:text-emerald-300"
          data-testid="timeline-cashflow-risk-summary"
        >
          <Check className="size-3.5" />
          Cash risk · Clear
        </div>
      )}
    </section>
  );
}
