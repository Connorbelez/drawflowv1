import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Info,
  Lock,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  BuildWorkspaceAdapter,
  DrawGroup,
  DrawStatus,
  EvidenceStatus,
  Milestone,
  MilestoneStatus,
  ReviewReportSummary,
  SiteVisitSummary,
} from "./types";
import { useConvexBuildWorkspace } from "./convex-workspace-adapter";
import {
  BuildWorkspaceProvider,
  useBuildWorkspace,
} from "./workspace-adapter";

type AdminAction =
  | "approveEvidence"
  | "assignSiteVisit"
  | "requestMoreInformation"
  | "approveMilestone"
  | "approveWithOverride"
  | "rejectMilestone";

type DecisionState = {
  approveMilestoneEnabled: boolean;
  blockers: string[];
  canOverrideSiteVisit: boolean;
  helperCopy: string;
  recommendation: "Approve" | "Hold" | "Needs information";
};

type ReviewPackageRow = {
  countLabel: string;
  files: Milestone["evidenceFiles"];
  id: string;
  note: string;
  primaryAt: string;
  reportLabel: string;
  status: EvidenceStatus;
  title: string;
};

type SiteVisitRow = {
  id: string;
  note: string;
  primaryAt: string;
  reportLabel: string;
  status: string;
  title: string;
  visit: SiteVisitSummary;
};

type AdminViewModel = {
  decisionState: DecisionState;
  drawGroups: DrawGroup[];
  evidencePackages: ReviewPackageRow[];
  milestonesByDrawGroup: Map<string, Milestone[]>;
  reviewReportHistory: ReviewReportSummary[];
  selectedDrawGroup?: DrawGroup;
  selectedMilestone?: Milestone;
  siteVisitPackages: SiteVisitRow[];
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);

const dateTime = (value?: string) => {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const dateOnly = (value?: Date | string) => {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value instanceof Date ? value : new Date(value));
};

const percent = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);

const titleCase = (value: string) =>
  value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const milestoneStatusLabel: Record<MilestoneStatus, string> = {
  approved: "Complete",
  blocked: "Blocked",
  evidenceRequired: "Evidence required",
  evidenceSubmitted: "Evidence submitted",
  inProgress: "In progress",
  notStarted: "Pending",
  proposed: "Proposed",
  underReview: "In review",
};

const evidenceStatusLabel: Record<EvidenceStatus, string> = {
  accepted: "Complete",
  draft: "Draft",
  locationUnverified: "Location unverified",
  needsInfo: "Needs info",
  notStarted: "Missing",
  submitted: "Submitted",
};

const drawStatusLabel: Record<DrawStatus, string> = {
  blocked: "Pending",
  evidencePending: "In review",
  planned: "Pending",
  readyForRelease: "Ready",
  released: "Complete",
};

const statusTone = (
  status: MilestoneStatus | EvidenceStatus | DrawStatus | string
) => {
  if (
    status === "approved" ||
    status === "accepted" ||
    status === "released" ||
    status === "completed"
  ) {
    return "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-100";
  }
  if (
    status === "blocked" ||
    status === "locationUnverified" ||
    status === "needsInfo" ||
    status === "rejected"
  ) {
    return "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-100";
  }
  if (
    status === "underReview" ||
    status === "evidenceSubmitted" ||
    status === "submitted" ||
    status === "evidencePending" ||
    status === "requested" ||
    status === "claimed"
  ) {
    return "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-100";
  }
  if (status === "evidenceRequired" || status === "draft") {
    return "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-100";
  }
  return "border-border bg-muted text-muted-foreground";
};

