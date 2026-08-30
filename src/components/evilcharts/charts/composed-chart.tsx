"use client";

import {
  type ComponentProps,
  useCallback,
  useId,
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
import {
  AnimatedDashedStyle,
  AreaFillGradientStyle,
  BarGlowFilterStyle,
  CustomBar,
  DuotonePatternStyle,
  DuotoneReversePatternStyle,
  GradientPatternStyle,
  HatchedPatternStyle,
  HorizontalColorGradientStyle,
  LineGlowFilterStyle,
  LoadingPatternStyle,
  StrippedPatternStyle,
  VerticalColorGradientStyle,
  getMinimumWidthBarX as calculateMinimumWidthBarX,
  getOpacity,
  resolveBarStackId,
  useLoadingData as useRendererLoadingData,
} from "./composed-chart-renderers.tsx";

export function getMinimumWidthBarX(
  x: number,
  width: number,
  renderedWidth: number
) {
  return calculateMinimumWidthBarX(x, width, renderedWidth);
}

export function useLoadingData(isLoading: boolean, loadingBars = 12) {
  return useRendererLoadingData(isLoading, loadingBars);
}

// Constants
const STROKE_WIDTH = 2;
const DEFAULT_BAR_RADIUS = 4;
const LOADING_DATA_KEY = "loading";

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
