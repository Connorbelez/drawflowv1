import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  GitBranch,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  GanttRangeDragHandle,
  getGanttRangeWidth,
  useGanttContext,
} from "#/components/kibo-ui/gantt/index.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { cn } from "#/lib/utils.ts";
import {
  compactMoney,
  type GanttResolution,
  resolutionOptions,
  roleLabels,
  type ScheduleDisplayMode,
} from "./build-workspace-demo-contracts";
import { AddMilestoneDialog } from "./build-workspace-demo-inspection";
import {
  type getDrawOverlays,
  IssuePopoverBody,
  issueTone,
  SummaryPill,
} from "./build-workspace-demo-issues";
import type {
  Milestone,
  OptimizationPlanId,
  WorkspaceIssue,
  WorkspaceRole,
} from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function WorkspaceTopBar({
  blockerCount,
  canFinalizeMilestones,
  onOpenDrawPlans,
  onOpenInspection,
  onOpenValidation,
  showPrimaryAction,
  showRoleSelector,
  totalDrawAmount,
  viewer,
  workspaceCrumbHref,
}: {
  blockerCount: number;
  canFinalizeMilestones: boolean;
  onOpenDrawPlans: () => void;
  onOpenInspection: (drawer: "audit" | "outbox") => void;
  onOpenValidation: () => void;
  showPrimaryAction: boolean;
  showRoleSelector: boolean;
  totalDrawAmount: number;
  viewer: "builder" | "lender";
  workspaceCrumbHref: { active: string; proposal: string };
}) {
  const workspace = useBuildWorkspace();
  const [addOpen, setAddOpen] = useState(false);
  const isBuilderViewer = viewer === "builder";
  const workspaceCrumb =
    workspace.mode === "active"
      ? { href: workspaceCrumbHref.active, label: "Live Build" }
      : { href: workspaceCrumbHref.proposal, label: "Proposal" };
  const buildTitle =
    workspace.mode === "active"
      ? activeBuildDisplayName(workspace.build.buildName)
      : workspace.build.buildName;
  const validationCount =
    workspace.validationErrors.length +
    workspace.validationWarnings.length +
    workspace.issues.filter((issue) => !issue.dismissed).length;
  const selectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId
    ) ?? workspace.milestones[0];

  return (
    <header className="mb-3 grid gap-3 rounded-md border border-border bg-card p-3 shadow-foreground/10 shadow-lg lg:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.6fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span className="font-semibold text-emerald-700 tracking-wide dark:text-emerald-200">
            DrawFlow
          </span>
          <span>/</span>
          <a
            className="hover:text-emerald-700 dark:text-emerald-100"
            href={workspaceCrumbHref.active}
          >
            {workspace.mode === "active" ? "Active" : "Draft"}
          </a>
          <span>/</span>
          <a
            className="hover:text-emerald-700 dark:text-emerald-100"
            href={workspaceCrumb.href}
          >
            {workspaceCrumb.label}
          </a>
          <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-700 dark:text-cyan-100">
            {workspace.mode === "active"
              ? "active"
              : workspace.build.proposalStatus}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <h1 className="font-semibold text-2xl leading-tight tracking-normal">
            {buildTitle}
          </h1>
          <span className="pb-1 text-muted-foreground text-xs">
            {workspace.build.phaseLabel}
          </span>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {workspace.build.borrowerName} / {workspace.build.siteAddress}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
        {showRoleSelector && !isBuilderViewer ? (
          <NativeSelect
            aria-label="Workspace role"
            className="w-36"
            data-testid="workspace-role-select"
            onChange={(event) =>
              workspace.setRole(event.currentTarget.value as WorkspaceRole)
            }
            value={workspace.role}
          >
            {Object.entries(roleLabels).map(([role, label]) => (
              <NativeSelectOption key={role} value={role}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
        <SummaryPill icon={Banknote} label={compactMoney(totalDrawAmount)} />
        <SummaryPill icon={AlertTriangle} label={`${blockerCount} hard deps`} />
        <Button
          data-testid="workspace-draw-plans-open"
          onClick={onOpenDrawPlans}
          variant="outline"
        >
          <GitBranch />
          Draw plans
        </Button>
        <Button
          className="relative"
          data-testid="workspace-validation-open"
          onClick={onOpenValidation}
          variant="outline"
        >
          <AlertTriangle />
          Validation
          {validationCount > 0 ? (
            <span
              className="absolute -top-2 -right-2 grid min-w-5 place-items-center rounded-full border border-red-200/70 bg-red-500 px-1 font-semibold text-[0.62rem] text-white shadow-lg shadow-red-950/40"
              data-testid="workspace-validation-count"
            >
              {validationCount}
            </span>
          ) : null}
        </Button>
        <Button
          data-testid="workspace-audit-open"
          onClick={() => onOpenInspection("audit")}
          variant="outline"
        >
          Audit
        </Button>
        <Button
          data-testid="workspace-outbox-open"
          onClick={() => onOpenInspection("outbox")}
          variant="outline"
        >
          Outbox
        </Button>
        {workspace.mode === "proposal" ? (
          <Button
            data-testid="workspace-add-milestone-open"
            disabled={workspace.build.proposalStatus === "submitted"}
            onClick={() => setAddOpen(true)}
            variant="secondary"
          >
            <Plus />
            Add milestone
          </Button>
        ) : null}
        {showPrimaryAction ? (
          <RolePrimaryAction
            canFinalizeMilestones={canFinalizeMilestones}
            milestone={selectedMilestone}
            viewer={viewer}
          />
        ) : null}
        <Button
          data-testid="drawflow:shared:reset-demo"
          onClick={() => {
            if (window.confirm("Reset both DrawFlow demo scenarios?")) {
              void workspace.resetWorkspace();
            }
          }}
          size="icon"
          variant="ghost"
        >
          <RotateCcw />
          <span className="sr-only">Reset workspace</span>
        </Button>
      </div>
      <AddMilestoneDialog onOpenChange={setAddOpen} open={addOpen} />
    </header>
  );
}

export function activeBuildDisplayName(buildName: string) {
  return buildName.replace(/\s+proposal$/i, " Build");
}

export function RolePrimaryAction({
  canFinalizeMilestones,
  milestone,
  viewer,
}: {
  canFinalizeMilestones: boolean;
  milestone: Milestone;
  viewer: "builder" | "lender";
}) {
  const workspace = useBuildWorkspace();

  if (workspace.mode === "proposal") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="proposal-compilation-status"
          disabled
          title="Proposal planning compiles automatically after each proposal edit."
          variant="outline"
        >
          <Info />
          {workspace.compilationStatus === "blocked"
            ? "Planning blocked"
            : workspace.compilationStatus === "updating"
              ? "Planning updating"
              : workspace.compilationStatus === "failed"
                ? "Planning failed"
                : "Planning up to date"}
        </Button>
        <Button
          data-testid="proposal-apply-plan"
          disabled={workspace.build.proposalStatus === "submitted"}
          onClick={() => void workspace.applyRecommendedPlan()}
          variant="secondary"
        >
          Apply plan
        </Button>
        <Button
          data-testid="proposal-submit"
          disabled={
            workspace.build.proposalStatus === "submitted" ||
            workspace.validationErrors.length > 0
          }
          onClick={() => void workspace.submitProposal()}
        >
          <Send />
          Submit proposal
        </Button>
      </div>
    );
  }

  if (
    canFinalizeMilestones &&
    viewer === "lender" &&
    workspace.role === "lenderAdmin"
  ) {
    return (
      <Button
        data-testid={`active-primary-approve-${milestone.id}`}
        onClick={() =>
          void workspace.approveMilestone(
            milestone.id,
            "Approved from role-aware primary action."
          )
        }
      >
        <ShieldCheck />
        Approve milestone
      </Button>
    );
  }

  if (viewer === "lender" && workspace.role === "siteVisitor") {
    return (
      <Button
        data-testid={`active-primary-site-visit-${milestone.id}`}
        onClick={() =>
          void workspace.submitSiteVisitReport(milestone.id, {
            completionObserved: true,
            notes: "Site visit report submitted from primary action.",
            recommendedOutcome: "approve",
          })
        }
      >
        <ClipboardCheck />
        Submit site report
      </Button>
    );
  }

  return (
    <Button
      data-testid={`active-primary-mark-complete-${milestone.id}`}
      onClick={() => void workspace.updateProgress(milestone.id, 100)}
    >
      <Send />
      Mark complete
    </Button>
  );
}

export function TimelineControlsStrip({
  railCollapsed,
  resolution,
  scheduleDisplayMode,
  zoom,
  onRailCollapsedChange,
  onResolutionChange,
  onScheduleDisplayModeChange,
  onZoomChange,
}: {
  railCollapsed: boolean;
  resolution: GanttResolution;
  scheduleDisplayMode: ScheduleDisplayMode;
  zoom: number;
  onRailCollapsedChange: (collapsed: boolean) => void;
  onResolutionChange: (resolution: GanttResolution) => void;
  onScheduleDisplayModeChange: (mode: ScheduleDisplayMode) => void;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b bg-card p-3">
      <div className="flex items-center gap-2">
        <Button
          className="self-stretch border-cyan-300/30 bg-cyan-300/10 px-2.5 text-cyan-700 hover:border-cyan-300/50 hover:bg-cyan-300/15 hover:text-cyan-950 dark:text-cyan-100 dark:text-cyan-50"
          data-testid="milestone-rail-collapse-toggle"
          onClick={() => onRailCollapsedChange(!railCollapsed)}
          title={railCollapsed ? "Show milestone rail" : "Hide milestone rail"}
          variant="outline"
        >
          {railCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {railCollapsed ? "Show milestones" : "Hide milestones"}
        </Button>
        <div className="text-muted-foreground text-xs">Roadmap scale</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <div className="grid grid-cols-3">
            {resolutionOptions.map((option) => (
              <button
                aria-pressed={resolution === option.value}
                className={cn(
                  "h-7 rounded-sm px-2 font-medium text-muted-foreground transition-colors hover:text-foreground",
                  resolution === option.value &&
                    "bg-emerald-300 text-emerald-950 hover:text-emerald-950"
                )}
                data-testid={`timeline-resolution-${option.value}`}
                key={option.value}
                onClick={() => onResolutionChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[auto_8rem_auto] items-center gap-2 text-muted-foreground">
          <span>Size</span>
          <input
            aria-label="Timeline column size"
            className="h-1 w-full accent-emerald-300"
            data-testid="timeline-column-size-slider"
            max={180}
            min={80}
            onChange={(event) =>
              onZoomChange(Number(event.currentTarget.value))
            }
            step={1}
            type="range"
            value={zoom}
          />
          <span className="w-8 text-right text-muted-foreground">{zoom}%</span>
        </div>
        <div className="grid grid-cols-2">
          {(
            [
              ["dates", "Dates"],
              ["tOffsets", "T#"],
            ] as const
          ).map(([mode, label]) => (
            <button
              aria-pressed={scheduleDisplayMode === mode}
              className={cn(
                "h-7 rounded-sm px-2 font-medium text-muted-foreground transition-colors hover:text-foreground",
                scheduleDisplayMode === mode &&
                  "bg-cyan-300 text-cyan-950 hover:text-cyan-950"
              )}
              data-testid={`timeline-schedule-display-${mode}`}
              key={mode}
              onClick={() => onScheduleDisplayModeChange(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DrawPlanComparisonDialog({
  onOpenChange,
  open,
  selectedPlanId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedPlanId?: OptimizationPlanId;
}) {
  const workspace = useBuildWorkspace();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(760px,calc(100vh-4rem))] max-w-4xl overflow-hidden border border-border bg-popover text-foreground"
        data-testid="draw-plan-comparison-dialog"
      >
        <DialogHeader>
          <DialogTitle>Draw Plan Comparison</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto pr-1 md:grid-cols-3">
          {workspace.optimizationPlans.map((plan) => (
            <article
              className={cn(
                "grid gap-3 rounded-md border p-4",
                plan.id === selectedPlanId
                  ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-950 dark:text-emerald-50"
                  : "border-border bg-muted/30 text-muted-foreground"
              )}
              key={plan.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <span className="font-semibold text-sm">{plan.label}</span>
                  {plan.recommended ? (
                    <Badge className="w-fit" variant="secondary">
                      Recommended
                    </Badge>
                  ) : null}
                </div>
                <span className="rounded-sm border border-border px-2 py-1 text-xs">
                  {plan.durationDays}d
                </span>
              </div>
              <p className="text-xs">{plan.summary}</p>
              <div className="grid gap-2 text-xs">
                <span>{compactMoney(plan.totalFees)} draw fees</span>
                <span>
                  {compactMoney(plan.projectedInterest)} projected interest
                </span>
                <span>
                  {compactMoney(plan.peakWorkingCapital)} peak working capital
                </span>
              </div>
              <p
                className={cn(
                  "text-xs",
                  plan.infeasibleReason
                    ? "text-red-700 dark:text-red-200"
                    : "text-amber-700/90 dark:text-amber-200/80"
                )}
              >
                {plan.infeasibleReason ?? plan.warning}
              </p>
              <Button
                aria-pressed={plan.id === selectedPlanId}
                data-testid={`draw-plan-option-${plan.id}`}
                disabled={Boolean(plan.infeasibleReason)}
                onClick={() => workspace.setActivePlan(plan.id)}
                variant={plan.id === selectedPlanId ? "default" : "outline"}
              >
                {plan.id === selectedPlanId
                  ? `${plan.label} selected`
                  : `Select ${plan.label}`}
              </Button>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ValidationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const workspace = useBuildWorkspace();
  const visibleIssues = workspace.issues.filter((issue) => !issue.dismissed);
  const validationItems = [
    ...workspace.validationErrors.map((message, index) => ({
      id: `validation-error-${index}`,
      message,
      quickFixIssue: visibleIssues.find(
        (issue) => issue.message === message && issue.severity === "blocking"
      ),
      severity: "blocking" as const,
      title: "Validation error",
    })),
    ...workspace.validationWarnings.map((message, index) => ({
      id: `validation-warning-${index}`,
      message,
      quickFixIssue: visibleIssues.find(
        (issue) => issue.message === message && issue.severity === "warning"
      ),
      severity: "warning" as const,
      title: "Validation warning",
    })),
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid max-h-[min(820px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-border bg-popover text-foreground sm:max-w-3xl"
        data-testid="workspace-validation-dialog"
      >
        <DialogHeader>
          <DialogTitle>Roadmap Validation</DialogTitle>
        </DialogHeader>
        <div
          className="-mx-4 grid min-h-0 content-start gap-3 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-gutter:stable]"
          data-testid="workspace-validation-panel"
        >
          {validationItems.length === 0 && visibleIssues.length === 0 ? (
            <Badge className="w-fit border-emerald-300/30 bg-emerald-300/10 text-emerald-700 dark:text-emerald-100">
              No blocking errors
            </Badge>
          ) : null}
          {validationItems.map((item) => (
            <ValidationMessageItem
              item={item}
              key={item.id}
              testId={`validation-issue-${item.id}`}
            />
          ))}
          {visibleIssues.map((issue) => (
            <ValidationWorkspaceIssueItem issue={issue} key={issue.id} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ValidationMessageItem({
  item,
  testId,
}: {
  item: {
    id: string;
    message: string;
    quickFixIssue?: WorkspaceIssue;
    severity: "blocking" | "warning";
    title: string;
  };
  testId: string;
}) {
  return (
    <details className="group rounded-md border border-border bg-muted/30 p-0 text-left shadow-[0_16px_40px_rgba(0,0,0,0.24)] [&>summary::-webkit-details-marker]:hidden">
      <summary
        className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-3 rounded-md p-4 outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
        data-testid={testId}
      >
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle
              className={cn(
                "size-4 shrink-0",
                item.severity === "blocking"
                  ? "text-red-700 dark:text-red-200"
                  : "text-amber-800 dark:text-amber-200"
              )}
            />
            <span className="font-semibold text-foreground text-sm">
              {item.title}
            </span>
          </span>
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {item.message}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge className={cn("rounded-sm", issueTone(item))}>
            {item.severity}
          </Badge>
          <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
        </span>
      </summary>
      <div
        className="border-border border-t px-4 pt-3 pb-4"
        data-testid={`${testId}-popover`}
      >
        <ValidationMessageBody item={item} />
      </div>
    </details>
  );
}

export function ValidationMessageBody({
  item,
}: {
  item: {
    message: string;
    quickFixIssue?: WorkspaceIssue;
    severity: "blocking" | "warning";
    title: string;
  };
}) {
  const workspace = useBuildWorkspace();
  const quickFixIssue = item.quickFixIssue;

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-foreground">
            {item.title}
          </h3>
          <p className="mt-1 text-muted-foreground text-sm">{item.message}</p>
        </div>
        <Badge className={cn("rounded-sm", issueTone(item))}>
          {item.severity}
        </Badge>
      </div>
      <div className="grid gap-1 text-muted-foreground text-sm">
        <div>
          <span className="text-muted-foreground">Why it matters: </span>
          Roadmap validation protects draw eligibility, dependency sequencing,
          and borrower/lender approval timing before the proposal is submitted.
        </div>
        <div>
          <span className="text-muted-foreground">
            Blocks release/submission:{" "}
          </span>
          {item.severity === "blocking" ? "Yes" : "No"}
        </div>
        <div>
          <span className="text-muted-foreground">Recommended fix: </span>
          Review the related milestone or draw group issue below, then apply a
          quick fix or adjust the roadmap dates.
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          data-testid={
            quickFixIssue
              ? `validation-quickfix-${quickFixIssue.id}`
              : undefined
          }
          disabled={!quickFixIssue}
          onClick={() => {
            if (!quickFixIssue) {
              return;
            }
            workspace.applyIssueQuickFix(quickFixIssue).catch(() => undefined);
          }}
          size="sm"
          variant="secondary"
        >
          {quickFixIssue?.quickFix?.label ?? "Open editor"}
        </Button>
      </div>
    </div>
  );
}

export function ValidationWorkspaceIssueItem({
  issue,
}: {
  issue: WorkspaceIssue;
}) {
  const testId = `validation-issue-${issue.id}`;

  return (
    <details className="group rounded-md border border-border bg-muted/30 p-0 text-left shadow-[0_16px_40px_rgba(0,0,0,0.24)] [&>summary::-webkit-details-marker]:hidden">
      <summary
        className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-3 rounded-md p-4 outline-none transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
        data-testid={testId}
      >
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle
              className={cn(
                "size-4 shrink-0",
                issue.severity === "blocking"
                  ? "text-red-700 dark:text-red-200"
                  : "text-amber-800 dark:text-amber-200"
              )}
            />
            <span className="font-semibold text-foreground text-sm">
              {issue.title}
            </span>
          </span>
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {issue.message}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge className={cn("rounded-sm", issueTone(issue))}>
            {issue.severity}
          </Badge>
          <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
        </span>
      </summary>
      <div
        className="border-border border-t px-4 pt-3 pb-4"
        data-testid={`${testId}-popover`}
      >
        <IssuePopoverBody issue={issue} />
      </div>
    </details>
  );
}

type DrawOverlay = ReturnType<typeof getDrawOverlays>[number];

export function DrawGroupRangeDragHandle({
  children,
  draw,
  milestones,
  onMoveDelta,
  onPreviewDelta,
  proposalSubmitted,
}: {
  children: ReactNode;
  draw: DrawOverlay;
  milestones: Milestone[];
  onMoveDelta: (deltaDays: number) => void;
  onPreviewDelta: (deltaDays: number | null) => void;
  proposalSubmitted: boolean;
}) {
  const gantt = useGanttContext();
  const hasUnlockedMilestones = milestones.some(
    (milestone) => milestone.drawGroupId === draw.id && !milestone.isDragLocked
  );
  const firstMilestoneWidth = useMemo(() => {
    const firstMilestone = milestones
      .filter((milestone) => milestone.drawGroupId === draw.id)
      .sort(
        (leftMilestone, rightMilestone) =>
          leftMilestone.startAt.getTime() - rightMilestone.startAt.getTime() ||
          leftMilestone.endAt.getTime() - rightMilestone.endAt.getTime()
      )
      .at(0);

    return firstMilestone
      ? Math.round(
          getGanttRangeWidth(
            firstMilestone.startAt,
            firstMilestone.endAt,
            gantt
          )
        )
      : 0;
  }, [draw.id, gantt, milestones]);
  const handleStyle = useMemo<CSSProperties>(
    () => ({
      left: firstMilestoneWidth,
      // transform: "translateX(-100%)",
    }),
    [firstMilestoneWidth]
  );

  return (
    <GanttRangeDragHandle
      className="absolute -top-4 z-40 inline-flex min-w-max max-w-max items-center gap-2 rounded-sm bg-popover/95 px-2.5 py-1 font-medium text-[0.72rem] shadow-foreground/10 shadow-lg backdrop-blur"
      disabled={proposalSubmitted || !hasUnlockedMilestones}
      onMoveDelta={onMoveDelta}
      onPreviewDelta={onPreviewDelta}
      startAt={draw.startAt}
      style={handleStyle}
      testId={`draw-drag-handle-${draw.id}`}
      title={
        hasUnlockedMilestones
          ? `Drag to shift unlocked milestones in ${draw.label}`
          : `${draw.label} has no unlocked milestones to shift.`
      }
    >
      {children}
    </GanttRangeDragHandle>
  );
}
