import { useEffect, useState } from "react";

import { cn } from "#/lib/utils.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  GanttResolution,
  MilestoneHighlightTones,
  ScheduleDisplayMode,
} from "./build-workspace-demo-contracts";
import {
  DrawPlanComparisonDialog,
  TimelineControlsStrip,
  ValidationDialog,
  WorkspaceTopBar,
} from "./build-workspace-demo-controls";
import { DrawGroupDetailSheet } from "./build-workspace-demo-draw-sheet";
import { GanttRoadmap } from "./build-workspace-demo-gantt";
import { InspectionDrawer } from "./build-workspace-demo-inspection";
import { MilestoneDetailSheet } from "./build-workspace-demo-milestone-sheet";
import { useBuildWorkspace } from "./workspace-adapter";

export function BuildWorkspaceDemo({
  canFinalizeMilestones = true,
  layout = "route",
  onOpenSubmilestone,
  showPrimaryAction = true,
  showRoleSelector = true,
  viewer = "lender",
  workspaceCrumbHref = {
    active: "/backoffice/builds/$buildId",
    proposal: "/backoffice/proposals/$planId",
  },
}: {
  canFinalizeMilestones?: boolean;
  layout?: "embedded" | "route";
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  showPrimaryAction?: boolean;
  showRoleSelector?: boolean;
  viewer?: "builder" | "lender";
  workspaceCrumbHref?: { active: string; proposal: string };
} = {}) {
  const workspace = useBuildWorkspace();
  const [detailOpen, setDetailOpen] = useState(false);
  const [inspectionDrawer, setInspectionDrawer] = useState<
    "audit" | "outbox" | null
  >(null);
  const [timelineResolution, setTimelineResolution] =
    useState<GanttResolution>("monthly");
  const [scheduleDisplayMode, setScheduleDisplayMode] =
    useState<ScheduleDisplayMode>("dates");
  const [timelineZoom, setTimelineZoom] = useState(120);
  const [detailMilestoneId, setDetailMilestoneId] = useState<string | null>(
    null
  );
  const [detailDrawId, setDetailDrawId] = useState<string | null>(null);
  const [drawDetailOpen, setDrawDetailOpen] = useState(false);
  const [milestoneHighlightTones, setMilestoneHighlightTones] =
    useState<MilestoneHighlightTones>({});
  const [focusedMilestoneId, setFocusedMilestoneId] = useState<string | null>(
    null
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
      (milestone) => milestone.id === workspace.selectedMilestoneId
    ) ?? workspace.milestones[0];
  const selectedDraw = selectedMilestone
    ? workspace.drawGroups.find(
        (drawGroup) => drawGroup.id === selectedMilestone.drawGroupId
      )
    : undefined;
  const detailMilestone =
    workspace.milestones.find(
      (milestone) => milestone.id === detailMilestoneId
    ) ?? selectedMilestone;
  const detailDraw = detailMilestone
    ? workspace.drawGroups.find(
        (drawGroup) => drawGroup.id === detailMilestone.drawGroupId
      )
    : selectedDraw;
  const detailDrawGroup =
    workspace.drawGroups.find((drawGroup) => drawGroup.id === detailDrawId) ??
    selectedDraw;
  const totalDrawAmount = workspace.milestones.reduce(
    (sum, milestone) => sum + milestone.estimatedCost,
    0
  );
  const blockerCount = workspace.dependencies.filter(
    (dependency) => dependency.hardness === "hard"
  ).length;

  if (workspace.isLoading || workspace.needsSeed || !selectedMilestone) {
    return (
      <main
        className={cn(
          "grid place-items-center bg-background text-foreground",
          layout === "embedded" ? "min-h-[32rem]" : "min-h-screen"
        )}
      >
        <div
          className="rounded-md border border-border bg-card px-4 py-3 text-sm"
          data-testid="build-workspace-loading"
        >
          Loading DrawFlow workspace...
        </div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "overflow-hidden bg-background text-foreground",
        layout === "embedded"
          ? "h-full min-h-[42rem] rounded-md border border-border"
          : "fixed inset-x-0 top-16 bottom-0"
      )}
    >
      <div
        className="flex h-full min-h-0 w-full flex-col px-3 pt-3 sm:px-4"
        data-testid="build-workspace-shell"
      >
        <WorkspaceTopBar
          blockerCount={blockerCount}
          canFinalizeMilestones={canFinalizeMilestones}
          onOpenDrawPlans={() => setDrawPlansOpen(true)}
          onOpenInspection={setInspectionDrawer}
          onOpenValidation={() => setValidationOpen(true)}
          showPrimaryAction={showPrimaryAction}
          showRoleSelector={showRoleSelector}
          totalDrawAmount={totalDrawAmount}
          viewer={viewer}
          workspaceCrumbHref={workspaceCrumbHref}
        />
        {workspace.terminalMessage ? (
          <div className="mb-3 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-emerald-700 text-sm dark:text-emerald-100">
            {workspace.terminalMessage}
          </div>
        ) : null}

        <section className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-card shadow-2xl shadow-foreground/10">
          <TimelineControlsStrip
            onRailCollapsedChange={setMilestoneRailCollapsed}
            onResolutionChange={setTimelineResolution}
            onScheduleDisplayModeChange={setScheduleDisplayMode}
            onZoomChange={setTimelineZoom}
            railCollapsed={milestoneRailCollapsed}
            resolution={timelineResolution}
            scheduleDisplayMode={scheduleDisplayMode}
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
              onOpenDraw={(drawGroupId) => {
                setDetailDrawId(drawGroupId);
                setDrawDetailOpen(true);
              }}
              railCollapsed={milestoneRailCollapsed}
              resolution={timelineResolution}
              scheduleDisplayMode={scheduleDisplayMode}
              zoom={timelineZoom}
            />
          </div>
        </section>

        <MilestoneDetailSheet
          canFinalizeMilestones={canFinalizeMilestones}
          draw={detailDraw}
          milestone={detailMilestone}
          onOpenChange={setDetailOpen}
          onOpenSubmilestone={onOpenSubmilestone}
          open={detailOpen}
          viewer={viewer}
        />
        {detailDrawGroup ? (
          <DrawGroupDetailSheet
            draw={detailDrawGroup}
            onOpenChange={setDrawDetailOpen}
            open={drawDetailOpen}
          />
        ) : null}
        <DrawPlanComparisonDialog
          onOpenChange={setDrawPlansOpen}
          open={drawPlansOpen}
          selectedPlanId={workspace.selectedPlanId}
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
