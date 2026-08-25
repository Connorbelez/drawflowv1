import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock3,
  FileStack,
  type LucideIcon,
  MailWarning,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { cn } from "#/lib/utils.ts";
import type { QuoteRoundRegisterRow } from "./QuoteRoundsSurfaceContracts.ts";
import {
  deliveryLabel,
  hasScopeUpdate,
  LIFECYCLE_PHASES,
  stateLabel,
} from "./QuoteRoundsSurfaceContracts.ts";

export function ScopeUpdateBadge({
  className,
  row,
}: {
  className?: string;
  row: QuoteRoundRegisterRow;
}) {
  return hasScopeUpdate(row) ? (
    <Badge className={className} variant="warning">
      Update available
    </Badge>
  ) : null;
}

export function LifecycleRail({
  phase,
}: {
  phase: QuoteRoundRegisterRow["state"];
}) {
  const cancelled = phase === "cancelled";
  const activeIndex = cancelled
    ? LIFECYCLE_PHASES.length - 1
    : LIFECYCLE_PHASES.indexOf(phase);
  return (
    <div
      aria-label={`Lifecycle: ${stateLabel(phase)}`}
      className="flex items-center pr-5"
      role="img"
    >
      {LIFECYCLE_PHASES.map((item, index) => {
        const completed = !cancelled && index < activeIndex;
        const active = index === activeIndex;
        return (
          <div
            className="flex min-w-0 flex-1 items-center last:flex-none"
            key={item}
          >
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border text-[0.625rem]",
                completed && "border-success/50 bg-success/12 text-success",
                active && "border-primary bg-primary text-primary-foreground",
                !(completed || active) && "text-muted-foreground"
              )}
              title={stateLabel(item)}
            >
              {completed ? <Check className="size-3" /> : index + 1}
            </span>
            {index < LIFECYCLE_PHASES.length - 1 &&
            !(cancelled && item === "closed") ? (
              <span
                className={cn(
                  "h-px min-w-2 flex-1 bg-border",
                  completed && "bg-success/50"
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CurrentState({ row }: { row: QuoteRoundRegisterRow }) {
  const Icon = currentStateIcon(row);
  return (
    <div className="flex min-w-0 items-start gap-2 pr-3 text-xs">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0 text-muted-foreground",
          row.attention?.tone === "critical" && "text-destructive",
          row.attention?.tone === "warning" && "text-warning"
        )}
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {row.attention?.label ?? stateLabel(row.state)}
        </span>
        <span className="mt-1 block truncate text-muted-foreground">
          {row.attention?.detail ?? deliveryLabel(row)}
        </span>
      </span>
    </div>
  );
}

function currentStateIcon(row: QuoteRoundRegisterRow): LucideIcon {
  if (row.attention?.tone === "critical") {
    return MailWarning;
  }
  if (row.attention?.tone === "warning") {
    return AlertTriangle;
  }
  switch (row.state) {
    case "closed":
      return ShieldCheck;
    case "draft":
      return FileStack;
    case "cancelled":
      return XCircle;
    case "open":
      return Clock3;
    default:
      return CalendarClock;
  }
}

function formatPreferredTotal(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 100);
}

export function PreferredQuote({ row }: { row: QuoteRoundRegisterRow }) {
  if (!row.preferredQuote) {
    return <span className="text-muted-foreground text-xs">Not selected</span>;
  }
  return (
    <span className="grid gap-0.5 text-xs">
      <span className="font-medium text-success">Preferred Quote</span>
      <span className="text-muted-foreground">
        R{row.preferredQuote.revision} ·{" "}
        {formatPreferredTotal(row.preferredQuote.canonicalTotalCents)}
      </span>
    </span>
  );
}