export function deriveDecisionState(
  milestone?: Milestone,
  drawGroup?: DrawGroup
): DecisionState {
  if (!milestone) {
    return {
      approveMilestoneEnabled: false,
      blockers: ["No milestone selected."],
      canOverrideSiteVisit: false,
      helperCopy: "Select a milestone before taking admin action.",
      recommendation: "Hold",
    };
  }

  const blockers = new Set<string>();

  if (milestone.evidenceFiles.length === 0) {
    blockers.add("Evidence missing");
  }

  if (milestone.evidenceStatus === "notStarted") {
    blockers.add("Evidence package has not been submitted");
  }
  if (milestone.evidenceStatus === "draft") {
    blockers.add("Evidence package is still a builder draft");
  }
  if (milestone.evidenceStatus === "submitted") {
    blockers.add("Evidence requires lender admin acceptance");
  }
  if (milestone.evidenceStatus === "needsInfo") {
    blockers.add("More information is outstanding");
  }
  if (milestone.evidenceStatus === "locationUnverified") {
    blockers.add("Evidence location is unverified");
  }

  const latestVisit = milestone.siteVisits[0];
  const siteVisitIncomplete =
    milestone.requiresSiteVisit && latestVisit?.status !== "completed";
  if (siteVisitIncomplete) {
    blockers.add("Site visit required");
  }

  for (const reason of milestone.blockingReasons) {
    blockers.add(reason);
  }

  if (drawGroup?.status === "blocked") {
    blockers.add(`${drawGroup.label} is blocked by lender draw policy`);
  }

  const blockerList = [...blockers];
  const onlySiteVisitBlocks =
    blockerList.length > 0 &&
    blockerList.every((blocker) => /site visit/i.test(blocker));
  const canOverrideSiteVisit =
    milestone.evidenceStatus === "accepted" &&
    siteVisitIncomplete &&
    onlySiteVisitBlocks;
  const approveMilestoneEnabled =
    blockerList.length === 0 && milestone.evidenceStatus === "accepted";

  return {
    approveMilestoneEnabled,
    blockers: blockerList,
    canOverrideSiteVisit,
    helperCopy: blockerList.length
      ? `Resolve ${blockerList.length} blocking item${
          blockerList.length === 1 ? "" : "s"
        } before approving milestone completion.`
      : "Evidence and policy gates are clear for lender admin approval.",
    recommendation:
      milestone.evidenceStatus === "needsInfo"
        ? "Needs information"
        : blockerList.length
          ? "Hold"
          : "Approve",
  };
}

export function buildAdminReviewViewModel(
  workspace: Pick<
    BuildWorkspaceAdapter,
    "drawGroups" | "milestones" | "selectedMilestoneId"
  >,
  selectedMilestoneId = workspace.selectedMilestoneId
): AdminViewModel {
  const milestonesByDrawGroup = new Map<string, Milestone[]>();
  for (const group of workspace.drawGroups) {
    milestonesByDrawGroup.set(
      group.id,
      workspace.milestones.filter((milestone) => milestone.drawGroupId === group.id)
    );
  }

  const selectedMilestone =
    workspace.milestones.find((item) => item.id === selectedMilestoneId) ??
    workspace.milestones[0];
  const selectedDrawGroup = selectedMilestone
    ? workspace.drawGroups.find(
        (group) => group.id === selectedMilestone.drawGroupId
      )
    : workspace.drawGroups[0];

  const evidencePackages: ReviewPackageRow[] = selectedMilestone
    ? [
        {
          countLabel:
            selectedMilestone.evidenceFiles.length > 3
              ? `+${selectedMilestone.evidenceFiles.length - 3}`
              : `${selectedMilestone.evidenceFiles.length}`,
          files: selectedMilestone.evidenceFiles,
          id:
            selectedMilestone.evidencePackages[0]?.id ??
            `${selectedMilestone.id}:evidence`,
          note:
            selectedMilestone.evidenceStatus === "locationUnverified"
              ? "Geofence failed; evidence preserved for review."
              : selectedMilestone.completionReport || "Builder report attached.",
          primaryAt:
            selectedMilestone.evidencePackages[0]?.submittedAt ??
            selectedMilestone.evidenceFiles[0]?.uploadedAt ??
            selectedMilestone.startAt.toISOString(),
          reportLabel: "Builder Report",
          status: selectedMilestone.evidenceStatus,
          title: selectedMilestone.name,
        },
      ]
    : [];

  const siteVisitPackages = (selectedMilestone?.siteVisits ?? []).map(
    (visit): SiteVisitRow => ({
      id: visit.id,
      note:
        visit.notes ??
        (visit.status === "completed"
          ? "Site visit report submitted."
          : "Site visit report pending."),
      primaryAt: visit.completedAt ?? visit.claimedAt ?? visit.createdAt,
      reportLabel: "Site Visit Report",
      status: visit.status,
      title: selectedMilestone?.name ?? "Milestone",
      visit,
    })
  );

  return {
    decisionState: deriveDecisionState(selectedMilestone, selectedDrawGroup),
    drawGroups: workspace.drawGroups,
    evidencePackages,
    milestonesByDrawGroup,
    reviewReportHistory: selectedMilestone?.reviewReports ?? [],
    selectedDrawGroup,
    selectedMilestone,
    siteVisitPackages,
  };
}

