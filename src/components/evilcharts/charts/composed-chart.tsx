"use client";

import { motion } from "motion/react";
import {
  type ComponentProps,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  type BackgroundVariant,
  ChartBackground,
} from "#/components/evilcharts/ui/background.tsx";
import {
  type ChartConfig,
  ChartContainer,
  getColorsCount,
  getLoadingData,
  LoadingIndicator,
} from "#/components/evilcharts/ui/chart.tsx";
import { ChartDot, type DotVariant } from "#/components/evilcharts/ui/dot.tsx";
import {
  EvilBrush,
  type EvilBrushRange,
  useEvilBrush,
} from "#/components/evilcharts/ui/evil-brush.tsx";
import {
  ChartLegend,
  ChartLegendContent,
  type ChartLegendVariant,
} from "#/components/evilcharts/ui/legend.tsx";
import {
  ChartTooltip,
  ChartTooltipContent,
  type TooltipRoundness,
  type TooltipVariant,
} from "#/components/evilcharts/ui/tooltip.tsx";

// Constants
const STROKE_WIDTH = 2;
const DEFAULT_BAR_RADIUS = 4;
const LOADING_DATA_KEY = "loading";
const LOADING_ANIMATION_DURATION = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

type ChartProps = ComponentProps<typeof ComposedChart>;
type XAxisProps = ComponentProps<typeof XAxis>;
type YAxisProps = ComponentProps<typeof YAxis>;
type LineType = ComponentProps<typeof Line>["type"];
type AreaType = ComponentProps<typeof Area>["type"];
type StrokeVariant = "solid" | "dashed" | "animated-dashed";
type BarVariant =
  | "default"
  | "hatched"
  | "duotone"
  | "duotone-reverse"
  | "gradient"
  | "stripped";
type AreaVariant =
  | "gradient"
  | "gradient-reverse"
  | "solid"
  | "dotted"
  | "lines"
  | "hatched";
type ReferenceLineMarker = {
  label?: string | string[];
  labelOffsetY?: number;
  onClick?: () => void;
  opacity?: number;
  stroke?: string;
  strokeDasharray?: string;
  x: number | string;
};

interface ReferenceLineLabelProps {
  fill?: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  offsetY?: number;
  value?: string | string[];
  viewBox?: unknown;
}

