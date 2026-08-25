import { differenceInDays, formatDistanceStrict } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { cn } from "#/lib/utils.ts";
import {
  ANNUAL_DRAW_INTEREST_RATE,
  DRAW_FEE_AMOUNT,
} from "./build-workspace-demo-contracts";
import type { DrawGroup, Milestone, WorkspaceIssue } from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function issueTone(
  issue: { severity?: WorkspaceIssue["severity"] } | undefined
) {
  if (issue?.severity === "blocking") {
    return "border-red-300/40 bg-red-500/15 text-red-700 dark:text-red-100";
  }
  if (issue?.severity === "info") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-700 dark:text-cyan-100";
  }
  return "border-amber-300/30 bg-amber-300/10 text-amber-800 dark:text-amber-100";
}

export function IssueChip({
  compact = false,
  issues,
  testId,
}: {
  compact?: boolean;
  issues: WorkspaceIssue[];
  testId: string;
}) {
  const visibleIssues = issues.filter((issue) => !issue.dismissed);
  const primaryIssue =
    visibleIssues.find((issue) => issue.severity === "blocking") ??
    visibleIssues[0];

  if (!primaryIssue) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 font-medium text-[0.62rem]",
              issueTone(primaryIssue)
            )}
            data-gantt-interactive="true"
            data-testid={testId}
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <AlertTriangle className="size-3" />
            {compact ? visibleIssues.length : `${visibleIssues.length} issue`}
          </button>
        }
      />
      <PopoverContent
        className="w-80 border border-border bg-popover text-foreground"
        data-testid={`${testId}-popover`}
        side="right"
      >
        <IssuePopoverBody issue={primaryIssue} />
      </PopoverContent>
    </Popover>
  );
}

export function IssueList({
  issues,
  surface,
  testIdPrefix,
}: {
  issues: WorkspaceIssue[];
  surface: string;
  testIdPrefix: string;
}) {
  const visibleIssues = issues.filter((issue) => !issue.dismissed);
  if (visibleIssues.length === 0) {
    return null;
  }

  return (
    <>
      {visibleIssues.map((issue) => (
        <Popover key={`${surface}-${issue.id}`}>
          <PopoverTrigger
            render={
              <button
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-sm border px-2 font-medium text-[0.68rem]",
                  issueTone(issue)
                )}
                data-testid={`${testIdPrefix}-${issue.id}`}
                onClick={(event) => event.stopPropagation()}
                type="button"
              >
                <AlertTriangle className="size-3" />
                {issue.title}
              </button>
            }
          />
          <PopoverContent
            className="w-80 border border-border bg-popover text-foreground"
            data-testid={`${testIdPrefix}-${issue.id}-popover`}
            side="bottom"
          >
            <IssuePopoverBody issue={issue} />
          </PopoverContent>
        </Popover>
      ))}
    </>
  );
}