export function isReviewNoteRequired(
  action: AdminAction,
  decisionState: DecisionState
) {
  return (
    action === "rejectMilestone" ||
    (action === "approveWithOverride" && decisionState.canOverrideSiteVisit)
  );
}

export async function runAdminReviewAction({
  action,
  decisionState,
  milestoneId,
  note,
  workspace,
}: {
  action: AdminAction;
  decisionState: DecisionState;
  milestoneId: string;
  note: string;
  workspace: Pick<
    BuildWorkspaceAdapter,
    | "approveMilestone"
    | "rejectMilestone"
    | "requestMoreInformation"
    | "requestSiteVisit"
    | "reviewEvidence"
  >;
}) {
  if (isReviewNoteRequired(action, decisionState) && !note.trim()) {
    throw new Error("Review note is required for this decision.");
  }

  if (action === "approveEvidence") {
    await workspace.reviewEvidence(milestoneId, true, note);
    return;
  }
  if (action === "assignSiteVisit") {
    await workspace.requestSiteVisit(milestoneId, note);
    return;
  }
  if (action === "requestMoreInformation") {
    await workspace.requestMoreInformation(milestoneId, note);
    return;
  }
  if (action === "approveMilestone" || action === "approveWithOverride") {
    await workspace.approveMilestone(milestoneId, note);
    return;
  }
  await workspace.rejectMilestone(milestoneId, note);
}

export function ConvexAdminBuildDashboardRoute() {
  const workspace = useConvexBuildWorkspace("active");

  useEffect(() => {
    if (workspace.role !== "lenderAdmin") {
      workspace.setRole("lenderAdmin");
    }
  }, [workspace]);

  return (
    <BuildWorkspaceProvider workspace={workspace}>
      <AdminBuildDashboard />
    </BuildWorkspaceProvider>
  );
}

