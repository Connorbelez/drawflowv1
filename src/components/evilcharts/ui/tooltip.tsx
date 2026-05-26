import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import {
  getColorsCount,
  getPayloadConfigFromPayload,
  useChart,
} from "#/components/evilcharts/ui/chart.tsx";
import { cn } from "#/lib/utils.ts";

type TooltipRoundness = "sm" | "md" | "lg" | "xl";
type TooltipVariant = "default" | "frosted-glass";
type TooltipPayloadItem = NonNullable<
  RechartsPrimitive.DefaultTooltipContentProps<ValueType, NameType>["payload"]
>[number];
type TooltipFormatter = RechartsPrimitive.DefaultTooltipContentProps<
  ValueType,
  NameType
>["formatter"];

const roundnessMap: Record<TooltipRoundness, string> = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
};

const variantMap: Record<TooltipVariant, string> = {
  default: "bg-background",
  "frosted-glass": "bg-background/70 backdrop-blur-sm",
};

function getTooltipPayloadKey(item: TooltipPayloadItem, nameKey?: string) {
  const payloadName =
    nameKey && item.payload
      ? (item.payload as Record<string, unknown>)[nameKey]
      : undefined;

  return `${payloadName ?? item.name ?? item.dataKey ?? "value"}`;
}

function dedupeTooltipPayload(payload: readonly TooltipPayloadItem[]) {
  const seenKeys = new Set<unknown>();

  return payload.filter((item) => {
    if (item.type === "none") {
      return false;
    }

    const key = item.dataKey ?? item.name;
    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  nameKey,
  labelKey,
  hiddenKeys,
  selected,
  roundness = "lg",
  variant = "default",
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    nameKey?: string;
    labelKey?: string;
    hiddenKeys?: string[];
    selected?: string | null;
    roundness?: TooltipRoundness;
    variant?: TooltipVariant;
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<ValueType, NameType>,
    "accessibilityLayer"
  >) {
  const { config } = useChart();
  const hiddenKeySet = React.useMemo(
    () => new Set(hiddenKeys ?? []),
    [hiddenKeys],
  );

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ]);

  if (!(active && payload?.length)) {
    // Empty tooltip - to prevent position getting 0.0 so it doesnt animate tooltip every time from 0.0 origin
    return <span className="p-4" />;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";
  const visiblePayload = dedupeTooltipPayload(payload).filter(
    (item) => !hiddenKeySet.has(String(item.dataKey ?? item.name ?? "")),
  );

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 border border-border/50 px-2.5 py-1.5 text-xs shadow-xl",
        roundnessMap[roundness],
        variantMap[variant],
        className,
      )}
    >
      {nestLabel ? null : tooltipLabel}
      <div className="grid gap-1.5">
        {visiblePayload.map((item, index) => {
          const key = getTooltipPayloadKey(item, nameKey);

          return (
            <TooltipPayloadRow
              config={config}
              formatter={formatter}
              hideIndicator={hideIndicator}
              indicator={indicator}
              item={item}
              itemIndex={index}
              itemKey={key}
              key={key}
              nestLabel={nestLabel}
              selected={selected}
              tooltipLabel={tooltipLabel}
            />
          );
        })}
      </div>
    </div>
  );
}

function TooltipPayloadRow({
  config,
  formatter,
  hideIndicator,
  indicator,
  item,
  itemIndex,
  itemKey,
  nestLabel,
  selected,
  tooltipLabel,
}: {
  config: ReturnType<typeof useChart>["config"];
  formatter?: TooltipFormatter;
  hideIndicator: boolean;
  indicator: "line" | "dot" | "dashed";
  item: TooltipPayloadItem;
  itemIndex: number;
  itemKey: string;
  nestLabel: boolean;
  selected?: string | null;
  tooltipLabel: React.ReactNode;
}) {
  const itemConfig = getPayloadConfigFromPayload(config, item, itemKey);
  const colorsCount = itemConfig ? getColorsCount(itemConfig) : 1;

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
        indicator === "dot" && "items-center",
        selected != null && selected !== item.dataKey && "opacity-30",
      )}
    >
      {formatter && item.value !== undefined && item.name ? (
        formatter(item.value, item.name, item, itemIndex, item.payload)
      ) : (
        <>
          <TooltipPayloadIndicator
            colorsCount={colorsCount}
            dataKey={itemKey}
            hidden={hideIndicator}
            indicator={indicator}
            itemConfigIcon={itemConfig?.icon}
            nestLabel={nestLabel}
          />
          <div
            className={cn(
              "flex flex-1 justify-between gap-4 leading-none",
              nestLabel ? "items-end" : "items-center",
            )}
          >
            <div className="grid gap-1.5">
              {nestLabel ? tooltipLabel : null}
              <span className="text-muted-foreground">
                {itemConfig?.label ?? item.name}
              </span>
            </div>
            {item.value != null && (
              <span className="font-medium font-mono text-foreground tabular-nums">
                {typeof item.value === "number"
                  ? item.value.toLocaleString()
                  : String(item.value)}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TooltipPayloadIndicator({
  colorsCount,
  dataKey,
  hidden,
  indicator,
  itemConfigIcon: ItemConfigIcon,
  nestLabel,
}: {
  colorsCount: number;
  dataKey: string;
  hidden: boolean;
  indicator: "line" | "dot" | "dashed";
  itemConfigIcon?: React.ComponentType;
  nestLabel: boolean;
}) {
  if (ItemConfigIcon) {
    return <ItemConfigIcon />;
  }

  if (hidden) {
    return null;
  }

  return (
    <div
      className={cn("shrink-0 rounded-[2px]", {
        "h-2.5 w-2.5": indicator === "dot",
        "w-1": indicator === "line",
        "w-0 border-[1.5px] border-dashed bg-transparent!":
          indicator === "dashed",
        "my-0.5": nestLabel && indicator === "dashed",
      })}
      style={getIndicatorColorStyle(dataKey, colorsCount)}
    />
  );
}

function getIndicatorColorStyle(
  dataKey: string,
  colorsCount: number,
): React.CSSProperties {
  if (colorsCount <= 1) {
    return { background: `var(--color-${dataKey}-0)` };
  }

  // Multiple colors: create linear gradient with evenly distributed stops
  const stops = Array.from({ length: colorsCount }, (_, index) => {
    const offset = (index / (colorsCount - 1)) * 100;
    return `var(--color-${dataKey}-${index}) ${offset}%`;
  }).join(", ");

  return { background: `linear-gradient(to right, ${stops})` };
}

const ChartTooltip = ({
  animationDuration = 200,
  ...props
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip>) => (
  <RechartsPrimitive.Tooltip animationDuration={animationDuration} {...props} />
);

export type { TooltipRoundness, TooltipVariant };
export { ChartTooltip, ChartTooltipContent };
