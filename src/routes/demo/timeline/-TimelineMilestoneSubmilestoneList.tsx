import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import {
  EditableFilterChip,
  EditableNumberChip,
} from "#/components/ui/editable-chip.tsx";
import type { DemoSubmilestone } from "./-timeline-milestone-submilestones.ts";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

function SubmilestoneStatusIcon({
  status,
}: {
  status: NonNullable<DemoSubmilestone["status"]>;
}) {
  if (status === "done") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className="size-3.5 shrink-0 text-emerald-500"
      />
    );
  }

  if (status === "in_progress") {
    return (
      <Loader2
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin text-sky-500"
      />
    );
  }

  return (
    <Circle
      aria-hidden="true"
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  );
}

function formatSubmilestoneSupplementalMeta(submilestone: DemoSubmilestone) {
  const parts: string[] = [];
  if (submilestone.durationDays !== undefined) {
    parts.push(
      `${submilestone.durationDays} day${submilestone.durationDays === 1 ? "" : "s"}`
    );
  }
  return parts.join(" · ");
}

export function TimelineMilestoneSubmilestoneList({
  milestoneKey,
  submilestones,
  testIdPrefix = "timeline-milestone-submilestone",
}: {
  milestoneKey: string;
  submilestones: DemoSubmilestone[];
  testIdPrefix?: string;
}) {
  if (submilestones.length === 0) {
    return (
      <p
        className="mt-2 text-muted-foreground text-xs"
        data-testid={`${testIdPrefix}-empty-${milestoneKey}`}
      >
        No sub-milestones are defined for this milestone yet.
      </p>
    );
  }

  const doneCount = submilestones.filter((row) => row.status === "done").length;
  const activeCount = submilestones.filter(
    (row) => row.status === "in_progress"
  ).length;

  return (
    <section
      className="border-border border-t pt-3"
      data-testid={`${testIdPrefix}-section-${milestoneKey}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-[10px] text-muted-foreground uppercase">
          Sub-milestones
        </p>
        {submilestones.some((row) => row.status) ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {doneCount}/{submilestones.length} done
            {activeCount > 0 ? ` · ${activeCount} active` : ""}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 grid gap-2">
        {submilestones.map((submilestone) => {
          const supplementalMeta =
            formatSubmilestoneSupplementalMeta(submilestone);
          const budgetDollars = Math.round(
            (submilestone.budgetCents ?? 0) / 100
          );
          return (
            <li
              data-testid={`${testIdPrefix}-${submilestone.key}`}
              key={submilestone.key}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <EditableFilterChip
                  className="w-full justify-start"
                  Icon={
                    submilestone.status ? (
                      <SubmilestoneStatusIcon status={submilestone.status} />
                    ) : undefined
                  }
                  labelKey={submilestone.name}
                  testId={`${testIdPrefix}-chip-${submilestone.key}`}
                  tone={
                    submilestone.budgetCents === undefined
                      ? "neutral"
                      : "accent"
                  }
                  type="value"
                />
                <EditableNumberChip
                  ariaLabel={`${submilestone.name} budget`}
                  disabled
                  formatDisplay={(value) => money(value)}
                  inputWidth="4.6rem"
                  min={0}
                  onCommit={() => undefined}
                  prefix="$"
                  reserveWidth="6.9rem"
                  size="metric-sm"
                  step={1000}
                  testId={`${testIdPrefix}-budget-${submilestone.key}`}
                  value={budgetDollars}
                  weight="semibold"
                />
                {submilestone.status ? (
                  <span className="sr-only">Status: {submilestone.status}</span>
                ) : null}
                {submilestone.description || supplementalMeta ? (
                  <div className="col-span-2 min-w-0 px-2.5">
                    {submilestone.description ? (
                      <p
                        className="text-muted-foreground text-xs leading-relaxed"
                        data-testid={`${testIdPrefix}-description-${submilestone.key}`}
                      >
                        {submilestone.description}
                      </p>
                    ) : null}
                    {supplementalMeta ? (
                      <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                        {supplementalMeta}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
