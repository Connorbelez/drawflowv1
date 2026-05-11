import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addDays,
  differenceInDays,
  format,
  formatDistanceStrict,
} from "date-fns";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  GitBranch,
  GripVertical,
  Info,
  Lock,
  MapPinOff,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Scissors,
  Send,
  ShieldCheck,
  Unlock,
  Upload,
} from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type GanttFeature,
  GanttFeatureList,
  GanttFeatureRow,
  GanttHeader,
  GanttMarker,
  GanttProvider,
  GanttRangeDragHandle,
  GanttRangeOverlay,
  GanttSidebar,
  GanttSidebarItem,
  GanttSelectionLayer,
  GanttTimeline,
  GanttToday,
  getGanttRangeWidth,
  type Range,
  useGanttContext,
} from "#/components/kibo-ui/gantt/index.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "#/components/ui/hover-card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  DependencyHardness,
  DrawGroup,
  DrawStatus,
  EvidenceStatus,
  Milestone,
  MilestoneStatus,
  OptimizationPlanId,
  WorkspaceIssue,
  WorkspaceRole,
} from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

type GanttResolution = Extract<Range, "daily" | "weekly" | "monthly">;
type MilestoneHighlightTone = "selected" | "blocking" | "blocked";
type MilestoneHighlightTones = Record<string, MilestoneHighlightTone>;
type SelectedMilestoneIds = Set<string>;
type BatchShiftPreview = {
  deltaDays: number;
  movingMilestoneIds: string[];
  lockedMilestoneIds: string[];
  source: "selection" | "drawGroup";
  sourceId?: string;
} | null;

const resolutionOptions: { label: string; value: GanttResolution }[] = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];

const milestoneStatuses: MilestoneStatus[] = [
  "proposed",
  "notStarted",
  "inProgress",
  "blocked",
  "evidenceRequired",
  "evidenceSubmitted",
  "underReview",
  "approved",
];

const roleLabels: Record<WorkspaceRole, string> = {
  builderLead: "Builder Lead",
  lenderAdmin: "Lender Admin",
  siteVisitor: "Site Visitor",
};

const statusLabels: Record<
  MilestoneStatus | DrawStatus | EvidenceStatus,
  string
> = {
  accepted: "Accepted",
  approved: "Approved",
  blocked: "Blocked",
  draft: "Draft",
  evidencePending: "Evidence pending",
  evidenceRequired: "Evidence required",
  evidenceSubmitted: "Evidence submitted",
  inProgress: "In progress",
  locationUnverified: "Location unverified",
  needsInfo: "Needs info",
  notStarted: "Not started",
  planned: "Planned",
  proposed: "Proposed",
  readyForRelease: "Ready for release",
  released: "Released",
  submitted: "Submitted",
  underReview: "Under review",
};

const statusColors: Record<MilestoneStatus, string> = {
  approved: "#7dd3a8",
  blocked: "#f97373",
  evidenceRequired: "#fbbf24",
  evidenceSubmitted: "#67e8f9",
  inProgress: "#8ab4ff",
  notStarted: "#8b949e",
  proposed: "#c084fc",
  underReview: "#fde047",
};

const drawClasses: Record<DrawStatus, string> = {
  blocked: "border-red-400/70 bg-red-500/10 text-red-100",
  evidencePending: "border-amber-300/70 bg-amber-400/10 text-amber-100",
  planned: "border-sky-300/50 bg-sky-400/10 text-sky-100",
  readyForRelease: "border-emerald-300/70 bg-emerald-400/10 text-emerald-100",
  released: "border-lime-300/70 bg-lime-400/15 text-lime-100",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);

const ANNUAL_DRAW_INTEREST_RATE = 0.14;
const DRAW_FEE_AMOUNT = 500;

const parseNumber = (value: string, fallback: number) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const toDateInputValue = (date: Date) => format(date, "yyyy-MM-dd");

const fromDateInputValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
};

const milestoneToFeature = (milestone: Milestone): GanttFeature => ({
  id: milestone.id,
  name: milestone.name,
  startAt: milestone.startAt,
  endAt: milestone.endAt,
  lane: milestone.lane,
  status: {
    id: milestone.status,
    name: statusLabels[milestone.status],
    color: statusColors[milestone.status],
  },
});

export function BuildWorkspaceDemo() {
  const workspace = useBuildWorkspace();
  const [detailOpen, setDetailOpen] = useState(false);
  const [inspectionDrawer, setInspectionDrawer] = useState<
    "audit" | "outbox" | null
  >(null);
  const [timelineResolution, setTimelineResolution] =
    useState<GanttResolution>("monthly");
  const [timelineZoom, setTimelineZoom] = useState(120);
  const [detailMilestoneId, setDetailMilestoneId] = useState<string | null>(
    null,
  );
  const [milestoneHighlightTones, setMilestoneHighlightTones] =
    useState<MilestoneHighlightTones>({});
  const [focusedMilestoneId, setFocusedMilestoneId] = useState<string | null>(
    null,
  );
  const [milestoneRailCollapsed, setMilestoneRailCollapsed] = useState(false);
  const [drawPlansOpen, setDrawPlansOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);

  useEffect(() => {
    const openDetail = (event: Event) => {
      const milestoneId = (event as CustomEvent<string>).detail;
      if (milestoneId) {
        setDetailMilestoneId(milestoneId);
        setDetailOpen(true);
      }
    };
    window.addEventListener("drawflow-open-milestone-detail", openDetail);
    return () =>
      window.removeEventListener("drawflow-open-milestone-detail", openDetail);
  }, []);

  const selectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId,
    ) ?? workspace.milestones[0];
  const selectedDraw = selectedMilestone
    ? workspace.drawGroups.find(
        (drawGroup) => drawGroup.id === selectedMilestone.drawGroupId,
      )
    : undefined;
  const detailMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === detailMilestoneId,
    ) ?? selectedMilestone;
  const detailDraw = detailMilestone
    ? workspace.drawGroups.find(
        (drawGroup) => drawGroup.id === detailMilestone.drawGroupId,
      )
    : selectedDraw;
  const totalDrawAmount = workspace.milestones.reduce(
    (sum, milestone) => sum + milestone.estimatedCost,
    0,
  );
  const blockerCount = workspace.dependencies.filter(
    (dependency) => dependency.hardness === "hard",
  ).length;

  if (workspace.isLoading || workspace.needsSeed || !selectedMilestone) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0d100f] text-stone-100">
        <div
          className="rounded-md border border-white/10 bg-[#151a18] px-4 py-3 text-sm"
          data-testid="build-workspace-loading"
        >
          Loading DrawFlow workspace...
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-x-0 bottom-0 top-16 overflow-hidden bg-[#0d100f] text-stone-100">
      <div
        className="flex h-full min-h-0 w-full flex-col px-3 pt-3 sm:px-4"
        data-testid="build-workspace-shell"
      >
        <WorkspaceTopBar
          blockerCount={blockerCount}
          onOpenDrawPlans={() => setDrawPlansOpen(true)}
          onOpenInspection={setInspectionDrawer}
          onOpenValidation={() => setValidationOpen(true)}
          totalDrawAmount={totalDrawAmount}
        />
        {workspace.terminalMessage ? (
          <div className="mb-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-emerald-100 text-sm">
            {workspace.terminalMessage}
          </div>
        ) : null}

        <section className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-white/10 bg-[#121615] shadow-2xl shadow-black/40">
          <TimelineControlsStrip
            onResolutionChange={setTimelineResolution}
            onZoomChange={setTimelineZoom}
            resolution={timelineResolution}
            zoom={timelineZoom}
          />
          <div className="min-h-0 min-w-0 overflow-hidden">
            <GanttRoadmap
              focusedMilestoneId={focusedMilestoneId}
              milestoneHighlightTones={milestoneHighlightTones}
              onHighlightMilestones={setMilestoneHighlightTones}
              onMilestoneFocus={setFocusedMilestoneId}
              onOpenDetail={(milestoneId) => {
                setDetailMilestoneId(milestoneId);
                setDetailOpen(true);
              }}
              railCollapsed={milestoneRailCollapsed}
              onRailCollapsedChange={setMilestoneRailCollapsed}
              resolution={timelineResolution}
              zoom={timelineZoom}
            />
          </div>
        </section>

        <MilestoneDetailSheet
          draw={detailDraw}
          milestone={detailMilestone}
          onOpenChange={setDetailOpen}
          open={detailOpen}
        />
        <DrawPlanComparisonDialog
          activePlanId={workspace.activePlanId}
          onOpenChange={setDrawPlansOpen}
          open={drawPlansOpen}
        />
        <ValidationDialog
          onOpenChange={setValidationOpen}
          open={validationOpen}
        />
        {inspectionDrawer ? (
          <InspectionDrawer
            drawer={inspectionDrawer}
            onClose={() => setInspectionDrawer(null)}
          />
        ) : null}
      </div>
    </main>
  );
}