export function ReferenceLineLabel({
  fill,
  fontSize = 15,
  fontWeight = 700,
  offsetY = 0,
  value,
  viewBox,
}: ReferenceLineLabelProps) {
  if (!(value && typeof viewBox === "object" && viewBox !== null)) {
    return null;
  }

  const box = viewBox as Record<string, unknown>;
  const x = Number(box.x);
  const y = Number(box.y);
  const width = Number(box.width);

  if (!(Number.isFinite(x) && Number.isFinite(y))) {
    return null;
  }

  const lines = Array.isArray(value) ? value : [value];
  const numericFontSize =
    typeof fontSize === "number"
      ? fontSize
      : typeof fontSize === "string"
        ? Number.parseFloat(fontSize)
        : 15;
  const lineHeight = numericFontSize + 4;
  const estimatedHalfWidth =
    Math.max(...lines.map((line) => line.length), 1) *
    (Number.isFinite(numericFontSize) ? numericFontSize : 15) *
    0.32;
  const textX =
    Number.isFinite(width) && width > 0
      ? Math.min(
          Math.max(x, estimatedHalfWidth + 8),
          Math.max(estimatedHalfWidth + 8, width - estimatedHalfWidth - 8)
        )
      : x;
  const textY = y - 10 - (lines.length - 1) * lineHeight + offsetY;
  const padX = 10;
  const padY = 6;
  const bgWidth = estimatedHalfWidth * 2 + padX * 2;
  const bgHeight = lines.length * lineHeight + padY * 2;
  const bgX = textX - bgWidth / 2;
  const bgY = textY - numericFontSize - padY + 2;

  return (
    <g>
      <rect
        fill="var(--popover)"
        height={bgHeight}
        rx={6}
        ry={6}
        stroke={fill ?? "var(--border)"}
        strokeOpacity={0.45}
        strokeWidth={1}
        width={bgWidth}
        x={bgX}
        y={bgY}
      />
      <text
        fill="var(--popover-foreground)"
        fontSize={fontSize}
        fontWeight={fontWeight}
        textAnchor="middle"
        x={textX}
        y={textY}
      >
        {lines.map((line, index) => (
          <tspan
            dy={index === 0 ? 0 : lineHeight}
            key={`${line}-${index}`}
            x={textX}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

// Validating Types to make sure user have provided valid data according to chartConfig
type ValidateConfigKeys<TData, TConfig> = {
  [K in keyof TConfig]: K extends keyof TData ? ChartConfig[string] : never;
};

// Extract only keys from TData where the value is a number
type NumericDataKeys<T> = {
  [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

type EvilComposedChartProps<
  TData extends Record<string, unknown>,
  TBarConfig extends Record<string, ChartConfig[string]>,
  TLineConfig extends Record<string, ChartConfig[string]>,
  TAreaConfig extends Record<string, ChartConfig[string]> = {},
> = {
  // Data
  data: TData[];
  xDataKey?: keyof TData & string;
  yDataKey?: keyof TData & string;
  className?: string;
  chartProps?: ChartProps;
  xAxisProps?: XAxisProps;
  yAxisProps?: YAxisProps;
  tickGap?: number;
  defaultSelectedDataKey?: string | null;
  referenceLines?: ReferenceLineMarker[];

  // Bar Configuration
  barConfig: TBarConfig & ValidateConfigKeys<TData, TBarConfig>;
  barVariant?: BarVariant;
  barRadius?: number;
  barSize?: number;
  minBarWidth?: number;
  barGap?: number;
  barCategoryGap?: number;
  barStackId?: string | Partial<Record<keyof TBarConfig & string, string>>;
  enableHoverHighlight?: boolean;
  glowingBars?: NumericDataKeys<TData>[];

  // Area Configuration
  areaConfig?: TAreaConfig & ValidateConfigKeys<TData, TAreaConfig>;
  areaOpacity?: number;
  areaCurveType?: AreaType;
  areaStacked?: boolean;
  areaVariant?: AreaVariant;

  // Line Configuration
  lineConfig: TLineConfig & ValidateConfigKeys<TData, TLineConfig>;
  curveType?: LineType;
  strokeVariant?: StrokeVariant;
  dotVariant?: DotVariant;
  activeDotVariant?: DotVariant;
  connectNulls?: boolean;
  glowingLines?: NumericDataKeys<TData>[];

  // Hide Stuffs
  hideTooltip?: boolean;
  hideCartesianGrid?: boolean;
  hideLegend?: boolean;
  hideCursorLine?: boolean;
  legendVariant?: ChartLegendVariant;
  // Tooltip
  tooltipRoundness?: TooltipRoundness;
  tooltipVariant?: TooltipVariant;
  tooltipDefaultIndex?: number;
  tooltipHiddenKeys?: string[];
  tooltipLabelFormatter?: ComponentProps<
    typeof ChartTooltipContent
  >["labelFormatter"];
  tooltipIndicator?: ComponentProps<typeof ChartTooltipContent>["indicator"];

  // Interactive Stuffs
  isLoading?: boolean;
  loadingBars?: number;
  // Brush
  showBrush?: boolean;
  brushHeight?: number;
  brushFormatLabel?: (value: unknown, index: number) => string;
  onBrushChange?: (range: EvilBrushRange) => void;
  onBarClick?: (event: {
    dataKey: string;
    index: number;
    payload: TData;
  }) => void;
  // Background
  backgroundVariant?: BackgroundVariant;
};

type EvilComposedChartClickable = {
  isClickable: true;
  onSelectionChange?: (selectedDataKey: string | null) => void;
};

type EvilComposedChartNotClickable = {
  isClickable?: false;
  onSelectionChange?: never;
};

type EvilComposedChartPropsWithCallback<
  TData extends Record<string, unknown>,
  TBarConfig extends Record<string, ChartConfig[string]>,
  TLineConfig extends Record<string, ChartConfig[string]>,
  TAreaConfig extends Record<string, ChartConfig[string]> = {},
> = EvilComposedChartProps<TData, TBarConfig, TLineConfig, TAreaConfig> &
  (EvilComposedChartClickable | EvilComposedChartNotClickable);

export function EvilComposedChart<
  TData extends Record<string, unknown>,
  TBarConfig extends Record<string, ChartConfig[string]>,
  TLineConfig extends Record<string, ChartConfig[string]>,
  TAreaConfig extends Record<string, ChartConfig[string]> = {},
>({
  data,
  xDataKey,
  yDataKey,
  className,
  chartProps,
  xAxisProps,
  yAxisProps,
  tickGap = 8,
  defaultSelectedDataKey = null,
  referenceLines = [],
  // Bar props
  barConfig,
  barVariant = "default",
  barRadius = DEFAULT_BAR_RADIUS,
  barSize,
  minBarWidth,
  barGap,
  barCategoryGap,
  barStackId,
  enableHoverHighlight = false,
  glowingBars = [],
  // Area props
  areaConfig,
  areaOpacity = 0.18,
  areaCurveType,
  areaStacked = false,
  areaVariant = "gradient",
  // Line props
  lineConfig,
  curveType = "linear",
  strokeVariant = "solid",
  dotVariant,
  activeDotVariant,
  connectNulls = false,
  glowingLines = [],
  // Common props
  hideTooltip = false,
  hideCartesianGrid = false,
  hideLegend = false,
  hideCursorLine = false,
  legendVariant,
  tooltipRoundness,
  tooltipVariant,
  tooltipDefaultIndex,
  tooltipHiddenKeys,
  tooltipLabelFormatter,
  tooltipIndicator,
  isClickable = false,
  isLoading = false,
  loadingBars,
  showBrush = false,
  brushHeight,
  brushFormatLabel,
  onBrushChange,
  onBarClick,
  onSelectionChange,
  backgroundVariant,
}: EvilComposedChartPropsWithCallback<
  TData,
  TBarConfig,
  TLineConfig,
  TAreaConfig
>) {
  const [selectedDataKey, setSelectedDataKey] = useState<string | null>(
    defaultSelectedDataKey
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { loadingData, onShimmerExit } = useLoadingData(isLoading, loadingBars);
  const chartId = useId().replace(/:/g, "");

  // ── Zoom state ──────────────────────────────────────────────────────────
  const { visibleData, brushProps } = useEvilBrush({ data });
  const displayData = showBrush && !isLoading ? visibleData : data;

  // Wrapper function to update state and call parent callback
  const handleSelectionChange = useCallback(
    (newSelectedDataKey: string | null) => {
      setSelectedDataKey(newSelectedDataKey);
      if (isClickable && onSelectionChange) {
        onSelectionChange(newSelectedDataKey);
      }
    },
    [onSelectionChange, isClickable]
  );

  // Combined config for legend and tooltip
  const combinedConfig = { ...barConfig, ...(areaConfig ?? {}), ...lineConfig };

  return (
    <ChartContainer
      className={className}
      config={combinedConfig}
      footer={
        showBrush &&
        !isLoading && (
          <EvilBrush
            barRadius={barRadius}
            chartConfig={combinedConfig}
            className="mt-1"
            connectNulls={connectNulls}
            curveType={curveType}
            data={data}
            formatLabel={brushFormatLabel}
            height={brushHeight}
            skipStyle
            strokeVariant={strokeVariant}
            variant="area"
            xDataKey={xDataKey}
            {...brushProps}
            onChange={(range) => {
              brushProps.onChange(range);
              onBrushChange?.(range);
            }}
          />
        )
      }
    >
      <LoadingIndicator isLoading={isLoading} />
      <ComposedChart
        accessibilityLayer
        barCategoryGap={barCategoryGap}
        barGap={barGap}
        data={isLoading ? loadingData : displayData}
        id="evil-charts-composed-chart"
        onMouseLeave={() => enableHoverHighlight && setHoveredIndex(null)}
        {...chartProps}
      >
        {backgroundVariant && <ChartBackground variant={backgroundVariant} />}
        <ReferenceLine color="white" />
        {!(hideCartesianGrid || backgroundVariant) && (
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
        )}
        {!hideLegend && (
          <ChartLegend
            align="right"
            content={
              <ChartLegendContent
                isClickable={isClickable}
                onSelectChange={handleSelectionChange}
                selected={selectedDataKey}
                variant={legendVariant}
              />
            }
            verticalAlign="top"
          />
        )}
        {xDataKey && !isLoading && (
          <XAxis
            axisLine={false}
            dataKey={xDataKey}
            minTickGap={tickGap}
            tickLine={false}
            tickMargin={8}
            {...xAxisProps}
          />
        )}
        {yDataKey && !isLoading && (
          <YAxis
            axisLine={false}
            dataKey={yDataKey}
            minTickGap={tickGap}
            tickLine={false}
            tickMargin={8}
            width="auto"
            {...yAxisProps}
          />
        )}
        {!(hideTooltip || isLoading) && (
          <ChartTooltip
            content={
              <ChartTooltipContent
                hiddenKeys={tooltipHiddenKeys}
                indicator={tooltipIndicator}
                labelFormatter={tooltipLabelFormatter}
                roundness={tooltipRoundness}
                selected={selectedDataKey}
                variant={tooltipVariant}
              />
            }
            cursor={
              hideCursorLine
                ? false
                : {
                    strokeDasharray:
                      strokeVariant === "dashed" ||
                      strokeVariant === "animated-dashed"
                        ? "3 3"
                        : undefined,
                    strokeWidth: STROKE_WIDTH,
                  }
            }
            defaultIndex={tooltipDefaultIndex}
          />
        )}

        {!isLoading &&
          referenceLines.map((marker, index) => (
            <ReferenceLine
              ifOverflow="visible"
              key={`${marker.x}-${marker.label ?? "reference-line"}-${index}`}
              label={
                marker.label
                  ? {
                      content: (props) => (
                        <ReferenceLineLabel
                          {...props}
                          offsetY={marker.labelOffsetY}
                          value={marker.label}
                        />
                      ),
                      fill: marker.stroke ?? "oklch(0.78 0.16 85)",
                      fontSize: 11,
                      fontWeight: 600,
                      position: "top",
                    }
                  : undefined
              }
              stroke={marker.stroke ?? "oklch(0.65 0.015 285)"}
              strokeDasharray={marker.strokeDasharray}
              strokeOpacity={marker.opacity ?? 0.4}
              strokeWidth={1.5}
              style={marker.onClick ? { pointerEvents: "none" } : undefined}
              x={marker.x}
            />
          ))}

        {/* ======== AREAS ======== */}
        {!isLoading &&
          areaConfig &&
          Object.keys(areaConfig).map((dataKey) => {
            const _opacity = getOpacity(isClickable, selectedDataKey, dataKey);
            const hasSelection = selectedDataKey !== null;

            return (
              <Area
                activeDot={false}
                connectNulls={connectNulls}
                dataKey={dataKey}
                dot={false}
                fill={`url(#${chartId}-area-fill-${dataKey})`}
                fillOpacity={_opacity.stroke}
                key={`area-${dataKey}`}
                stackId={areaStacked ? "evil-area-stack" : undefined}
                stroke={`url(#${chartId}-area-colors-${dataKey})`}
                strokeDasharray={
                  strokeVariant === "dashed"
                    ? "5 5"
                    : strokeVariant === "animated-dashed"
                      ? "5 5"
                      : undefined
                }
                strokeOpacity={_opacity.stroke}
                strokeWidth={STROKE_WIDTH}
                type={areaCurveType ?? curveType}
              >
                {strokeVariant === "animated-dashed" && !hasSelection && (
                  <AnimatedDashedStyle />
                )}
              </Area>
            );
          })}

        {/* ======== BARS ======== */}
        {!isLoading &&
          Object.keys(barConfig).map((dataKey) => {
            const isGlowing = glowingBars.includes(
              dataKey as NumericDataKeys<TData>
            );
            const isSelectedDataKey =
              selectedDataKey === null || selectedDataKey === dataKey;

            const getFilter = () => {
              if (isGlowing) {
                return `url(#${chartId}-bar-glow-${dataKey})`;
              }
              return;
            };

            return (
              <Bar
                barSize={barSize}
                dataKey={dataKey}
                fill={`url(#${chartId}-bar-colors-${dataKey})`}
                key={`bar-${dataKey}`}
                radius={barRadius}
                shape={(props: unknown) => {
                  const barProps = props as BarShapeProps;
                  const index = barProps.index as number;
                  const payload =
                    isRecord(barProps.payload) && !isLoading
                      ? (barProps.payload as TData)
                      : null;

                  const getBarOpacity = () => {
                    const clickOpacity =
                      isClickable && selectedDataKey !== null
                        ? isSelectedDataKey
                          ? 1
                          : 0.3
                        : 1;

                    if (enableHoverHighlight && hoveredIndex !== null) {
                      const isHovered = hoveredIndex === index;
                      return isHovered ? clickOpacity : clickOpacity * 0.3;
                    }

                    return clickOpacity;
                  };

                  return (
                    <CustomBar
                      {...barProps}
                      barRadius={barRadius}
                      barVariant={barVariant}
                      chartId={chartId}
                      dataKey={dataKey}
                      enableHoverHighlight={enableHoverHighlight}
                      fillOpacity={getBarOpacity()}
                      filter={getFilter()}
                      isClickable={isClickable}
                      isDatumClickable={Boolean(onBarClick && payload)}
                      minBarWidth={minBarWidth}
                      onClick={() => {
                        if (onBarClick && payload) {
                          onBarClick({ dataKey, index, payload });
                        }
                        if (!isClickable) {
                          return;
                        }
                        handleSelectionChange(
                          selectedDataKey === dataKey ? null : dataKey
                        );
                      }}
                      onMouseEnter={() => {
                        if (enableHoverHighlight) {
                          setHoveredIndex(index);
                        }
                      }}
                    />
                  );
                }}
                stackId={resolveBarStackId(barStackId, dataKey)}
                style={
                  isClickable || enableHoverHighlight
                    ? { cursor: "pointer" }
                    : undefined
                }
              />
            );
          })}

        {/* ======== LINES ======== */}
        {!isLoading &&
          Object.keys(lineConfig).map((dataKey) => {
            const _opacity = getOpacity(isClickable, selectedDataKey, dataKey);
            const hasSelection = selectedDataKey !== null;
            const isGlowing = glowingLines.includes(
              dataKey as NumericDataKeys<TData>
            );

            const getFilter = () => {
              if (isGlowing) {
                return `url(#${chartId}-line-glow-${dataKey})`;
              }
              return;
            };

            const handleLineClick = () => {
              if (!isClickable) {
                return;
              }
              setSelectedDataKey(selectedDataKey === dataKey ? null : dataKey);
            };

            return (
              <g key={`line-group-${dataKey}`}>
                {/* Invisible hit area for easier clicking */}
                {isClickable && (
                  <Line
                    activeDot={false}
                    connectNulls={connectNulls}
                    dataKey={dataKey}
                    dot={false}
                    legendType="none"
                    onClick={handleLineClick}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: "pointer" }}
                    tooltipType="none"
                    type={curveType}
                  />
                )}
                {/* Visible line */}
                <Line
                  activeDot={
                    activeDotVariant ? (
                      <ChartDot
                        chartId={`${chartId}-line`}
                        dataKey={dataKey}
                        fillOpacity={_opacity.dot}
                        type={activeDotVariant}
                      />
                    ) : (
                      false
                    )
                  }
                  connectNulls={connectNulls}
                  dataKey={dataKey}
                  dot={
                    dotVariant ? (
                      <ChartDot
                        chartId={`${chartId}-line`}
                        dataKey={dataKey}
                        fillOpacity={_opacity.dot}
                        type={dotVariant}
                      />
                    ) : (
                      false
                    )
                  }
                  filter={getFilter()}
                  stroke={`url(#${chartId}-line-colors-${dataKey})`}
                  strokeDasharray={
                    strokeVariant === "dashed"
                      ? "5 5"
                      : strokeVariant === "animated-dashed"
                        ? "5 5"
                        : undefined
                  }
                  strokeOpacity={_opacity.stroke}
                  strokeWidth={STROKE_WIDTH}
                  style={
                    isClickable
                      ? { cursor: "pointer", pointerEvents: "none" }
                      : undefined
                  }
                  type={curveType}
                >
                  {strokeVariant === "animated-dashed" && !hasSelection && (
                    <AnimatedDashedStyle />
                  )}
                </Line>
              </g>
            );
          })}

        {/* ======== LOADING BAR ======== */}
        {isLoading && (
          <Bar
            dataKey={LOADING_DATA_KEY}
            fill="currentColor"
            fillOpacity={0.15}
            isAnimationActive={false}
            legendType="none"
            radius={barRadius}
            style={{ mask: `url(#${chartId}-loading-mask)` }}
          />
        )}

        {!isLoading &&
          referenceLines.map((marker, index) =>
            marker.onClick ? (
              <ReferenceLine
                ifOverflow="visible"
                key={`${marker.x}-${marker.label ?? "reference-line"}-${index}-hit`}
                onClick={marker.onClick}
                stroke="transparent"
                strokeWidth={18}
                style={{ cursor: "pointer" }}
                x={marker.x}
              />
            ) : null
          )}

        {/* ======== CHART STYLES ======== */}
        <defs>
          {isLoading && (
            <LoadingPatternStyle
              chartId={chartId}
              onShimmerExit={onShimmerExit}
            />
          )}

          {/* Bar color gradients (vertical) */}
          <VerticalColorGradientStyle
            chartConfig={barConfig}
            chartId={chartId}
            prefix="bar"
          />

          {/* Area color gradients */}
          {areaConfig && (
            <>
              <HorizontalColorGradientStyle
                chartConfig={areaConfig}
                chartId={chartId}
                prefix="area"
              />
              <AreaFillGradientStyle
                chartConfig={areaConfig}
                chartId={chartId}
                opacity={areaOpacity}
                variant={areaVariant}
              />
            </>
          )}

          {/* Line color gradients (horizontal) */}
          <HorizontalColorGradientStyle
            chartConfig={lineConfig}
            chartId={chartId}
            prefix="line"
          />

          {/* Bar variant styles */}
          {barVariant === "hatched" && (
            <HatchedPatternStyle chartConfig={barConfig} chartId={chartId} />
          )}
          {barVariant === "duotone" && (
            <DuotonePatternStyle chartConfig={barConfig} chartId={chartId} />
          )}
          {barVariant === "duotone-reverse" && (
            <DuotoneReversePatternStyle
              chartConfig={barConfig}
              chartId={chartId}
            />
          )}
          {barVariant === "gradient" && (
            <GradientPatternStyle chartConfig={barConfig} chartId={chartId} />
          )}
          {barVariant === "stripped" && (
            <StrippedPatternStyle chartConfig={barConfig} chartId={chartId} />
          )}

          {/* Bar glow filters */}
          {glowingBars.length > 0 && (
            <BarGlowFilterStyle
              chartId={chartId}
              glowingBars={glowingBars as string[]}
            />
          )}

          {/* Line glow filters */}
          {glowingLines.length > 0 && (
            <LineGlowFilterStyle
              chartId={chartId}
              glowingLines={glowingLines as string[]}
            />
          )}
        </defs>
      </ComposedChart>
    </ChartContainer>
  );
}

// Calculate opacity values for stroke and dot based on selection state
const getOpacity = (
  isClickable: boolean,
  selectedDataKey: string | null,
  dataKey: string
) => {
  if (!isClickable || selectedDataKey === null) {
    return { stroke: 1, dot: 1 };
  }
  return selectedDataKey === dataKey
    ? { stroke: 1, dot: 1 }
    : { stroke: 0.3, dot: 0.3 };
};

function resolveBarStackId<TBarConfig extends Record<string, unknown>>(
  stackId:
    | string
    | Partial<Record<keyof TBarConfig & string, string>>
    | undefined,
  dataKey: string
) {
  if (typeof stackId === "string") {
    return stackId;
  }

  return stackId?.[dataKey as keyof TBarConfig & string];
}

// Animated dashed-stroke style for lines
const AnimatedDashedStyle = () => (
  <>
    <animate
      attributeName="stroke-dasharray"
      dur="1s"
      keyTimes="0;0.5;1"
      repeatCount="indefinite"
      values="5 5; 0 5; 5 5"
    />
    <animate
      attributeName="stroke-dashoffset"
      dur="1s"
      keyTimes="0;1"
      repeatCount="indefinite"
      values="0; -10"
    />
  </>
);

// Custom bar shape component with support for variants, glow effects, and interactions
type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  fillOpacity?: number;
  dataKey?: string;
  index?: number;
  background?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  [key: string]: unknown;
};

type CustomBarProps = {
  chartId: string;
  dataKey: string;
  barVariant: BarVariant;
  barRadius: number;
  filter?: string;
  minBarWidth?: number;
  isClickable?: boolean;
  isDatumClickable?: boolean;
  enableHoverHighlight?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
} & BarShapeProps;

const CustomBar = ({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fillOpacity = 1,
  background,
  chartId,
  dataKey,
  barVariant,
  barRadius,
  filter,
  minBarWidth,
  isClickable,
  isDatumClickable,
  enableHoverHighlight,
  onClick,
  onMouseEnter,
}: CustomBarProps) => {
  const getFill = () => {
    switch (barVariant) {
      case "hatched":
        return `url(#${chartId}-hatched-${dataKey})`;
      case "duotone":
        return `url(#${chartId}-duotone-${dataKey})`;
      case "duotone-reverse":
        return `url(#${chartId}-duotone-reverse-${dataKey})`;
      case "gradient":
        return `url(#${chartId}-gradient-${dataKey})`;
      case "stripped":
        return `url(#${chartId}-stripped-${dataKey})`;
      default:
        return `url(#${chartId}-bar-colors-${dataKey})`;
    }
  };

  const cursorStyle =
    isClickable || isDatumClickable || enableHoverHighlight
      ? { cursor: "pointer" }
      : undefined;
  const renderedWidth =
    height > 0 && minBarWidth !== undefined
      ? Math.max(width, minBarWidth)
      : width;
  const renderedX = getMinimumWidthBarX(x, width, renderedWidth);
  const hitAreaX = background?.x ?? renderedX;
  const hitAreaY = background?.y ?? y;
  const hitAreaWidth = background?.width ?? renderedWidth;
  const hitAreaHeight = background?.height ?? height;

  if (barVariant === "stripped") {
    return (
      <g onClick={onClick} style={cursorStyle}>
        <g
          className="transition-opacity duration-200"
          filter={filter}
          opacity={fillOpacity}
        >
          <rect
            fill={getFill()}
            height={height}
            width={renderedWidth}
            x={renderedX}
            y={y}
          />
          <rect
            fill={`url(#${chartId}-bar-colors-${dataKey})`}
            height={2}
            width={renderedWidth}
            x={renderedX}
            y={y}
          />
        </g>
        {enableHoverHighlight && (
          <rect
            fill="transparent"
            height={hitAreaHeight}
            onMouseEnter={onMouseEnter}
            width={hitAreaWidth}
            x={hitAreaX}
            y={hitAreaY}
          />
        )}
      </g>
    );
  }

  return (
    <g onClick={onClick} style={cursorStyle}>
      <rect
        className="transition-opacity duration-200"
        fill={getFill()}
        filter={filter}
        height={height}
        opacity={fillOpacity}
        rx={barRadius}
        ry={barRadius}
        width={renderedWidth}
        x={renderedX}
        y={y}
      />
      {enableHoverHighlight && (
        <rect
          fill="transparent"
          height={hitAreaHeight}
          onMouseEnter={onMouseEnter}
          width={hitAreaWidth}
          x={hitAreaX}
          y={hitAreaY}
        />
      )}
    </g>
  );
};

export function getMinimumWidthBarX(
  x: number,
  width: number,
  renderedWidth: number
) {
  return x - (renderedWidth - width) / 2;
}

// Create vertical color gradient for bars (top to bottom)
const VerticalColorGradientStyle = ({
  chartConfig,
  chartId,
  prefix,
}: {
  chartConfig: ChartConfig;
  chartId: string;
  prefix: string;
}) => (
  <>
    {Object.entries(chartConfig).map(([dataKey, config]) => {
      const colorsCount = getColorsCount(config);

      return (
        <linearGradient
          id={`${chartId}-${prefix}-colors-${dataKey}`}
          key={`${chartId}-${prefix}-colors-${dataKey}`}
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          {colorsCount === 1 ? (
            <>
              <stop offset="0%" stopColor={`var(--color-${dataKey}-0)`} />
              <stop offset="100%" stopColor={`var(--color-${dataKey}-0)`} />
            </>
          ) : (
            Array.from({ length: colorsCount }, (_, index) => (
              <stop
                key={index}
                offset={`${(index / (colorsCount - 1)) * 100}%`}
                stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
              />
            ))
          )}
        </linearGradient>
      );
    })}
  </>
);

// Horizontal color gradient for lines (left to right)
const HorizontalColorGradientStyle = ({
  chartConfig,
  chartId,
  prefix,
}: {
  chartConfig: ChartConfig;
  chartId: string;
  prefix: string;
}) => (
  <>
    {Object.entries(chartConfig).map(([dataKey, config]) => {
      const colorsCount = getColorsCount(config);

      return (
        <linearGradient
          id={`${chartId}-${prefix}-colors-${dataKey}`}
          key={`${chartId}-${prefix}-colors-${dataKey}`}
          x1="0"
          x2="1"
          y1="0"
          y2="0"
        >
          {colorsCount === 1 ? (
            <>
              <stop offset="0%" stopColor={`var(--color-${dataKey}-0)`} />
              <stop offset="100%" stopColor={`var(--color-${dataKey}-0)`} />
            </>
          ) : (
            Array.from({ length: colorsCount }, (_, index) => (
              <stop
                key={index}
                offset={`${(index / (colorsCount - 1)) * 100}%`}
                stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
              />
            ))
          )}
        </linearGradient>
      );
    })}
  </>
);

const AreaFillGradientStyle = ({
  chartConfig,
  chartId,
  opacity,
  variant,
}: {
  chartConfig: ChartConfig;
  chartId: string;
  opacity: number;
  variant: AreaVariant;
}) => {
  const renderStops = (
    dataKey: string,
    colorsCount: number,
    reverse = false
  ) => (
    <>
      {Array.from({ length: colorsCount }, (_, index) => {
        const offset = (index / Math.max(colorsCount - 1, 1)) * 100;
        return (
          <stop
            key={index}
            offset={`${offset}%`}
            stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
            stopOpacity={
              reverse
                ? opacity * (0.35 + offset / 160)
                : opacity * (1 - offset / 160)
            }
          />
        );
      })}
      <stop
        offset="100%"
        stopColor={`var(--color-${dataKey}-0)`}
        stopOpacity={reverse ? opacity : 0.03}
      />
    </>
  );

  return (
    <>
      {(variant === "lines" || variant === "hatched") && (
        <pattern
          height={variant === "hatched" ? "10" : "6"}
          id={`${chartId}-area-lines-mask-pattern`}
          patternTransform={variant === "hatched" ? "rotate(22)" : "rotate(45)"}
          patternUnits="userSpaceOnUse"
          width={variant === "hatched" ? "10" : "6"}
        >
          <line stroke="white" strokeWidth="1.5" x1="0" x2="0" y1="0" y2="10" />
        </pattern>
      )}
      {variant === "dotted" && (
        <pattern
          height="8"
          id={`${chartId}-area-dotted-mask-pattern`}
          patternUnits="userSpaceOnUse"
          width="8"
        >
          <circle cx="4" cy="4" fill="white" r="1" />
        </pattern>
      )}
      {Object.entries(chartConfig).map(([dataKey, config]) => {
        const colorsCount = getColorsCount(config);

        if (variant === "solid") {
          return (
            <pattern
              height="100%"
              id={`${chartId}-area-fill-${dataKey}`}
              key={`${chartId}-area-fill-${dataKey}`}
              patternUnits="userSpaceOnUse"
              width="100%"
            >
              <rect
                fill={`url(#${chartId}-area-colors-${dataKey})`}
                height="100%"
                opacity={opacity}
                width="100%"
              />
            </pattern>
          );
        }

        if (
          variant === "dotted" ||
          variant === "lines" ||
          variant === "hatched"
        ) {
          const maskPattern =
            variant === "dotted"
              ? `${chartId}-area-dotted-mask-pattern`
              : `${chartId}-area-lines-mask-pattern`;

          return (
            <g key={`${chartId}-area-fill-group-${dataKey}`}>
              <mask id={`${chartId}-area-mask-${dataKey}`}>
                <rect
                  fill={`url(#${maskPattern})`}
                  fillOpacity={variant === "hatched" ? 0.65 : 0.85}
                  height="100%"
                  width="100%"
                />
              </mask>
              <pattern
                height="100%"
                id={`${chartId}-area-fill-${dataKey}`}
                patternUnits="userSpaceOnUse"
                width="100%"
              >
                <rect
                  fill={`url(#${chartId}-area-colors-${dataKey})`}
                  height="100%"
                  mask={`url(#${chartId}-area-mask-${dataKey})`}
                  opacity={opacity}
                  width="100%"
                />
              </pattern>
            </g>
          );
        }

        return (
          <linearGradient
            id={`${chartId}-area-fill-${dataKey}`}
            key={`${chartId}-area-fill-${dataKey}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            {renderStops(dataKey, colorsCount, variant === "gradient-reverse")}
          </linearGradient>
        );
      })}
    </>
  );
};

// Create hatched diagonal pattern style for bars using SVG masks
const HatchedPatternStyle = ({
  chartConfig,
  chartId,
}: {
  chartConfig: ChartConfig;
  chartId: string;
}) => (
  <>
    <pattern
      height="5"
      id={`${chartId}-hatched-mask-pattern`}
      patternTransform="rotate(-45)"
      patternUnits="userSpaceOnUse"
      width="5"
      x="0"
      y="0"
    >
      <rect fill="white" fillOpacity={0.3} height="5" width="5" />
      <rect fill="white" fillOpacity={1} height="5" width="1.5" />
    </pattern>

    {Object.keys(chartConfig).map((dataKey) => (
      <g key={`${chartId}-hatched-group-${dataKey}`}>
        <mask id={`${chartId}-hatched-mask-${dataKey}`}>
          <rect
            fill={`url(#${chartId}-hatched-mask-pattern)`}
            height="100%"
            width="100%"
          />
        </mask>
        <pattern
          height="100%"
          id={`${chartId}-hatched-${dataKey}`}
          patternUnits="userSpaceOnUse"
          width="100%"
        >
          <rect
            fill={`url(#${chartId}-bar-colors-${dataKey})`}
            height="100%"
            mask={`url(#${chartId}-hatched-mask-${dataKey})`}
            width="100%"
          />
        </pattern>
      </g>
    ))}
  </>
);

const DuotonePatternStyle = ({
  chartConfig,
  chartId,
}: {
  chartConfig: ChartConfig;
  chartId: string;
}) => (
  <>
    {Object.entries(chartConfig).map(([dataKey, config]) => {
      const colorsCount = getColorsCount(config);

      return (
        <g key={`${chartId}-duotone-group-${dataKey}`}>
          <linearGradient
            gradientUnits="objectBoundingBox"
            id={`${chartId}-duotone-mask-gradient-${dataKey}`}
            x1="0"
            x2="1"
            y1="0"
            y2="0"
          >
            <stop offset="50%" stopColor="white" stopOpacity={0.4} />
            <stop offset="50%" stopColor="white" stopOpacity={1} />
          </linearGradient>

          <linearGradient
            gradientUnits="objectBoundingBox"
            id={`${chartId}-duotone-colors-${dataKey}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            {colorsCount === 1 ? (
              <>
                <stop offset="0%" stopColor={`var(--color-${dataKey}-0)`} />
                <stop offset="100%" stopColor={`var(--color-${dataKey}-0)`} />
              </>
            ) : (
              Array.from({ length: colorsCount }, (_, index) => (
                <stop
                  key={index}
                  offset={`${(index / (colorsCount - 1)) * 100}%`}
                  stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
                />
              ))
            )}
          </linearGradient>

          <mask
            id={`${chartId}-duotone-mask-${dataKey}`}
            maskContentUnits="objectBoundingBox"
          >
            <rect
              fill={`url(#${chartId}-duotone-mask-gradient-${dataKey})`}
              height="1"
              width="1"
              x="0"
              y="0"
            />
          </mask>

          <pattern
            height="1"
            id={`${chartId}-duotone-${dataKey}`}
            patternContentUnits="objectBoundingBox"
            patternUnits="objectBoundingBox"
            width="1"
          >
            <rect
              fill={`url(#${chartId}-duotone-colors-${dataKey})`}
              height="1"
              mask={`url(#${chartId}-duotone-mask-${dataKey})`}
              width="1"
              x="0"
              y="0"
            />
          </pattern>
        </g>
      );
    })}
  </>
);

const DuotoneReversePatternStyle = ({
  chartConfig,
  chartId,
}: {
  chartConfig: ChartConfig;
  chartId: string;
}) => (
  <>
    {Object.entries(chartConfig).map(([dataKey, config]) => {
      const colorsCount = getColorsCount(config);

      return (
        <g key={`${chartId}-duotone-reverse-group-${dataKey}`}>
          <linearGradient
            gradientUnits="objectBoundingBox"
            id={`${chartId}-duotone-reverse-mask-gradient-${dataKey}`}
            x1="0"
            x2="1"
            y1="0"
            y2="0"
          >
            <stop offset="50%" stopColor="white" stopOpacity={1} />
            <stop offset="50%" stopColor="white" stopOpacity={0.4} />
          </linearGradient>

          <linearGradient
            gradientUnits="objectBoundingBox"
            id={`${chartId}-duotone-reverse-colors-${dataKey}`}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            {colorsCount === 1 ? (
              <>
                <stop offset="0%" stopColor={`var(--color-${dataKey}-0)`} />
                <stop offset="100%" stopColor={`var(--color-${dataKey}-0)`} />
              </>
            ) : (
              Array.from({ length: colorsCount }, (_, index) => (
                <stop
                  key={index}
                  offset={`${(index / (colorsCount - 1)) * 100}%`}
                  stopColor={`var(--color-${dataKey}-${index}, var(--color-${dataKey}-0))`}
                />
              ))
            )}
          </linearGradient>

          <mask
            id={`${chartId}-duotone-reverse-mask-${dataKey}`}
            maskContentUnits="objectBoundingBox"
          >
            <rect
              fill={`url(#${chartId}-duotone-reverse-mask-gradient-${dataKey})`}
              height="1"
              width="1"
              x="0"
              y="0"
            />
          </mask>

          <pattern
            height="1"
            id={`${chartId}-duotone-reverse-${dataKey}`}
            patternContentUnits="objectBoundingBox"
            patternUnits="objectBoundingBox"
            width="1"
          >
            <rect
              fill={`url(#${chartId}-duotone-reverse-colors-${dataKey})`}
              height="1"
              mask={`url(#${chartId}-duotone-reverse-mask-${dataKey})`}
              width="1"
              x="0"
              y="0"
            />
          </pattern>
        </g>
      );
    })}
  </>
);

const GradientPatternStyle = ({
  chartConfig,
  chartId,
}: {
  chartConfig: ChartConfig;
  chartId: string;
}) => (
  <>
    <linearGradient
      id={`${chartId}-gradient-mask-gradient`}
      x1="0"
      x2="0"
      y1="0"
      y2="1"
    >
      <stop offset="20%" stopColor="white" stopOpacity={1} />
      <stop offset="90%" stopColor="white" stopOpacity={0} />
    </linearGradient>

    {Object.keys(chartConfig).map((dataKey) => (
      <g key={`${chartId}-gradient-group-${dataKey}`}>
        <mask id={`${chartId}-gradient-mask-${dataKey}`}>
          <rect
            fill={`url(#${chartId}-gradient-mask-gradient)`}
            height="100%"
            width="100%"
          />
        </mask>
        <pattern
          height="100%"
          id={`${chartId}-gradient-${dataKey}`}
          patternUnits="userSpaceOnUse"
          width="100%"
        >
          <rect
            fill={`url(#${chartId}-bar-colors-${dataKey})`}
            height="100%"
            mask={`url(#${chartId}-gradient-mask-${dataKey})`}
            width="100%"
          />
        </pattern>
      </g>
    ))}
  </>
);

const StrippedPatternStyle = ({
  chartConfig,
  chartId,
}: {
  chartConfig: ChartConfig;
  chartId: string;
}) => (
  <>
    <linearGradient
      id={`${chartId}-stripped-mask-gradient`}
      x1="0"
      x2="0"
      y1="0"
      y2="1"
    >
      <stop offset="0%" stopColor="white" stopOpacity={0.4} />
      <stop offset="100%" stopColor="white" stopOpacity={0.1} />
    </linearGradient>

    {Object.keys(chartConfig).map((dataKey) => (
      <g key={`${chartId}-stripped-group-${dataKey}`}>
        <mask id={`${chartId}-stripped-mask-${dataKey}`}>
          <rect
            fill={`url(#${chartId}-stripped-mask-gradient)`}
            height="100%"
            width="100%"
          />
        </mask>
        <pattern
          height="100%"
          id={`${chartId}-stripped-${dataKey}`}
          patternUnits="userSpaceOnUse"
          width="100%"
        >
          <rect
            fill={`url(#${chartId}-bar-colors-${dataKey})`}
            height="100%"
            mask={`url(#${chartId}-stripped-mask-${dataKey})`}
            width="100%"
          />
        </pattern>
      </g>
    ))}
  </>
);

// Apply soft glow filter effect to bars using SVG filters
const BarGlowFilterStyle = ({
  chartId,
  glowingBars,
}: {
  chartId: string;
  glowingBars: string[];
}) => (
  <>
    {glowingBars.map((dataKey) => (
      <filter
        height="300%"
        id={`${chartId}-bar-glow-${dataKey}`}
        key={`${chartId}-bar-glow-${dataKey}`}
        width="300%"
        x="-100%"
        y="-100%"
      >
        <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="8" />
        <feColorMatrix
          in="blur"
          result="glow"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0"
        />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    ))}
  </>
);

const LineGlowFilterStyle = ({
  chartId,
  glowingLines,
}: {
  chartId: string;
  glowingLines: string[];
}) => (
  <>
    {glowingLines.map((dataKey) => (
      <filter
        height="200%"
        id={`${chartId}-line-glow-${dataKey}`}
        key={`${chartId}-line-glow-${dataKey}`}
        width="200%"
        x="-50%"
        y="-50%"
      >
        <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="10" />
        <feColorMatrix
          in="blur"
          result="glow"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 2 0"
        />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    ))}
  </>
);

// Generate gradient stops with smooth sine-based easing for loading animation
const generateEasedGradientStops = (
  steps = 17,
  minOpacity = 0.05,
  maxOpacity = 0.9
) =>
  Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const eased = Math.sin(t * Math.PI) ** 2;
    const opacity = minOpacity + eased * (maxOpacity - minOpacity);
    return {
      offset: `${(t * 100).toFixed(0)}%`,
      opacity: Number(opacity.toFixed(3)),
    };
  });

export function useLoadingData(isLoading: boolean, loadingBars = 12) {
  const [loadingDataKey, setLoadingDataKey] = useState(false);

  const onShimmerExit = useCallback(() => {
    if (isLoading) {
      setLoadingDataKey((prev) => !prev);
    }
  }, [isLoading]);

  const loadingData = useMemo(
    () => getLoadingData(loadingBars, 20, 80),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadingBars, loadingDataKey]
  );

  return { loadingData, onShimmerExit };
}

const LoadingPatternStyle = ({
  chartId,
  onShimmerExit,
}: {
  chartId: string;
  onShimmerExit: () => void;
}) => {
  const gradientStops = generateEasedGradientStops();
  const patternWidth = 3;
  const startX = -1;
  const endX = 2;
  const lastXRef = useRef(startX);

  return (
    <>
      <linearGradient
        id={`${chartId}-loading-mask-gradient`}
        x1="0"
        x2="1"
        y1="0"
        y2="0"
      >
        {gradientStops.map(({ offset, opacity }) => (
          <stop
            key={offset}
            offset={offset}
            stopColor="white"
            stopOpacity={opacity}
          />
        ))}
      </linearGradient>
      <pattern
        height="1"
        id={`${chartId}-loading-mask-pattern`}
        patternContentUnits="objectBoundingBox"
        patternTransform="rotate(25)"
        patternUnits="objectBoundingBox"
        width={patternWidth}
        x="0"
        y="0"
      >
        <motion.rect
          animate={{ x: endX }}
          fill={`url(#${chartId}-loading-mask-gradient)`}
          height="1"
          initial={{ x: startX }}
          onUpdate={(latest) => {
            const xValue = typeof latest.x === "number" ? latest.x : startX;
            const lastX = lastXRef.current;
            if (xValue >= 1 && lastX < 1) {
              onShimmerExit();
            }
            lastXRef.current = xValue;
          }}
          transition={{
            duration: LOADING_ANIMATION_DURATION / 1000,
            ease: "linear",
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "loop",
          }}
          width="1"
          y="0"
        />
      </pattern>
      <mask id={`${chartId}-loading-mask`} maskUnits="userSpaceOnUse">
        <rect
          fill={`url(#${chartId}-loading-mask-pattern)`}
          height="100%"
          width="100%"
        />
      </mask>
    </>
  );
};