export function IssuePopoverBody({ issue }: { issue: WorkspaceIssue }) {
  const workspace = useBuildWorkspace();
  const firstAffectedMilestoneId = issue.milestoneIds.find((milestoneId) =>
    workspace.milestones.some((milestone) => milestone.id === milestoneId)
  );
  const openAffectedMilestone = () => {
    if (!firstAffectedMilestoneId) {
      return;
    }
    workspace.selectMilestone(firstAffectedMilestoneId);
    window.dispatchEvent(
      new CustomEvent("drawflow-open-milestone-detail", {
        detail: firstAffectedMilestoneId,
      })
    );
  };

  return (
    <div className="grid gap-3">
      <button
        className={cn(
          "rounded-sm text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/50",
          firstAffectedMilestoneId && "cursor-pointer hover:bg-muted/40"
        )}
        data-testid={`issue-focus-${issue.id}`}
        disabled={!firstAffectedMilestoneId}
        onClick={openAffectedMilestone}
        title={
          firstAffectedMilestoneId
            ? "Open the first affected milestone"
            : undefined
        }
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">{issue.title}</h3>
          <Badge className={cn("rounded-sm", issueTone(issue))}>
            {issue.severity}
          </Badge>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">{issue.message}</p>
      </button>
      <div className="grid gap-1 text-muted-foreground text-xs">
        <div>
          <span className="text-muted-foreground">Affected: </span>
          {[
            ...issue.milestoneIds,
            ...issue.drawGroupIds,
            ...issue.dependencyIds,
          ].join(", ")}
        </div>
        <div>
          <span className="text-muted-foreground">Why it matters: </span>
          {issue.impact}
        </div>
        <div>
          <span className="text-muted-foreground">
            Blocks release/submission:{" "}
          </span>
          {issue.severity === "blocking" ? "Yes" : "No"}
        </div>
        <div>
          <span className="text-muted-foreground">Recommended fix: </span>
          {issue.quickFix?.label ?? "Open the related editor section."}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {issue.dismissible ? (
          <Button
            data-testid={`issue-dismiss-${issue.id}`}
            onClick={() =>
              void workspace.dismissIssue(
                issue,
                "Dismissed after review in demo workspace."
              )
            }
            size="sm"
            variant="outline"
          >
            Dismiss
          </Button>
        ) : null}
        <Button
          data-testid={`issue-quickfix-${issue.id}`}
          onClick={() => void workspace.applyIssueQuickFix(issue)}
          size="sm"
          variant="secondary"
        >
          {issue.quickFix?.label ?? "Open editor"}
        </Button>
      </div>
    </div>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
      <h2 className="font-medium text-foreground text-xs">{title}</h2>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 text-muted-foreground text-xs">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function SummaryPill({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 text-muted-foreground text-xs">
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </span>
  );
}

export function getDrawOverlays(
  milestones: Milestone[],
  drawGroups: DrawGroup[]
) {
  const baseDrawOverlays = drawGroups
    .map((drawGroup) => {
      const indexedMilestones = milestones
        .map((milestone, index) => ({ milestone, index }))
        .filter(({ milestone }) => milestone.drawGroupId === drawGroup.id);

      if (indexedMilestones.length === 0) {
        return null;
      }

      const rowIndex = Math.min(...indexedMilestones.map((item) => item.index));
      const lastRowIndex = Math.max(
        ...indexedMilestones.map((item) => item.index)
      );
      const startAt = new Date(
        Math.min(
          ...indexedMilestones.map(({ milestone }) =>
            milestone.startAt.getTime()
          )
        )
      );
      const endAt = new Date(
        Math.max(
          ...indexedMilestones.map(({ milestone }) => milestone.endAt.getTime())
        )
      );
      const amount = indexedMilestones.reduce(
        (sum, { milestone }) => sum + milestone.estimatedCost,
        0
      );
      const incurredCost = milestones
        .filter((milestone) => milestone.endAt.getTime() <= endAt.getTime())
        .reduce((sum, milestone) => sum + milestone.estimatedCost, 0);
      const plannedAt = drawGroup.plannedAt ?? drawGroup.eligibleAt ?? endAt;

      return {
        ...drawGroup,
        amount,
        duration: formatDistanceStrict(startAt, endAt),
        endAt,
        eligibleAt: plannedAt,
        incurredCost,
        plannedAt,
        rowIndex,
        rowSpan: lastRowIndex - rowIndex + 1,
        startAt,
      };
    })
    .filter((drawGroup) => drawGroup !== null);

  return baseDrawOverlays.map((drawGroup) => {
    const eligibleDraws = baseDrawOverlays.filter(
      (candidate) => candidate.endAt.getTime() <= drawGroup.endAt.getTime()
    );
    const principalExposure = eligibleDraws.reduce(
      (sum, candidate) => sum + candidate.amount,
      0
    );
    const interestAccumulated = eligibleDraws.reduce((sum, candidate) => {
      const daysSinceDraw = Math.max(
        0,
        differenceInDays(drawGroup.endAt, candidate.endAt)
      );
      const dailyRate = ANNUAL_DRAW_INTEREST_RATE / 365;
      const interest =
        candidate.amount * (1 + dailyRate) ** daysSinceDraw - candidate.amount;

      return sum + interest;
    }, 0);
    const drawFeesToDate = eligibleDraws.length * DRAW_FEE_AMOUNT;

    return {
      ...drawGroup,
      drawFeesToDate,
      interestAccumulated,
      principalExposure,
      totalExposure: principalExposure + interestAccumulated + drawFeesToDate,
    };
  });
}
