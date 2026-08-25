"use client";

import { motion } from "motion/react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type ChartConfig,
  getColorsCount,
  getLoadingData,
} from "#/components/evilcharts/ui/chart.tsx";

const LOADING_ANIMATION_DURATION = 2000;

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
    // deps exhaustive; stale eslint-disable removed (compiler-safe)
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

export {
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
  getOpacity,
  resolveBarStackId,
};