function AdminBuildDashboard() {
  const workspace = useBuildWorkspace();
  const [expandedDrawGroupIds, setExpandedDrawGroupIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  const viewModel = useMemo(
    () => buildAdminReviewViewModel(workspace),
    [workspace]
  );

  useEffect(() => {
    const selectedDrawGroupId = viewModel.selectedDrawGroup?.id;
    if (!selectedDrawGroupId) {
      return;
    }
    setExpandedDrawGroupIds((current) => {
      if (current.has(selectedDrawGroupId)) {
        return current;
      }
      const next = new Set(current);
      next.add(selectedDrawGroupId);
      return next;
    });
  }, [viewModel.selectedDrawGroup?.id]);

  if (workspace.isLoading) {
    return <AdminDashboardShell>Loading active workspace...</AdminDashboardShell>;
  }

  if (workspace.milestones.length === 0) {
    return (
      <AdminDashboardShell>
        No active milestones are available for lender admin review.
      </AdminDashboardShell>
    );
  }

  const selectedMilestone = viewModel.selectedMilestone;
  const actionRequiresNote =
    pendingAction !== null &&
    isReviewNoteRequired(pendingAction, viewModel.decisionState);

  const handleDrawSelect = (drawGroup: DrawGroup) => {
    const wasExpanded = expandedDrawGroupIds.has(drawGroup.id);
    setExpandedDrawGroupIds((current) => {
      const next = new Set(current);
      if (next.has(drawGroup.id)) {
        next.delete(drawGroup.id);
      } else {
        next.add(drawGroup.id);
      }
      return next;
    });
    if (wasExpanded) {
      return;
    }
    const milestones = viewModel.milestonesByDrawGroup.get(drawGroup.id) ?? [];
    const selectedInGroup = milestones.find(
      (milestone) => milestone.id === workspace.selectedMilestoneId
    );
    const nextMilestone = selectedInGroup ?? milestones[0];
    if (nextMilestone) {
      workspace.selectMilestone(nextMilestone.id);
    }
  };

  const executeAction = async () => {
    if (!(pendingAction && selectedMilestone)) {
      return;
    }
    setMutationError("");
    setIsMutating(true);
    try {
      await runAdminReviewAction({
        action: pendingAction,
        decisionState: viewModel.decisionState,
        milestoneId: selectedMilestone.id,
        note: reviewNote,
        workspace,
      });
      setPendingAction(null);
      setReviewNote("");
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Unable to record decision."
      );
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="admin-build-dashboard-shell"
      data-ixc-ref="SCREEN-ADMIN-COMMAND-CENTER"
    >
      <div
        className={cn(
          "grid min-h-screen gap-3 overflow-x-hidden p-3",
          isRailCollapsed
            ? "xl:grid-cols-[4.5rem_minmax(0,1fr)_22rem]"
            : "xl:grid-cols-[21rem_minmax(0,1fr)_22rem]"
        )}
      >
        <DrawGroupRail
          collapsed={isRailCollapsed}
          expandedDrawGroupIds={expandedDrawGroupIds}
          onDrawSelect={handleDrawSelect}
          onMilestoneSelect={workspace.selectMilestone}
          onToggleRail={() => setIsRailCollapsed((current) => !current)}
          selectedMilestoneId={selectedMilestone?.id ?? ""}
          viewModel={viewModel}
        />
        <ReviewCenterPane viewModel={viewModel} />
        <DecisionPanel
          mutationError={mutationError}
          onAction={(action) => {
            setPendingAction(action);
            setReviewNote("");
            setMutationError("");
          }}
          viewModel={viewModel}
        />
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
            setReviewNote("");
            setMutationError("");
          }
        }}
        open={pendingAction !== null}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pendingAction ? actionLabel(pendingAction) : "Decision"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-muted-foreground text-xs">
              {actionRequiresNote
                ? "A review note is required for rejection and override decisions."
                : "A review note is optional for this action."}
            </p>
            <Textarea
              aria-label="Review note"
              data-testid="admin-review-note"
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder={
                actionRequiresNote
                  ? "Enter the audit reason for this decision."
                  : "Optional note for audit history."
              }
              value={reviewNote}
            />
            {mutationError ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"
                data-testid="admin-action-error"
              >
                {mutationError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={isMutating}
              onClick={() => {
                setPendingAction(null);
                setReviewNote("");
                setMutationError("");
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isMutating} onClick={executeAction} type="button">
              {isMutating ? "Recording..." : "Record decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function AdminDashboardShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        {children}
      </div>
    </main>
  );
}

function DrawGroupRail({
  collapsed,
  expandedDrawGroupIds,
  onDrawSelect,
  onMilestoneSelect,
  onToggleRail,
  selectedMilestoneId,
  viewModel,
}: {
  collapsed: boolean;
  expandedDrawGroupIds: Set<string>;
  onDrawSelect: (drawGroup: DrawGroup) => void;
  onMilestoneSelect: (milestoneId: string) => void;
  onToggleRail: () => void;
  selectedMilestoneId: string;
  viewModel: AdminViewModel;
}) {
  return (
    <aside
      className="min-h-0 min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
      data-ixc-ref="UI-DRAW-GROUP-RAIL"
      data-testid="admin-draw-group-rail"
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        {collapsed ? (
          <span className="sr-only">Draw Groups</span>
        ) : (
          <h1 className="font-semibold text-xl">Draw Groups</h1>
        )}
        <Button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand draw group rail" : "Collapse draw group rail"}
          data-testid="admin-draw-rail-toggle"
          onClick={onToggleRail}
          size="icon"
          variant="ghost"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto">
        {viewModel.drawGroups.map((drawGroup, drawIndex) => {
          const milestones =
            viewModel.milestonesByDrawGroup.get(drawGroup.id) ?? [];
          const isExpanded = expandedDrawGroupIds.has(drawGroup.id);
          const isSelected = viewModel.selectedDrawGroup?.id === drawGroup.id;
          const completedCount = milestones.filter(
            (milestone) => milestone.status === "approved"
          ).length;

          return (
            <section key={drawGroup.id}>
              <button
                className={cn(
                  "grid w-full items-center gap-3 border-b py-4 text-left transition-colors hover:bg-muted/60",
                  collapsed
                    ? "grid-cols-[2rem] justify-center px-3"
                    : "grid-cols-[2rem_minmax(0,1fr)_auto_1rem] px-4",
                  isSelected && "bg-blue-50 dark:bg-blue-500/10"
                )}
                data-ixc-ref={
                  isSelected ? "UI-DRAW-ROW-SELECTED" : "UI-DRAW-ROW-1"
                }
                data-testid={`admin-draw-row-${drawGroup.id}`}
                onClick={() => onDrawSelect(drawGroup)}
                type="button"
              >
                <RailCircle active={isSelected} done={drawGroup.status === "released"}>
                  {drawGroup.status === "released" ? <Check /> : drawIndex + 1}
                </RailCircle>
                <span className="min-w-0">
                  {collapsed ? (
                    <span className="sr-only">{drawGroup.label}</span>
                  ) : (
                    <>
                      <span className="block truncate font-semibold">
                        {drawGroup.label}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {money(drawGroup.totalExposure)} of {money(drawGroup.amount)}
                      </span>
                    </>
                  )}
                </span>
                {collapsed ? null : (
                  <StatusBadge status={drawGroup.status}>
                    {drawStatusLabel[drawGroup.status]}
                  </StatusBadge>
                )}
                {collapsed ? null : isExpanded ? <ChevronDown /> : <ChevronRight />}
              </button>
              {isExpanded && !collapsed ? (
                <div>
                  <div className="border-b px-4 py-3 font-semibold text-sm">
                    Milestones ({completedCount} of {milestones.length} complete)
                  </div>
                  {milestones.map((milestone, milestoneIndex) => (
                    <button
                      className={cn(
                        "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                        selectedMilestoneId === milestone.id &&
                          "bg-blue-50 dark:bg-blue-500/10"
                      )}
                      data-ixc-ref={
                        selectedMilestoneId === milestone.id
                          ? "UI-MILESTONE-SELECTED"
                          : undefined
                      }
                      data-testid={`admin-milestone-row-${milestone.id}`}
                      key={milestone.id}
                      onClick={() => onMilestoneSelect(milestone.id)}
                      type="button"
                    >
                      <RailCircle
                        active={milestone.status === "inProgress"}
                        done={milestone.status === "approved"}
                      >
                        {milestoneIndex + 1}
                      </RailCircle>
                      <span className="truncate font-semibold">
                        {milestone.name}
                      </span>
                      <StatusBadge status={milestone.status}>
                        {milestoneStatusLabel[milestone.status]}
                      </StatusBadge>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
        {collapsed ? null : <button
          className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto_1rem] items-center gap-3 px-4 py-5 text-left text-primary"
          data-ixc-ref="UI-ADD-DRAW-GROUP"
          type="button"
        >
          <Plus />
          <span className="font-semibold">Add Draw Group</span>
        </button>}
      </div>
    </aside>
  );
}

function ReviewCenterPane({ viewModel }: { viewModel: AdminViewModel }) {
  const milestone = viewModel.selectedMilestone;
  const drawGroup = viewModel.selectedDrawGroup;

  if (!milestone) {
    return (
      <section className="rounded-lg border bg-card p-5 text-card-foreground">
        Select a milestone to review evidence.
      </section>
    );
  }

  return (
    <section
      className="min-h-0 min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
      data-ixc-ref="UI-REVIEW-CENTER-PANE"
      data-testid="admin-review-center-pane"
    >
      <div className="border-b p-5">
        <div className="mb-5">
          <h2
            className="font-semibold text-3xl"
            data-ixc-ref="UI-SELECTED-MILESTONE-TITLE"
          >
            {milestone.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {drawGroup?.label ?? "Draw group"} / Milestone Review
          </p>
        </div>
        <div
          className="grid gap-4 border-t pt-4 md:grid-cols-5"
          data-ixc-ref="UI-MILESTONE-REVIEW-METRICS"
        >
          <Metric label="Milestone Status">
            <StatusBadge status={milestone.status}>
              {milestoneStatusLabel[milestone.status]}
            </StatusBadge>
          </Metric>
          <Metric label="% Complete">
            <strong>{milestone.progress}%</strong>
            <Progress value={milestone.progress} />
          </Metric>
          <Metric label="Evidence Status">
            <strong
              className={cn(
                milestone.evidenceStatus === "accepted"
                  ? "text-success"
                  : "text-warning"
              )}
            >
              {evidenceStatusLabel[milestone.evidenceStatus]}
            </strong>
            <span className="text-muted-foreground text-xs">
              {milestone.evidenceFiles.length === 0
                ? "No files"
                : `${milestone.evidenceFiles.length} file${
                    milestone.evidenceFiles.length === 1 ? "" : "s"
                  }`}
            </span>
          </Metric>
          <Metric label="Draw Group">
            <strong>{drawGroup?.label ?? "Unassigned"}</strong>
          </Metric>
          <Metric label="Blocking Approval">
            <strong
              className={cn(
                "inline-flex items-center gap-1",
                viewModel.decisionState.blockers.length
                  ? "text-danger"
                  : "text-success"
              )}
            >
              {viewModel.decisionState.blockers.length ? (
                <AlertTriangle className="size-4" />
              ) : (
                <Check className="size-4" />
              )}
              {viewModel.decisionState.blockers.length ? "Yes" : "No"}
            </strong>
          </Metric>
        </div>
      </div>

      <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto p-5">
        <PackageSection
          description="Evidence packages submitted by the builder for this milestone."
          empty="No builder evidence package is available for this milestone."
          rows={viewModel.evidencePackages}
          title="Builder / Borrower Evidence"
        />
        <SiteVisitSection rows={viewModel.siteVisitPackages} />
        <ReviewReportSection rows={viewModel.reviewReportHistory} />
        <div
          className="flex gap-3 rounded-lg border bg-blue-50 p-4 text-blue-950 text-sm dark:bg-blue-500/10 dark:text-blue-100"
          data-ixc-ref="UI-REVIEW-HELP-COPY"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Evidence packages group related photos and reports together. Review
            each package to verify milestone completion.
          </p>
        </div>
      </div>
    </section>
  );
}

function DecisionPanel({
  mutationError,
  onAction,
  viewModel,
}: {
  mutationError: string;
  onAction: (action: AdminAction) => void;
  viewModel: AdminViewModel;
}) {
  const milestone = viewModel.selectedMilestone;
  const decision = viewModel.decisionState;

  return (
    <aside
      className="min-h-0 min-w-0 overflow-y-auto rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
      data-ixc-ref="UI-DECISION-PANEL"
      data-testid="admin-decision-panel"
    >
      <h2 className="mb-6 font-semibold text-2xl">Milestone Decision</h2>
      <div className="mb-5" data-ixc-ref="UI-RECOMMENDATION-SUMMARY">
        <div className="font-semibold text-muted-foreground text-xs uppercase">
          Recommendation
        </div>
        <div
          className={cn(
            "mt-2 font-semibold text-3xl",
            decision.recommendation === "Approve"
              ? "text-success"
              : "text-danger"
          )}
        >
          {decision.recommendation}
        </div>
        <p className="mt-3 text-muted-foreground text-sm">
          {decision.helperCopy}
        </p>
      </div>

      <div
        className={cn(
          "mb-6 rounded-lg border p-4",
          decision.blockers.length
            ? "border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
        )}
        data-ixc-ref="UI-BLOCKING-ITEMS"
        data-testid="admin-blocking-items"
      >
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          {decision.blockers.length ? (
            <AlertTriangle className="size-4" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Blocking Items ({decision.blockers.length})
        </h3>
        {decision.blockers.length ? (
          <ul className="grid gap-2 text-sm">
            {decision.blockers.map((blocker) => (
              <li className="flex gap-2" key={blocker}>
                <span className="text-warning">•</span>
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No blockers remain for this milestone.</p>
        )}
      </div>

      {milestone ? (
        <MilestoneDetailCard
          drawGroup={viewModel.selectedDrawGroup}
          milestone={milestone}
        />
      ) : null}

      <div className="mb-6 border-t pt-5">
        <h3 className="mb-3 font-semibold">Milestone Review Actions</h3>
        <div className="grid gap-3">
          <Button
            className="h-10 text-sm"
            data-ixc-ref="UI-APPROVE-EVIDENCE"
            disabled={!milestone || milestone.evidenceFiles.length === 0}
            onClick={() => onAction("approveEvidence")}
          >
            <ClipboardCheck />
            Approve Evidence
          </Button>
          <Button
            className="h-10 text-sm"
            data-ixc-ref="UI-ASSIGN-SITE-VISIT"
            disabled={!milestone}
            onClick={() => onAction("assignSiteVisit")}
            variant="outline"
          >
            <MapPinned />
            Assign Site Visit
          </Button>
          <Button
            className="h-10 text-sm"
            data-ixc-ref="UI-REQUEST-MORE-INFORMATION"
            disabled={!milestone}
            onClick={() => onAction("requestMoreInformation")}
            variant="outline"
          >
            Request More Information
          </Button>
          <Button
            className="h-10 text-sm"
            data-ixc-ref="UI-APPROVE-MILESTONE-DISABLED"
            disabled={!decision.approveMilestoneEnabled}
            onClick={() => onAction("approveMilestone")}
            variant={decision.approveMilestoneEnabled ? "default" : "secondary"}
          >
            {decision.approveMilestoneEnabled ? <Check /> : <Lock />}
            Approve Milestone
          </Button>
          {decision.canOverrideSiteVisit ? (
            <Button
              className="h-10 text-sm"
              onClick={() => onAction("approveWithOverride")}
              variant="outline"
            >
              Approve With Override
            </Button>
          ) : null}
          <Button
            className="h-10 text-sm"
            disabled={!milestone}
            onClick={() => onAction("rejectMilestone")}
            variant="destructive"
          >
            Reject Milestone
          </Button>
        </div>
      </div>

      {mutationError ? (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-xs">
          {mutationError}
        </div>
      ) : null}

      <div
        className="flex gap-3 rounded-lg border bg-blue-50 p-4 text-blue-950 text-sm dark:bg-blue-500/10 dark:text-blue-100"
        data-ixc-ref="UI-DRAW-BLOCKING-NOTE"
      >
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          This milestone blocks approval for{" "}
          {viewModel.selectedDrawGroup?.label ?? "the selected draw group"}.
        </p>
      </div>
    </aside>
  );
}

function MilestoneDetailCard({
  drawGroup,
  milestone,
}: {
  drawGroup?: DrawGroup;
  milestone: Milestone;
}) {
  const completedAt =
    milestone.status === "approved" ? milestone.endAt : undefined;
  const isBehindSchedule =
    milestone.status === "blocked" ||
    milestone.issues.some((issue) => issue.severity === "blocking") ||
    (milestone.progress < 100 && milestone.endAt.getTime() < Date.now());
  const scheduleLabel = completedAt
    ? isBehindSchedule
      ? "Completed behind schedule"
      : "Completed on schedule"
    : isBehindSchedule
      ? "Behind schedule"
      : "On schedule";
  const costIncurred =
    milestone.actualCost || Math.round((milestone.estimatedCost * milestone.progress) / 100);
  const drawBudgetShare =
    drawGroup && drawGroup.amount > 0 ? milestone.estimatedCost / drawGroup.amount : 0;

  return (
    <section
      className="mb-6 rounded-lg border bg-muted/20 p-4"
      data-testid="admin-milestone-detail"
    >
      <h3 className="mb-3 font-semibold">Milestone Details</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DecisionMetric label="Date started" value={dateOnly(milestone.startAt)} />
        <DecisionMetric
          label="Date completed"
          value={completedAt ? dateOnly(completedAt) : "Not complete"}
        />
        <DecisionMetric label="Schedule" value={scheduleLabel} />
        <DecisionMetric label="Milestone budget" value={money(milestone.estimatedCost)} />
        <DecisionMetric label="Cost incurred" value={money(costIncurred)} />
        <DecisionMetric
          label="% of draw budget"
          value={drawGroup ? percent(drawBudgetShare) : "Unassigned"}
        />
      </div>
    </section>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="text-muted-foreground text-[0.7rem] uppercase">
        {label}
      </div>
      <div className="mt-1 break-words font-semibold leading-snug">{value}</div>
    </div>
  );
}

function PackageSection({
  description,
  empty,
  rows,
  title,
}: {
  description: string;
  empty: string;
  rows: ReviewPackageRow[];
  title: string;
}) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="font-semibold text-2xl">{title}</h3>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">{description}</p>
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((row) => (
            <button
              className="grid w-full min-w-0 gap-4 overflow-hidden rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 xl:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)_minmax(9rem,12rem)_1rem]"
              data-ixc-ref="UI-BUILDER-EVIDENCE-PACKAGE"
              data-testid={`admin-evidence-package-${row.id}`}
              key={row.id}
              type="button"
            >
              <PackageDate date={row.primaryAt} status={row.status} />
              <EvidenceThumbs files={row.files} moreLabel={row.countLabel} />
              <ReportLabel label={row.reportLabel} note={row.note} />
              <ChevronRight className="self-center" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyRow>{empty}</EmptyRow>
      )}
    </section>
  );
}

function SiteVisitSection({ rows }: { rows: SiteVisitRow[] }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="font-semibold text-2xl">Staff Site Visits</h3>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        Site visit evidence packages and reports.
      </p>
      {rows.length ? (
        <div className="grid gap-3">
          {rows.map((row, index) => (
            <button
              className="grid w-full min-w-0 gap-4 overflow-hidden rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 xl:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)_minmax(9rem,12rem)_1rem]"
              data-ixc-ref={
                index === 0 ? "UI-SITE-VISIT-CURRENT" : "UI-SITE-VISIT-COMPLETE"
              }
              data-testid={`admin-site-visit-${row.id}`}
              key={row.id}
              type="button"
            >
              <PackageDate date={row.primaryAt} status={row.status} />
              <div className="grid gap-2 text-sm">
                <div className="font-semibold">{row.title}</div>
                <p className="text-muted-foreground">{row.note}</p>
                {row.visit.riskFlags.length ? (
                  <p className="text-danger">
                    {row.visit.riskFlags.map(titleCase).join(", ")}
                  </p>
                ) : null}
              </div>
              <ReportLabel
                label={row.reportLabel}
                note={row.visit.recommendedOutcome ?? "PDF report"}
              />
              <ChevronRight className="self-center" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyRow>No site visit has been requested for this milestone.</EmptyRow>
      )}
    </section>
  );
}

function ReviewReportSection({ rows }: { rows: ReviewReportSummary[] }) {
  return (
    <section className="rounded-lg border p-4">
      <h3 className="font-semibold text-xl">Historical Review Reports</h3>
      <p className="mt-1 mb-4 text-muted-foreground text-sm">
        Lender review decisions already recorded for this milestone.
      </p>
      {rows.length ? (
        <div className="grid gap-2">
          {rows.map((row) => (
            <div
              className="grid gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-[10rem_1fr_auto]"
              data-testid={`admin-review-report-${row.id}`}
              key={row.id}
            >
              <span className="text-muted-foreground text-xs">
                {dateTime(row.createdAt)}
              </span>
              <span className="text-sm">
                {row.notes || `${titleCase(row.outcome)} recorded.`}
              </span>
              <StatusBadge status={row.outcome}>{titleCase(row.outcome)}</StatusBadge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyRow>No historical review report exists yet.</EmptyRow>
      )}
    </section>
  );
}

function EvidenceThumbs({
  files,
  moreLabel,
}: {
  files: Milestone["evidenceFiles"];
  moreLabel: string;
}) {
  const visibleFiles = files.slice(0, 3);
  return (
    <div className="flex min-w-0 gap-2">
      {visibleFiles.map((file) => (
        <div
          className="grid aspect-[4/3] w-20 place-items-center rounded-md border bg-muted text-center text-[0.625rem] text-muted-foreground"
          key={file.id}
          title={file.fileName}
        >
          {file.mimeType.includes("pdf") ? (
            <FileText className="size-5" />
          ) : (
            file.fileName.split(".")[0]?.slice(0, 8)
          )}
        </div>
      ))}
      <div className="grid aspect-[4/3] w-20 place-items-center rounded-md border bg-background font-semibold">
        {moreLabel}
      </div>
    </div>
  );
}

function PackageDate({
  date,
  status,
}: {
  date: string;
  status: EvidenceStatus | string;
}) {
  return (
    <span className="grid gap-2">
      <strong>{dateTime(date)}</strong>
      <StatusBadge status={status}>
        {evidenceStatusLabel[status as EvidenceStatus] ?? titleCase(status)}
      </StatusBadge>
    </span>
  );
}

function ReportLabel({ label, note }: { label: string; note: string }) {
  return (
    <span className="grid content-center gap-1 border-l pl-4">
      <span className="flex items-center gap-2 font-semibold text-primary">
        <FileText className="size-4" />
        {label}
      </span>
      <span className="line-clamp-2 text-muted-foreground text-xs">{note}</span>
    </span>
  );
}

function Metric({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-2 border-border md:border-r md:pr-4 md:last:border-r-0">
      <span className="font-semibold text-muted-foreground text-xs">
        {label}
      </span>
      {children}
    </div>
  );
}

function RailCircle({
  active,
  children,
  done,
}: {
  active?: boolean;
  children: ReactNode;
  done?: boolean;
}) {
  return (
    <span
      className={cn(
        "grid size-7 place-items-center rounded-full border-2 font-semibold text-xs",
        done && "border-success bg-success text-white",
        active && !done && "border-blue-600 bg-blue-600 text-white",
        !(active || done) && "border-border-strong text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function StatusBadge({
  children,
  status,
}: {
  children: ReactNode;
  status: MilestoneStatus | EvidenceStatus | DrawStatus | string;
}) {
  return (
    <Badge className={cn("rounded-md", statusTone(status))} variant="outline">
      {children}
    </Badge>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function actionLabel(action: AdminAction) {
  if (action === "approveEvidence") {
    return "Approve Evidence";
  }
  if (action === "assignSiteVisit") {
    return "Assign Site Visit";
  }
  if (action === "requestMoreInformation") {
    return "Request More Information";
  }
  if (action === "approveMilestone") {
    return "Approve Milestone";
  }
  if (action === "approveWithOverride") {
    return "Approve With Override";
  }
  return "Reject Milestone";
}
