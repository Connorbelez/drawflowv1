"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { convexWorkspaceToTimelineState } from "#/routes/demo/timeline/-timeline-convex-adapter";
import { TimelineDemoWorkspace } from "#/routes/demo/timeline/index";

interface BuildTimelinePanelProps {
  timelinePlanId: Id<"demo_timelinePlans"> | null;
}

export function BuildTimelinePanel({ timelinePlanId }: BuildTimelinePanelProps) {
  const workspace = useQuery(
    api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
    timelinePlanId ? { planId: timelinePlanId } : "skip",
  );

  if (!timelinePlanId) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-6"
        data-testid="build-detail-timeline-empty"
      >
        <h3 className="font-semibold text-sm">Timeline</h3>
        <p className="mt-2 text-[12px] text-muted-foreground">
          This build does not have a durable timeline plan yet. Approve the
          build's proposal from the backoffice queue to provision one.
        </p>
      </section>
    );
  }

  if (workspace === undefined) {
    return (
      <section
        className="grid place-items-center rounded-xl border border-border bg-card p-12"
        data-testid="build-detail-timeline-loading"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading timeline plan…
        </div>
      </section>
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-card"
      data-testid="build-detail-timeline"
    >
      <TimelineDemoWorkspace
        durablePlanId={timelinePlanId}
        initialRole="lender"
        initialState={convexWorkspaceToTimelineState(workspace)}
        planSummary={{
          includedCount: workspace.milestones.length,
          templateTitle: workspace.plan.buildName,
          totalBudget: Math.round(workspace.plan.totalBudgetCents / 100),
        }}
      />
    </div>
  );
}
