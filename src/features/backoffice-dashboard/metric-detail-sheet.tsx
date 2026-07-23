"use client";

import type { ReactElement } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardDescription, CardTitle } from "#/components/ui/card.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { getMetricSectionHref } from "#/features/backoffice-dashboard/metric-drilldown.ts";
import type {
  DashboardMetric,
  MetricDrilldownItem,
} from "#/features/backoffice-dashboard/mock-data.ts";

function MetricDetailRow({
  item,
}: {
  item: MetricDrilldownItem;
}): ReactElement {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate text-base">{item.title}</CardTitle>
          {item.subtitle ? (
            <CardDescription className="text-xs">
              {item.subtitle}
            </CardDescription>
          ) : null}
        </div>
        {item.badgeLabel ? (
          <Badge className="shrink-0" variant={item.badgeVariant}>
            {item.badgeLabel}
          </Badge>
        ) : null}
      </div>
      {item.context ? (
        <p className="text-muted-foreground text-sm">{item.context}</p>
      ) : null}
      <div className="flex justify-end">
        <Button render={<a href={item.href} />} size="sm" variant="outline">
          Open
        </Button>
      </div>
    </Card>
  );
}

export function MetricDetailSheet({
  items,
  metric,
  onOpenChange,
  open,
}: {
  items: MetricDrilldownItem[];
  metric: DashboardMetric;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}): ReactElement {
  const sectionHref = getMetricSectionHref(metric.id);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full min-w-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1">
              <SheetTitle>{metric.label}</SheetTitle>
              <SheetDescription>{metric.detail}</SheetDescription>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold text-3xl tracking-tight">
                {metric.value}
              </div>
              {metric.trend ? (
                <p className="mt-1 text-muted-foreground text-xs">
                  {metric.trend}
                </p>
              ) : null}
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1" scrollbarGutter scrollFade>
          <div className="flex flex-col gap-3 p-4">
            {items.length ? (
              items.map((item) => <MetricDetailRow item={item} key={item.id} />)
            ) : (
              <Card className="gap-3 p-4">
                <CardTitle className="text-base">Nothing in view</CardTitle>
                <CardDescription>
                  No {metric.label.toLowerCase()} are available in the current
                  dashboard view.
                </CardDescription>
                <div className="flex justify-end">
                  <Button
                    render={<a href={sectionHref} />}
                    size="sm"
                    variant="outline"
                  >
                    Jump to section
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