function WorkspaceTopBar({
  blockerCount,
  onOpenDrawPlans,
  onOpenInspection,
  onOpenValidation,
  totalDrawAmount,
}: {
  blockerCount: number;
  onOpenDrawPlans: () => void;
  onOpenInspection: (drawer: "audit" | "outbox") => void;
  onOpenValidation: () => void;
  totalDrawAmount: number;
}) {
  const workspace = useBuildWorkspace();
  const [addOpen, setAddOpen] = useState(false);
  const validationCount =
    workspace.validationErrors.length +
    workspace.validationWarnings.length +
    workspace.issues.filter((issue) => !issue.dismissed).length;
  const selectedMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId,
    ) ?? workspace.milestones[0];

  return (
    <header className="mb-3 grid gap-3 rounded-md border border-white/10 bg-[#151a18] p-3 shadow-black/20 shadow-lg lg:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.6fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-stone-400 text-xs">
          <span className="font-semibold text-emerald-200 tracking-wide">
            DrawFlow
          </span>
          <span>/</span>
          <a className="hover:text-emerald-100" href="/demo/drawflow/active">
            Active
          </a>
          <span>/</span>
          <a className="hover:text-emerald-100" href="/demo/drawflow/proposal">
            Proposal
          </a>
          <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
            {workspace.mode === "active"
              ? "active"
              : workspace.build.proposalStatus}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <h1 className="font-semibold text-2xl leading-tight tracking-normal">
            {workspace.build.buildName}
          </h1>
          <span className="pb-1 text-stone-400 text-xs">
            {workspace.build.phaseLabel}
          </span>
        </div>
        <p className="mt-1 text-stone-500 text-xs">
          {workspace.build.borrowerName} / {workspace.build.siteAddress}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
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
              className="-top-2 -right-2 absolute grid min-w-5 place-items-center rounded-full border border-red-200/70 bg-red-500 px-1 font-semibold text-[0.62rem] text-white shadow-lg shadow-red-950/40"
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
        <RolePrimaryAction milestone={selectedMilestone} />
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

function RolePrimaryAction({ milestone }: { milestone: Milestone }) {
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

  if (workspace.role === "lenderAdmin") {
    return (
      <Button
        data-testid={`active-primary-approve-${milestone.id}`}
        onClick={() =>
          void workspace.approveMilestone(
            milestone.id,
            "Approved from role-aware primary action.",
          )
        }
      >
        <ShieldCheck />
        Approve milestone
      </Button>
    );
  }

  if (workspace.role === "siteVisitor") {
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

function TimelineControlsStrip({
  resolution,
  zoom,
  onResolutionChange,
  onZoomChange,
}: {
  resolution: GanttResolution;
  zoom: number;
  onResolutionChange: (resolution: GanttResolution) => void;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-white/10 border-b bg-[#111715] p-3">
      <div className="text-stone-400 text-xs">Roadmap scale</div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-stone-500" />
          <div className="grid grid-cols-3">
            {resolutionOptions.map((option) => (
              <button
                aria-pressed={resolution === option.value}
                className={cn(
                  "h-7 rounded-sm px-2 font-medium text-stone-400 transition-colors hover:text-stone-100",
                  resolution === option.value &&
                    "bg-emerald-300 text-emerald-950 hover:text-emerald-950",
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
        <div className="grid grid-cols-[auto_8rem_auto] items-center gap-2 text-stone-400">
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
          <span className="w-8 text-right text-stone-500">{zoom}%</span>
        </div>
      </div>
    </div>
  );
}

function DrawPlanComparisonDialog({
  activePlanId,
  onOpenChange,
  open,
}: {
  activePlanId: OptimizationPlanId;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const workspace = useBuildWorkspace();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(760px,calc(100vh-4rem))] max-w-4xl overflow-hidden border border-white/10 bg-[#111615] text-stone-100"
        data-testid="draw-plan-comparison-dialog"
      >
        <DialogHeader>
          <DialogTitle>Draw Plan Comparison</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 overflow-y-auto pr-1 md:grid-cols-3">
          {workspace.optimizationPlans.map((plan) => (
            <button
              className={cn(
                "grid gap-3 rounded-md border p-4 text-left transition-colors",
                plan.id === activePlanId
                  ? "border-emerald-300/60 bg-emerald-300/10 text-emerald-50"
                  : "border-white/10 bg-white/[0.03] text-stone-300 hover:bg-white/[0.06]",
              )}
              key={plan.id}
              onClick={() => workspace.setActivePlan(plan.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold text-sm">{plan.label}</span>
                <span className="rounded-sm border border-white/10 px-2 py-1 text-xs">
                  {plan.durationDays}d
                </span>
              </div>
              <div className="grid gap-2 text-xs">
                <span>{compactMoney(plan.totalFees)} draw fees</span>
                <span>
                  {compactMoney(plan.projectedInterest)} projected interest
                </span>
                <span>
                  {compactMoney(plan.peakWorkingCapital)} peak working capital
                </span>
              </div>
              <p className="text-amber-200/80 text-xs">{plan.warning}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ValidationDialog({
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
      severity: "blocking" as const,
      title: "Validation error",
    })),
    ...workspace.validationWarnings.map((message, index) => ({
      id: `validation-warning-${index}`,
      message,
      severity: "warning" as const,
      title: "Validation warning",
    })),
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid max-h-[min(820px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border border-white/10 bg-[#111615] text-stone-100 sm:max-w-3xl"
        data-testid="workspace-validation-dialog"
      >
        <DialogHeader>
          <DialogTitle>Roadmap Validation</DialogTitle>
        </DialogHeader>
        <div
          className="grid min-h-0 content-start gap-3 overflow-y-auto overscroll-contain pr-2"
          data-testid="workspace-validation-panel"
        >
          {validationItems.length === 0 && visibleIssues.length === 0 ? (
            <Badge className="w-fit border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
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

function ValidationMessageItem({
  item,
  testId,
}: {
  item: {
    id: string;
    message: string;
    severity: "blocking" | "warning";
    title: string;
  };
  testId: string;
}) {
  return (
    <details className="group rounded-md border border-white/10 bg-black/20 p-0 text-left shadow-[0_16px_40px_rgba(0,0,0,0.24)] [&>summary::-webkit-details-marker]:hidden">
      <summary
        className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-3 rounded-md p-4 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-cyan-300/50"
        data-testid={testId}
      >
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle
              className={cn(
                "size-4 shrink-0",
                item.severity === "blocking"
                  ? "text-red-200"
                  : "text-amber-200",
              )}
            />
            <span className="font-semibold text-sm text-stone-100">
              {item.title}
            </span>
          </span>
          <span className="line-clamp-2 text-stone-300 text-xs">
            {item.message}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge className={cn("rounded-sm", issueTone(item))}>
            {item.severity}
          </Badge>
          <ChevronDown className="size-4 text-stone-500 transition group-open:rotate-180" />
        </span>
      </summary>
      <div
        className="border-white/10 border-t px-4 pt-3 pb-4"
        data-testid={`${testId}-popover`}
      >
        <ValidationMessageBody item={item} />
      </div>
    </details>
  );
}

function ValidationMessageBody({
  item,
}: {
  item: {
    message: string;
    severity: "blocking" | "warning";
    title: string;
  };
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-base text-stone-100">
            {item.title}
          </h3>
          <p className="mt-1 text-sm text-stone-300">{item.message}</p>
        </div>
        <Badge className={cn("rounded-sm", issueTone(item))}>
          {item.severity}
        </Badge>
      </div>
      <div className="grid gap-1 text-sm text-stone-400">
        <div>
          <span className="text-stone-500">Why it matters: </span>
          Roadmap validation protects draw eligibility, dependency sequencing,
          and borrower/lender approval timing before the proposal is submitted.
        </div>
        <div>
          <span className="text-stone-500">Blocks release/submission: </span>
          {item.severity === "blocking" ? "Yes" : "No"}
        </div>
        <div>
          <span className="text-stone-500">Recommended fix: </span>
          Review the related milestone or draw group issue below, then apply a
          quick fix or adjust the roadmap dates.
        </div>
      </div>
    </div>
  );
}

function ValidationWorkspaceIssueItem({ issue }: { issue: WorkspaceIssue }) {
  const testId = `validation-issue-${issue.id}`;

  return (
    <details className="group rounded-md border border-white/10 bg-black/20 p-0 text-left shadow-[0_16px_40px_rgba(0,0,0,0.24)] [&>summary::-webkit-details-marker]:hidden">
      <summary
        className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-3 rounded-md p-4 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-cyan-300/50"
        data-testid={testId}
      >
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle
              className={cn(
                "size-4 shrink-0",
                issue.severity === "blocking"
                  ? "text-red-200"
                  : "text-amber-200",
              )}
            />
            <span className="font-semibold text-sm text-stone-100">
              {issue.title}
            </span>
          </span>
          <span className="line-clamp-2 text-stone-300 text-xs">
            {issue.message}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge className={cn("rounded-sm", issueTone(issue))}>
            {issue.severity}
          </Badge>
          <ChevronDown className="size-4 text-stone-500 transition group-open:rotate-180" />
        </span>
      </summary>
      <div
        className="border-white/10 border-t px-4 pt-3 pb-4"
        data-testid={`${testId}-popover`}
      >
        <IssuePopoverBody issue={issue} />
      </div>
    </details>
  );
}

type DrawOverlay = ReturnType<typeof getDrawOverlays>[number];

function DrawGroupRangeDragHandle({
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
    (milestone) => milestone.drawGroupId === draw.id && !milestone.isDragLocked,
  );
  const firstMilestoneWidth = useMemo(() => {
    const firstMilestone = milestones
      .filter((milestone) => milestone.drawGroupId === draw.id)
      .sort(
        (leftMilestone, rightMilestone) =>
          leftMilestone.startAt.getTime() - rightMilestone.startAt.getTime() ||
          leftMilestone.endAt.getTime() - rightMilestone.endAt.getTime(),
      )
      .at(0);

    return firstMilestone
      ? Math.round(
          getGanttRangeWidth(
            firstMilestone.startAt,
            firstMilestone.endAt,
            gantt,
          ),
        )
      : 0;
  }, [draw.id, gantt, milestones]);
  const handleStyle = useMemo<CSSProperties>(
    () => ({
      left: firstMilestoneWidth,
      // transform: "translateX(-100%)",
    }),
    [firstMilestoneWidth],
  );

  return (
    <GanttRangeDragHandle
      className="absolute -top-4 z-40 inline-flex min-w-max max-w-max items-center gap-2 rounded-sm bg-black/85 px-2.5 py-1 font-medium text-[0.72rem] shadow-black/30 shadow-lg backdrop-blur"
      contentTestId={`draw-label-${draw.id}`}
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

function GanttRoadmap({
  focusedMilestoneId,
  milestoneHighlightTones,
  onHighlightMilestones,
  onMilestoneFocus,
  onOpenDetail,
  railCollapsed,
  onRailCollapsedChange,
  resolution,
  zoom,
}: {
  focusedMilestoneId: string | null;
  milestoneHighlightTones: MilestoneHighlightTones;
  onHighlightMilestones: (milestoneTones: MilestoneHighlightTones) => void;
  onMilestoneFocus: (milestoneId: string | null) => void;
  onOpenDetail: (milestoneId: string) => void;
  railCollapsed: boolean;
  onRailCollapsedChange: (collapsed: boolean) => void;
  resolution: GanttResolution;
  zoom: number;
}) {
  const workspace = useBuildWorkspace();
  const [selectedMilestoneIds, setSelectedMilestoneIds] =
    useState<SelectedMilestoneIds>(() => new Set());
  const [batchShiftPreview, setBatchShiftPreview] =
    useState<BatchShiftPreview>(null);
  const proposalSubmitted =
    workspace.mode === "proposal" &&
    workspace.build.proposalStatus === "submitted";
  const selectionPreview =
    batchShiftPreview?.source === "selection" ? batchShiftPreview : null;
  const drawGroupPreview =
    batchShiftPreview?.source === "drawGroup" ? batchShiftPreview : null;
  const features: GanttFeature[] = workspace.milestones.map((milestone) => {
    const featureMilestone = selectionPreview?.movingMilestoneIds.includes(
      milestone.id,
    )
      ? {
          ...milestone,
          startAt: addDays(milestone.startAt, selectionPreview.deltaDays),
          endAt: addDays(milestone.endAt, selectionPreview.deltaDays),
        }
      : milestone;
    return milestoneToFeature(featureMilestone);
  });
  const drawOverlays = getDrawOverlays(
    workspace.milestones,
    workspace.drawGroups,
  );
  const drawGroupGhostOverlays = drawGroupPreview
    ? getDrawOverlays(
        workspace.milestones.map((milestone) =>
          drawGroupPreview.movingMilestoneIds.includes(milestone.id)
            ? {
                ...milestone,
                startAt: addDays(milestone.startAt, drawGroupPreview.deltaDays),
                endAt: addDays(milestone.endAt, drawGroupPreview.deltaDays),
              }
            : milestone,
        ),
        workspace.drawGroups,
      ).filter((draw) => draw.id === drawGroupPreview.sourceId)
    : [];
  const ghostFeatures: GanttFeature[] = workspace.milestones.map((milestone) =>
    drawGroupPreview?.movingMilestoneIds.includes(milestone.id)
      ? {
          ...milestoneToFeature({
            ...milestone,
            startAt: addDays(milestone.startAt, drawGroupPreview.deltaDays),
            endAt: addDays(milestone.endAt, drawGroupPreview.deltaDays),
          }),
        }
      : milestoneToFeature(milestone),
  );
  const focusedMilestone = workspace.milestones.find(
    (milestone) => milestone.id === focusedMilestoneId,
  );
  const initialScrollDate = useMemo(
    () =>
      new Date(
        Math.min(
          ...workspace.milestones.map((milestone) =>
            milestone.startAt.getTime(),
          ),
        ),
      ),
    [workspace.milestones],
  );
  const replaceSelection = useCallback((milestoneId: string) => {
    setSelectedMilestoneIds(new Set([milestoneId]));
  }, []);
  const toggleSelection = useCallback((milestoneId: string) => {
    setSelectedMilestoneIds((current) => {
      const next = new Set(current);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedMilestoneIds(new Set());
  }, []);
  const selectFromMarquee = useCallback(
    (milestoneIds: string[]) => {
      setSelectedMilestoneIds(new Set(milestoneIds));
      const first = milestoneIds[0];
      if (first) {
        workspace.selectMilestone(first);
        onMilestoneFocus(first);
      }
    },
    [onMilestoneFocus, workspace],
  );
  const handleTimelineMilestoneClick = useCallback(
    (
      milestoneId: string,
      event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
    ) => {
      workspace.selectMilestone(milestoneId);
      onMilestoneFocus(milestoneId);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleSelection(milestoneId);
        return;
      }
      replaceSelection(milestoneId);
      onHighlightMilestones({ [milestoneId]: "selected" });
    },
    [
      onHighlightMilestones,
      onMilestoneFocus,
      replaceSelection,
      toggleSelection,
      workspace,
    ],
  );
  const selectedUnlockedIds = workspace.milestones
    .filter(
      (milestone) =>
        selectedMilestoneIds.has(milestone.id) && !milestone.isDragLocked,
    )
    .map((milestone) => milestone.id);
  const lockedSelectedIds = workspace.milestones
    .filter(
      (milestone) =>
        selectedMilestoneIds.has(milestone.id) && milestone.isDragLocked,
    )
    .map((milestone) => milestone.id);
  const disabledMilestoneIds = new Set(
    workspace.milestones
      .filter((milestone) => milestone.isDragLocked || proposalSubmitted)
      .map((milestone) => milestone.id),
  );
  const commitBatchShift = useCallback(
    async (
      milestoneIds: string[],
      deltaDays: number,
      source: "selection" | "drawGroup",
      sourceId?: string,
    ) => {
      if (deltaDays === 0 || proposalSubmitted) {
        setBatchShiftPreview(null);
        return;
      }
      const moves = workspace.milestones
        .filter(
          (milestone) =>
            milestoneIds.includes(milestone.id) && !milestone.isDragLocked,
        )
        .map((milestone) => ({
          milestoneId: milestone.id,
          startAt: addDays(milestone.startAt, deltaDays),
          endAt: addDays(milestone.endAt, deltaDays),
        }));
      setBatchShiftPreview(null);
      if (moves.length === 0) {
        return;
      }
      await workspace.batchMoveMilestoneDates(
        moves,
        undefined,
        source,
        sourceId,
      );
    },
    [proposalSubmitted, workspace],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  return (
    <GanttProvider
      className="h-full min-w-0 rounded-none bg-[#151a18]"
      initialScrollDate={initialScrollDate}
      leadingSidebarWidth={railCollapsed ? 72 : 420}
      range={resolution}
      rowGap={0}
      rowHeight={36}
      zoom={zoom}
    >
      <MilestoneRail
        collapsed={railCollapsed}
        milestoneHighlightTones={milestoneHighlightTones}
        onCollapsedChange={onRailCollapsedChange}
        onHighlightMilestones={onHighlightMilestones}
        onMilestoneFocus={onMilestoneFocus}
        onOpenDetail={onOpenDetail}
      />
      <GanttMilestoneSidebar
        features={features}
        onLockToggle={(milestoneId, locked) => {
          void workspace.setMilestoneDragLocked(milestoneId, locked);
        }}
        onMilestoneFocus={(milestoneId) => {
          const milestone = workspace.milestones.find(
            (item) => item.id === milestoneId,
          );
          if (!milestone) {
            return;
          }
          workspace.selectMilestone(milestone.id);
          onHighlightMilestones({ [milestone.id]: "selected" });
          onMilestoneFocus(milestone.id);
        }}
        proposalSubmitted={proposalSubmitted}
        selectedMilestoneIds={selectedMilestoneIds}
      />
      <GanttTimeline
        style={{
          minHeight: `calc(var(--gantt-header-height) + ${features.length} * var(--gantt-row-height))`,
        }}
      >
        <GanttHeader className="text-stone-300 [&_p]:text-[0.82rem]" />
        <GanttSelectionLayer
          disabled={proposalSubmitted}
          features={features}
          onEmptyClick={clearSelection}
          onSelectionChange={selectFromMarquee}
        />
        {drawOverlays.map((draw) => (
          <GanttRangeOverlay
            className={cn("pt-1 pl-2", drawClasses[draw.status])}
            dragDisabled={
              proposalSubmitted ||
              workspace.milestones.every(
                (milestone) =>
                  milestone.drawGroupId !== draw.id || milestone.isDragLocked,
              )
            }
            endAt={draw.endAt}
            id={draw.id}
            key={draw.id}
            onMoveDelta={(deltaDays) => {
              const ids = workspace.milestones
                .filter((milestone) => milestone.drawGroupId === draw.id)
                .map((milestone) => milestone.id);
              void commitBatchShift(ids, deltaDays, "drawGroup", draw.id);
            }}
            onPreviewDelta={(deltaDays) => {
              if (deltaDays === null) {
                setBatchShiftPreview(null);
                return;
              }
              const drawMilestones = workspace.milestones.filter(
                (milestone) => milestone.drawGroupId === draw.id,
              );
              setBatchShiftPreview({
                deltaDays,
                lockedMilestoneIds: drawMilestones
                  .filter((milestone) => milestone.isDragLocked)
                  .map((milestone) => milestone.id),
                movingMilestoneIds: drawMilestones
                  .filter((milestone) => !milestone.isDragLocked)
                  .map((milestone) => milestone.id),
                source: "drawGroup",
                sourceId: draw.id,
              });
            }}
            rowIndex={draw.rowIndex}
            rowSpan={draw.rowSpan}
            startAt={draw.startAt}
            testId={`draw-overlay-${draw.id}`}
          >
            <DrawGroupRangeDragHandle
              draw={draw}
              milestones={workspace.milestones}
              onMoveDelta={(deltaDays) => {
                const ids = workspace.milestones
                  .filter((milestone) => milestone.drawGroupId === draw.id)
                  .map((milestone) => milestone.id);
                void commitBatchShift(ids, deltaDays, "drawGroup", draw.id);
              }}
              onPreviewDelta={(deltaDays) => {
                if (deltaDays === null) {
                  setBatchShiftPreview(null);
                  return;
                }
                const drawMilestones = workspace.milestones.filter(
                  (milestone) => milestone.drawGroupId === draw.id,
                );
                setBatchShiftPreview({
                  deltaDays,
                  lockedMilestoneIds: drawMilestones
                    .filter((milestone) => milestone.isDragLocked)
                    .map((milestone) => milestone.id),
                  movingMilestoneIds: drawMilestones
                    .filter((milestone) => !milestone.isDragLocked)
                    .map((milestone) => milestone.id),
                  source: "drawGroup",
                  sourceId: draw.id,
                });
              }}
              proposalSubmitted={proposalSubmitted}
            >
              <span className="font-semibold text-stone-100">{draw.label}</span>
              <span>{compactMoney(draw.amount)}</span>
              <span className="text-stone-300">
                {statusLabels[draw.status]}
              </span>
              <IssueChip
                compact
                issues={draw.issues}
                testId={`draw-issue-chip-${draw.id}`}
              />
            </DrawGroupRangeDragHandle>
          </GanttRangeOverlay>
        ))}
        {drawGroupGhostOverlays.map((draw) => (
          <GanttRangeOverlay
            className="z-[4] border-cyan-200/70 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(103,232,249,0.15)]"
            endAt={draw.endAt}
            id={`ghost-${draw.id}`}
            key={`ghost-${draw.id}`}
            rowIndex={draw.rowIndex}
            rowSpan={draw.rowSpan}
            startAt={draw.startAt}
            testId={`draw-ghost-overlay-${draw.id}`}
          >
            <div className="pointer-events-none sticky left-[calc(var(--gantt-sidebar-width)+0.5rem)] inline-flex -translate-y-[calc(100%+0.25rem)] items-center rounded-sm border border-cyan-200/40 bg-cyan-950/85 px-2 py-1 font-medium text-[0.72rem] text-cyan-50 shadow-lg">
              Drop {draw.label} here
            </div>
          </GanttRangeOverlay>
        ))}
        {batchShiftPreview ? (
          <div
            className="pointer-events-none absolute top-16 left-[calc(var(--gantt-sidebar-width)+1rem)] z-40 inline-flex rounded-sm border border-cyan-200/40 bg-cyan-950/90 px-2.5 py-1 font-medium text-[0.72rem] text-cyan-50 shadow-lg"
            data-testid="gantt-batch-shift-preview"
          >
            {batchShiftPreview.source === "drawGroup"
              ? `Shift ${workspace.drawGroups.find((draw) => draw.id === batchShiftPreview.sourceId)?.label ?? "draw"}: ${batchShiftPreview.movingMilestoneIds.length} milestones ${batchShiftPreview.deltaDays > 0 ? "+" : ""}${batchShiftPreview.deltaDays}d, ${batchShiftPreview.lockedMilestoneIds.length} locked`
              : `Shift ${batchShiftPreview.movingMilestoneIds.length} milestones ${batchShiftPreview.deltaDays > 0 ? "+" : ""}${batchShiftPreview.deltaDays}d`}
          </div>
        ) : null}
        {selectedMilestoneIds.size > 1 ? (
          <div
            className="pointer-events-none absolute top-8 left-[calc(var(--gantt-sidebar-width)+1rem)] z-40 inline-flex rounded-sm border border-cyan-200/35 bg-black/80 px-2 py-1 text-[0.7rem] text-cyan-100"
            data-testid="gantt-selection-count"
          >
            {selectedMilestoneIds.size} selected
            {lockedSelectedIds.length > 0
              ? ` / ${lockedSelectedIds.length} locked`
              : ""}
          </div>
        ) : null}
        {drawOverlays.map((draw) => (
          <GanttMarker
            className="bg-cyan-300 text-cyan-950 shadow-cyan-500/30"
            date={draw.eligibleAt}
            detail={
              <span className="flex flex-col items-start gap-0.5 leading-tight">
                <span>{format(draw.eligibleAt, "MMM dd, yyyy")}</span>
                <span>Draw value: {money(draw.amount)}</span>
                <span>Total exposure: {money(draw.totalExposure)}</span>
                <span>
                  Interest accrued (14%): {money(draw.interestAccumulated)}
                </span>
                <span>Draw fees to date: {money(draw.drawFeesToDate)}</span>
                <span>Incurred cost: {money(draw.incurredCost)}</span>
              </span>
            }
            detailTestId={`draw-eligible-${draw.id}-detail`}
            id={`draw-eligible-${draw.id}`}
            key={`draw-eligible-${draw.id}`}
            label={`${draw.label} eligible`}
            labelClassName="items-start text-left"
            testId={`draw-eligible-${draw.id}`}
          />
        ))}
        {drawGroupGhostOverlays.map((draw) => (
          <GanttMarker
            className="bg-cyan-100 text-cyan-950 shadow-cyan-500/40 ring-2 ring-cyan-300/40"
            containerClassName="z-30 opacity-80"
            date={draw.eligibleAt}
            id={`ghost-draw-eligible-${draw.id}`}
            key={`ghost-draw-eligible-${draw.id}`}
            label={`${draw.label} drop eligible`}
            testId={`draw-ghost-eligible-${draw.id}`}
          />
        ))}
        {focusedMilestone && (
          <>
            <GanttMarker
              className="bg-cyan-100 text-cyan-950 shadow-cyan-500/25"
              containerClassName="z-30"
              date={focusedMilestone.startAt}
              id={`milestone-start-${focusedMilestone.id}`}
              key={`milestone-start-${focusedMilestone.id}`}
              label={`Start ${format(focusedMilestone.startAt, "MMM dd")}`}
              labelClassName="translate-x-1/2"
              testId={`milestone-start-marker-${focusedMilestone.id}`}
            />
            <GanttMarker
              className="bg-cyan-100 text-cyan-950 shadow-cyan-500/25"
              containerClassName="z-30"
              date={focusedMilestone.endAt}
              id={`milestone-end-${focusedMilestone.id}`}
              key={`milestone-end-${focusedMilestone.id}`}
              label={`End ${format(focusedMilestone.endAt, "MMM dd")}`}
              labelClassName="translate-x-1/2"
              testId={`milestone-end-marker-${focusedMilestone.id}`}
            />
          </>
        )}
        <GanttToday className="bg-emerald-300 text-emerald-950" />
        <GanttFeatureList>
          {features.map((feature) => {
            const milestone = workspace.milestones.find(
              (item) => item.id === feature.id,
            );

            return (
              <GanttFeatureRow
                batchMoveIds={Array.from(selectedMilestoneIds)}
                className="border-white/5 border-b"
                disabledIds={disabledMilestoneIds}
                features={[feature]}
                key={feature.id}
                onBatchMove={(_featureId, deltaDays) => {
                  void commitBatchShift(
                    Array.from(selectedMilestoneIds),
                    deltaDays,
                    "selection",
                  );
                }}
                onBatchPreviewChange={(_featureId, preview) => {
                  if (!preview) {
                    setBatchShiftPreview(null);
                    return;
                  }
                  setBatchShiftPreview({
                    deltaDays: preview.deltaDays,
                    lockedMilestoneIds: lockedSelectedIds,
                    movingMilestoneIds: selectedUnlockedIds,
                    source: "selection",
                  });
                }}
                onMove={workspace.moveMilestoneDates}
                selectedIds={selectedMilestoneIds}
              >
                {(item) => (
                  <MilestoneBlock
                    feature={item}
                    highlightTone={milestoneHighlightTones[item.id]}
                    milestone={milestone ?? workspace.milestones[0]}
                    onTimelineClick={handleTimelineMilestoneClick}
                    selected={selectedMilestoneIds.has(item.id)}
                  />
                )}
              </GanttFeatureRow>
            );
          })}
        </GanttFeatureList>
        {drawGroupPreview ? (
          <GanttFeatureList className="pointer-events-none z-[5]">
            {ghostFeatures.map((feature) => {
              const milestone = workspace.milestones.find(
                (item) => item.id === feature.id,
              );
              const isMoving = drawGroupPreview.movingMilestoneIds.includes(
                feature.id,
              );

              return (
                <GanttFeatureRow
                  className="border-transparent border-b"
                  features={isMoving ? [feature] : []}
                  key={`ghost-${feature.id}`}
                >
                  {(item) => (
                    <MilestoneGhostBlock
                      feature={item}
                      milestone={milestone ?? workspace.milestones[0]}
                    />
                  )}
                </GanttFeatureRow>
              );
            })}
          </GanttFeatureList>
        ) : null}
      </GanttTimeline>
    </GanttProvider>
  );
}

function MilestoneRail({
  collapsed,
  milestoneHighlightTones,
  onCollapsedChange,
  onHighlightMilestones,
  onMilestoneFocus,
  onOpenDetail,
}: {
  collapsed: boolean;
  milestoneHighlightTones: MilestoneHighlightTones;
  onCollapsedChange: (collapsed: boolean) => void;
  onHighlightMilestones: (milestoneTones: MilestoneHighlightTones) => void;
  onMilestoneFocus: (milestoneId: string | null) => void;
  onOpenDetail: (milestoneId: string) => void;
}) {
  const workspace = useBuildWorkspace();
  const gantt = useGanttContext();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const focusMilestone = (milestone: Milestone) => {
    workspace.selectMilestone(milestone.id);
    onHighlightMilestones({ [milestone.id]: "selected" });
    onMilestoneFocus(milestone.id);
    gantt.scrollToFeature?.(milestoneToFeature(milestone));
  };

  const highlightBlocking = (milestone: Milestone) => {
    const blockedIds = workspace.dependencies
      .filter((dependency) => dependency.fromMilestoneId === milestone.id)
      .map((dependency) => dependency.toMilestoneId);

    onMilestoneFocus(null);
    onHighlightMilestones(
      Object.fromEntries(
        blockedIds.map((milestoneId) => [milestoneId, "blocked"]),
      ),
    );
  };

  const highlightBlockers = (milestone: Milestone) => {
    const blockerIds = workspace.dependencies
      .filter((dependency) => dependency.toMilestoneId === milestone.id)
      .map((dependency) => dependency.fromMilestoneId);

    onMilestoneFocus(null);
    onHighlightMilestones(
      Object.fromEntries(
        blockerIds.map((milestoneId) => [milestoneId, "blocking"]),
      ),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const fromIndex = workspace.milestones.findIndex(
      (milestone) => milestone.id === active.id,
    );
    const toIndex = workspace.milestones.findIndex(
      (milestone) => milestone.id === over.id,
    );
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    void workspace.reorderMilestoneAbsolute(
      String(active.id),
      fromIndex,
      toIndex,
    );
  };

  return (
    <aside
      className="sticky left-0 z-30 h-full max-h-full min-h-0 overflow-hidden border-white/10 border-r bg-[#101412]/95 backdrop-blur-md"
      data-testid="milestone-rail"
      style={{ width: collapsed ? 72 : 420 }}
    >
      <div className="sticky top-0 z-20 flex h-[60px] items-end justify-between border-white/10 border-b bg-[#101412]/95 px-3 py-2 text-stone-400 text-xs backdrop-blur-md">
        <span>{collapsed ? "MS" : "Milestones"}</span>
        {collapsed ? null : <span>Draw / Risk</span>}
        <Button
          data-testid="milestone-rail-collapse-toggle"
          onClick={() => onCollapsedChange(!collapsed)}
          size="icon-xs"
          title={
            collapsed ? "Expand milestone rail" : "Collapse milestone rail"
          }
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={workspace.milestones.map((milestone) => milestone.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="h-[calc(100%-60px)] min-h-0 overflow-y-auto overscroll-contain">
            {workspace.milestones.map((milestone, index) => {
              const blockers = workspace.dependencies.filter(
                (dependency) => dependency.toMilestoneId === milestone.id,
              ).length;
              const blocking = workspace.dependencies.filter(
                (dependency) => dependency.fromMilestoneId === milestone.id,
              ).length;
              const blockingChipActive = workspace.dependencies
                .filter(
                  (dependency) => dependency.fromMilestoneId === milestone.id,
                )
                .some(
                  (dependency) =>
                    milestoneHighlightTones[dependency.toMilestoneId] ===
                    "blocked",
                );
              const blockedByChipActive = workspace.dependencies
                .filter(
                  (dependency) => dependency.toMilestoneId === milestone.id,
                )
                .some(
                  (dependency) =>
                    milestoneHighlightTones[dependency.fromMilestoneId] ===
                    "blocking",
                );
              const draw = workspace.drawGroups.find(
                (drawGroup) => drawGroup.id === milestone.drawGroupId,
              );
              const selected = milestone.id === workspace.selectedMilestoneId;
              const highlightTone: MilestoneHighlightTone | undefined = selected
                ? "selected"
                : milestoneHighlightTones[milestone.id];

              return (
                <SortableMilestoneRailRow
                  blockedByChipActive={blockedByChipActive}
                  blockers={blockers}
                  blocking={blocking}
                  blockingChipActive={blockingChipActive}
                  collapsed={collapsed}
                  draw={draw}
                  highlightBlockers={highlightBlockers}
                  highlightBlocking={highlightBlocking}
                  highlightTone={highlightTone}
                  index={index}
                  key={milestone.id}
                  milestone={milestone}
                  onFocusMilestone={focusMilestone}
                  onOpenDetail={onOpenDetail}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </aside>
  );
}

function GanttMilestoneSidebar({
  features,
  onLockToggle,
  onMilestoneFocus,
  proposalSubmitted,
  selectedMilestoneIds,
}: {
  features: GanttFeature[];
  onLockToggle: (milestoneId: string, locked: boolean) => void;
  onMilestoneFocus: (milestoneId: string) => void;
  proposalSubmitted: boolean;
  selectedMilestoneIds: SelectedMilestoneIds;
}) {
  const workspace = useBuildWorkspace();

  return (
    <GanttSidebar className="w-[220px] shrink-0 border-white/10 bg-[#111615]/95 text-stone-300">
      <div className="divide-y divide-white/5">
        {features.map((feature) => {
          const milestone = workspace.milestones.find(
            (item) => item.id === feature.id,
          );
          const draw = milestone
            ? workspace.drawGroups.find(
                (drawGroup) => drawGroup.id === milestone.drawGroupId,
              )
            : undefined;

          return (
            <GanttSidebarItem
              className={cn(
                "gap-2 px-3 py-0 hover:bg-white/[0.04]",
                milestone?.id === workspace.selectedMilestoneId &&
                  "bg-lime-300/10 text-lime-100",
                milestone &&
                  selectedMilestoneIds.has(milestone.id) &&
                  "ring-1 ring-cyan-300/40 ring-inset",
              )}
              feature={feature}
              key={feature.id}
              onSelectItem={onMilestoneFocus}
            >
              <span
                className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: feature.status.color }}
              />
              <span className="pointer-events-none min-w-0 flex-1">
                <span className="block truncate text-[0.68rem] text-stone-500">
                  {milestone?.code}
                </span>
                <span className="block truncate font-medium text-[0.72rem] text-stone-200">
                  {feature.name}
                </span>
              </span>
              <span className="pointer-events-none shrink-0 text-[0.68rem] text-cyan-100">
                {draw?.label}
              </span>
              {milestone ? (
                <button
                  aria-label={
                    milestone.isDragLocked
                      ? `Unlock timeline dragging for ${milestone.name}`
                      : `Lock timeline dragging for ${milestone.name}`
                  }
                  aria-pressed={milestone.isDragLocked}
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-sm border border-white/10 text-stone-400 transition-colors hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100",
                    milestone.isDragLocked &&
                      "border-cyan-300/40 bg-cyan-300/15 text-cyan-100",
                    proposalSubmitted && "cursor-not-allowed opacity-50",
                  )}
                  data-gantt-interactive="true"
                  data-testid={`gantt-sidebar-lock-${milestone.id}`}
                  disabled={proposalSubmitted}
                  onClick={(event) => {
                    event.stopPropagation();
                    onLockToggle(milestone.id, !milestone.isDragLocked);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                    }
                  }}
                  title={
                    proposalSubmitted
                      ? "Submitted proposals cannot change milestone drag locks."
                      : milestone.isDragLocked
                        ? "Unlock milestone timeline dragging"
                        : "Lock milestone timeline dragging"
                  }
                  type="button"
                >
                  {milestone.isDragLocked ? (
                    <Lock className="size-3.5" />
                  ) : (
                    <Unlock className="size-3.5" />
                  )}
                </button>
              ) : null}
            </GanttSidebarItem>
          );
        })}
      </div>
    </GanttSidebar>
  );
}

function SortableMilestoneRailRow({
  blockedByChipActive,
  blockers,
  blocking,
  blockingChipActive,
  collapsed,
  draw,
  highlightBlockers,
  highlightBlocking,
  highlightTone,
  index,
  milestone,
  onFocusMilestone,
  onOpenDetail,
}: {
  blockedByChipActive: boolean;
  blockers: number;
  blocking: number;
  blockingChipActive: boolean;
  collapsed: boolean;
  draw: DrawGroup | undefined;
  highlightBlockers: (milestone: Milestone) => void;
  highlightBlocking: (milestone: Milestone) => void;
  highlightTone: MilestoneHighlightTone | undefined;
  index: number;
  milestone: Milestone;
  onFocusMilestone: (milestone: Milestone) => void;
  onOpenDetail: (milestoneId: string) => void;
}) {
  const workspace = useBuildWorkspace();
  const sortableDisabled =
    workspace.mode === "active" ||
    workspace.build.proposalStatus === "submitted";
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: milestone.id,
    disabled: sortableDisabled || collapsed,
  });

  return (
    <div
      className={cn(
        "relative grid w-full items-center overflow-hidden text-left transition-colors",
        collapsed
          ? "grid-cols-[1fr] gap-1 border-white/5 border-b px-1 hover:bg-white/[0.05]"
          : "grid-cols-[1rem_1fr_auto] gap-2 border-white/5 border-b px-2 hover:bg-white/[0.05]",
        highlightTone === "selected" &&
          "bg-cyan-300/10 ring-1 ring-cyan-300/45 ring-inset",
        highlightTone === "blocking" &&
          "bg-amber-300/20 ring-1 ring-amber-300/70 ring-inset",
        highlightTone === "blocked" &&
          "bg-red-500/20 ring-1 ring-red-300/70 ring-inset",
        isDragging && "z-40 opacity-70",
      )}
      data-highlight-tone={highlightTone ?? "none"}
      data-highlighted={highlightTone ? "true" : "false"}
      data-testid={`milestone-rail-row-${milestone.id}`}
      onClick={() => onFocusMilestone(milestone)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onFocusMilestone(milestone);
        }
      }}
      ref={setNodeRef}
      role="button"
      style={{
        height: collapsed ? "var(--gantt-row-height)" : "72px",
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      tabIndex={0}
    >
      {collapsed ? (
        <div className="flex items-center justify-center gap-1">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: statusColors[milestone.status] }}
          />
          <span className="truncate text-[0.62rem] text-stone-300">
            {milestone.code.replace("M-", "")}
          </span>
          {milestone.warningCount > 0 ? (
            <IssueChip
              compact
              issues={milestone.issues}
              testId={`milestone-issue-chip-${milestone.id}`}
            />
          ) : null}
        </div>
      ) : (
        <>
          <button
            aria-label={
              sortableDisabled
                ? workspace.mode === "active"
                  ? "Reordering is available only in proposal mode."
                  : "Submitted proposals cannot be reordered."
                : `Drag ${milestone.name} to reorder`
            }
            className={cn(
              "grid size-5 place-items-center rounded-sm text-stone-600",
              sortableDisabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-grab hover:bg-white/10 hover:text-stone-200",
            )}
            data-testid={`milestone-drag-handle-${milestone.id}`}
            disabled={sortableDisabled}
            {...attributes}
            {...listeners}
            onClick={(event) => {
              event.stopPropagation();
              if (!sortableDisabled && index > 0) {
                void workspace.reorderMilestone(milestone.id, "up");
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (!sortableDisabled && index > 0) {
                void workspace.reorderMilestone(milestone.id, "up");
              }
            }}
            title={
              sortableDisabled
                ? workspace.mode === "active"
                  ? "Reordering is disabled in active execution because the approved roadmap is locked."
                  : "Reordering is disabled after proposal submission."
                : "Drag to reorder proposal milestones"
            }
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-xs">
                {milestone.name}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[0.65rem] text-stone-500">
              <span>{milestone.code}</span>
              <span>{statusLabels[milestone.status]}</span>
              <span>{compactMoney(milestone.estimatedCost)}</span>
              <span>{milestone.estimatedDurationDays}d</span>
            </div>
            <div className="mt-1 flex gap-1 text-[0.62rem]">
              <button
                aria-label={`Highlight milestones blocked by ${milestone.name}`}
                className={cn(
                  "inline-flex h-4 items-center rounded-sm border border-white/10 bg-white/[0.04] px-1 text-stone-300 transition-colors hover:border-red-300/50 hover:bg-red-400/15 hover:text-red-100",
                  blockingChipActive &&
                    "border-red-300/60 bg-red-500/20 text-red-100",
                )}
                data-testid={`milestone-blocking-chip-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  highlightBlocking(milestone);
                }}
                type="button"
              >
                {blocking} blocking
              </button>
              <button
                aria-label={`Highlight milestones blocking ${milestone.name}`}
                className={cn(
                  "inline-flex h-4 items-center rounded-sm border border-white/10 bg-white/[0.04] px-1 text-stone-300 transition-colors hover:border-amber-300/50 hover:bg-amber-300/15 hover:text-amber-100",
                  blockedByChipActive &&
                    "border-amber-300/60 bg-amber-300/20 text-amber-100",
                )}
                data-testid={`milestone-blocked-by-chip-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  highlightBlockers(milestone);
                }}
                type="button"
              >
                {blockers} blocked-by
              </button>
              {milestone.warningCount > 0 ? (
                <IssueChip
                  compact
                  issues={milestone.issues}
                  testId={`milestone-issue-chip-${milestone.id}`}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className="h-5 rounded-sm border-cyan-300/20 bg-cyan-300/10 px-1.5 text-cyan-100">
              {draw?.label}
            </Badge>
            <div className="flex gap-1">
              <Button
                data-testid={`milestone-rail-detail-${milestone.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  workspace.selectMilestone(milestone.id);
                  onOpenDetail(milestone.id);
                }}
                size="icon-xs"
                title={`Open ${milestone.name} detail`}
                variant="ghost"
              >
                <PanelRightOpen />
              </Button>
              <Button
                data-testid={`milestone-move-up-${milestone.id}`}
                disabled={index === 0 || sortableDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void workspace.reorderMilestone(milestone.id, "up");
                }}
                size="icon-xs"
                title={
                  sortableDisabled
                    ? "Reorder controls are disabled outside editable proposal mode."
                    : "Move milestone up"
                }
                variant="ghost"
              >
                <ArrowUp />
              </Button>
              <Button
                data-testid={`milestone-move-down-${milestone.id}`}
                disabled={
                  index === workspace.milestones.length - 1 || sortableDisabled
                }
                onClick={(event) => {
                  event.stopPropagation();
                  void workspace.reorderMilestone(milestone.id, "down");
                }}
                size="icon-xs"
                title={
                  sortableDisabled
                    ? "Reorder controls are disabled outside editable proposal mode."
                    : "Move milestone down"
                }
                variant="ghost"
              >
                <ArrowDown />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MilestoneBlock({
  feature,
  highlightTone,
  milestone,
  onTimelineClick,
  selected,
}: {
  feature: GanttFeature;
  highlightTone: MilestoneHighlightTone | undefined;
  milestone: Milestone;
  onTimelineClick: (
    milestoneId: string,
    event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => void;
  selected: boolean;
}) {
  const workspace = useBuildWorkspace();
  const [previewOpen, setPreviewOpen] = useState(false);
  const handledModifiedPointerRef = useRef(false);
  const draw = workspace.drawGroups.find(
    (drawGroup) => drawGroup.id === milestone.drawGroupId,
  );
  const effectiveHighlightTone =
    selected || milestone.id === workspace.selectedMilestoneId
      ? "selected"
      : highlightTone;

  return (
    <HoverCard onOpenChange={setPreviewOpen} open={previewOpen}>
      <HoverCardTrigger
        className="flex h-full min-w-0 flex-1 items-center"
        render={
          <button
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-white/10 bg-[#1b211f] px-1.5 text-left transition-colors hover:border-cyan-200/40",
              effectiveHighlightTone === "selected" &&
                "border-cyan-200/60 bg-cyan-300/20 ring-2 ring-cyan-300/70",
              effectiveHighlightTone === "blocking" &&
                "bg-amber-300/20 ring-1 ring-amber-300/70",
              effectiveHighlightTone === "blocked" &&
                "bg-red-500/20 ring-1 ring-red-300/70",
              milestone.isDragLocked &&
                "cursor-not-allowed border-stone-500/40 bg-stone-800/70 text-stone-300",
            )}
            data-end-date={toDateInputValue(milestone.endAt)}
            data-gantt-interactive="true"
            data-highlight-tone={effectiveHighlightTone ?? "none"}
            data-highlighted={effectiveHighlightTone ? "true" : "false"}
            data-locked={milestone.isDragLocked ? "true" : "false"}
            data-selected={selected ? "true" : "false"}
            data-start-date={toDateInputValue(milestone.startAt)}
            data-testid={`timeline-milestone-${milestone.id}`}
            onClick={(event) => {
              if (handledModifiedPointerRef.current) {
                handledModifiedPointerRef.current = false;
                return;
              }
              onTimelineClick(milestone.id, event);
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                return;
              }
              window.dispatchEvent(
                new CustomEvent("drawflow-open-milestone-detail", {
                  detail: milestone.id,
                }),
              );
            }}
            onMouseEnter={() => setPreviewOpen(true)}
            onMouseLeave={() => setPreviewOpen(false)}
            onPointerDown={(event) => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) {
                handledModifiedPointerRef.current = true;
                event.preventDefault();
                event.stopPropagation();
                onTimelineClick(milestone.id, event);
              }
            }}
            style={{
              scrollMarginLeft:
                "calc(var(--gantt-leading-sidebar-width) + var(--gantt-kibo-sidebar-width) + 2rem)",
            }}
            type="button"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: feature.status.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[0.68rem]">
              <span className="mr-1 text-stone-400">{milestone.code}</span>
              <span className="font-medium text-stone-100">{feature.name}</span>
            </span>
            <IssueChip
              compact
              issues={milestone.issues}
              testId={`gantt-issue-chip-${milestone.id}`}
            />
            {milestone.isDragLocked ? (
              <Lock className="size-3 shrink-0 text-cyan-100" />
            ) : null}
          </button>
        }
      />
      <HoverCardContent
        className="border border-white/10 bg-[#111615] text-stone-100"
        data-testid={`gantt-preview-${milestone.id}`}
        side="top"
      >
        <div className="grid gap-1">
          <div className="font-medium">{milestone.name}</div>
          <div className="text-stone-400">
            {milestone.code} / {draw?.label} / {statusLabels[milestone.status]}
          </div>
          <div className="text-stone-400">
            {format(milestone.startAt, "MMM d")} -{" "}
            {format(milestone.endAt, "MMM d")} /{" "}
            {compactMoney(milestone.estimatedCost)}
          </div>
          <IssueList
            issues={milestone.issues}
            surface="gantt-preview"
            testIdPrefix={`gantt-preview-issue-${milestone.id}`}
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function MilestoneGhostBlock({
  feature,
  milestone,
}: {
  feature: GanttFeature;
  milestone: Milestone;
}) {
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-cyan-200/70 bg-cyan-300/20 px-1.5 text-left shadow-[0_0_0_1px_rgba(103,232,249,0.18)]"
      data-testid={`timeline-milestone-ghost-${milestone.id}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full opacity-80"
        style={{ backgroundColor: feature.status.color }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.68rem] text-cyan-50">
        <span className="mr-1 text-cyan-100/80">{milestone.code}</span>
        <span className="font-medium">{feature.name}</span>
      </span>
    </div>
  );
}

function MilestoneDetailSheet({
  milestone,
  draw,
  open,
  onOpenChange,
}: {
  milestone: Milestone;
  draw: DrawGroup | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useBuildWorkspace();
  const [draft, setDraft] = useState({
    actualCost: String(milestone.actualCost),
    completionReport: milestone.completionReport,
    estimatedCost: String(milestone.estimatedCost),
    estimatedDurationDays: String(milestone.estimatedDurationDays),
    lane: milestone.lane,
    name: milestone.name,
    notes: milestone.notes,
    progress: String(milestone.progress),
    startAt: toDateInputValue(milestone.startAt),
    status: milestone.status,
  });
  const [reason, setReason] = useState("Reviewed in demo workspace.");
  const [dependencyTarget, setDependencyTarget] = useState(
    workspace.milestones.find((item) => item.id !== milestone.id)?.id ?? "",
  );
  const [dependencyHardness, setDependencyHardnessDraft] =
    useState<DependencyHardness>("hard");

  useEffect(() => {
    setDraft({
      actualCost: String(milestone.actualCost),
      completionReport: milestone.completionReport,
      estimatedCost: String(milestone.estimatedCost),
      estimatedDurationDays: String(milestone.estimatedDurationDays),
      lane: milestone.lane,
      name: milestone.name,
      notes: milestone.notes,
      progress: String(milestone.progress),
      startAt: toDateInputValue(milestone.startAt),
      status: milestone.status,
    });
    setDependencyTarget(
      workspace.milestones.find((item) => item.id !== milestone.id)?.id ?? "",
    );
  }, [milestone, workspace.milestones]);

  const incoming = workspace.dependencies.filter(
    (dependency) => dependency.toMilestoneId === milestone.id,
  );
  const outgoing = workspace.dependencies.filter(
    (dependency) => dependency.fromMilestoneId === milestone.id,
  );
  const currentDrawIndex = workspace.drawGroups.findIndex(
    (drawGroup) => drawGroup.id === milestone.drawGroupId,
  );
  const previousDraw = workspace.drawGroups[currentDrawIndex - 1];
  const nextDraw = workspace.drawGroups[currentDrawIndex + 1];

  const saveMilestone = async () => {
    const duration = Math.max(
      1,
      parseNumber(draft.estimatedDurationDays, milestone.estimatedDurationDays),
    );
    const startAt = fromDateInputValue(draft.startAt);

    await workspace.updateMilestone(milestone.id, {
      estimatedCost: parseNumber(draft.estimatedCost, milestone.estimatedCost),
      estimatedDurationDays: duration,
      progress: Math.min(100, Math.max(0, parseNumber(draft.progress, 0))),
    });
    await workspace.moveMilestoneDates(
      milestone.id,
      startAt,
      addDays(startAt, duration - 1),
      reason,
    );
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto border-white/10 bg-[#111615] text-stone-100 sm:max-w-xl"
        data-testid="milestone-detail-sheet"
      >
        <SheetHeader className="border-white/10 border-b">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <SheetTitle className="text-stone-100">
                {milestone.code} / {milestone.name}
              </SheetTitle>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  {draw?.label}
                </Badge>
                <Badge variant="outline">
                  {statusLabels[milestone.status]}
                </Badge>
                <Badge variant="outline">
                  {statusLabels[milestone.evidenceStatus]}
                </Badge>
                <IssueList
                  issues={milestone.issues}
                  surface="detail"
                  testIdPrefix={`detail-issue-${milestone.id}`}
                />
              </div>
            </div>
            <Button
              data-testid="milestone-detail-close"
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Close
            </Button>
          </div>
        </SheetHeader>

        <div className="grid gap-4 p-4">
          <Panel title="Milestone Estimate">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  data-testid="milestone-name-input"
                  disabled
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      name: value,
                    }));
                  }}
                  value={draft.name}
                />
              </Field>
              <Field label="Status">
                <NativeSelect
                  className="w-full"
                  data-testid="milestone-status-select"
                  disabled
                  onChange={(event) => {
                    const value = event.currentTarget.value as MilestoneStatus;

                    setDraft((current) => ({
                      ...current,
                      status: value,
                    }));
                  }}
                  value={draft.status}
                >
                  {milestoneStatuses.map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {statusLabels[status]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Estimated cost">
                <Input
                  data-testid="milestone-estimated-cost-input"
                  disabled={workspace.mode === "active"}
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      estimatedCost: value,
                    }));
                  }}
                  onBlur={(event) => {
                    if (
                      workspace.mode === "proposal" &&
                      workspace.build.proposalStatus !== "submitted"
                    ) {
                      void workspace.updateMilestone(milestone.id, {
                        estimatedCost: parseNumber(
                          event.currentTarget.value,
                          milestone.estimatedCost,
                        ),
                      });
                    }
                  }}
                  value={draft.estimatedCost}
                />
              </Field>
              <Field
                label={
                  workspace.mode === "active"
                    ? "Requested draw amount"
                    : "Actual cost"
                }
              >
                <Input
                  data-testid="milestone-actual-cost-input"
                  disabled={workspace.mode === "proposal"}
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      actualCost: value,
                    }));
                  }}
                  value={draft.actualCost}
                />
              </Field>
              <Field label="Start date">
                <Input
                  data-testid="milestone-start-date-input"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      startAt: value,
                    }));
                  }}
                  type="date"
                  value={draft.startAt}
                />
              </Field>
              <Field label="Duration days">
                <Input
                  data-testid="milestone-duration-input"
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      estimatedDurationDays: value,
                    }));
                  }}
                  onBlur={(event) => {
                    if (
                      workspace.mode === "proposal" &&
                      workspace.build.proposalStatus !== "submitted"
                    ) {
                      void workspace.updateMilestone(milestone.id, {
                        estimatedDurationDays: Math.max(
                          1,
                          parseNumber(
                            event.currentTarget.value,
                            milestone.estimatedDurationDays,
                          ),
                        ),
                      });
                    }
                  }}
                  value={draft.estimatedDurationDays}
                />
              </Field>
              <Field label="Lane">
                <Input
                  data-testid="milestone-lane-input"
                  disabled
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      lane: value,
                    }));
                  }}
                  value={draft.lane}
                />
              </Field>
              <Field label="Progress">
                <Input
                  data-testid="milestone-progress-input"
                  disabled={workspace.mode === "proposal"}
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      progress: value,
                    }));
                  }}
                  value={draft.progress}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                data-testid="milestone-notes-input"
                disabled
                onChange={(event) => {
                  const { value } = event.currentTarget;

                  setDraft((current) => ({
                    ...current,
                    notes: value,
                  }));
                }}
                value={draft.notes}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                data-testid="save-milestone"
                disabled={
                  workspace.mode === "proposal" &&
                  workspace.build.proposalStatus === "submitted"
                }
                onClick={() => void saveMilestone()}
              >
                <Check />
                Save milestone
              </Button>
            </div>
          </Panel>

          {workspace.mode === "proposal" ? (
            <Panel title="Draw Group Controls">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Move to draw">
                  <NativeSelect
                    className="w-full"
                    data-testid="move-to-draw-select"
                    disabled={workspace.build.proposalStatus === "submitted"}
                    onChange={(event) =>
                      void workspace.moveMilestoneToDrawGroup(
                        milestone.id,
                        event.currentTarget.value,
                      )
                    }
                    value={milestone.drawGroupId}
                  >
                    {workspace.drawGroups.map((drawGroup) => (
                      <NativeSelectOption
                        key={drawGroup.id}
                        value={drawGroup.id}
                      >
                        {drawGroup.label} / {statusLabels[drawGroup.status]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-3 gap-2 self-end">
                  <Button
                    data-testid="split-draw"
                    disabled={
                      !draw || workspace.build.proposalStatus === "submitted"
                    }
                    onClick={() =>
                      draw &&
                      void workspace.splitDrawGroup(draw.id, milestone.id)
                    }
                    variant="outline"
                  >
                    <Scissors />
                    Split
                  </Button>
                  <Button
                    data-testid="merge-prev-draw"
                    disabled={
                      !previousDraw ||
                      workspace.build.proposalStatus === "submitted"
                    }
                    onClick={() =>
                      previousDraw &&
                      void workspace.mergeDrawGroups(
                        draw?.id ?? "",
                        previousDraw.id,
                      )
                    }
                    variant="outline"
                  >
                    Merge prev
                  </Button>
                  <Button
                    data-testid="merge-next-draw"
                    disabled
                    title={
                      nextDraw
                        ? "Merge next is disabled in this demo; use the next draw's Merge prev control."
                        : "No next draw group."
                    }
                    variant="outline"
                  >
                    Merge next
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}

          {workspace.mode === "proposal" ? (
            <Panel title="Dependencies">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <NativeSelect
                  className="w-full"
                  data-testid="dependency-target-select"
                  onChange={(event) =>
                    setDependencyTarget(event.currentTarget.value)
                  }
                  value={dependencyTarget}
                >
                  {workspace.milestones
                    .filter((item) => item.id !== milestone.id)
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.code} / {item.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <NativeSelect
                  className="w-full"
                  data-testid="dependency-hardness-select"
                  onChange={(event) =>
                    setDependencyHardnessDraft(
                      event.currentTarget.value as DependencyHardness,
                    )
                  }
                  value={dependencyHardness}
                >
                  <NativeSelectOption value="hard">Hard</NativeSelectOption>
                  <NativeSelectOption value="soft">Soft</NativeSelectOption>
                </NativeSelect>
                <Button
                  data-testid="add-dependency"
                  onClick={() =>
                    void workspace.addDependency(
                      dependencyTarget,
                      milestone.id,
                      dependencyHardness,
                    )
                  }
                  variant="secondary"
                >
                  Add dependency
                </Button>
              </div>
              <DependencyList dependencies={[...incoming, ...outgoing]} />
            </Panel>
          ) : null}

          {workspace.mode === "active" ? (
            <Panel title="Evidence and Completion">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  data-testid="add-sample-evidence"
                  onClick={() => void workspace.addSampleEvidence(milestone.id)}
                  variant="outline"
                >
                  <Plus />
                  Add sample evidence
                </Button>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-transparent px-3 text-sm hover:bg-white/[0.04]">
                  <Upload className="size-4" />
                  Upload evidence
                  <input
                    className="sr-only"
                    data-testid="upload-evidence"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) {
                        void workspace.uploadEvidence(milestone.id, file, true);
                      }
                    }}
                    type="file"
                  />
                </label>
                <Button
                  data-testid="upload-location-unverified"
                  onClick={() => {
                    const file = new File(
                      ["location unverified"],
                      "location-unverified.txt",
                      {
                        type: "text/plain",
                      },
                    );
                    void workspace.uploadEvidence(milestone.id, file, false);
                  }}
                  variant="outline"
                >
                  <MapPinOff />
                  Upload location-unverified
                </Button>
              </div>
              <Field label="Completion report">
                <Textarea
                  data-testid="completion-report-input"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      completionReport: value,
                    }));
                  }}
                  value={draft.completionReport}
                />
              </Field>
              <Button
                data-testid="submit-completion-report"
                onClick={() =>
                  void workspace.submitCompletionClaim(
                    milestone.id,
                    Math.max(
                      0,
                      parseNumber(draft.actualCost, milestone.estimatedCost),
                    ) * 100,
                  )
                }
                variant="secondary"
              >
                <ClipboardCheck />
                Submit completion report
              </Button>
            </Panel>
          ) : null}

          {workspace.mode === "active" ? (
            <Panel title="Lender Review, Site Visit, and Admin Approval">
              <Field label="Audit reason / review note">
                <Textarea
                  data-testid="audit-reason-input"
                  onChange={(event) => setReason(event.currentTarget.value)}
                  value={reason}
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  data-testid="accept-evidence"
                  onClick={() =>
                    void workspace.reviewEvidence(milestone.id, true, reason)
                  }
                  variant="outline"
                >
                  Accept evidence
                </Button>
                <Button
                  data-testid="request-more-info"
                  onClick={() =>
                    void workspace.requestMoreInformation(milestone.id, reason)
                  }
                  variant="outline"
                >
                  Request more info
                </Button>
                <Button
                  data-testid="request-site-visit"
                  onClick={() =>
                    void workspace.requestSiteVisit(milestone.id, reason)
                  }
                  variant="outline"
                >
                  Request site visit
                </Button>
                <Button
                  data-testid="claim-site-visit"
                  onClick={() => void workspace.claimSiteVisit(milestone.id)}
                  variant="outline"
                >
                  Claim site visit
                </Button>
                <Button
                  data-testid="submit-site-visit-report"
                  onClick={() =>
                    void workspace.submitSiteVisitReport(milestone.id, {
                      completionObserved: true,
                      notes: reason,
                      recommendedOutcome: "approve",
                    })
                  }
                  variant="outline"
                >
                  Submit site visit report
                </Button>
                <Button
                  data-testid="reject-milestone"
                  onClick={() =>
                    void workspace.rejectMilestone(milestone.id, reason)
                  }
                  variant="outline"
                >
                  Reject completion
                </Button>
                <Button
                  className="sm:col-span-2"
                  data-testid="approve-milestone"
                  onClick={() =>
                    void workspace.approveMilestone(milestone.id, reason)
                  }
                >
                  <ShieldCheck />
                  Approve milestone
                </Button>
              </div>
            </Panel>
          ) : null}

          <Panel title="Audit History">
            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
              {workspace.auditEvents.slice(0, 10).map((event) => (
                <div
                  className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs"
                  key={event.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-stone-200">
                      {event.message}
                    </span>
                    <span className="shrink-0 text-stone-500">
                      {format(new Date(event.timestamp), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <div className="mt-1 text-stone-500">
                    {event.actor} / {roleLabels[event.role]}
                    {event.reason ? ` / ${event.reason}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DependencyList({
  dependencies,
}: {
  dependencies: ReturnType<typeof useBuildWorkspace>["dependencies"];
}) {
  const workspace = useBuildWorkspace();
  const [error, setError] = useState("");

  if (dependencies.length === 0) {
    return <p className="text-stone-500 text-xs">No dependencies attached.</p>;
  }

  return (
    <div className="grid gap-2">
      {error ? (
        <div
          className="rounded-md border border-red-300/30 bg-red-500/10 p-2 text-red-100 text-xs"
          data-testid="dependency-error"
        >
          {error}
        </div>
      ) : null}
      {dependencies.map((dependency) => {
        const from = workspace.milestones.find(
          (milestone) => milestone.id === dependency.fromMilestoneId,
        );
        const to = workspace.milestones.find(
          (milestone) => milestone.id === dependency.toMilestoneId,
        );

        return (
          <div
            className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs sm:grid-cols-[1fr_auto_auto]"
            key={dependency.id}
          >
            <div className="min-w-0 truncate">
              {from?.code} blocks {to?.code}
            </div>
            <NativeSelect
              data-testid={`dependency-hardness-${dependency.id}`}
              disabled={
                dependency.isSystem ||
                workspace.build.proposalStatus === "submitted"
              }
              onChange={(event) => {
                setError("");
                void workspace
                  .setDependencyHardness(
                    dependency.id,
                    event.currentTarget.value as DependencyHardness,
                  )
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Dependency update failed.",
                    ),
                  );
              }}
              value={dependency.hardness}
            >
              <NativeSelectOption value="hard">Hard</NativeSelectOption>
              <NativeSelectOption value="soft">Soft</NativeSelectOption>
            </NativeSelect>
            <Button
              data-testid={`dependency-remove-${dependency.id}`}
              disabled={workspace.build.proposalStatus === "submitted"}
              onClick={() => {
                setError("");
                void workspace
                  .removeDependency(dependency.id)
                  .catch((caught) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Dependency removal failed.",
                    ),
                  );
              }}
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function InspectionDrawer({
  drawer,
  onClose,
}: {
  drawer: "audit" | "outbox";
  onClose: () => void;
}) {
  const workspace = useBuildWorkspace();
  const items =
    drawer === "audit" ? workspace.auditEvents : workspace.outboxEvents;

  return (
    <div
      className="fixed right-4 bottom-4 z-50 max-h-[70vh] w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-md border border-white/10 bg-[#111615] shadow-2xl shadow-black/60"
      data-testid={`workspace-${drawer}-drawer`}
    >
      <div className="flex items-center justify-between border-white/10 border-b p-3">
        <h2 className="font-semibold text-sm">
          {drawer === "audit" ? "Audit Events" : "Event Outbox"}
        </h2>
        <Button onClick={onClose} size="icon-xs" variant="ghost">
          Close
        </Button>
      </div>
      <div className="grid max-h-[58vh] gap-2 overflow-auto p-3">
        {items.length === 0 ? (
          <p className="text-stone-500 text-xs">No records yet.</p>
        ) : (
          items.map((item: any) => (
            <div
              className="rounded-md border border-white/10 bg-white/[0.03] p-2 text-xs"
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-200">
                  {drawer === "audit" ? item.message : item.eventType}
                </span>
                <span className="shrink-0 text-stone-500">
                  {format(new Date(item.timestamp), "MMM d, HH:mm")}
                </span>
              </div>
              <p className="mt-1 text-stone-400">
                {drawer === "audit"
                  ? `${item.actor} / ${item.command}`
                  : `${item.status} / ${item.relatedEntity}`}
              </p>
              <p className="mt-1 text-stone-500">
                {drawer === "audit" ? item.reason : item.payloadPreview}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddMilestoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useBuildWorkspace();
  const [name, setName] = useState("Exterior envelope");
  const [cost, setCost] = useState("188000");
  const [duration, setDuration] = useState("24");
  const [drawGroupId, setDrawGroupId] = useState(
    workspace.drawGroups[0]?.id ?? "",
  );

  const addMilestone = () => {
    workspace.addMilestone({
      drawGroupId,
      estimatedCost: parseNumber(cost, 0),
      estimatedDurationDays: Math.max(1, parseNumber(duration, 14)),
      name,
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="border-white/10 bg-[#111615] text-stone-100 sm:max-w-md"
        data-testid="add-milestone-dialog"
      >
        <DialogHeader>
          <DialogTitle>Add milestone</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              data-testid="add-milestone-name-input"
              onChange={(event) => setName(event.currentTarget.value)}
              value={name}
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Cost">
              <Input
                data-testid="add-milestone-cost-input"
                inputMode="numeric"
                onChange={(event) => setCost(event.currentTarget.value)}
                value={cost}
              />
            </Field>
            <Field label="Days">
              <Input
                data-testid="add-milestone-days-input"
                inputMode="numeric"
                onChange={(event) => setDuration(event.currentTarget.value)}
                value={duration}
              />
            </Field>
            <Field label="Draw">
              <NativeSelect
                className="w-full"
                data-testid="add-milestone-draw-select"
                onChange={(event) => setDrawGroupId(event.currentTarget.value)}
                value={drawGroupId}
              >
                {workspace.drawGroups.map((drawGroup) => (
                  <NativeSelectOption key={drawGroup.id} value={drawGroup.id}>
                    {drawGroup.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="add-milestone-submit"
            disabled={!name.trim()}
            onClick={addMilestone}
          >
            <Plus />
            Add milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function issueTone(
  issue: { severity?: WorkspaceIssue["severity"] } | undefined,
) {
  if (issue?.severity === "blocking") {
    return "border-red-300/40 bg-red-500/15 text-red-100";
  }
  if (issue?.severity === "info") {
    return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  }
  return "border-amber-300/30 bg-amber-300/10 text-amber-100";
}

function IssueChip({
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
              issueTone(primaryIssue),
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
        className="w-80 border border-white/10 bg-[#111615] text-stone-100"
        data-testid={`${testId}-popover`}
        side="right"
      >
        <IssuePopoverBody issue={primaryIssue} />
      </PopoverContent>
    </Popover>
  );
}

function IssueList({
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
                  issueTone(issue),
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
            className="w-80 border border-white/10 bg-[#111615] text-stone-100"
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

function IssuePopoverBody({ issue }: { issue: WorkspaceIssue }) {
  const workspace = useBuildWorkspace();
  const firstAffectedMilestoneId = issue.milestoneIds.find((milestoneId) =>
    workspace.milestones.some((milestone) => milestone.id === milestoneId),
  );
  const openAffectedMilestone = () => {
    if (!firstAffectedMilestoneId) {
      return;
    }
    workspace.selectMilestone(firstAffectedMilestoneId);
    window.dispatchEvent(
      new CustomEvent("drawflow-open-milestone-detail", {
        detail: firstAffectedMilestoneId,
      }),
    );
  };

  return (
    <div className="grid gap-3">
      <button
        className={cn(
          "rounded-sm text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/50",
          firstAffectedMilestoneId && "cursor-pointer hover:bg-white/[0.04]",
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
        <p className="mt-1 text-stone-300 text-xs">{issue.message}</p>
      </button>
      <div className="grid gap-1 text-stone-400 text-xs">
        <div>
          <span className="text-stone-500">Affected: </span>
          {[
            ...issue.milestoneIds,
            ...issue.drawGroupIds,
            ...issue.dependencyIds,
          ].join(", ")}
        </div>
        <div>
          <span className="text-stone-500">Why it matters: </span>
          {issue.impact}
        </div>
        <div>
          <span className="text-stone-500">Blocks release/submission: </span>
          {issue.severity === "blocking" ? "Yes" : "No"}
        </div>
        <div>
          <span className="text-stone-500">Recommended fix: </span>
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
                "Dismissed after review in demo workspace.",
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <h2 className="font-medium text-stone-200 text-xs">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 text-stone-400 text-xs">
      <span>{label}</span>
      {children}
    </div>
  );
}

function SummaryPill({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 text-stone-300 text-xs">
      <Icon className="size-3.5 text-stone-500" />
      {label}
    </span>
  );
}

function getDrawOverlays(milestones: Milestone[], drawGroups: DrawGroup[]) {
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
        ...indexedMilestones.map((item) => item.index),
      );
      const startAt = new Date(
        Math.min(
          ...indexedMilestones.map(({ milestone }) =>
            milestone.startAt.getTime(),
          ),
        ),
      );
      const endAt = new Date(
        Math.max(
          ...indexedMilestones.map(({ milestone }) =>
            milestone.endAt.getTime(),
          ),
        ),
      );
      const amount = indexedMilestones.reduce(
        (sum, { milestone }) => sum + milestone.estimatedCost,
        0,
      );
      const incurredCost = milestones
        .filter((milestone) => milestone.endAt.getTime() <= endAt.getTime())
        .reduce((sum, milestone) => sum + milestone.estimatedCost, 0);

      return {
        ...drawGroup,
        amount,
        duration: formatDistanceStrict(startAt, endAt),
        endAt,
        eligibleAt: endAt,
        incurredCost,
        rowIndex,
        rowSpan: lastRowIndex - rowIndex + 1,
        startAt,
      };
    })
    .filter((drawGroup) => drawGroup !== null);

  return baseDrawOverlays.map((drawGroup) => {
    const eligibleDraws = baseDrawOverlays.filter(
      (candidate) => candidate.endAt.getTime() <= drawGroup.endAt.getTime(),
    );
    const principalExposure = eligibleDraws.reduce(
      (sum, candidate) => sum + candidate.amount,
      0,
    );
    const interestAccumulated = eligibleDraws.reduce((sum, candidate) => {
      const daysSinceDraw = Math.max(
        0,
        differenceInDays(drawGroup.endAt, candidate.endAt),
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
