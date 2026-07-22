import * as React from "react";
import { cn } from "#/lib/utils.ts";

export type DotVariant = "default" | "border" | "colored-border";

type ChartDotProps = {
  cx?: number;
  cy?: number;
  dataKey: string;
  chartId: string;
  className?: string;
  fillOpacity?: number;
  type?: DotVariant;
};

const ChartDot = React.memo(function ChartDot({
  cx,
  cy,
  dataKey,
  chartId,
  className,
  fillOpacity = 1,
  type = "default",
}: ChartDotProps) {
  const dotId = React.useId().replace(/:/g, "");
  const gradientUrl = `url(#${chartId}-colors-${String(dataKey)})`;

  if (cx === undefined || cy === undefined) {
    return null;
  }

  switch (type) {
    case "border":
      return (
        <PrimaryBorderDot
          className={className}
          cx={cx}
          cy={cy}
          dotId={dotId}
          fillOpacity={fillOpacity}
          gradientUrl={gradientUrl}
        />
      );
    case "colored-border":
      return (
        <ColoredBorderDot
          className={className}
          cx={cx}
          cy={cy}
          dotId={dotId}
          fillOpacity={fillOpacity}
          gradientUrl={gradientUrl}
        />
      );
    default:
      return (
        <DefaultDot
          className={className}
          cx={cx}
          cy={cy}
          dotId={dotId}
          fillOpacity={fillOpacity}
          gradientUrl={gradientUrl}
        />
      );
  }
});

type DotVariantProps = {
  cx: number;
  cy: number;
  dotId: string;
  fillOpacity: number;
  gradientUrl: string;
  className?: string;
};

const DefaultDot = React.memo(
  ({ cx, cy, dotId, fillOpacity, gradientUrl, className }: DotVariantProps) => {
    const r = 3;
    return (
      <g className={className}>
        <defs>
          <clipPath id={`dot-clip-${dotId}`}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        {/* Full-width gradient rectangle clipped to dot shape */}
        <rect
          clipPath={`url(#dot-clip-${dotId})`}
          fill={gradientUrl}
          fillOpacity={fillOpacity}
          height={r * 2}
          width="100%"
          x="0"
          y={cy - r}
        />
      </g>
    );
  }
);

DefaultDot.displayName = "DefaultDot";

const PrimaryBorderDot = React.memo(
  ({ cx, cy, dotId, fillOpacity, gradientUrl, className }: DotVariantProps) => {
    const r = 6;
    const strokeWidth = 5;
    return (
      <g className={cn(className, "text-background")}>
        <defs>
          <clipPath id={`dot-clip-${dotId}`}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        {/* Background stroke (border) */}
        <circle cx={cx} cy={cy} fill="currentColor" r={r} />
        {/* Inner gradient circle clipped */}
        <rect
          clipPath={`url(#dot-clip-inner-${dotId})`}
          fill={gradientUrl}
          fillOpacity={fillOpacity}
          height={(r - strokeWidth / 2) * 2}
          width="100%"
          x="0"
          y={cy - (r - strokeWidth / 2)}
        />
        <defs>
          <clipPath id={`dot-clip-inner-${dotId}`}>
            <circle cx={cx} cy={cy} r={r - strokeWidth / 2} />
          </clipPath>
        </defs>
      </g>
    );
  }
);

PrimaryBorderDot.displayName = "PrimaryBorderDot";

const ColoredBorderDot = React.memo(
  ({ cx, cy, dotId, fillOpacity, gradientUrl, className }: DotVariantProps) => {
    const r = 3;
    const strokeWidth = 1;
    return (
      <g className={cn(className, "text-background")}>
        <defs>
          <clipPath id={`dot-clip-${dotId}`}>
            <circle cx={cx} cy={cy} r={r + strokeWidth / 2} />
          </clipPath>
        </defs>
        {/* Gradient stroke (border) via clipped rect */}
        <rect
          clipPath={`url(#dot-clip-${dotId})`}
          fill={gradientUrl}
          fillOpacity={fillOpacity}
          height={(r + strokeWidth / 2) * 2}
          width="100%"
          x="0"
          y={cy - r - strokeWidth / 2}
        />
        {/* Inner solid fill */}
        <circle cx={cx} cy={cy} fill="currentColor" r={r - strokeWidth / 2} />
      </g>
    );
  }
);

ColoredBorderDot.displayName = "ColoredBorderDot";

export { ChartDot };
