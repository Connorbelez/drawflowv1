import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import { cn } from "#/lib/utils";
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
    <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
  );
}

function formatSubmilestoneMeta(submilestone: DemoSubmilestone) {
  const parts: string[] = [];
  if (submilestone.budgetCents !== undefined) {
    parts.push(money(submilestone.budgetCents / 100));
  }
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
          const meta = formatSubmilestoneMeta(submilestone);
          return (
            <li
              className="rounded-md border border-border bg-muted/25 px-2.5 py-2"
              data-testid={`${testIdPrefix}-${submilestone.key}`}
              key={submilestone.key}
            >
              <div className="flex items-start gap-2">
                {submilestone.status ? (
                  <SubmilestoneStatusIcon status={submilestone.status} />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "font-medium text-sm leading-snug",
                      submilestone.status === "done" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {submilestone.name}
                  </p>
                  {submilestone.description ? (
                    <p
                      className="mt-0.5 text-muted-foreground text-xs leading-relaxed"
                      data-testid={`${testIdPrefix}-description-${submilestone.key}`}
                    >
                      {submilestone.description}
                    </p>
                  ) : null}
                  {meta ? (
                    <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                      {meta}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
